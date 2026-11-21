import test from "node:test";
import assert from "node:assert/strict";
import { GENERIC_ERROR, userMessage } from "@/lib/action-result";
import { DAILY_CAP, LISTING_GONE, join, remove, restore, withoutValues, type WaitlistDb } from "./core";
import { NOT_TAKING_SIGN_UPS, TOO_MANY_TODAY } from "./fields";

/**
 * The sign-up list's rules (docs/specs/coming-soon.md 3.4) against a small
 * fake of the two models core.ts reads. The fake understands only the query
 * shapes core.ts sends, and has no Property model at all, so a write that
 * reached for the property's version would fail here.
 */

type Status = "AVAILABLE" | "COMING_SOON" | "LEASED" | "HIDDEN";
type FakeListing = { id: string; propertyId: string; status: Status; archived: boolean };
type FakeEntry = { id: string; listingId: string; firstName: string; email: string; phone: string | null; createdAt: Date; updatedAt: Date };

type Where = Record<string, unknown>;

function pick<T extends Record<string, unknown>>(row: T, select: Record<string, boolean> | undefined): Partial<T> {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]])) as Partial<T>;
}

function fakeDb(listings: FakeListing[], entries: FakeEntry[] = [], clock: () => Date = () => new Date()) {
  let next = 1;
  const listingMatches = (l: FakeListing, where: Where) => {
    if (where.id !== undefined && l.id !== where.id) return false;
    if (where.propertyId !== undefined && l.propertyId !== where.propertyId) return false;
    if (where.status !== undefined && l.status !== where.status) return false;
    const property = where.property as { archivedAt?: null } | undefined;
    if (property && "archivedAt" in property && property.archivedAt === null && l.archived) return false;
    return true;
  };
  const entryMatches = (e: FakeEntry, where: Where) => {
    if (where.id !== undefined && e.id !== where.id) return false;
    const listing = where.listing as Where | undefined;
    if (listing) {
      const l = listings.find((x) => x.id === e.listingId);
      if (!l || !listingMatches(l, listing)) return false;
    }
    const createdAt = where.createdAt as { gte?: Date } | undefined;
    if (createdAt?.gte && e.createdAt < createdAt.gte) return false;
    return true;
  };
  const db = {
    listing: {
      async findFirst({ where, select }: { where: Where; select?: Record<string, boolean> }) {
        const l = listings.find((x) => listingMatches(x, where));
        return l ? pick(l, select) : null;
      },
    },
    listingWaitlistEntry: {
      async count({ where }: { where: Where }) {
        return entries.filter((e) => entryMatches(e, where)).length;
      },
      async findFirst({ where, select }: { where: Where; select?: Record<string, boolean> }) {
        const e = entries.find((x) => entryMatches(x, where));
        return e ? pick(e, select) : null;
      },
      async deleteMany({ where }: { where: Where }) {
        const before = entries.length;
        for (let i = entries.length - 1; i >= 0; i--) if (entryMatches(entries[i], where)) entries.splice(i, 1);
        return { count: before - entries.length };
      },
      async upsert(args: {
        where: { listingId_email: { listingId: string; email: string } };
        create: Partial<FakeEntry> & { listingId: string; email: string; firstName: string };
        update: Partial<FakeEntry>;
        select?: Record<string, boolean>;
      }) {
        const { listingId, email } = args.where.listingId_email;
        const found = entries.find((e) => e.listingId === listingId && e.email === email);
        const now = clock();
        if (found) {
          Object.assign(found, args.update, { updatedAt: now });
          return pick(found, args.select);
        }
        if (!listings.some((l) => l.id === listingId)) throw new Error("foreign key");
        const row: FakeEntry = { id: `e${next++}`, phone: null, createdAt: now, ...args.create, updatedAt: now };
        entries.push(row);
        return pick(row, args.select);
      },
    },
  };
  return { db: db as unknown as WaitlistDb, entries };
}

