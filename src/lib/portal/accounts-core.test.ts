import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { PortalAccountError, changePortalEmailIn } from "./accounts-core";

const STAFF = { id: "u-connor" };
const LATER = new Date("2026-10-20T10:00:00.000Z");

type Account = { id: string; contactId: string; email: string };
type Token = { id: string; accountId: string; usedAt: Date | null };

/** The tables changing a login's email touches, in memory, with the order the writes happened in. */
function fakeAccounts(opts: { staffEmails?: string[] } = {}) {
  const accounts: Account[] = [
    { id: "a1", contactId: "c-zack", email: "zack@old.example" },
    { id: "a2", contactId: "c-jose", email: "jose@example.com" },
  ];
  const tokens: Token[] = [
    { id: "r1", accountId: "a1", usedAt: null },
    { id: "r2", accountId: "a1", usedAt: null },
    { id: "r3", accountId: "a1", usedAt: LATER },
    { id: "r4", accountId: "a2", usedAt: null },
  ];
  const writes: string[] = [];
  const events: { kind: string; data: unknown }[] = [];
  const tx = {
    portalAccount: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        const row = accounts.find((a) => (where.id ? a.id === where.id : a.email === where.email));
        return row ? { ...row } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Account> }) => {
        writes.push("account");
        Object.assign(accounts.find((a) => a.id === where.id)!, data);
      },
    },
    user: {
      findFirst: async ({ where }: { where: { email: { equals: string } } }) =>
        (opts.staffEmails ?? []).includes(where.email.equals) ? { id: "u-staff" } : null,
    },
    passwordResetToken: {
      updateMany: async ({ where, data }: { where: { accountId: string; usedAt: null }; data: { usedAt: Date } }) => {
        writes.push("tokens");
        const hit = tokens.filter((t) => t.accountId === where.accountId && t.usedAt === null);
        for (const t of hit) t.usedAt = data.usedAt;
        return { count: hit.length };
      },
    },
    securityEvent: {
      create: async ({ data }: { data: { kind: string; data: unknown } }) => {
        writes.push("event");
        events.push(data);
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, accounts, tokens, writes, events };
}

test("changePortalEmailIn: a reset link mailed to the old address stops working", async () => {
  const { tx, accounts, tokens, writes, events } = fakeAccounts();
  await changePortalEmailIn(tx, "a1", "zack@new.example", STAFF);
  assert.equal(accounts[0].email, "zack@new.example");
  // Both of this login's open links are spent; the used one and another contractor's are left alone.
  assert.equal(tokens.find((t) => t.id === "r1")!.usedAt instanceof Date, true);
  assert.equal(tokens.find((t) => t.id === "r2")!.usedAt instanceof Date, true);
  assert.equal(tokens.find((t) => t.id === "r3")!.usedAt, LATER);
  assert.equal(tokens.find((t) => t.id === "r4")!.usedAt, null);
  // After the email changes, in the same transaction, and before the log line.
  assert.deepEqual(writes, ["account", "tokens", "event"]);
  assert.deepEqual(events, [{ kind: "ACCOUNT_DISABLED", userId: "u-connor", contactId: "c-zack", ipHash: null, taskId: null, data: { action: "email-changed", from: "zack@old.example", to: "zack@new.example" } }]);
});

test("changePortalEmailIn: the same address changes nothing, so open reset links stay good", async () => {
  const { tx, tokens, writes } = fakeAccounts();
  await changePortalEmailIn(tx, "a1", "zack@old.example", STAFF);
  assert.deepEqual(writes, []);
  assert.equal(tokens.find((t) => t.id === "r1")!.usedAt, null);
});

test("changePortalEmailIn: a refused change writes nothing and leaves the links alone", async () => {
  const taken = fakeAccounts();
  await assert.rejects(changePortalEmailIn(taken.tx, "a1", "jose@example.com", STAFF), (e) => e instanceof PortalAccountError && /already uses/.test(e.message));
  const staff = fakeAccounts({ staffEmails: ["connor@example.com"] });
  await assert.rejects(changePortalEmailIn(staff.tx, "a1", "connor@example.com", STAFF), (e) => e instanceof PortalAccountError && /staff login/.test(e.message));
  const gone = fakeAccounts();
  await assert.rejects(changePortalEmailIn(gone.tx, "nope", "x@example.com", STAFF), (e) => e instanceof PortalAccountError && /no longer exists/.test(e.message));
  for (const f of [taken, staff, gone]) {
    assert.deepEqual(f.writes, []);
    assert.equal(f.tokens.find((t) => t.id === "r1")!.usedAt, null);
  }
});
