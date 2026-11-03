import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { TOAST_PHONE_CHARS } from "@/lib/toast-line";
import {
  ARCHIVED_CONTRACTOR_LINE,
  PortalAccountError,
  changePortalEmailIn,
  createPortalAccountIn,
  enablePortalAccountIn,
} from "./accounts-core";

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

/* ---------------- An archived contractor gets no working login ---------------- */

type Contact = { id: string; email: string | null; archivedAt: Date | null; portalAccount: { id: string } | null };
type Login = { id: string; contactId: string; email: string; status: "ACTIVE" | "DISABLED" };

/** The tables creating a login and giving access back touch, in memory, with the order the writes happened in. */
function fakeContractors(contacts: Contact[], logins: Login[] = []) {
  const writes: string[] = [];
  const events: { kind: string; data: unknown }[] = [];
  const tx = {
    contact: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = contacts.find((c) => c.id === where.id);
        return row ? { ...row } : null;
      },
      updateMany: async ({ where, data }: { where: { id: string; email: string | null }; data: { email: string } }) => {
        writes.push("contact");
        const row = contacts.find((c) => c.id === where.id && c.email === where.email);
        if (row) row.email = data.email;
        return { count: row ? 1 : 0 };
      },
    },
    user: { findFirst: async () => null },
    portalAccount: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        const row = logins.find((a) => (where.id ? a.id === where.id : a.email === where.email));
        if (!row) return null;
        return { ...row, contact: { archivedAt: contacts.find((c) => c.id === row.contactId)?.archivedAt ?? null } };
      },
      create: async ({ data }: { data: { contactId: string; email: string } }) => {
        writes.push("login");
        const row: Login = { id: `a-${logins.length + 1}`, contactId: data.contactId, email: data.email, status: "ACTIVE" };
        logins.push(row);
        return { ...row, mustChangePassword: true, createdAt: LATER };
      },
      update: async ({ where, data }: { where: { id: string }; data: { status: "ACTIVE" | "DISABLED" } }) => {
        writes.push("status");
        Object.assign(logins.find((a) => a.id === where.id)!, data);
      },
    },
    securityEvent: {
      create: async ({ data }: { data: { kind: string; data: unknown } }) => {
        writes.push("event");
        events.push(data);
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, contacts, logins, writes, events };
}

const ARCHIVED_AT = new Date("2026-10-30T14:00:00.000Z");

test("createPortalAccountIn: an archived contractor gets no login, and nothing is written", async () => {
  // The contractor nobody can find in the directory, search or pickers must not be given a way to sign in.
  const f = fakeContractors([{ id: "c-zed", email: null, archivedAt: ARCHIVED_AT, portalAccount: null }]);
  await assert.rejects(
    createPortalAccountIn(f.tx, "c-zed", "zed@example.com", "hash", STAFF),
    (e) => e instanceof PortalAccountError && e.message === ARCHIVED_CONTRACTOR_LINE,
  );
  assert.equal(ARCHIVED_CONTRACTOR_LINE, "Restore this contractor first.");
  assert.ok(ARCHIVED_CONTRACTOR_LINE.length <= TOAST_PHONE_CHARS, "it can also be a toast, one line on a phone");
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.logins, []);
  assert.equal(f.contacts[0].email, null, "the contractor's own email isn't filled in either");
});

test("createPortalAccountIn: after Restore the login is made, logged, and fills in the empty email", async () => {
  const f = fakeContractors([{ id: "c-zed", email: "", archivedAt: null, portalAccount: null }]);
  const created = await createPortalAccountIn(f.tx, "c-zed", "zed@example.com", "hash", STAFF);
  assert.equal(created.email, "zed@example.com");
  assert.equal(created.mustChangePassword, true);
  assert.deepEqual(f.writes, ["login", "event", "contact"], "the login, then its log line, then the contact's email");
  assert.deepEqual(f.events, [{ kind: "ACCOUNT_CREATED", userId: "u-connor", contactId: "c-zed", ipHash: null, taskId: null, data: {} }]);
  assert.equal(f.contacts[0].email, "zed@example.com");
});

test("createPortalAccountIn: the other refusals still read as before", async () => {
  const f = fakeContractors(
    [
      { id: "c-has", email: "has@example.com", archivedAt: null, portalAccount: { id: "a-has" } },
      { id: "c-free", email: "free@example.com", archivedAt: null, portalAccount: null },
    ],
    [{ id: "a-has", contactId: "c-has", email: "has@example.com", status: "ACTIVE" }],
  );
  await assert.rejects(createPortalAccountIn(f.tx, "c-has", "x@example.com", "hash", STAFF), /already has a login/);
  await assert.rejects(createPortalAccountIn(f.tx, "c-free", "has@example.com", "hash", STAFF), /already uses that email/);
  await assert.rejects(createPortalAccountIn(f.tx, "nope", "x@example.com", "hash", STAFF), /no longer exists/);
  assert.deepEqual(f.writes, []);
});

test("enablePortalAccountIn: an archived contractor's removed access stays removed", async () => {
  const f = fakeContractors(
    [{ id: "c-zed", email: "zed@example.com", archivedAt: ARCHIVED_AT, portalAccount: { id: "a-zed" } }],
    [{ id: "a-zed", contactId: "c-zed", email: "zed@example.com", status: "DISABLED" }],
  );
  await assert.rejects(enablePortalAccountIn(f.tx, "a-zed", STAFF), (e) => e instanceof PortalAccountError && e.message === ARCHIVED_CONTRACTOR_LINE);
  assert.equal(f.logins[0].status, "DISABLED");
  assert.deepEqual(f.writes, []);
});

test("enablePortalAccountIn: a contractor who isn't archived gets access back, logged as 'enabled'", async () => {
  const f = fakeContractors(
    [{ id: "c-zed", email: "zed@example.com", archivedAt: null, portalAccount: { id: "a-zed" } }],
    [{ id: "a-zed", contactId: "c-zed", email: "zed@example.com", status: "DISABLED" }],
  );
  await enablePortalAccountIn(f.tx, "a-zed", STAFF);
  assert.equal(f.logins[0].status, "ACTIVE");
  assert.deepEqual(f.writes, ["status", "event"]);
  assert.deepEqual(f.events, [{ kind: "ACCOUNT_DISABLED", userId: "u-connor", contactId: "c-zed", ipHash: null, taskId: null, data: { action: "enabled" } }]);
  await assert.rejects(enablePortalAccountIn(f.tx, "nope", STAFF), /no longer exists/);
});