const NOW = new Date("2026-11-20T15:00:00Z");
const DANA = { firstName: "Dana", email: "dana@hg.localhost", phone: "716-555-1234" };
const listing = (over: Partial<FakeListing> = {}): FakeListing => ({ id: "l1", propertyId: "p1", status: "COMING_SOON", archived: false, ...over });

test("a Coming soon listing at a live property takes a sign-up", async () => {
  const { db, entries } = fakeDb([listing()], [], () => NOW);
  const r = await join(db, "l1", DANA, NOW);
  assert.deepEqual(r, { id: entries[0].id, listingId: "l1", propertyId: "p1" });
  assert.equal(entries.length, 1);
  const [e] = entries;
  assert.deepEqual({ listingId: e.listingId, firstName: e.firstName, email: e.email, phone: e.phone }, { listingId: "l1", ...DANA });
});

for (const status of ["HIDDEN", "AVAILABLE", "LEASED"] as const) {
  test(`a ${status} listing turns a sign-up down`, async () => {
    const { db, entries } = fakeDb([listing({ status })]);
    await assert.rejects(join(db, "l1", DANA, NOW), { message: NOT_TAKING_SIGN_UPS });
    assert.equal(entries.length, 0);
  });
}

test("a listing that's gone, or at an archived property, turns a sign-up down", async () => {
  const gone = fakeDb([listing()]);
  await assert.rejects(join(gone.db, "l-other", DANA, NOW), { message: NOT_TAKING_SIGN_UPS });
  const archived = fakeDb([listing({ archived: true })]);
  await assert.rejects(join(archived.db, "l1", DANA, NOW), { message: NOT_TAKING_SIGN_UPS });
  assert.equal(archived.entries.length, 0);
});

test("the daily cap counts new rows on every listing in the last 24 hours", async () => {
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);
  const filler = (i: number, at: Date): FakeEntry => ({
    id: `f${i}`,
    listingId: i % 2 ? "l1" : "l2",
    firstName: "Fill",
    email: `fill${i}@hg.localhost`,
    phone: null,
    createdAt: at,
    updatedAt: at,
  });
  const recent = Array.from({ length: DAILY_CAP }, (_, i) => filler(i, hoursAgo(1)));
  const full = fakeDb([listing(), listing({ id: "l2" })], recent);
  await assert.rejects(join(full.db, "l1", DANA, NOW), { message: TOO_MANY_TODAY });
  assert.equal(full.entries.length, DAILY_CAP);

  // One under the cap, or the same count but a day old: it goes through.
  const under = fakeDb([listing(), listing({ id: "l2" })], recent.slice(1));
  await join(under.db, "l1", DANA, NOW);
  assert.equal(under.entries.length, DAILY_CAP);
  const old = fakeDb([listing(), listing({ id: "l2" })], Array.from({ length: DAILY_CAP }, (_, i) => filler(i, hoursAgo(25))));
  await join(old.db, "l1", DANA, NOW);
  assert.equal(old.entries.length, DAILY_CAP + 1);
});

test("a second sign-up with the same email on the same listing updates the name and phone", async () => {
  const later = new Date(NOW.getTime() + 60_000);
  let clock = NOW;
  const { db, entries } = fakeDb([listing(), listing({ id: "l2" })], [], () => clock);
  const first = await join(db, "l1", DANA, NOW);
  clock = later;
  const second = await join(db, "l1", { firstName: "Dana Lee", email: DANA.email, phone: null }, later);
  assert.equal(second.id, first.id);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].firstName, "Dana Lee");
  assert.equal(entries[0].phone, null);
  assert.equal(entries[0].createdAt.getTime(), NOW.getTime());
  // The same email on another listing is another row.
  await join(db, "l2", DANA, later);
  assert.equal(entries.length, 2);
});

