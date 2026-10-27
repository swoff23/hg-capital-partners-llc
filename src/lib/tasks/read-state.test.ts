import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { countsAsUnread as ruleInActivity } from "./activity";
import {
  READ_STATE_SINCE,
  countsAsUnread,
  lastSeenIn,
  markSeenIn,
  otherPartnersSeenIn,
  seenBaseline,
  unreadTaskIdsIn,
} from "./read-state-core";

test("READ_STATE_SINCE is one fixed instant, not the time the code loaded", () => {
  assert.ok(READ_STATE_SINCE instanceof Date);
  assert.ok(!Number.isNaN(READ_STATE_SINCE.getTime()));
  assert.equal(READ_STATE_SINCE.toISOString(), "2026-10-27T11:00:00.000Z");
});

test("seenBaseline: a partner with no row has seen everything before the release", () => {
  assert.equal(seenBaseline(null), READ_STATE_SINCE);
  assert.equal(seenBaseline(undefined), READ_STATE_SINCE);
  // An event from before the release is at or before the baseline: seen.
  const before = new Date(READ_STATE_SINCE.getTime() - 60_000);
  assert.ok(before.getTime() <= seenBaseline(null).getTime());
});

test("seenBaseline: a row's lastSeenAt is the baseline, so the dot and the divider agree", () => {
  const opened = new Date("2026-11-03T15:00:00.000Z");
  assert.equal(seenBaseline(opened), opened);
});

test("rows before READ_STATE_SINCE read as seen, and the first one after it as new", () => {
  const written = (createdAt: Date) => ({ kind: "COMMENT", source: "PORTAL", actorUserId: null, actorContactId: "c-zack", createdAt });
  const base = seenBaseline(null);
  assert.equal(countsAsUnread(written(new Date(READ_STATE_SINCE.getTime() - 1)), "u-connor", base), false);
  assert.equal(countsAsUnread(written(READ_STATE_SINCE), "u-connor", base), false, "at the release is seen");
  assert.equal(countsAsUnread(written(new Date(READ_STATE_SINCE.getTime() + 1)), "u-connor", base), true);
  // Once the partner opens the task, their row is the baseline and the release no longer matters.
  const opened = new Date(READ_STATE_SINCE.getTime() + 3_600_000);
  assert.equal(countsAsUnread(written(new Date(opened.getTime() - 1)), "u-connor", seenBaseline(opened)), false);
  assert.equal(countsAsUnread(written(new Date(opened.getTime() + 1)), "u-connor", seenBaseline(opened)), true);
});

test("the unread rule is the timeline's: one function", () => {
  assert.equal(countsAsUnread, ruleInActivity);
});

/* ---------------- The queries, on a fake client ---------------- */

type Call = { sql: string; values: unknown[] };

function fakeDb(rows: unknown[] = []) {
  const queries: Call[] = [];
  const upserts: unknown[] = [];
  const db = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push({ sql: strings.join("?"), values });
      return rows;
    },
    taskReadState: {
      findUnique: async (args: unknown) => {
        upserts.push(["findUnique", args]);
        return rows[0] ?? null;
      },
      findMany: async (args: unknown) => {
        upserts.push(["findMany", args]);
        return rows;
      },
      upsert: async (args: unknown) => {
        upserts.push(args);
        if (failure) throw failure;
        return {};
      },
    },
  };
  let failure: unknown = null;
  return { db: db as never, queries, upserts, fail: (e: unknown) => (failure = e) };
}

