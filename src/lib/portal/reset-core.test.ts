import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { PortalAccountStatus } from "@prisma/client";
import type { EmailMessage } from "@/lib/email/resend";
import type { SendResult } from "@/lib/email/send";
import { deliverResetEmail, findResetOwner, resetTokenOwner, usableReset, type ResetRequestData, type ResetTokenRow } from "./reset-core";

/*
 * A reset request used to log `sent: true` in its transaction, before the
 * send after the response was even tried, and the daily email count
 * (notifications/sent-count.ts) counts those events: a failed send still
 * spent the cap. Now the request writes `sent: false` and the send marks it.
 */

const msg: EmailMessage = { to: "zack@example.test", subject: "Reset your HG password", text: "link" };
const data: ResetRequestData = { emailHash: "h-zack", sent: false };

function fakeEvents() {
  const writes: { where: unknown; data: unknown }[] = [];
  const db = {
    securityEvent: {
      updateMany: async (args: { where: unknown; data: unknown }) => {
        writes.push(args);
        return { count: 1 };
      },
    },
  };
  return { db: db as unknown as Parameters<typeof deliverResetEmail>[0], writes };
}

test("a reset email that went marks its event sent, keeping the emailHash the hourly limit counts by", async () => {
  const { db, writes } = fakeEvents();
  const sent: EmailMessage[] = [];
  const went = await deliverResetEmail(db, async (m) => (sent.push(m), { ok: true, id: "re_1" }), { eventId: "ev-1", data, msg });
  assert.equal(went, true);
  assert.deepEqual(sent, [msg]);
  assert.deepEqual(writes, [{ where: { id: "ev-1" }, data: { data: { emailHash: "h-zack", sent: true } } }]);
});

test("a send Resend refuses, or that fails before it, leaves the event unsent", async () => {
  const failures: SendResult[] = [
    { ok: false, error: "Resend 500: request failed", status: 500 },
    { ok: false, error: "Resend 429: daily quota", status: 429, code: "daily_quota_exceeded" },
    { ok: false, error: "Email is not configured" },
  ];
  for (const res of failures) {
    const { db, writes } = fakeEvents();
    assert.equal(await deliverResetEmail(db, async () => res, { eventId: "ev-1", data, msg }), false, res.error);
    assert.deepEqual(writes, [], res.error);
  }
});

