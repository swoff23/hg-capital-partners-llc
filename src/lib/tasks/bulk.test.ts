import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Moving dates on several tasks at once takes each task's row in turn (core.patchTask updates it), inside one
 * transaction. Two batches that share tasks (both partners' "Move all to today", a move and its Undo) must take them
 * the same way round, or each holds a row the other waits on (40P01). bulk.ts talks to the database and Next, which
 * node:test can't load, so this pins its source.
 */

const code = readFileSync(join(import.meta.dirname, "bulk.ts"), "utf8").replace(/\/\/.*$/gm, "");
const body = (name: string) => code.slice(code.indexOf(`export async function ${name}`), code.indexOf("\nexport ", code.indexOf(`export async function ${name}`) + 1) >>> 0);

test("moveTaskDates locks its tasks as it reads them, in id order, and reads each status under the lock", () => {
  const move = body("moveTaskDates");
  // One statement that takes each row in id order as it reads it: a task can't be deleted between the read and its
  // patch (which would fail the whole batch) or closed after the status check and still be moved.
  assert.match(
    move,
    /tx\.\$queryRaw<[\s\S]*?>`\s*SELECT "id", "status", "dueDate", "scheduledFor", "propertyId", "dealId" FROM "Task" WHERE "id" IN \(\$\{Prisma\.join\(unique\)\}\) ORDER BY "id" FOR NO KEY UPDATE`;/,
  );
  assert.doesNotMatch(move, /tx\.task\.findMany/, "no unlocked read");
  assert.doesNotMatch(move, /FOR UPDATE`/, "never FOR UPDATE, which the key-share locks of the lines it writes would wait on");
  assert.ok(move.indexOf("$queryRaw") < move.indexOf("isActiveStatus"), "the status is read under the lock");
  assert.ok(move.indexOf("$queryRaw") < move.indexOf("core.patchTask"), "locked before the first patch");
  assert.match(move, /for \(const r of rows\)/, "in the order the read returned");
  assert.match(move, /if \(!unique\.length\) return \[\];/, "an empty list reads nothing (Prisma.join needs one id)");
});

test("restoreTaskDates locks its tasks as it reads them, in the same id order, whatever order the Undo's list came in", () => {
  const restore = body("restoreTaskDates");
  // One statement that takes each row in id order as it reads it: a task can't be deleted between the read and its
  // patch (which would fail the whole Undo), and NO KEY UPDATE is the lock patchTask's own update takes.
  assert.match(
    restore,
    /tx\.\$queryRaw<[^>]*>`\s*SELECT "id", "propertyId", "dealId" FROM "Task" WHERE "id" IN \(\$\{Prisma\.join\(ids\)\}\) ORDER BY "id" FOR NO KEY UPDATE`;/,
  );
  assert.doesNotMatch(restore, /tx\.task\.findMany/, "no unlocked read");
  assert.doesNotMatch(restore, /FOR UPDATE`/, "never FOR UPDATE, which the key-share locks of the lines it writes would wait on");
  assert.ok(restore.indexOf("$queryRaw") < restore.indexOf("core.patchTask"), "locked before the first patch");
  assert.match(restore, /for \(const r of rows\) \{\s*for \(const c of changes\) \{\s*if \(c\.id !== r\.id\) continue;/);
  assert.doesNotMatch(restore, /for \(const c of changes\) \{\s*if \(!exists/, "not in the list's own order");
});

test("the note on why multi-task lock orders agree names what keeps them agreeing and what breaks it", () => {
  const source = readFileSync(join(import.meta.dirname, "bulk.ts"), "utf8");
  assert.match(source, /ids\s+\* sort by when the task was made/);
  assert.match(source, /newTaskId/);
  assert.match(source, /cuid2, UUIDs/);
});
