import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RecentKind, TaskStatus } from "@prisma/client";
import { PORTAL_COOKIE_HTTP, PORTAL_COOKIE_HTTPS } from "@/lib/portal/cookie";
import { newToken } from "@/lib/portal/tokens";
import { readSessionToken, signSessionToken } from "@/lib/session-token";
import {
  answerRecent,
  MAX_QUERY,
  answerSearch,
  parseSearchParams,
  runSearch,
  type SearchDb,
  type SearchGroup,
  type TaskSearchRow,
} from "@/lib/search-results";

// ---------------------------------------------------------------------------
// An in-memory database that answers the calls the search makes. It reads the
// same `where` the route sends Prisma, so a Template filter dropped from the
// query shows up here as a Template row in the answer.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function matches(row: Row, cond: Row): boolean {
  return Object.entries(cond).every(([key, value]) => {
    if (key === "AND") return (value as Row[]).every((c) => matches(row, c));
    if (key === "OR") return (value as Row[]).some((c) => matches(row, c));
    const have = row[key];
    if (value !== null && typeof value === "object" && !(value instanceof Date)) {
      const filter = value as Row;
      if ("contains" in filter) {
        return typeof have === "string" && have.toLowerCase().includes(String(filter.contains).toLowerCase());
      }
      if ("not" in filter) return have !== filter.not;
      if ("in" in filter) return (filter.in as unknown[]).includes(have);
      // A relation: the row it points at has to match.
      return have !== null && have !== undefined && matches(have as Row, filter);
    }
    return have === value;
  });
}

function table(rows: Row[], log: string[], name: string) {
  const sorted = (list: Row[], orderBy?: { updatedAt?: "desc" }) =>
    orderBy?.updatedAt === "desc" ? [...list].sort((a, b) => +(b.updatedAt as Date) - +(a.updatedAt as Date)) : list;
  return {
    async findMany(args: { where?: Row; orderBy?: { updatedAt?: "desc" }; take?: number }) {
      log.push(`${name}.findMany`);
      return sorted(rows.filter((r) => matches(r, args.where ?? {})), args.orderBy).slice(0, args.take);
    },
    async count(args: { where?: Row }) {
      log.push(`${name}.count`);
      return rows.filter((r) => matches(r, args.where ?? {})).length;
    },
  };
}

type Data = { properties?: Row[]; tasks?: Row[]; deals?: Row[]; contacts?: Row[] };

function fakeDb(data: Data = {}) {
  const log: string[] = [];
  const db = {
    property: table(data.properties ?? [], log, "property"),
    task: table(data.tasks ?? [], log, "task"),
    deal: table(data.deals ?? [], log, "deal"),
    contact: table(data.contacts ?? [], log, "contact"),
  } as unknown as SearchDb;
  return { db, log };
}

const day = (n: number) => new Date(Date.UTC(2026, 9, n));

const property = (id: string, address: string, extra: Row = {}): Row => ({
  id,
  address,
  llcOwner: "HG Buffalo Holding 1 LLC",
  unitCount: 4,
  units: [],
  photoUrl: null,
  updatedAt: day(1),
  ...extra,
});

const task = (id: string, title: string, status: TaskStatus, extra: Row = {}): Row => ({
  id,
  title,
  status,
  bucket: "Property",
  dueDate: null,
  assigneeName: null,
  updatedAt: day(1),
  property: { address: "767 Prospect Ave, Buffalo, NY 14213" },
  deal: null,
  assignee: null,
  assigneeContact: null,
  ...extra,
});

const deal = (id: string, address: string, status: string, extra: Row = {}): Row => ({
  id,
  address,
  status,
  theirPrice: null,
  convertedPropertyId: null,
  updatedAt: day(1),
  ...extra,
});

const contact = (id: string, fullName: string, extra: Row = {}): Row => ({
  id,
  fullName,
  company: null,
  trades: null,
  active: true,
  updatedAt: day(1),
  ...extra,
});

const search = (db: SearchDb, q: string, extra: { type?: "property" | "task" | "deal" | "contractor"; limit?: number } = {}) =>
  runSearch(db, { q, ...extra });

const ids = (g: SearchGroup | undefined) => g?.rows.map((r) => r.id);
const group = (groups: SearchGroup[], type: SearchGroup["type"]) => groups.find((g) => g.type === type);

