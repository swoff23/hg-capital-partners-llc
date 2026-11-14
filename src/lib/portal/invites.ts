import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { hashPassword } from "@/lib/password";
import { RateLimiter } from "@/lib/rate-limit";
import { readContactPatch } from "@/lib/contractors/contact-fields";
import { inviteExpiresAt, inviteState } from "@/lib/contractors/onboarding";
import { createPortalAccountIn, PortalAccountError, type Staff } from "./accounts-core";
import { checkNewPassword, looksLikeEmail, normalizeEmail, PASSWORD_MESSAGES } from "./credentials";
import { startPortalSession } from "./session";
import { hashToken, isWellFormedToken, newToken, signupLinkToken } from "./tokens";

/**
 * Personal invites and the shared sign-up link (docs/specs/contractor-onboarding.md, sections 3, 4 and 6).
 *
 * A personal invite is for someone who isn't in Contractors yet: inviting them adds them (signupSource INVITE), and
 * the link lets them choose their own login once, within 14 days. Resend makes a new link and ends the old one.
 * The shared link is one row at a time; anyone holding it can sign up, and each sign-up starts as New
 * (signupSource LINK, needsReview) until a partner keeps or archives them. Reset ends it and makes another.
 *
 * Tokens are 32 random bytes and only their SHA-256 is stored (tokens.ts). The shared link's token is rebuilt from
 * its row id and the session secret (signupLinkToken), so a partner can copy it again at any time.
 *
 * Every refusal a person sees is an InviteError with the line to show, and the field it belongs on.
 */

export type JoinField = "fullName" | "phone" | "email" | "password" | "form";

export class InviteError extends Error {
  constructor(
    message: string,
    readonly field: JoinField = "form",
  ) {
    super(message);
    this.name = "InviteError";
  }
}

/** What a used, expired, replaced or unknown link says. Nothing says which, so a guessed token learns nothing. */
export const EXPIRED_LINE = "This invite has expired. Ask HG Capital for a new one.";
export const USED_LINE = "This invite was already used. Sign in instead.";
const EMAIL_TAKEN = "That email already has an account. Sign in or reset your password.";
const TOO_MANY = "Too many tries from here. Wait a few minutes and try again.";

/** Per process, as the move-in form's limiter (rate-limit.ts): enough to stop a script filling Contractors from one link. */
const signupLimiter = new RateLimiter(5, 10 * 60 * 1000);

// ---------------------------------------------------------------------------
// Staff: invite, resend, the shared link
// ---------------------------------------------------------------------------

/** "Mobile or email" in the Invite contractor sheet, read as one or the other. */
export function readInviteContact(raw: string): { email: string | null; phone: string | null; phoneE164: string | null } | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.includes("@")) {
    const email = normalizeEmail(text);
    return looksLikeEmail(email) ? { email, phone: null, phoneE164: null } : null;
  }
  const read = readContactPatch({ phone: text });
  if (!read.ok || !read.data.phone) return null;
  return { email: null, phone: read.data.phone, phoneE164: read.data.phoneE164 ?? null };
}

/**
 * Invite someone new: they're added to Contractors (Invited) with the name and the mobile or email, and get a link.
 * Returns the token, which goes only into the text or email.
 */
export async function invitePerson(input: { fullName: string; reach: string }, byUser: Staff): Promise<{ contactId: string; token: string; email: string | null; phone: string | null }> {
  const name = readContactPatch({ fullName: input.fullName });
  if (!name.ok || !name.data.fullName) throw new InviteError(name.ok ? "Enter a name." : name.message, "fullName");
  const reach = readInviteContact(input.reach);
  if (!reach) throw new InviteError("Enter a mobile number or an email.", "phone");
  // Invites are for people who aren't in Contractors yet (decision 5): someone already there is opened, not added twice.
  const existing = await prisma.contact.findFirst({
    where: {
      archivedAt: null,
      OR: [
        ...(reach.phoneE164 ? [{ phoneE164: reach.phoneE164 }] : []),
        ...(reach.email ? [{ email: { equals: reach.email, mode: "insensitive" as const } }] : []),
      ],
    },
    select: { fullName: true },
  });
  if (existing) throw new InviteError(`${existing.fullName} already has that ${reach.email ? "email" : "number"}. Open their page instead.`, "phone");
  const token = newToken();
  const contact = await prisma.$transaction(async (tx) => {
    const created = await tx.contact.create({
      data: { fullName: name.data.fullName!, email: reach.email, phone: reach.phone, phoneE164: reach.phoneE164, signupSource: "INVITE" },
      select: { id: true },
    });
    await tx.portalInvite.create({
      data: {
        contactId: created.id,
        tokenHash: hashToken(token),
        email: reach.email,
        phone: reach.phone,
        createdByUserId: byUser.id,
        expiresAt: inviteExpiresAt(new Date()),
      },
    });
    return created;
  });
  return { contactId: contact.id, token, email: reach.email, phone: reach.phone };
}

