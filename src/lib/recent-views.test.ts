import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RecentKind } from "@prisma/client";
import {
  RECENT_KEEP,
  RECENT_KINDS,
  RECENT_MAX,
  isRecentKind,
  readRecentsIn,
  recordViewIn,
  type RecentViewDb,
} from "./recent-views-core";

// ---------------------------------------------------------------------------
// An in-memory RecentView table that answers the calls the core makes, with
// the unique (userId, kind, recordId) key the migration creates.
// ---------------------------------------------------------------------------

type Row = { id: string; userId: string; kind: RecentKind; recordId: string; viewedAt: Date };
type Where = { userId?: string; kind?: RecentKind | { in: RecentKind[] }; recordId?: string; id?: { in: string[] } };
type Order = Record<string, "asc" | "desc">;

function fakeTable(options: { raceOnce?: boolean } = {}) {
  const rows: Row[] = [];
  const ops: string[] = [];
  let seq = 0;
  let race = options.raceOnce ?? false;

  const matches = (row: Row, where: Where) =>
    (where.userId === undefined || row.userId === where.userId) &&
    (where.recordId === undefined || row.recordId === where.recordId) &&
    (where.kind === undefined || (typeof where.kind === "string" ? row.kind === where.kind : where.kind.in.includes(row.kind))) &&
    (where.id === undefined || where.id.in.includes(row.id));

  const sorted = (list: Row[], orderBy: Order[] = []) =>
    [...list].sort((a, b) => {
      for (const order of orderBy) {
        const [field, dir] = Object.entries(order)[0] as [keyof Row, "asc" | "desc"];
        const x = a[field] instanceof Date ? (a[field] as Date).getTime() : a[field];
        const y = b[field] instanceof Date ? (b[field] as Date).getTime() : b[field];
        if (x < y) return dir === "asc" ? -1 : 1;
        if (x > y) return dir === "asc" ? 1 : -1;
      }
      return 0;
    });

  const pick = (row: Row, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k as keyof Row]])) : { ...row };

  const recentView = {
    async upsert(args: {
      where: { userId_kind_recordId: { userId: string; kind: RecentKind; recordId: string } };
      create: Omit<Row, "id">;
      update: { viewedAt: Date };
      select?: Record<string, boolean>;
    }) {
      ops.push("upsert");
      const key = args.where.userId_kind_recordId;
      if (race) {
        // The other tab's insert lands first; this call loses on the unique key.
        race = false;
        rows.push({ id: `r${String(++seq).padStart(4, "0")}`, ...key, viewedAt: new Date(0) });
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
      const found = rows.find((r) => matches(r, key));
      if (found) {
        found.viewedAt = args.update.viewedAt;
        return pick(found, args.select);
      }
      const row = { id: `r${String(++seq).padStart(4, "0")}`, ...args.create };
      rows.push(row);
      return pick(row, args.select);
    },
    async updateMany(args: { where: Where; data: { viewedAt: Date } }) {
      ops.push("updateMany");
      const hit = rows.filter((r) => matches(r, args.where));
      for (const r of hit) r.viewedAt = args.data.viewedAt;
      return { count: hit.length };
    },
    async findMany(args: { where: Where; orderBy?: Order[]; skip?: number; take?: number; select?: Record<string, boolean> }) {
      ops.push("findMany");
      const list = sorted(rows.filter((r) => matches(r, args.where)), args.orderBy);
      const start = args.skip ?? 0;
      const end = args.take === undefined ? undefined : start + args.take;
      return list.slice(start, end).map((r) => pick(r, args.select));
    },
    async deleteMany(args: { where: Where }) {
      ops.push("deleteMany");
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], args.where)) rows.splice(i, 1);
      return { count: before - rows.length };
    },
  };

  return { db: { recentView } as unknown as RecentViewDb, rows, ops };
}

/** A clock that moves one minute per view, so newest-first is unambiguous. */
function clock(start = Date.UTC(2026, 9, 26, 12)) {
  let t = start;
  return () => new Date((t += 60_000));
}

const ids = (rows: { recordId: string }[]) => rows.map((r) => r.recordId);

// ---------------------------------------------------------------------------

test("recordView: the first view adds a row; a second view bumps it, never a second row", async () => {
  const { db, rows } = fakeTable();
  const at = clock();
  const first = at();
  assert.equal(await recordViewIn(db, "u-connor", "PROPERTY", "p1", first), true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].viewedAt.getTime(), first.getTime());

  const second = at();
  await recordViewIn(db, "u-connor", "PROPERTY", "p1", second);
  assert.equal(rows.length, 1, "one row per (user, kind, record)");
  assert.equal(rows[0].viewedAt.getTime(), second.getTime(), "viewedAt moved up");
});

