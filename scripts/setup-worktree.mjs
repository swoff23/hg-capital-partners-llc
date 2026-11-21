#!/usr/bin/env node
// npm run setup:worktree: gets a fresh git worktree ready for typecheck, the dev
// server and the device check. Run it again any time; each step skips itself
// when it's already done.
//
//   1. packages   npm ci, when node_modules is missing
//   2. .env       copied from the main checkout
//   3. database   one of its own, copied from the seed and brought up to this
//                 branch's migrations
//   4. prisma     generate, after .env exists (Prisma records where .env is)
//   5. report     the rows the device check needs, and Playwright's browsers
//
// Without this a new worktree borrows the main checkout's node_modules and
// database, and the failures look like code bugs: about 1,600 Prisma type
// errors, or device check pages that find no row.
//
// The seed is a local database that passes the device check (HG_SEED_DB,
// default hg_seed). It is only ever read. Make or refresh it by hand from a
// database you trust:
//   createdb hg_seed && pg_dump --no-owner --no-acl <source> | psql -q -d hg_seed
//
// The only database this writes to is the worktree's own, on localhost.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SEED_DB = process.env.HG_SEED_DB || "hg_seed";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const DB_NAME = /^[a-z0-9_]+$/;

const say = (status, step, note) => console.log(`${status.padEnd(5)} ${step.padEnd(9)} ${note}`);

function fail(step, note) {
  say("FAIL", step, note);
  process.exit(1);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

/** Runs a command, showing its output only when it fails. */
function quiet(step, command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    console.log(`${result.stdout ?? ""}${result.stderr ?? ""}`.trim());
    fail(step, `\`${command} ${args.join(" ")}\` failed.`);
  }
  return result.stdout ?? "";
}

