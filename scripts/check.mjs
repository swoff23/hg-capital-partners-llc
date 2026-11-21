#!/usr/bin/env node
// npm run check: typecheck, lint and the unit tests, side by side. A check that
// passes prints one line. One that fails prints its own output, minus the
// passing tests, and the run exits 1. CI runs the same three one at a time
// (.github/workflows/ci.yml). The device check is separate (npm run test:devices).
import { spawn } from "node:child_process";

const CHECKS = [
  { name: "typecheck", script: "typecheck" },
  { name: "lint", script: "lint" },
  { name: "unit tests", script: "test" },
];

function run({ name, script }) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "--silent", script], {
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => resolve({ name, script, code: 1, output: String(error), seconds: "0.0" }));
    child.on("close", (code) =>
      resolve({ name, script, code: code ?? 1, output, seconds: ((Date.now() - started) / 1000).toFixed(1) }),
    );
  });
}

/**
 * What's worth reading from a failed check. node:test ends a failed run with
 * its counts and a "failing tests" section, so the unit tests show just those.
 * Anything else shows whole, minus passing (✔) and skipped (﹣) test lines.
 */
function failureOutput(output) {
  const lines = output.split("\n");
  const failing = lines.findIndex((line) => /^✖ failing tests:/.test(line));
  if (failing !== -1) {
    const counts = lines.filter((line) => /^ℹ (tests|pass|fail|skipped) /.test(line));
    return [...counts, "", ...lines.slice(failing)].join("\n").trim();
  }
  return lines
    .filter((line) => !/^\s*[✔﹣]/.test(line))
    .join("\n")
    .trim();
}

/** Lint passes with warnings (hg/filler-copy), which are read case by case, so say when there are some. */
function passNote({ script, output }) {
  if (script !== "lint") return "";
  const warnings = /\b(\d+) warnings?\b/.exec(output)?.[1];
  return warnings && warnings !== "0" ? `, ${warnings} warnings: run \`npm run lint\` to read them` : "";
}

const results = await Promise.all(CHECKS.map(run));
for (const result of results) {
  if (result.code === 0) console.log(`ok    ${result.name} (${result.seconds}s${passNote(result)})`);
}
const failed = results.filter((result) => result.code !== 0);
for (const result of failed) {
  console.log(`\nFAIL  ${result.name} (${result.seconds}s), from \`npm run ${result.script}\`:\n`);
  console.log(failureOutput(result.output));
}
process.exit(failed.length ? 1 : 0);