/**
 * A new link for someone invited who hasn't made their account yet. Every earlier link of theirs stops working.
 * Refused once they have a login (Reset password is the way then), and for anyone staff added.
 */
export async function resendInvite(contactId: string, byUser: Staff): Promise<{ token: string; email: string | null; phone: string | null; firstName: string }> {
  const now = new Date();
  const token = newToken();
  const contact = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Contact" WHERE "id" = ${contactId} FOR NO KEY UPDATE`;
    const c = await tx.contact.findUnique({
      where: { id: contactId },
      select: { id: true, fullName: true, email: true, phone: true, signupSource: true, archivedAt: true, portalAccount: { select: { id: true } } },
    });
    if (!c) throw new InviteError("That contractor no longer exists.");
    if (c.archivedAt) throw new InviteError("Restore this contractor first.");
    if (c.signupSource === "STAFF") throw new InviteError("Use Create login for this contractor.");
    if (c.portalAccount) throw new InviteError("They already made their account.");
    await tx.portalInvite.updateMany({
      where: { contactId, shared: false, usedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      data: { expiresAt: now },
    });
    await tx.portalInvite.create({
      data: { contactId, tokenHash: hashToken(token), email: c.email, phone: c.phone, createdByUserId: byUser.id, expiresAt: inviteExpiresAt(now) },
    });
    return c;
  });
  return { token, email: contact.email, phone: contact.phone, firstName: contact.fullName.trim().split(/\s+/)[0] ?? "" };
}

const liveShared = (now: Date): Prisma.PortalInviteWhereInput => ({ shared: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

/** The shared sign-up link as it stands, made the first time anyone asks for it. */
export async function currentSignupLink(byUser: Staff | null = null): Promise<{ token: string }> {
  const secret = getEnv().sessionSecret;
  const now = new Date();
  const row = await prisma.portalInvite.findFirst({ where: liveShared(now), orderBy: { createdAt: "desc" }, select: { id: true, tokenHash: true } });
  if (row) {
    const token = signupLinkToken(row.id, secret);
    // Rebuilt under a different secret (SESSION_SECRET changed since it was made), it would be a dead link: make a new
    // one instead. The old row stays live for anyone already holding its link.
    if (hashToken(token) === row.tokenHash) return { token };
  }
  return { token: await createSharedRow(byUser) };
}

/** Reset link: the old one stops working at once, and a new one takes its place. */
export async function resetSignupLink(byUser: Staff): Promise<{ token: string }> {
  const now = new Date();
  await prisma.portalInvite.updateMany({ where: liveShared(now), data: { expiresAt: now } });
  return { token: await createSharedRow(byUser) };
}

async function createSharedRow(byUser: Staff | null): Promise<string> {
  const secret = getEnv().sessionSecret;
  // The id comes first, so the hash of the token built from it can be stored with the row.
  const id = crypto.randomUUID().replace(/-/g, "");
  const token = signupLinkToken(id, secret);
  await prisma.portalInvite.create({ data: { id, shared: true, tokenHash: hashToken(token), createdByUserId: byUser?.id ?? null } });
  return token;
}

// ---------------------------------------------------------------------------
// The /join page
// ---------------------------------------------------------------------------

export type JoinView =
  | { kind: "invite"; firstName: string; fullName: string; email: string | null }
  | { kind: "signup" }
  | { kind: "used" }
  | { kind: "expired" };

type InviteRow = {
  id: string;
  shared: boolean;
  usedAt: Date | null;
  expiresAt: Date | null;
  email: string | null;
  openedAt: Date | null;
  contact: { id: string; fullName: string; email: string | null; archivedAt: Date | null; active: boolean; portalAccount: { id: string } | null } | null;
};

async function findInvite(token: string): Promise<InviteRow | null> {
  if (!isWellFormedToken(token)) return null;
  return prisma.portalInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      shared: true,
      usedAt: true,
      expiresAt: true,
      email: true,
      openedAt: true,
      contact: { select: { id: true, fullName: true, email: true, archivedAt: true, active: true, portalAccount: { select: { id: true } } } },
    },
  });
}

function viewOf(row: InviteRow | null, now: Date): JoinView {
  if (!row) return { kind: "expired" };
  const state = inviteState(row, now);
  if (row.shared) return state === "live" ? { kind: "signup" } : { kind: "expired" };
  if (!row.contact || row.contact.archivedAt || !row.contact.active) return { kind: "expired" };
  if (state === "used" || row.contact.portalAccount) return { kind: "used" };
  if (state === "expired") return { kind: "expired" };
  const fullName = row.contact.fullName.trim();
  return { kind: "invite", fullName, firstName: fullName.split(/\s+/)[0] ?? "", email: row.email ?? row.contact.email };
}

/** What /join/<token> shows. */
export async function resolveJoin(token: string): Promise<JoinView> {
  return viewOf(await findInvite(token), new Date());
}

