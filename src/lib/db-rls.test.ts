/**
 * Guards the fix from `20260901200000_enable_row_level_security`.
 *
 * Supabase serves the `public` schema over PostgREST, so a table without RLS
 * is readable with the project's `anon` key — the linter's
 * `rls_disabled_in_public` ERROR. Prisma won't add RLS to a table it generates,
 * so a new model ships exposed unless someone remembers. This test remembers.
 *
 * Static only: it reads schema.prisma and the migration SQL, no database.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error("could not locate prisma/schema.prisma above " + process.cwd());
    dir = up;
  }
}

const root = repoRoot();

/** Table names Prisma will create: the model name, or its `@@map` override. */
function modelTables(): string[] {
  const schema = fs.readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
  const tables: string[] = [];
  for (const block of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = block;
    tables.push(body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name);
  }
  return tables;
}

/** Every migration's SQL, oldest first — directory names sort chronologically. */
function migrationSql(): string {
  const dir = path.join(root, "prisma", "migrations");
  return fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, "migration.sql")))
    .sort()
    .map((d) => fs.readFileSync(path.join(dir, d, "migration.sql"), "utf8"))
    .join("\n");
}

const sql = migrationSql();

/** Last RLS verb applied to `table` across all migrations, or null if never touched. */
function rlsState(table: string): "enabled" | "disabled" | null {
  const re = new RegExp(
    `ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:"public"\\.)?"${table}"\\s+(ENABLE|DISABLE)\\s+ROW\\s+LEVEL\\s+SECURITY`,
    "gi",
  );
  let last: string | null = null;
  for (const m of sql.matchAll(re)) last = m[1].toUpperCase();
  return last === "ENABLE" ? "enabled" : last === "DISABLE" ? "disabled" : null;
}

test("every Prisma model's table has RLS enabled by a migration", () => {
  const missing = modelTables().filter((t) => rlsState(t) !== "enabled");
  assert.deepEqual(
    missing,
    [],
    `Tables reachable with the Supabase anon key. Add to a migration:\n` +
      missing.map((t) => `  ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`).join("\n"),
  );
});

test("Prisma's own _prisma_migrations table has RLS enabled", () => {
  assert.equal(rlsState("_prisma_migrations"), "enabled");
});

test("no migration forces RLS on the owner", () => {
  // The app connects as the table owner, which bypasses RLS — that is the only
  // reason zero policies is safe. FORCE removes the owner's exemption, so with
  // no policies every app query would silently return nothing.
  const forced = [...sql.matchAll(/ALTER\s+TABLE\s+[^;]*?FORCE\s+ROW\s+LEVEL\s+SECURITY/gi)]
    .map((m) => m[0].replace(/\s+/g, " "))
    .filter((s) => !/NO\s+FORCE/i.test(s));
  assert.deepEqual(forced, [], "FORCE ROW LEVEL SECURITY would lock the app out of its own tables");
});