test("recordView: the same id under another kind is another record", async () => {
  const { db, rows } = fakeTable();
  const at = clock();
  await recordViewIn(db, "u-connor", "TASK", "x1", at());
  await recordViewIn(db, "u-connor", "DEAL", "x1", at());
  assert.deepEqual(rows.map((r) => r.kind).sort(), ["DEAL", "TASK"]);
});

test("recordView: keeps the newest 20 per user and kind", async () => {
  const { db, rows } = fakeTable();
  const at = clock();
  for (let i = 1; i <= 25; i++) await recordViewIn(db, "u-connor", "PROPERTY", `p${i}`, at());

  assert.equal(RECENT_KEEP, 20);
  const kept = await readRecentsIn(db, "u-connor", { kinds: ["PROPERTY"], limit: 99 });
  assert.equal(rows.length, 20);
  assert.deepEqual(
    ids(kept),
    Array.from({ length: 20 }, (_, i) => `p${25 - i}`),
    "p25 down to p6: the five oldest went",
  );
});

test("recordView: pruning one kind leaves the other kinds and other people alone", async () => {
  const { db, rows } = fakeTable();
  const at = clock();
  for (let i = 1; i <= 3; i++) await recordViewIn(db, "u-connor", "TASK", `t${i}`, at());
  for (let i = 1; i <= 5; i++) await recordViewIn(db, "u-pieter", "PROPERTY", `p${i}`, at());
  for (let i = 1; i <= 30; i++) await recordViewIn(db, "u-connor", "PROPERTY", `p${i}`, at());

  const count = (userId: string, kind: RecentKind) => rows.filter((r) => r.userId === userId && r.kind === kind).length;
  assert.equal(count("u-connor", "PROPERTY"), 20);
  assert.equal(count("u-connor", "TASK"), 3, "Connor's tasks stay");
  assert.equal(count("u-pieter", "PROPERTY"), 5, "Pieter's properties stay");
});

test("recordView: reopening an old record moves it to the top, so the next prune keeps it", async () => {
  const { db } = fakeTable();
  const at = clock();
  for (let i = 1; i <= 20; i++) await recordViewIn(db, "u-connor", "DEAL", `d${i}`, at());
  await recordViewIn(db, "u-connor", "DEAL", "d1", at());
  await recordViewIn(db, "u-connor", "DEAL", "d21", at());

  const kept = ids(await readRecentsIn(db, "u-connor", { kinds: ["DEAL"] }));
  assert.equal(kept.length, 20);
  assert.deepEqual(kept.slice(0, 2), ["d21", "d1"]);
  assert.ok(!kept.includes("d2"), "d2 was the oldest, so it went");
  assert.ok(kept.includes("d1"));
});

test("recordView: a view in the same millisecond as another still prunes to 20", async () => {
  const { db, rows } = fakeTable();
  const same = new Date(Date.UTC(2026, 9, 26, 12));
  for (let i = 1; i <= 22; i++) await recordViewIn(db, "u-connor", "CONTACT", `c${i}`, same);
  assert.equal(rows.length, 20);
  // The id breaks the tie, newest insert first, so the two earliest inserts went.
  assert.deepEqual(ids(rows).sort(), Array.from({ length: 20 }, (_, i) => `c${i + 3}`).sort());
});

test("recordView: losing an insert race to another tab bumps the winner's row instead", async () => {
  const { db, rows, ops } = fakeTable({ raceOnce: true });
  const now = new Date(Date.UTC(2026, 9, 26, 12));
  assert.equal(await recordViewIn(db, "u-connor", "TASK", "t1", now), true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].viewedAt.getTime(), now.getTime());
  assert.deepEqual(ops.slice(0, 2), ["upsert", "updateMany"]);
});

test("recordView: any other database error reaches the caller", async () => {
  const { db } = fakeTable();
  const broken = {
    recentView: { ...db.recentView, upsert: async () => Promise.reject(Object.assign(new Error("offline"), { code: "P1001" })) },
  } as unknown as RecentViewDb;
  await assert.rejects(recordViewIn(broken, "u-connor", "TASK", "t1"), /offline/);
});

test("recordView: ids and kinds that can't be a record write nothing", async () => {
  const { db, rows, ops } = fakeTable();
  assert.equal(await recordViewIn(db, "u-connor", "PROPERTY", ""), false);
  assert.equal(await recordViewIn(db, "u-connor", "PROPERTY", " p1"), false);
  assert.equal(await recordViewIn(db, "u-connor", "PROPERTY", "p".repeat(65)), false);
  assert.equal(await recordViewIn(db, "", "PROPERTY", "p1"), false);
  assert.equal(await recordViewIn(db, "u-connor", "LISTING" as RecentKind, "p1"), false);
  assert.equal(rows.length, 0);
  assert.deepEqual(ops, [], "no query at all");
});