test("unreadTaskIdsIn: counts app and portal rows by someone else after COALESCE(lastSeenAt, release), in one query", async () => {
  const { db, queries } = fakeDb([{ taskId: "t1" }, { taskId: "t3" }]);
  const ids = await unreadTaskIdsIn(db, "u-connor", ["t1", "t2", "t3"]);
  assert.deepEqual([...ids].sort(), ["t1", "t3"]);
  assert.equal(queries.length, 1);
  const sql = queries[0].sql;
  assert.match(sql, /"TaskReadState" r ON r\."taskId" = e\."taskId" AND r\."userId" = \?/);
  assert.match(sql, /e\."deletedAt" IS NULL/);
  assert.match(sql, /e\."source" IN \('APP', 'PORTAL'\)/);
  assert.match(sql, /e\."actorUserId" IS DISTINCT FROM \?/);
  assert.match(sql, /e\."createdAt" > COALESCE\(r\."lastSeenAt", \?\)/);
  assert.match(sql, /e\."kind" = 'COMMENT' OR \(e\."actorContactId" IS NOT NULL AND e\."kind" IN \('ATTACHMENT', 'STATUS'\)\)/);
  // The user, the task ids and the release instant are parameters, never pasted in.
  assert.equal(queries[0].values[0], "u-connor");
  assert.ok(queries[0].values.some((v) => !!v && typeof v === "object" && "values" in v && (v as { values: unknown[] }).values.includes("2026-10-27T11:00:00.000Z")));
  assert.ok(!sql.includes("u-connor") && !sql.includes("t1"));
});

test("unreadTaskIdsIn: nothing to ask about asks nothing", async () => {
  const { db, queries } = fakeDb();
  assert.equal((await unreadTaskIdsIn(db, "u-connor", [])).size, 0);
  assert.equal(queries.length, 0);
});

test("lastSeenIn: null for a partner who never opened it", async () => {
  assert.equal(await lastSeenIn(fakeDb().db, "u-connor", "t1"), null);
  const opened = new Date("2026-11-03T15:00:00Z");
  assert.equal(await lastSeenIn(fakeDb([{ lastSeenAt: opened }]).db, "u-connor", "t1"), opened);
});

test("markSeenIn: upserts the partner's row for the task, and two tabs at once are fine", async () => {
  const now = new Date("2026-11-03T15:00:00Z");
  const a = fakeDb();
  await markSeenIn(a.db, "u-connor", "t1", now);
  assert.deepEqual(a.upserts[0], {
    where: { taskId_userId: { taskId: "t1", userId: "u-connor" } },
    create: { taskId: "t1", userId: "u-connor", lastSeenAt: now },
    update: { lastSeenAt: now },
  });
  // The second tab loses the create race: the row exists, which is the same fact.
  const b = fakeDb();
  b.fail(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }));
  await markSeenIn(b.db, "u-connor", "t1", now);
  // Anything else is not swallowed.
  const c = fakeDb();
  c.fail(new Error("connection lost"));
  await assert.rejects(markSeenIn(c.db, "u-connor", "t1", now), /connection lost/);
});

test("otherPartnersSeenIn: the other partners' opens, newest first, never your own", async () => {
  const { db, upserts } = fakeDb([
    { userId: "u-pieter", lastSeenAt: new Date("2026-11-03T15:00:00Z") },
    { userId: null, lastSeenAt: new Date("2026-11-03T14:00:00Z") },
  ]);
  const seen = await otherPartnersSeenIn(db, "u-connor", "t1");
  assert.deepEqual(seen.map((s) => s.userId), ["u-pieter"]);
  const [, args] = upserts[0] as [string, { where: unknown; orderBy: unknown }];
  assert.deepEqual(args.where, { taskId: "t1", userId: { not: null, notIn: ["u-connor"] } });
  assert.deepEqual(args.orderBy, { lastSeenAt: "desc" });
});

test("read state never stamps the Task row, so opening a task can't stall the Asana delta", () => {
  for (const file of ["read-state-core.ts", "read-state.ts"]) {
    const source = fs.readFileSync(path.join(import.meta.dirname, file), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /\btask\.(update|updateMany|upsert)\b/, file);
    assert.doesNotMatch(code, /editStamp|appEditedAt/, file);
  }
});

test("read-state.ts stays server-only and binds the app's client", () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, "read-state.ts"), "utf8");
  assert.match(source, /^import "server-only";/);
  assert.match(source, /unreadTaskIdsIn\(prisma, /);
});
