#!/usr/bin/env node
// Claude Code PreToolUse hook (see .claude/settings.json). Holds back a
// `git commit` from Claude while UI files have changed since the last complete
// device check (npm run test:devices), or while that check has new errors.
// Exit 2 blocks the command and shows Claude the reason. Anything unexpected
// exits 0, so the gate never gets in the way of unrelated work.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Files that change what a page looks like: pages and components (not API
// routes), CSS, and the Next and PostCSS config. src/lib is left out so
// service and QuickBooks changes don't need a device run.
const UI_FILE = /^src\/(components\/|app\/(?!api\/))|\.css$|^(next|postcss)\.config\.|^public\//;
const GIT_COMMIT = /\bgit\b[^\n;&|]*\bcommit\b(?!-)/;

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function block(reason) {
  process.stderr.write(
    `Device check needed before committing UI changes. ${reason}\n` +
      "Run `npm run test:devices` (about 3 minutes; in a fresh checkout run " +
      "`npx playwright install chromium webkit` first), look over device-report/index.html, " +
      "then commit again.\n",
  );
  process.exit(2);
}

function main() {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  const command = input?.tool_input?.command ?? "";
  if (!GIT_COMMIT.test(command)) return;

  const root = git(["rev-parse", "--show-toplevel"], input.cwd || process.cwd()).trim();
  if (!fs.existsSync(path.join(root, "tests/devices/devices.spec.ts"))) return;

  // Staged, unstaged and new files all count: a `git add -A && git commit`
  // hasn't staged anything yet when this runs.
  const changed = new Set(
    [
      ...git(["diff", "--name-only", "-z", "HEAD"], root).split("\0"),
      ...git(["ls-files", "--others", "--exclude-standard", "-z"], root).split("\0"),
    ].filter((f) => f && UI_FILE.test(f)),
  );
  const edited = [...changed]
    .map((f) => ({ f, mtime: fs.statSync(path.join(root, f), { throwIfNoEntry: false })?.mtimeMs ?? 0 }))
    .filter((x) => x.mtime > 0);
  if (!edited.length) return;

  const runFile = path.join(root, "device-report/last-run.json");
  if (!fs.existsSync(runFile)) block("No device check has run in this checkout yet.");
  const run = JSON.parse(fs.readFileSync(runFile, "utf8"));

  if (!run.complete) {
    block("The last run was limited to some pages or devices. Run the whole suite.");
  }
  const since = Number(run.startedAt) || 0;
  const stale = edited.filter((x) => x.mtime > since).map((x) => x.f);
  if (stale.length) {
    const list = stale.slice(0, 5).join(", ") + (stale.length > 5 ? ` and ${stale.length - 5} more` : "");
    block(`Changed since the last run: ${list}.`);
  }
  if (run.pagesWithNewErrors?.length) {
    process.stderr.write(
      `The last device check found new errors on ${run.pagesWithNewErrors.join(", ")}. ` +
        "Fix them, or ask Connor whether to accept them as known issues " +
        "(`npm run test:devices:known`) before committing.\n",
    );
    process.exit(2);
  }
}

try {
  main();
} catch {
  process.exit(0);
}
