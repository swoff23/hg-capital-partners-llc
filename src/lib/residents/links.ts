import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { todayYmdEastern, type Ymd } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { firstName } from "@/lib/names";
import { hashToken, isWellFormedToken, residentLinkToken } from "@/lib/portal/tokens";
import { whyLinkEnded } from "./link-ended";
import { endedMessage, linkLeaseEnded, type LinkEnded } from "./steps";

/**
 * A tenant's own link for reporting repairs (docs/specs/maintenance-requests.md,
 * sections 3.1 and 6): /r/<token>. One live link per person per lease. The
 * token is rebuilt from the row id and the session secret whenever a partner
 * copies it, like the contractor sign-up link (portal/invites.ts), so Copy
 * link shows the link already sent while the table keeps only its hash.
 *
 * It works through the move-out day while the person is still on the lease.
 * Turn off link and Send a new link revoke it; an old link then opens the ended
 * page, which says "This link was replaced." when a newer one was emailed
 * (docs/specs/tenant-welcome-email.md). Only a partner's Email link, Copy link or Send a new link, or the
 * resident's own Email me my link, makes a new one: the update emails and the
 * tenant sheet never do, so Turn off link sticks.
 */

/** The link's address, with an optional rest of the path ("/new"). */
export function residentUrl(token: string, rest = ""): string {
  return `${getEnv().appUrl}/r/${token}${rest}`;
}

/** Where a link's token stands: its row, rebuilt from the id. */
function tokenFor(id: string): string {
  return residentLinkToken(id, getEnv().sessionSecret);
}

/** Why a partner can't have a link for this person: they aren't on the lease, or it has ended. */
export class ResidentLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResidentLinkError";
  }
}

/** The person must be on the lease and the lease not ended. */
async function assertOnLease(tenantId: string, leaseId: string, today: Ymd): Promise<void> {
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    select: { movesIn: true, movesOut: true, tenants: { where: { tenantId }, select: { tenantId: true } } },
  });
  if (!lease || lease.tenants.length === 0) throw new ResidentLinkError("They aren't on this lease anymore.");
  if (linkLeaseEnded(lease, today)) throw new ResidentLinkError("This lease has ended, so it has no request link.");
}

export interface LinkState {
  token: string;
  emailedAt: Date | null;
  lastUsedAt: Date | null;
}

async function createLink(tenantId: string, leaseId: string): Promise<LinkState> {
  // The id first, so the hash of the token built from it is stored with the row (invites.ts createSharedRow).
  const id = crypto.randomUUID().replace(/-/g, "");
  const token = tokenFor(id);
  await prisma.residentLink.create({ data: { id, tenantId, leaseId, tokenHash: hashToken(token) } });
  return { token, emailedAt: null, lastUsedAt: null };
}

/** The live link for this person on this lease, made the first time anyone asks for it. */
export async function currentResidentLink(tenantId: string, leaseId: string, now = new Date()): Promise<LinkState> {
  await assertOnLease(tenantId, leaseId, todayYmdEastern(now));
  // One made under a changed SESSION_SECRET can't be rebuilt: make a new one. The old row stays for anyone holding it.
  return (await liveResidentLink(tenantId, leaseId)) ?? createLink(tenantId, leaseId);
}

/**
 * The newest live link that rebuilds under today's secret, or null when there is none (turned off, never made, or
 * made under a secret since changed). Never makes one.
 */
export async function liveResidentLink(tenantId: string, leaseId: string): Promise<LinkState | null> {
  const rows = await prisma.residentLink.findMany({
    where: { tenantId, leaseId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, tokenHash: true, emailedAt: true, lastUsedAt: true },
  });
  for (const row of rows) {
    const token = tokenFor(row.id);
    if (hashToken(token) === row.tokenHash) return { token, emailedAt: row.emailedAt, lastUsedAt: row.lastUsedAt };
  }
  return null;
}

/**
 * What the tenant sheet shows when it opens: the live link, made the first time for someone who never had one so
 * Copy link is one tap, and `off` once a partner turned theirs off (the sheet doesn't quietly make another).
 */
