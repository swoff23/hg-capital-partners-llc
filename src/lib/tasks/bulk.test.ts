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
    /tx\.\$queryRaw<[^>]*>`\s*SELECT "id", "status", "propertyId", "dealId" FROM "Task" WHERE "id" IN \(\$\{Prisma\.join\(ids\)\}\) ORDER BY "id" FOR NO KEY UPDATE`;/,
  );
  assert.doesNotMatch(restore, /tx\.task\.findMany/, "no unlocked read");
  assert.doesNotMatch(restore, /FOR UPDATE`/, "never FOR UPDATE, which the key-share locks of the lines it writes would wait on");
  assert.ok(restore.indexOf("$queryRaw") < restore.indexOf("core.patchTask"), "locked before the first patch");
  assert.match(restore, /for \(const r of rows\) \{\s*if \(isDraftStatus\(r\.status\)\) continue;\s*for \(const c of changes\) \{\s*if \(c\.id !== r\.id\) continue;/);
  assert.doesNotMatch(restore, /for \(const c of changes\) \{\s*if \(!exists/, "not in the list's own order");
});

// A draft from Claude isn't a task yet (docs/specs/tasks-from-claude.md 6.2): "Move all to today" never moves one, and
// an Undo never patches a task that became a draft again since its date moved (an Add's Undo).
test("neither bulk move touches a draft: a move takes active tasks only, and an Undo skips a draft under the lock", () => {
  const move = body("moveTaskDates");
  assert.match(move, /if \(!isActiveStatus\(r\.status\)\) continue;/, "a draft is not active (task-scope.test.ts), so it is passed over");
  assert.ok(move.indexOf("isActiveStatus") < move.indexOf("core.patchTask"), "skipped before any patch");
  const restore = body("restoreTaskDates");
  assert.ok(restore.indexOf("isDraftStatus") > restore.indexOf("$queryRaw"), "the status is read under the lock");
  assert.ok(restore.indexOf("isDraftStatus") < restore.indexOf("core.patchTask"), "skipped before any patch");
});

// The Tasks list's bulk edits (bulk-core.ts) skip a draft in one place each: every change and Undo takes its rows from
// lockTasks, which hands on tasks only, and Delete goes through deleteEach (bulk-core.test.ts and bulk.pg.test.ts run
// both). This file only wires them to the app's client, so the wiring is what's pinned: nothing here may reach a task
// another way.
test("every bulk edit in bulk.ts goes through bulk-core.ts, and bulk delete deletes only what deleteEach hands it", () => {
  const wired: Record<string, string> = {
    bulkSetStatus: "setStatusEach",
    undoBulkStatus: "undoStatusEach",
    bulkAssign: "assignEach",
    undoBulkAssign: "undoAssignEach",
    bulkMoveDates: "moveDatesEach",
    undoBulkMoveDates: "undoDatesEach",
    bulkSetProperty: "setPropertyEach",
    undoBulkProperty: "undoPropertyEach",
  };
  // Without the block comments: a function's slice runs on into the next one's.
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, "");
  const slice = (name: string) => bare.slice(bare.indexOf(`export async function ${name}`), bare.indexOf("\nexport ", bare.indexOf(`export async function ${name}`) + 1) >>> 0);
  for (const [name, each] of Object.entries(wired)) {
    const fn = slice(name);
    assert.match(fn, new RegExp(`await prisma\\.\\$transaction\\(\\(tx\\) => ${each}\\(tx, `), `${name} runs ${each} in one transaction`);
    assert.doesNotMatch(fn, /core\.\w+\(|tx\.task|prisma\.task|\$queryRaw|\$executeRaw|deleteTask/, `${name} writes nothing itself`);
  }
  assert.match(slice("bulkDeleteTasks"), /return deleteEach\(\s*prisma,\s*ids,\s*\(id\) => deleteTask\(id, p\),/);
  assert.equal(bare.match(/\bdeleteTask\(/g)?.length, 1, "service.deleteTask is called in one place, inside deleteEach's callback");
  // Every export is one of the eight above, Delete, or the two date moves the tests above hold to their own draft checks.
  const exported = [...bare.matchAll(/export async function (\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(exported, [...Object.keys(wired), "bulkDeleteTasks", "moveTaskDates", "restoreTaskDates"].sort());
  assert.equal(bare.match(/core\.patchTask\(/g)?.length, 2, "the only patches written here are moveTaskDates's and restoreTaskDates's");
  assert.doesNotMatch(bare, /core\.setStatus\(|\.task\.(update|updateMany|delete|deleteMany|create|upsert)\(/, "no other task write");
});

test("the note on why multi-task lock orders agree names what keeps them agreeing and what breaks it", () => {
  const source = readFileSync(join(import.meta.dirname, "bulk.ts"), "utf8");
  assert.match(source, /ids\s+\* sort by when the task was made/);
  assert.match(source, /newTaskId/);
  assert.match(source, /cuid2, UUIDs/);
});