// ---------------------------------------------------------------------------
// Template rows
// ---------------------------------------------------------------------------

test("a Template task never comes back, in the rows or the total", async () => {
  const { db } = fakeDb({
    tasks: [
      task("live", "Coordinate closing time", "OPEN"),
      task("playbook", "Coordinate closing time", "OPEN", { bucket: "Template", property: null }),
      task("playbook-done", "Coordinate closing time", "DONE", { bucket: "Template", property: null }),
    ],
  });
  const { groups } = await search(db, "coordinate closing");
  const tasks = group(groups, "task");
  assert.deepEqual(ids(tasks), ["live"]);
  assert.equal(tasks?.total, 1);

  // Narrowed to tasks, and counted as "hits elsewhere" from another type, the same.
  assert.deepEqual(ids(group((await search(db, "coordinate closing", { type: "task" })).groups, "task")), ["live"]);
  const elsewhere = await search(db, "coordinate closing", { type: "deal" });
  assert.deepEqual(elsewhere.groups.map((g) => [g.type, g.total, g.rows.length]), [["task", 1, 0]]);
});

test("the route source takes the Template filter from the shared where, not a copy of its own", () => {
  const source = readFileSync(join(__dirname, "..", "..", "..", "lib", "search-results.ts"), "utf8");
  assert.match(source, /paletteTaskWhere\(q\)/);
  assert.match(source, /excludeTemplateTasks/);
});

// ---------------------------------------------------------------------------
// Who may search
// ---------------------------------------------------------------------------

test("no signed-in staff user: 401, and nothing is read", async () => {
  const { db, log } = fakeDb({ tasks: [task("t", "Fix porch light", "OPEN")] });
  const answer = await answerSearch(null, new URLSearchParams({ q: "porch" }), db);
  assert.equal(answer.status, 401);
  assert.deepEqual(answer.body, { error: "signed-out" });
  assert.deepEqual(log, []);

  const recent = await answerRecent(null, db, async () => {
    throw new Error("read the recents of nobody");
  });
  assert.equal(recent.status, 401);
  assert.deepEqual(log, []);
});

test("a contractor's portal session is not a staff session, so it gets the 401", () => {
  // getCurrentUser() reads the staff cookie and verifies it with readSessionToken. The portal keeps its
  // own cookie, by name, and its token is a random string: neither can pass for a staff session.
  assert.notEqual(PORTAL_COOKIE_HTTP, "hgos_session");
  assert.notEqual(PORTAL_COOKIE_HTTPS, "hgos_session");
  const secret = "test-secret-test-secret-test-secret";
  assert.equal(readSessionToken(newToken(), { secret, now: Date.now() }), null);
  const staff = signSessionToken("zack@hg.test", { secret, now: Date.now(), ttlMs: 60_000 });
  assert.equal(readSessionToken(staff, { secret, now: Date.now() })?.email, "zack@hg.test");
});

