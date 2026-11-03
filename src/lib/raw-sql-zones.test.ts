import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The database driver (@prisma/adapter-pg, src/lib/db.ts) reads a timestamptz
 * result as if the session were UTC. The app's columns are timestamps without
 * a zone, and raw SQL turns every instant into one explicitly, so no read
 * depends on the session's time zone. This keeps it that way: in a file that
 * runs raw SQL, every `::timestamptz` is followed by `AT TIME ZONE 'UTC'`, and
 * nothing calls the database's now().
 */
const SRC = join(import.meta.dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

test("raw SQL never leaves an instant to the session's time zone", () => {
  const problems: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    if (!/\$queryRaw|\$executeRaw|Prisma\.sql/.test(text)) continue;
    const at = (i: number) => `${relative(SRC, file)}:${text.slice(0, i).split("\n").length}`;
    for (const m of text.matchAll(/::timestamptz(?!\)?\s*AT TIME ZONE 'UTC')/g)) problems.push(`${at(m.index)} ::timestamptz without AT TIME ZONE 'UTC'`);
    for (const m of text.matchAll(/(?<![.\w])(now\(\)|CURRENT_TIMESTAMP|LOCALTIMESTAMP)/g)) problems.push(`${at(m.index)} ${m[1]} in SQL`);
  }
  assert.deepEqual(problems, []);
});