test("the request writes `sent: false` for every address and lets only the send mark it", () => {
  const source = fs
    .readFileSync(path.join(import.meta.dirname, "reset.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const start = source.slice(source.indexOf("export async function startPasswordReset"), source.indexOf("async function sendResetEmail"));
  // Same row whether or not the address has a login, so the stored event says nothing the response doesn't.
  assert.match(start, /const data: ResetRequestData = \{ emailHash: keyed, sent: false \};/);
  assert.doesNotMatch(start, /sent: (true|!!token|token)/, "never recorded as sent before the send is tried");
  // The send runs after the response, for a known address only, and records its own outcome.
  assert.match(start, /if \(request\) after\(\(\) => sendResetEmail\(email, request\)\);/);
  const send = source.slice(source.indexOf("async function sendResetEmail"));
  assert.match(send, /await deliverResetEmail\(prisma, sendEmail, \{/);
  assert.doesNotMatch(send, /await sendEmail\(/, "no send whose result goes unread");
});

/*
 * Staff resets (docs/specs/staff-password-reset.md): who a request reaches,
 * and when a link still works. The real-Postgres side is reset.pg.test.ts.
 */

const later = new Date("2026-11-16T12:30:00Z");
const now = new Date("2026-11-16T12:00:00Z");
const tokenRow = (over: Partial<ResetTokenRow>): ResetTokenRow => ({
  id: "tok-1",
  usedAt: null,
  expiresAt: later,
  account: null,
  user: null,
  ...over,
});
const zackAccount = { id: "acc-1", email: "zack@example.test", contactId: "c-1", status: "ACTIVE" as PortalAccountStatus, contact: { active: true } };
const connorUser = { id: "u-1", email: "connor@example.test", passwordHash: "salt.hash" };

test("a staff link works while it's unused, unexpired, and the partner still has a password", () => {
  assert.deepEqual(usableReset(tokenRow({ user: connorUser }), now), {
    tokenId: "tok-1",
    email: "connor@example.test",
    kind: "staff",
    userId: "u-1",
  });
  assert.equal(usableReset(tokenRow({ user: connorUser, usedAt: now }), now), null, "used");
  assert.equal(usableReset(tokenRow({ user: connorUser, expiresAt: now }), now), null, "expired");
  assert.equal(usableReset(tokenRow({ user: { ...connorUser, passwordHash: null } }), now), null, "login turned off");
  assert.equal(usableReset(null, now), null);
});

test("a contractor link still needs an active login and contractor, and never carries the hash", () => {
  assert.deepEqual(usableReset(tokenRow({ account: zackAccount }), now), {
    tokenId: "tok-1",
    email: "zack@example.test",
    kind: "contractor",
    accountId: "acc-1",
    contactId: "c-1",
  });
  assert.equal(usableReset(tokenRow({ account: { ...zackAccount, status: "DISABLED" } }), now), null);
  assert.equal(usableReset(tokenRow({ account: { ...zackAccount, contact: { active: false } } }), now), null);
  const staff = usableReset(tokenRow({ user: connorUser }), now);
  assert.ok(staff && !("passwordHash" in staff));
});

test("a new link is written with exactly one owner column", () => {
  assert.deepEqual(resetTokenOwner({ kind: "staff", userId: "u-1" }), { userId: "u-1" });
  assert.deepEqual(resetTokenOwner({ kind: "contractor", accountId: "acc-1" }), { accountId: "acc-1" });
});

/** findResetOwner against two in-memory tables keyed by email. */
function fakeLogins(accounts: Record<string, typeof zackAccount>, users: Record<string, typeof connorUser | { id: string; passwordHash: null }>) {
  const db = {
    portalAccount: { findUnique: async ({ where }: { where: { email: string } }) => accounts[where.email] ?? null },
    user: { findUnique: async ({ where }: { where: { email: string } }) => users[where.email] ?? null },
  };
  return db as unknown as Parameters<typeof findResetOwner>[0];
}

test("Forgot password reaches a partner with a password, never one without, and contractors as before", async () => {
  const db = fakeLogins(
    { "zack@example.test": zackAccount, "old@example.test": { ...zackAccount, id: "acc-2", contactId: "c-2", status: "DISABLED" } },
    { "connor@example.test": connorUser, "off@example.test": { id: "u-2", passwordHash: null } },
  );
  assert.deepEqual(await findResetOwner(db, "connor@example.test"), { owner: { kind: "staff", userId: "u-1" }, contactId: null, userId: "u-1" });
  // A cleared password is how a staff login is turned off: no link, though the event still names who asked.
  assert.deepEqual(await findResetOwner(db, "off@example.test"), { owner: null, contactId: null, userId: "u-2" });
  assert.deepEqual(await findResetOwner(db, "zack@example.test"), {
    owner: { kind: "contractor", accountId: "acc-1" },
    contactId: "c-1",
    userId: null,
  });
  assert.deepEqual(await findResetOwner(db, "old@example.test"), { owner: null, contactId: "c-2", userId: null });
  assert.deepEqual(await findResetOwner(db, "nobody@example.test"), { owner: null, contactId: null, userId: null });
});

test("a partner's reset email doesn't call the app 'jobs'", () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, "reset.ts"), "utf8");
  assert.match(source, /staff: "Here's your link to choose a new password for HG Capital\."/);
  assert.match(source, /contractor: "Here's your link to choose a new password for HG Capital jobs\."/);
});