test("readRecents: newest first across kinds, 20 by default, one person's rows only", async () => {
  const { db } = fakeTable();
  const at = clock();
  await recordViewIn(db, "u-connor", "PROPERTY", "p1", at());
  await recordViewIn(db, "u-connor", "TASK", "t1", at());
  await recordViewIn(db, "u-pieter", "DEAL", "d9", at());
  await recordViewIn(db, "u-connor", "DEAL", "d1", at());
  await recordViewIn(db, "u-connor", "CONTACT", "c1", at());
  await recordViewIn(db, "u-connor", "PROPERTY", "p1", at());

  const all = await readRecentsIn(db, "u-connor");
  assert.deepEqual(
    all.map((r) => `${r.kind}:${r.recordId}`),
    ["PROPERTY:p1", "CONTACT:c1", "DEAL:d1", "TASK:t1"],
    "p1 reopened last, so it leads; Pieter's deal never shows",
  );
  assert.deepEqual(Object.keys(all[0]).sort(), ["kind", "recordId", "viewedAt"]);
  assert.ok(all[0].viewedAt instanceof Date);

  for (let i = 1; i <= 30; i++) await recordViewIn(db, "u-connor", "TASK", `x${i}`, at());
  assert.equal((await readRecentsIn(db, "u-connor")).length, RECENT_KEEP);
});

test("readRecents: limit is clamped to 1 through every row a person can have", async () => {
  const { db } = fakeTable();
  const at = clock();
  for (const kind of RECENT_KINDS) for (let i = 1; i <= 25; i++) await recordViewIn(db, "u-connor", kind, `${kind}-${i}`, at());

  assert.equal(RECENT_MAX, 80);
  assert.equal((await readRecentsIn(db, "u-connor", { limit: 5 })).length, 5);
  assert.equal((await readRecentsIn(db, "u-connor", { limit: 0 })).length, 1);
  assert.equal((await readRecentsIn(db, "u-connor", { limit: -3 })).length, 1);
  assert.equal((await readRecentsIn(db, "u-connor", { limit: 2.9 })).length, 2);
  assert.equal((await readRecentsIn(db, "u-connor", { limit: Number.NaN })).length, RECENT_KEEP);
  assert.equal((await readRecentsIn(db, "u-connor", { limit: 1000 })).length, RECENT_MAX);
});

test("readRecents: kinds narrows the list; an empty list or a bad user reads nothing", async () => {
  const { db, ops } = fakeTable();
  const at = clock();
  await recordViewIn(db, "u-connor", "PROPERTY", "p1", at());
  await recordViewIn(db, "u-connor", "TASK", "t1", at());
  await recordViewIn(db, "u-connor", "DEAL", "d1", at());

  assert.deepEqual(ids(await readRecentsIn(db, "u-connor", { kinds: ["PROPERTY", "DEAL", "DEAL"] })), ["d1", "p1"]);
  const queries = ops.length;
  assert.deepEqual(await readRecentsIn(db, "u-connor", { kinds: [] }), []);
  assert.deepEqual(await readRecentsIn(db, "", {}), []);
  assert.equal(ops.length, queries, "neither one queried");
});

test("isRecentKind: the four kinds the migration creates, nothing else", () => {
  assert.deepEqual([...RECENT_KINDS], ["PROPERTY", "DEAL", "TASK", "CONTACT"]);
  for (const kind of RECENT_KINDS) assert.ok(isRecentKind(kind));
  assert.ok(!isRecentKind("property"));
  assert.ok(!isRecentKind("LISTING"));
  assert.ok(!isRecentKind(undefined));
});

test("the enum in the migration matches RECENT_KINDS", () => {
  const sql = readFileSync(join(__dirname, "..", "..", "prisma", "migrations", "20261026083921_recent_views", "migration.sql"), "utf8");
  const values = sql.match(/CREATE TYPE "RecentKind" AS ENUM \(([^)]*)\)/)?.[1];
  assert.ok(values, "the migration creates RecentKind");
  assert.deepEqual(values.split(",").map((v) => v.trim().replace(/'/g, "")), [...RECENT_KINDS]);
});

test("recent-views.ts stays server-only and never lets a failed write reach the page", () => {
  // It imports the Prisma client, so this reads its source instead of importing it.
  const source = readFileSync(join(__dirname, "recent-views.ts"), "utf8");
  assert.match(source, /^import "server-only";/);
  const recordView = source.slice(source.indexOf("export async function recordView"), source.indexOf("export async function readRecents"));
  assert.match(recordView, /try \{[\s\S]*recordViewIn\(prisma[\s\S]*\} catch \(err\) \{[\s\S]*logError\(/);
});