/** DATABASE_URL from a .env file's text, and the line it sits on. */
function readDatabaseUrl(envText) {
  const line = envText.split("\n").find((l) => /^DATABASE_URL=/.test(l));
  if (!line) return null;
  const raw = line.slice("DATABASE_URL=".length).trim().replace(/^(["'])(.*)\1$/, "$2");
  try {
    return { line, url: new URL(raw) };
  } catch {
    return null;
  }
}

/** The URL for psql and pg_dump: the same server, another database, and none of Prisma's query (?schema=public). */
function libpqUrl(url, database) {
  const copy = new URL(url);
  copy.pathname = `/${database}`;
  copy.search = "";
  return copy.toString();
}

function psql(url, database, sql) {
  return quiet("database", "psql", ["-At", "-v", "ON_ERROR_STOP=1", "-d", libpqUrl(url, database), "-c", sql]).trim();
}

function databaseExists(url, name) {
  return psql(url, "postgres", `select 1 from pg_database where datname = '${name}'`) === "1";
}

// --- Where are we? -----------------------------------------------------------

const root = git(["rev-parse", "--show-toplevel"]);
const commonDir = path.resolve(root, git(["rev-parse", "--git-common-dir"]));
const mainCheckout = path.dirname(commonDir);
if (path.resolve(mainCheckout) === path.resolve(root)) {
  say("skip", "worktree", "This is the main checkout, which keeps its own .env and database. Nothing to set up.");
  process.exit(0);
}
process.chdir(root);

// --- 1. Packages -------------------------------------------------------------

let installed = false;
if (fs.existsSync(path.join(root, "node_modules", ".package-lock.json"))) {
  say("ok", "packages", "already installed");
} else {
  quiet("packages", "npm", ["ci", "--no-audit", "--no-fund"]);
  installed = true;
  say("ok", "packages", "installed with npm ci");
}

// --- 2. .env -----------------------------------------------------------------

const envFile = path.join(root, ".env");
const mainEnvFile = path.join(mainCheckout, ".env");
if (!fs.existsSync(mainEnvFile)) fail(".env", `The main checkout has no .env to copy (${mainEnvFile}). See README, Local development.`);
const mainDb = readDatabaseUrl(fs.readFileSync(mainEnvFile, "utf8"));
if (!mainDb) fail(".env", "The main checkout's .env has no DATABASE_URL this can read.");

let copiedEnv = false;
if (fs.existsSync(envFile)) {
  say("ok", ".env", "already here");
} else {
  fs.copyFileSync(mainEnvFile, envFile);
  copiedEnv = true;
  say("ok", ".env", "copied from the main checkout");
}

// --- 3. A database of its own ------------------------------------------------

let envText = fs.readFileSync(envFile, "utf8");
let own = readDatabaseUrl(envText);
if (!own) fail("database", "This worktree's .env has no DATABASE_URL this can read.");
if (!LOCAL_HOSTS.has(own.url.hostname)) fail("database", `DATABASE_URL points at ${own.url.hostname}. This only sets up a localhost database.`);

const mainName = mainDb.url.pathname.slice(1);
const nameOf = (url) => url.pathname.slice(1);
// "md-rules-cleanup-a90bda" becomes hg_md_rules_cleanup_scratch.
const slug = path
  .basename(root)
  .toLowerCase()
  .replace(/-[0-9a-f]{6}$/, "")
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 40);
const wanted = `hg_${slug}_scratch`;

if (nameOf(own.url) !== mainName && nameOf(own.url) !== SEED_DB) {
  if (!databaseExists(own.url, nameOf(own.url))) fail("database", `.env points at ${nameOf(own.url)}, which doesn't exist. Delete the DATABASE_URL line's database name back to ${mainName} and run this again.`);
  say("ok", "database", `${nameOf(own.url)} (already this worktree's own)`);
} else {
  if (!DB_NAME.test(wanted) || !DB_NAME.test(SEED_DB)) fail("database", `"${wanted}" or "${SEED_DB}" isn't a plain database name.`);
  if (databaseExists(own.url, wanted)) {
    say("ok", "database", `${wanted} (found from an earlier run)`);
  } else {
    if (!databaseExists(own.url, SEED_DB)) {
      fail(
        "database",
        `No seed database "${SEED_DB}". Make it from a local database that passes the device check:\n` +
          `      createdb ${SEED_DB} && pg_dump --no-owner --no-acl <source> | psql -q -d ${SEED_DB}`,
      );
    }
    psql(own.url, "postgres", `create database "${wanted}"`);
    // pg_dump into psql, not createdb -T: a template copy fails while anything is connected to the seed.
    const dump = spawnSync("pg_dump", ["--no-owner", "--no-acl", "-d", libpqUrl(own.url, SEED_DB)], {
      encoding: "buffer",
      maxBuffer: 1024 * 1024 * 1024,
    });
    if (dump.status !== 0) fail("database", `pg_dump of ${SEED_DB} failed: ${String(dump.stderr).trim()}`);
    const load = spawnSync("psql", ["-q", "-v", "ON_ERROR_STOP=1", "-d", libpqUrl(own.url, wanted)], {
      input: dump.stdout,
      encoding: "buffer",
    });
    if (load.status !== 0) fail("database", `Loading the copy into ${wanted} failed: ${String(load.stderr).trim().slice(0, 600)}`);
    say("ok", "database", `${wanted}, copied from ${SEED_DB}`);
  }
  const next = new URL(own.url);
  next.pathname = `/${wanted}`;
  const quote = /^DATABASE_URL=(["'])/.exec(own.line)?.[1] ?? "";
  envText = envText.replace(own.line, `DATABASE_URL=${quote}${next.toString()}${quote}`);
  fs.writeFileSync(envFile, envText);
  own = readDatabaseUrl(envText);
}

// --- 4. Prisma: the client, then this branch's migrations --------------------

// Generate after .env exists, even when npm ci just did: Prisma records where .env is.
const generate = installed || copiedEnv || !fs.existsSync(path.join(root, "node_modules", ".prisma", "client", "index.js"));
if (generate) quiet("prisma", "npx", ["prisma", "generate"]);
const ownName = nameOf(own.url);
if (ownName === mainName || ownName === SEED_DB || !LOCAL_HOSTS.has(own.url.hostname)) {
  fail("prisma", `Refusing to migrate ${ownName}: it isn't this worktree's own local database.`);
}
const migrate = quiet("prisma", "npx", ["prisma", "migrate", "deploy"], {
  env: { ...process.env, DATABASE_URL: own.url.toString() },
});
const applied = (migrate.match(/^Applying migration/gm) ?? []).length;
const client = generate ? "client generated, " : "";
say("ok", "prisma", applied ? `${client}${applied} migrations applied to ${ownName}` : `${client}${ownName} is up to date with this branch's migrations`);

// --- 5. What the device check will want --------------------------------------

const NEEDS = [
  ["a user who can sign in", `select count(*) from "User" where "passwordHash" is not null`],
  ["a contractor", `select count(*) from "Contact"`],
  ["a deal", `select count(*) from "Deal"`],
  ["a property", `select count(*) from "Property"`],
  ["a task", `select count(*) from "Task" where bucket <> 'Template'`],
  ["a lease", `select count(*) from "Lease"`],
  ["a playbook", `select count(*) from "TaskTemplate" where "archivedAt" is null`],
];
const missing = NEEDS.filter(([, sql]) => psql(own.url, ownName, sql) === "0").map(([what]) => what);
if (missing.length) say("warn", "rows", `${ownName} has no ${missing.join(", no ")}. The device check will fail those pages (tests/devices/routes.ts).`);
else say("ok", "rows", "every page the device check loads has a row to show");

// Report only. Installing here can remove browsers another project still uses.
const cache =
  process.env.PLAYWRIGHT_BROWSERS_PATH ||
  (process.platform === "darwin" ? path.join(os.homedir(), "Library/Caches/ms-playwright") : path.join(os.homedir(), ".cache/ms-playwright"));
try {
  const { browsers } = JSON.parse(fs.readFileSync(path.join(root, "node_modules/playwright-core/browsers.json"), "utf8"));
  const absent = browsers
    .filter((b) => b.name === "chromium" || b.name === "webkit")
    .filter((b) => !fs.existsSync(path.join(cache, `${b.name}-${b.revision}`)))
    .map((b) => b.name);
  if (absent.length) say("warn", "browsers", `Playwright's ${absent.join(" and ")} isn't downloaded. Before the device check: npx playwright install ${absent.join(" ")}`);
  else say("ok", "browsers", "Playwright's chromium and webkit are downloaded");
} catch {
  say("warn", "browsers", "Couldn't read Playwright's browser list from node_modules.");
}