/**
 * Marks a personal invite Opened. Called from the browser after the page loads, never on the server's first GET,
 * because Messages and mail apps fetch a link to draw its preview (section 6).
 */
export async function markInviteOpened(token: string): Promise<void> {
  if (!isWellFormedToken(token)) return;
  await prisma.portalInvite.updateMany({ where: { tokenHash: hashToken(token), shared: false, openedAt: null, usedAt: null }, data: { openedAt: new Date() } });
}

function checkPassword(password: string, email: string): void {
  const problem = checkNewPassword(password, { email });
  if (problem) throw new InviteError(PASSWORD_MESSAGES[problem], "password");
}

function readLoginEmail(raw: string): string {
  const email = normalizeEmail(raw);
  if (!email) throw new InviteError("Enter your email.", "email");
  if (!looksLikeEmail(email)) throw new InviteError("Enter a full email, like name@example.com.", "email");
  return email;
}

/** Staff logins and other contractors' logins both answer the same line, which offers sign-in. */
async function assertEmailFree(tx: Prisma.TransactionClient, email: string): Promise<void> {
  const staff = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  const taken = await tx.portalAccount.findUnique({ where: { email }, select: { id: true } });
  if (staff || taken) throw new InviteError(EMAIL_TAKEN, "email");
}

function limit(ipHash: string): void {
  if (!signupLimiter.allow(ipHash).ok) throw new InviteError(TOO_MANY);
}

/** A unique index the reads missed (two tabs at once): the same answer the reads give. */
function rethrowUnique(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new InviteError(EMAIL_TAKEN, "email");
  if (err instanceof PortalAccountError) throw new InviteError(err.message, "email");
  throw err;
}

/** The invited person makes their login, then is signed in. The caller sends them on to the setup steps. */
export async function acceptInvite(token: string, input: { email: string; password: string }, ipHash: string): Promise<void> {
  limit(ipHash);
  const row = await findInvite(token);
  const view = viewOf(row, new Date());
  if (view.kind === "used") throw new InviteError(USED_LINE);
  if (view.kind !== "invite" || !row?.contact) throw new InviteError(EXPIRED_LINE);
  const email = readLoginEmail(input.email);
  checkPassword(input.password, email);
  const passwordHash = await hashPassword(input.password);
  const contactId = row.contact.id;
  let accountId: string;
  try {
    accountId = await prisma.$transaction(async (tx) => {
      // Used once: a second tab racing this one finds it taken and writes nothing.
      const claimed = await tx.portalInvite.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date(), openedAt: row.openedAt ?? new Date() } });
      if (claimed.count === 0) throw new InviteError(USED_LINE);
      await assertEmailFree(tx, email);
      const account = await createPortalAccountIn(tx, contactId, email, passwordHash, null, { chosenPassword: true, via: "invite" });
      return account.id;
    });
  } catch (err) {
    if (err instanceof InviteError) throw err;
    rethrowUnique(err);
  }
  await startPortalSession(accountId);
}

/**
 * Someone new signs up with the shared link: they're added to Contractors as New (needsReview) with their login,
 * then signed in. A name or number that matches someone already there makes a separate record; attaching it would
 * let anyone who knows Zack's number see Zack's jobs (section 6).
 */
export async function signUpWithLink(
  token: string,
  input: { fullName: string; phone: string; email: string; password: string },
  ipHash: string,
): Promise<void> {
  limit(ipHash);
  const row = await findInvite(token);
  if (viewOf(row, new Date()).kind !== "signup") throw new InviteError(EXPIRED_LINE);
  const name = readContactPatch({ fullName: input.fullName });
  if (!name.ok || !name.data.fullName) throw new InviteError(name.ok ? "Enter your name." : name.message, "fullName");
  const phone = readContactPatch({ phone: input.phone });
  if (!phone.ok || !phone.data.phone) throw new InviteError(phone.ok ? "Enter your mobile number." : phone.message, "phone");
  const email = readLoginEmail(input.email);
  checkPassword(input.password, email);
  const passwordHash = await hashPassword(input.password);
  let accountId: string;
  try {
    accountId = await prisma.$transaction(async (tx) => {
      await assertEmailFree(tx, email);
      const contact = await tx.contact.create({
        data: {
          fullName: name.data.fullName!,
          phone: phone.data.phone,
          phoneE164: phone.data.phoneE164 ?? null,
          email,
          signupSource: "LINK",
          needsReview: true,
        },
        select: { id: true },
      });
      const account = await createPortalAccountIn(tx, contact.id, email, passwordHash, null, { chosenPassword: true, via: "link" });
      return account.id;
    });
  } catch (err) {
    if (err instanceof InviteError) throw err;
    rethrowUnique(err);
  }
  await startPortalSession(accountId);
}

/** Keep: a sign-up from the shared link stops being New. Archive is the other answer (lib/archive.ts). */
export async function keepSignup(contactId: string): Promise<void> {
  await prisma.contact.updateMany({ where: { id: contactId, needsReview: true }, data: { needsReview: false } });
}
