import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_MAX_AGE_MS,
  backupCommand,
  backupRefusal,
  describeDatabaseUrl,
  dumpDbname,
  envFileOf,
  HG_PROJECT_GID,
  inputRefusal,
  PROD_REF,
  writeRefusal,
  type BackupFacts,
} from "./target";
import { DEFAULT_WORLD } from "./__fixtures__/snapshot";

const LOCAL = "postgresql://connor@localhost:5432/hg_wf_import";
const POOLER = `postgresql://postgres.${PROD_REF}:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
const TUNNEL = `postgresql://postgres.${PROD_REF}:pw@127.0.0.1:6543/postgres?pgbouncer=true`;
const OTHER = "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

test("describeDatabaseUrl: a production URL is never local, even through a tunnel or a local pooler", () => {
  assert.deepEqual(describeDatabaseUrl(LOCAL), { host: "localhost", database: "hg_wf_import", local: true, isProdRef: false });
  assert.equal(describeDatabaseUrl(POOLER).local, false);
  assert.deepEqual(describeDatabaseUrl(TUNNEL), { host: "127.0.0.1", database: "postgres", local: false, isProdRef: true });
  assert.equal(describeDatabaseUrl("postgresql://u@[::1]:5432/x").local, true);
});

test("writeRefusal: dry runs anywhere; writes need a local database or --confirm-prod and the production URL", () => {
  const ok = { apply: true, confirmProd: PROD_REF };
  assert.equal(writeRefusal(describeDatabaseUrl(POOLER), { apply: false, confirmProd: undefined }), null);
  assert.equal(writeRefusal(describeDatabaseUrl(LOCAL), { apply: true, confirmProd: undefined }), null);
  assert.match(writeRefusal(describeDatabaseUrl(POOLER), { apply: true, confirmProd: undefined })!, /--confirm-prod/);
  assert.match(writeRefusal(describeDatabaseUrl(TUNNEL), { apply: true, confirmProd: undefined })!, /--confirm-prod/, "a tunnel to production still needs it");
  assert.equal(writeRefusal(describeDatabaseUrl(POOLER), ok), null);
  assert.equal(writeRefusal(describeDatabaseUrl(TUNNEL), ok), null);
  assert.match(writeRefusal(describeDatabaseUrl(OTHER), ok)!, /isn't the production project/);
});

test("inputRefusal: a synthetic fixture or another project only ever applies locally", () => {
  const prod = describeDatabaseUrl(POOLER);
  const real = { apply: true, synthetic: false, projectGid: HG_PROJECT_GID };
  assert.equal(inputRefusal(prod, real), null);
  assert.match(inputRefusal(prod, { ...real, synthetic: true })!, /SYNTHETIC/);
  assert.match(inputRefusal(describeDatabaseUrl(TUNNEL), { ...real, synthetic: true })!, /SYNTHETIC/);
  assert.match(inputRefusal(prod, { ...real, projectGid: DEFAULT_WORLD.projectGid })!, /only HG Capital/);
  assert.equal(inputRefusal(prod, { ...real, synthetic: true, apply: false }), null, "a dry run is fine");
  assert.equal(inputRefusal(describeDatabaseUrl(LOCAL), { apply: true, synthetic: true, projectGid: DEFAULT_WORLD.projectGid }), null);
  assert.notEqual(DEFAULT_WORLD.projectGid, HG_PROJECT_GID, "the fixture never carries the real project's gid");
});

test("backupRefusal: recent, non-empty, gitignored, and a dump of the database being written", () => {
  const t = describeDatabaseUrl(POOLER);
  const now = Date.parse("2026-10-26T15:00:00Z");
  const good: BackupFacts = { exists: true, bytes: 5_000_000, mtimeMs: now - 5 * 60_000, trackable: false, dumpDbname: "postgres" };
  assert.equal(backupRefusal("b.dump", good, t, now), null);
  assert.equal(backupRefusal("b.dump", { ...good, dumpDbname: null }, t, now), null, "no pg_restore: the other checks still hold");
  assert.match(backupRefusal("b.dump", { ...good, exists: false }, t, now)!, /doesn't exist/);
  assert.match(backupRefusal("b.dump", { ...good, bytes: 0 }, t, now)!, /empty/);
  assert.match(backupRefusal("b.dump", { ...good, mtimeMs: now - BACKUP_MAX_AGE_MS - 60_000 }, t, now)!, /minutes old/);
  assert.match(backupRefusal("b.dump", { ...good, trackable: true }, t, now)!, /not gitignored/);
  assert.match(backupRefusal("b.dump", { ...good, dumpDbname: "hg_wf_import" }, t, now)!, /dump of database "hg_wf_import"/);
});

test("dumpDbname: reads the header pg_restore -l prints", () => {
  const listing = ";\n; Archive created at 2026-10-22 23:09:39 EDT\n;     dbname: hg_wf_import\n;     TOC Entries: 221\n";
  assert.equal(dumpDbname(listing), "hg_wf_import");
  assert.equal(dumpDbname("nothing here"), null);
});

test("backupCommand: reads DATABASE_URL from the run's env file, not the operator's shell, and writes under _private/", () => {
  const cmd = backupCommand(".env.prod-write", "asana-load");
  assert.match(cmd, /node --env-file=\.env\.prod-write -p '/);
  assert.match(cmd, /searchParams\.delete/);
  assert.match(cmd, /-f _private\/backups\/hg-before-asana-load-\$\(date \+%Y%m%d-%H%M\)\.dump$/);
  assert.ok(!cmd.includes(`"$DATABASE_URL"`));
  assert.match(backupCommand("my env", "d25"), /--env-file='my env'/);
  assert.match(backupCommand(null, "d25"), /pg_dump "\$DATABASE_URL"/, "no env file: the shell's own DATABASE_URL is the run's");
});

test("envFileOf: the --env-file tsx passed to node", () => {
  assert.equal(envFileOf(["--require", "x.cjs", "--import", "y.mjs", "--env-file=.env.prod-write"]), ".env.prod-write");
  assert.equal(envFileOf(["--env-file", ".env"]), ".env");
  assert.equal(envFileOf(["--env-file=.env", "--env-file=.env.prod-write"]), ".env.prod-write");
  assert.equal(envFileOf([]), null);
});