test("both routes ask who is calling before they answer anything", () => {
  for (const file of [["route.ts"], ["recent", "route.ts"]]) {
    const source = readFileSync(join(__dirname, ...file), "utf8");
    assert.match(source, /getCurrentUser/, `${file.join("/")} checks the staff session`);
    assert.ok(
      source.indexOf("getCurrentUser()") < source.search(/answer(Search|Recent)\(/),
      `${file.join("/")} looks up the user before it answers`,
    );
    assert.doesNotMatch(source, /getPortalPrincipal|requirePortalPrincipal/);
  }
});

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

test("under two characters, nothing is searched", async () => {
  const { db, log } = fakeDb({ properties: [property("p", "767 Prospect Ave")] });
  assert.deepEqual(await search(db, "7"), { groups: [] });
  assert.deepEqual(await search(db, " - . "), { groups: [] });
  assert.deepEqual(log, []);
});

test("groups come in a fixed order, four rows each, with every match counted", async () => {
  const many = Array.from({ length: 6 }, (_, i) => task(`t${i}`, `Roof check ${i}`, "OPEN", { updatedAt: day(i + 1), property: null }));
  const { db } = fakeDb({
    properties: [property("p1", "767 Prospect Ave, Buffalo, NY 14213")],
    tasks: many,
    deals: [deal("d1", "99 Prospect Ave, Buffalo, NY 14213", "2 - Medium", { theirPrice: "425000" })],
    contacts: [contact("c1", "Ana Prospect")],
  });
  const { groups } = await search(db, "prospect");
  assert.deepEqual(groups.map((g) => g.type), ["property", "deal", "contractor"]);

  const roofs = (await search(db, "roof")).groups;
  assert.deepEqual(roofs.map((g) => [g.type, g.total, g.rows.length]), [["task", 6, 4]]);
});

test("the order is Properties, Tasks, Deals, Contractors when all four match", async () => {
  const { db } = fakeDb({
    properties: [property("p1", "1 Maple St")],
    tasks: [task("t1", "Maple tree", "OPEN")],
    deals: [deal("d1", "2 Maple St", "5 - TBD")],
    contacts: [contact("c1", "Maple Co")],
  });
  assert.deepEqual((await search(db, "maple")).groups.map((g) => g.type), ["property", "task", "deal", "contractor"]);
});

test("rows carry what to choose by", async () => {
  const { db } = fakeDb({
    properties: [property("p1", "767 Prospect Ave, Buffalo, NY 14213", { units: [{ label: "1" }, { label: "2" }] })],
    tasks: [
      task("t1", "Fix porch light", "REVIEW", {
        dueDate: day(30),
        assignee: { name: "Zack", email: "z@hg.test" },
      }),
      task("t2", "Late one", "OPEN", { dueDate: new Date(Date.UTC(2020, 0, 2)), assigneeContact: { fullName: "Luis Ortiz" } }),
    ],
    deals: [deal("d1", "99 Prospect Ave, Buffalo, NY 14213", "CLOSED!", { theirPrice: "425000" })],
    contacts: [contact("c1", "Ana Prospect", { company: "Prospect Plumbing", trades: "Plumbing / Plumbing", active: false })],
  });
  const { groups } = await search(db, "prospect");
  assert.deepEqual(group(groups, "property")?.rows[0], {
    type: "property",
    id: "p1",
    href: "/properties/p1",
    title: "767 Prospect Ave",
    units: 2,
    owner: "HG Buffalo Holding 1 LLC",
    photoUrl: null,
  });
  assert.deepEqual(group(groups, "deal")?.rows[0], {
    type: "deal",
    id: "d1",
    href: "/deals/d1",
    title: "99 Prospect Ave",
    stage: "CLOSED!",
    asking: "425000",
  });
  assert.deepEqual(group(groups, "contractor")?.rows[0], {
    type: "contractor",
    id: "c1",
    href: "/contractors/c1",
    title: "Ana Prospect",
    trade: "Plumbing",
    company: "Prospect Plumbing",
    active: false,
  });

  const tasks = (await search(db, "prospect")).groups.find((g) => g.type === "task")!.rows as TaskSearchRow[];
  const porch = tasks.find((t) => t.id === "t1")!;
  assert.deepEqual(
    { place: porch.place, due: porch.due, overdue: porch.overdue, assignee: porch.assignee, status: porch.status },
    { place: "767 Prospect Ave", due: "2026-10-30", overdue: porch.overdue, assignee: { name: "Zack", contractor: false }, status: "REVIEW" },
  );
  assert.equal(porch.overdue, false, "Review is never overdue");
  const late = tasks.find((t) => t.id === "t2")!;
  assert.equal(late.overdue, true);
  assert.deepEqual(late.assignee, { name: "Luis Ortiz", contractor: true });
});

test("a property row carries its front photo once one is set", async () => {
  const url = "https://abc.public.blob.vercel-storage.com/properties/p1/photo/front.jpg";
  const { db } = fakeDb({ properties: [property("p1", "767 Prospect Ave, Buffalo, NY 14213", { photoUrl: url })] });
  const { groups } = await search(db, "prospect");
  assert.equal((group(groups, "property")?.rows[0] as { photoUrl: string | null }).photoUrl, url);
});

test("live work ranks first: an open task before a done one, an active contractor before an inactive one", async () => {
  const { db } = fakeDb({
    tasks: [
      task("done", "Replace smoke detectors", "DONE", { updatedAt: day(20) }),
      task("canceled", "Replace smoke detectors", "CANCELED", { updatedAt: day(25) }),
      task("open", "Replace smoke detectors", "IN_PROGRESS", { updatedAt: day(2) }),
    ],
    deals: [deal("pass", "5 Oak St", "Pass", { updatedAt: day(9) }), deal("high", "7 Oak St", "1 - High", { updatedAt: day(1) })],
    contacts: [contact("gone", "Oak Roofing", { active: false, updatedAt: day(9) }), contact("here", "Oak Painting", { updatedAt: day(1) })],
  });
  assert.deepEqual(ids(group((await search(db, "smoke")).groups, "task")), ["open", "done", "canceled"]);
  const oak = (await search(db, "oak")).groups;
  assert.deepEqual(ids(group(oak, "deal")), ["high", "pass"]);
  assert.deepEqual(ids(group(oak, "contractor")), ["here", "gone"]);
});

test("narrowed to one type: up to 20 rows, and when it has none the types that do come back with totals", async () => {
  const tasks = Array.from({ length: 25 }, (_, i) => task(`t${i}`, `Check ${i}`, "OPEN", { updatedAt: day((i % 25) + 1) }));
  const { db } = fakeDb({ tasks, deals: [deal("d1", "3 Check St", "5 - TBD"), deal("d2", "4 Check St", "5 - TBD")] });
  const scoped = await search(db, "check", { type: "task" });
  assert.equal(scoped.groups.length, 1);
  assert.equal(scoped.groups[0].rows.length, 20);
  assert.equal(scoped.groups[0].total, 25);
  assert.equal((await search(db, "check", { type: "task", limit: 6 })).groups[0].rows.length, 6);
  assert.equal((await search(db, "check", { type: "task", limit: 500 })).groups[0].rows.length, 20);

  const none = await search(db, "check", { type: "contractor" });
  assert.deepEqual(none.groups.map((g) => [g.type, g.total, g.rows.length]), [["task", 25, 0], ["deal", 2, 0]]);
  assert.deepEqual((await search(db, "zzzz", { type: "contractor" })).groups, []);
});

test("searching everything, a closed deal already converted into a shown property folds into it", async () => {
  const { db } = fakeDb({
    properties: [property("p1", "88 Elm St, Buffalo, NY")],
    deals: [
      deal("closed", "88 Elm St, Buffalo, NY", "CLOSED!", { convertedPropertyId: "p1" }),
      deal("other", "88 Elm Ter", "5 - TBD"),
    ],
  });
  const all = (await search(db, "88 elm")).groups;
  assert.deepEqual(ids(group(all, "deal")), ["other"]);
  assert.equal(group(all, "deal")?.total, 1, "the group counts what it shows, so no row hides behind its total");
  const scoped = (await search(db, "88 elm", { type: "deal" })).groups;
  assert.deepEqual(ids(group(scoped, "deal"))?.sort(), ["closed", "other"]);
  assert.equal(group(scoped, "deal")?.total, 2, "the Deals scope still holds both");
});

test("a group whose every deal folded into a property is left out of All", async () => {
  const { db } = fakeDb({
    properties: [property("p1", "88 Elm St, Buffalo, NY")],
    deals: [deal("closed", "88 Elm St, Buffalo, NY", "CLOSED!", { convertedPropertyId: "p1" })],
  });
  const all = (await search(db, "88 elm")).groups;
  assert.deepEqual(all.map((g) => g.type), ["property"]);
  assert.deepEqual(ids(group((await search(db, "88 elm", { type: "deal" })).groups, "deal")), ["closed"]);
});

test("only a CLOSED! deal folds: one still being worked keeps its row beside its property", async () => {
  const { db } = fakeDb({
    properties: [property("p1", "88 Elm St, Buffalo, NY")],
    deals: [deal("open", "88 Elm St, Buffalo, NY", "2 - Medium", { convertedPropertyId: "p1" })],
  });
  const all = (await search(db, "88 elm")).groups;
  assert.deepEqual(ids(group(all, "deal")), ["open"]);
  assert.equal(group(all, "deal")?.total, 1);
});

test("parseSearchParams: type and limit are checked", () => {
  assert.deepEqual(parseSearchParams(new URLSearchParams("q= roof &type=task&limit=7")), { q: "roof", type: "task", limit: 7 });
  assert.deepEqual(parseSearchParams(new URLSearchParams("q=roof")), { q: "roof", type: undefined, limit: undefined });
  assert.deepEqual(parseSearchParams(new URLSearchParams("type=widget")), { error: "bad-type" });
});

test("the query is bounded: a pasted page of text costs what a title does", async () => {
  // 400 distinct words took 1,153 ms and a 5,000-character term 722 ms, against ~100 ms for a normal query.
  const words = Array.from({ length: 400 }, (_, i) => `w${i}`).join(" ");
  const long = new URLSearchParams({ q: words });
  const parsed = parseSearchParams(long);
  assert.ok(!("error" in parsed));
  assert.ok(parsed.q.length <= MAX_QUERY, `${parsed.q.length} characters`);
  assert.ok(words.startsWith(parsed.q));
  const one = parseSearchParams(new URLSearchParams({ q: "x".repeat(5000) }));
  assert.equal("q" in one ? one.q.length : -1, MAX_QUERY);

  // runSearch bounds it too, whoever calls it: no spelling sent to the database is longer than the cap.
  const seen: string[] = [];
  const record = (args: unknown) =>
    JSON.stringify(args, (key, value) => {
      if (key === "contains" && typeof value === "string") seen.push(value);
      return value;
    });
  const recording = { findMany: async (args: unknown) => (record(args), []), count: async (args: unknown) => (record(args), 0) };
  const db = { property: recording, task: recording, deal: recording, contact: recording } as unknown as SearchDb;
  await runSearch(db, { q: "y".repeat(5000) });
  assert.ok(seen.length > 0);
  assert.ok(seen.every((s) => s.length <= MAX_QUERY), `longest spelling ${Math.max(...seen.map((s) => s.length))}`);
});

test("a bad type is a 400 and a database error is a 500 that is logged, not shown", async () => {
  const { db } = fakeDb();
  const staff = { id: "u1" };
  assert.equal((await answerSearch(staff, new URLSearchParams("q=roof&type=widget"), db)).status, 400);
  assert.equal((await answerSearch(staff, new URLSearchParams("q=roof"), db)).status, 200);

  const broken = { property: { findMany: async () => { throw new Error("db is down"); }, count: async () => 0 } } as unknown as SearchDb;
  const seen: unknown[] = [];
  const failed = await answerSearch(staff, new URLSearchParams("q=roof"), broken, (e) => seen.push(e));
  assert.equal(failed.status, 500);
  assert.deepEqual(failed.body, { error: "failed" });
  assert.equal(seen.length, 1);
});

// ---------------------------------------------------------------------------
// Recent
// ---------------------------------------------------------------------------

test("recent: newest first, records deleted since and Template tasks skipped, five shown", async () => {
  const { db } = fakeDb({
    properties: [property("p1", "767 Prospect Ave, Buffalo"), property("p2", "647 Prospect Ave, Buffalo")],
    tasks: [task("t1", "Fix porch light", "OPEN"), task("tpl", "Playbook step", "OPEN", { bucket: "Template" })],
    deals: [deal("d1", "99 Prospect Ave", "2 - Medium")],
    contacts: [contact("c1", "Luis Ortiz")],
  });
  const entries: { kind: RecentKind; recordId: string }[] = [
    { kind: "TASK", recordId: "tpl" },
    { kind: "PROPERTY", recordId: "gone" },
    { kind: "DEAL", recordId: "d1" },
    { kind: "TASK", recordId: "t1" },
    { kind: "CONTACT", recordId: "c1" },
    { kind: "PROPERTY", recordId: "p2" },
    { kind: "PROPERTY", recordId: "p1" },
  ];
  const answer = await answerRecent({ id: "u1" }, db, async (userId) => {
    assert.equal(userId, "u1");
    return entries;
  });
  assert.equal(answer.status, 200);
  if (answer.status !== 200) return;
  assert.deepEqual(
    answer.body.rows.map((r) => `${r.type}:${r.id}`),
    ["deal:d1", "task:t1", "contractor:c1", "property:p2", "property:p1"],
  );
});

test("recent: nothing opened yet is an empty list, and a failed read is a 500", async () => {
  const { db, log } = fakeDb();
  const empty = await answerRecent({ id: "u1" }, db, async () => []);
  assert.deepEqual(empty, { status: 200, body: { rows: [] } });
  assert.deepEqual(log, [], "no kind to look up, no query");

  const failed = await answerRecent({ id: "u1" }, db, async () => {
    throw new Error("db is down");
  });
  assert.equal(failed.status, 500);
});
