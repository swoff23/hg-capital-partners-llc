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

test("moveTaskDates patches its tasks in id order", () => {
  const move = body("moveTaskDates");
  assert.match(move, /tx\.task\.findMany\(\{[\s\S]*?orderBy: \{ id: "asc" \}[\s\S]*?\}\);\s*const moved/);
  assert.match(move, /for \(const r of rows\)/, "in the order the read returned");
});

test("restoreTaskDates puts the dates back in the same id order, whatever order the Undo's list came in", () => {
  const restore = body("restoreTaskDates");
  assert.match(restore, /tx\.task\.findMany\(\{[\s\S]*?orderBy: \{ id: "asc" \}[\s\S]*?\}\);/);
  assert.match(restore, /for \(const r of rows\) \{\s*for \(const c of changes\) \{\s*if \(c\.id !== r\.id\) continue;/);
  assert.doesNotMatch(restore, /for \(const c of changes\) \{\s*if \(!exists/, "not in the list's own order");
});
