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

/**
 * Where raw SQL reads a column that is a real timestamptz. The only ones in
 * the schema are Prisma's own bookkeeping table's (`_prisma_migrations`); the
 * app's tables use plain timestamps. A bare one in a SELECT list comes back
 * shifted by the session's offset, so it must read `finished_at AT TIME ZONE
 * 'UTC' AS finished_at`. Naming one after AS (the alias) or ORDER BY (it
 * returns no value), as a property (`r.finished_at`) or in a type
 * (`finished_at: Date`) is fine.
 */
export function bareTimestamptzColumns(text: string): { column: string; index: number }[] {
  const found: { column: string; index: number }[] = [];
  for (const m of text.matchAll(/(?<![.\w])(finished_at|rolled_back_at|started_at)\b(?!\s*:)(?!\s+AT TIME ZONE 'UTC')/g)) {
    const before = text.slice(0, m.index);
    if (/\bAS\s+$/i.test(before) || /\bORDER BY\s+$/i.test(before)) continue;
    found.push({ column: m[1], index: m.index });
  }
  return found;
}

/**
 * Where a parameter is cast `::timestamptz` without being an ISO string. A
 * Date handed to raw SQL goes to the driver as a timestamp with no offset, so
 * the cast reads it in the session's time zone and AT TIME ZONE 'UTC' then
 * shifts it. `${d.toISOString()}::timestamptz` carries the Z. A plain name is
 * fine when the file sets it from `.toISOString()` (`const lease = new
 * Date(...).toISOString();`).
 */
export function untypedInstants(text: string): { expr: string; index: number }[] {
  const found: { expr: string; index: number }[] = [];
  for (const m of text.matchAll(/\$\{([^}]*)\}::timestamptz/g)) {
    const expr = m[1].trim();
    if (/\.toISOString\(\)$/.test(expr)) continue;
    if (/^[A-Za-z_$][\w$]*$/.test(expr) && new RegExp(`\\b(?:const|let)\\s+${expr.replace(/\$/g, "\\$")}\\s*=\\s*[^;\\n]*\\.toISOString\\(\\)\\s*;`).test(text)) continue;
    found.push({ expr, index: m.index });
  }
  return found;
}

test("raw SQL never leaves an instant to the session's time zone", () => {
  const problems: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    if (!/\$queryRaw|\$executeRaw|Prisma\.sql/.test(text)) continue;
    const at = (i: number) => `${relative(SRC, file)}:${text.slice(0, i).split("\n").length}`;
    for (const m of text.matchAll(/::timestamptz(?!\)?\s*AT TIME ZONE 'UTC')/g)) problems.push(`${at(m.index)} ::timestamptz without AT TIME ZONE 'UTC'`);
    for (const m of text.matchAll(/(?<![.\w])(now\(\)|CURRENT_TIMESTAMP|LOCALTIMESTAMP)/g)) problems.push(`${at(m.index)} ${m[1]} in SQL`);
    for (const c of bareTimestamptzColumns(text)) problems.push(`${at(c.index)} ${c.column} (a timestamptz column) without AT TIME ZONE 'UTC'`);
    for (const p of untypedInstants(text)) problems.push(`${at(p.index)} \${${p.expr}}::timestamptz is not an ISO string (.toISOString())`);
  }
  assert.deepEqual(problems, []);
});

test("a parameter cast ::timestamptz must be an ISO string, or a name the file sets from one", () => {
  // ADP-2: a Date reaches the driver with no offset, so the cast reads it in the session's zone.
  assert.deepEqual(
    untypedInstants("SET \"sendAfter\" = (${until}::timestamptz AT TIME ZONE 'UTC') WHERE \"at\" <= (${now}::timestamptz AT TIME ZONE 'UTC')").map((p) => p.expr),
    ["until", "now"],
  );
  assert.deepEqual(untypedInstants("(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')"), []);
  assert.deepEqual(untypedInstants("(${new Date(now.getTime() + 5).toISOString()}::timestamptz AT TIME ZONE 'UTC')"), []);
  const named = "const lease = new Date(now.getTime() + LEASE_MS).toISOString();\n  sql`(${lease}::timestamptz AT TIME ZONE 'UTC')`";
  assert.deepEqual(untypedInstants(named), []);
  assert.deepEqual(untypedInstants("const lease = new Date(now.getTime() + LEASE_MS);\n  sql`(${lease}::timestamptz AT TIME ZONE 'UTC')`").map((p) => p.expr), ["lease"]);
});

test("a timestamptz column in a SELECT list is flagged until it is converted", () => {
  // /api/health selected these two bare, so its appliedAt was off by the session's offset in any non-UTC session.
  const before = `SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    ORDER BY started_at DESC`;
  assert.deepEqual(bareTimestamptzColumns(before).map((c) => c.column), ["finished_at", "rolled_back_at"]);
  const after = `SELECT migration_name,
      finished_at AT TIME ZONE 'UTC' AS finished_at,
      rolled_back_at AT TIME ZONE 'UTC' AS rolled_back_at
    FROM "_prisma_migrations"
    ORDER BY started_at DESC`;
  assert.deepEqual(bareTimestamptzColumns(after), []);
  // Reading the row in code is not a SELECT.
  assert.deepEqual(bareTimestamptzColumns("{ finished_at: Date | null }; r.finished_at?.toISOString()"), []);
  // And the route itself is clean.
  const route = readFileSync(join(SRC, "app/api/health/route.ts"), "utf8");
  assert.match(route, /finished_at AT TIME ZONE 'UTC' AS finished_at/);
  assert.match(route, /rolled_back_at AT TIME ZONE 'UTC' AS rolled_back_at/);
});