export async function sheetResidentLink(tenantId: string, leaseId: string, now = new Date()): Promise<{ link: LinkState | null; off: boolean }> {
  const live = await liveResidentLink(tenantId, leaseId);
  if (live) return { link: live, off: false };
  // Off only when a partner turned every link off; a live one we can't rebuild (a changed secret) gets a fresh one.
  const [ever, stillLive] = await Promise.all([
    prisma.residentLink.count({ where: { tenantId, leaseId } }),
    prisma.residentLink.count({ where: { tenantId, leaseId, revokedAt: null } }),
  ]);
  if (ever > 0 && stillLive === 0) return { link: null, off: true };
  return { link: await currentResidentLink(tenantId, leaseId, now), off: false };
}

/** Turn off link: the live one stops working at once. */
export async function turnOffResidentLink(tenantId: string, leaseId: string, now = new Date()): Promise<number> {
  const { count } = await prisma.residentLink.updateMany({ where: { tenantId, leaseId, revokedAt: null }, data: { revokedAt: now } });
  return count;
}

/** Send a new link: the old one stops working, and a new one takes its place. */
export async function newResidentLink(tenantId: string, leaseId: string, now = new Date()): Promise<LinkState> {
  await assertOnLease(tenantId, leaseId, todayYmdEastern(now));
  await turnOffResidentLink(tenantId, leaseId, now);
  return createLink(tenantId, leaseId);
}

/** Stamp the link as emailed, for the sheet's "Emailed Nov 21". */
export async function markResidentLinkEmailed(token: string, now = new Date()): Promise<void> {
  await prisma.residentLink.updateMany({ where: { tokenHash: hashToken(token) }, data: { emailedAt: now } });
}

/** Who a live link belongs to, and the home it's for. */
export interface ResidentContext {
  linkId: string;
  token: string;
  tenantId: string;
  tenantName: string;
  firstName: string;
  email: string | null;
  leaseId: string;
  propertyId: string;
  address: string;
  unitLabel: string | null;
}

export type ResolvedLink = { state: "live"; ctx: ResidentContext } | { state: "ended"; why: LinkEnded };

/** A last-used stamp at most every ten minutes, so a busy page isn't a write per load. */
const TOUCH_EVERY_MS = 10 * 60_000;

/**
 * What a /r/<token> link opens: live, ended (turned off, replaced, moved out,
 * or no longer on the lease) with why for the ended page's words
 * (link-ended.ts), or null for a token we never made.
 */
export async function resolveResidentLink(token: unknown, now = new Date()): Promise<ResolvedLink | null> {
  if (!isWellFormedToken(token)) return null;
  const row = await prisma.residentLink.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
      tenant: { select: { id: true, fullName: true, email: true } },
      lease: {
        select: {
          id: true,
          propertyId: true,
          unitLabel: true,
          movesIn: true,
          movesOut: true,
          property: { select: { address: true } },
          tenants: { select: { tenantId: true } },
        },
      },
    },
  });
  if (!row) return null;
  const onLease = row.lease.tenants.some((t) => t.tenantId === row.tenant.id);
  const leaseCurrent = onLease && !linkLeaseEnded(row.lease, todayYmdEastern(now));
  if (row.revokedAt || !leaseCurrent) {
    return { state: "ended", why: await whyLinkEnded(prisma, { id: row.id, tenantId: row.tenant.id, leaseId: row.lease.id, createdAt: row.createdAt }, leaseCurrent) };
  }
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await prisma.residentLink.update({ where: { id: row.id }, data: { lastUsedAt: now } }).catch(() => undefined);
  }
  return {
    state: "live",
    ctx: {
      linkId: row.id,
      token,
      tenantId: row.tenant.id,
      tenantName: row.tenant.fullName,
      firstName: firstName(row.tenant.fullName) || row.tenant.fullName,
      email: row.tenant.email,
      leaseId: row.lease.id,
      propertyId: row.lease.propertyId,
      address: row.lease.property.address,
      unitLabel: row.lease.unitLabel,
    },
  };
}

/** A live link's context, for a resident action: anything else is refused with the ended page's words as one line. */
export async function requireResidentLink(token: unknown, now = new Date()): Promise<ResidentContext> {
  const r = await resolveResidentLink(token, now);
  if (!r || r.state !== "live") throw new ResidentLinkError(endedMessage(r?.state === "ended" ? r.why : "gone"));
  return r.ctx;
}