test("remove takes the row off and returns it whole for Undo", async () => {
  const at = new Date("2026-11-03T14:00:00.000Z");
  const row: FakeEntry = { id: "e9", listingId: "l1", ...DANA, createdAt: at, updatedAt: at };
  const { db, entries } = fakeDb([listing()], [row]);
  const removed = await remove(db, "p1", "e9");
  assert.deepEqual(removed, { id: "e9", listingId: "l1", ...DANA, createdAt: "2026-11-03T14:00:00.000Z" });
  assert.equal(entries.length, 0);
  // Already gone: nothing to undo, and not an error.
  assert.equal(await remove(db, "p1", "e9"), null);
});

test("remove only reaches a row on one of this property's listings", async () => {
  const at = new Date("2026-11-03T14:00:00.000Z");
  const { db, entries } = fakeDb([listing()], [{ id: "e9", listingId: "l1", ...DANA, createdAt: at, updatedAt: at }]);
  assert.equal(await remove(db, "p-other", "e9"), null);
  assert.equal(entries.length, 1);
});

test("restore puts the row back with its id and original createdAt, whatever the listing's status now", async () => {
  const at = new Date("2026-11-03T14:00:00.000Z");
  const row: FakeEntry = { id: "e9", listingId: "l1", ...DANA, createdAt: at, updatedAt: at };
  const { db, entries } = fakeDb([listing({ status: "AVAILABLE" })], [row], () => NOW);
  const removed = await remove(db, "p1", "e9");
  assert.ok(removed);
  const back = await restore(db, "p1", removed);
  assert.deepEqual(back, { id: "e9", listingId: "l1", ...DANA, createdAt: at });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].createdAt.toISOString(), "2026-11-03T14:00:00.000Z");
});

test("restore over a newer sign-up with the same email keeps the newer details and the original day", async () => {
  const at = new Date("2026-11-03T14:00:00.000Z");
  const { db, entries } = fakeDb([listing()], [{ id: "e9", listingId: "l1", ...DANA, createdAt: at, updatedAt: at }], () => NOW);
  const removed = await remove(db, "p1", "e9");
  assert.ok(removed);
  await join(db, "l1", { ...DANA, phone: null }, NOW);
  const back = await restore(db, "p1", removed);
  assert.equal(entries.length, 1);
  assert.equal(back.phone, null);
  assert.equal(back.createdAt.toISOString(), "2026-11-03T14:00:00.000Z");
});

test("restore refuses a listing that's gone, or isn't at this property", async () => {
  const removed = { id: "e9", listingId: "l1", ...DANA, createdAt: "2026-11-03T14:00:00.000Z" };
  const { db, entries } = fakeDb([listing()]);
  await assert.rejects(restore(db, "p1", { ...removed, listingId: "l-gone" }), { message: LISTING_GONE });
  await assert.rejects(restore(db, "p-other", removed), { message: LISTING_GONE });
  assert.equal(entries.length, 0);
});

test("the refusals are plain lines the action passes through", () => {
  for (const message of [NOT_TAKING_SIGN_UPS, TOO_MANY_TODAY, LISTING_GONE]) assert.equal(userMessage(new Error(message)), message);
});

test("a database error loses its values but keeps its name, its code and the ids", () => {
  const prismaError = Object.assign(new Error("Invalid `prisma.listingWaitlistEntry.upsert()` invocation: { email: \"dana@hg.localhost\" }"), {
    name: "PrismaClientKnownRequestError",
    code: "P2002",
  });
  const scrubbed = withoutValues(prismaError, { listingId: "l1", entryId: undefined });
  assert.ok(scrubbed instanceof Error);
  assert.equal(scrubbed.name, "PrismaClientKnownRequestError");
  assert.equal(scrubbed.message, "Sign-up list write failed (P2002) for listingId l1");
  assert.doesNotMatch(scrubbed.message, /dana/);
  assert.equal(userMessage(scrubbed), GENERIC_ERROR);
  // Our own refusals, and anything that isn't the database's, pass as they are.
  const refusal = new Error(NOT_TAKING_SIGN_UPS);
  assert.equal(withoutValues(refusal, { listingId: "l1" }), refusal);
});
