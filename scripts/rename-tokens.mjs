#!/usr/bin/env node
// Renames HG's old color names to shadcn's, one pass per file
// (docs/specs/design-foundation.md, section 7.2). The map and the matching
// live in scripts/token-renames.mjs; the file walk lives here.
//
//   node scripts/rename-tokens.mjs            rewrite every file in scope
//   node scripts/rename-tokens.mjs --dry-run  print counts per file and per token, write nothing
//   node scripts/rename-tokens.mjs --check    print every old name as file:line, exit 1 if any
//
// Scope: src/**/*.{ts,tsx,css} with tests, docs/**/*.md and CLAUDE.md.
// Skipped: docs/uiux-review/ (a dated audit), the design-foundation spec
// (it names the old tokens on purpose) and the renamer's own fixtures, which
// are scripts/ and any test that imports token-renames.mjs.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findOldNames, RENAMED, renameText } from "./token-renames.mjs";

export const ROOT = resolve(import.meta.dirname, "..");

const SKIP_DIRS = new Set(["node_modules", ".next", ".next-devices", ".git"]);
const SKIP_PATHS = ["docs/uiux-review/", "docs/specs/design-foundation.md"];

/** Repo-relative paths under `dir` (also repo-relative) whose names pass `keep`, with forward slashes. */
export function filesUnder(dir, keep) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...filesUnder(rel, keep));
    } else if (keep(entry.name)) out.push(rel);
  }
  return out;
}

/** A test that imports the rename module holds old names as fixtures, so it stays as written. */
export function isFixture(rel, text) {
  return /\.test\.tsx?$/.test(rel) && /token-renames\.mjs["']/.test(text);
}

/** Every file the rename covers, repo-relative with forward slashes, sorted. */
export function scopeFiles() {
  const files = [
    ...filesUnder("src", (name) => /\.(?:tsx?|css)$/.test(name)),
    ...filesUnder("docs", (name) => name.endsWith(".md")),
    "CLAUDE.md",
  ];
  return files
    .filter((rel) => !SKIP_PATHS.some((skip) => rel === skip || rel.startsWith(skip)))
    .filter((rel) => !isFixture(rel, readFileSync(join(ROOT, rel), "utf8")))
    .sort();
}

/** The 1-based line and column of `index` in `text`. */
export function lineAndColumn(text, index) {
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  return { line, column: index - before.lastIndexOf("\n") };
}

const KEYS_LONGEST_FIRST = Object.keys(RENAMED).sort((a, b) => b.length - a.length);

/** The per-token label, such as "fg-3 -> muted-foreground". `act` splits by where it lands. */
function tokenLabel(hit) {
  const key =
    hit.kind === "var"
      ? hit.match.replace(/^--(?:color-)?/, "")
      : KEYS_LONGEST_FIRST.find((k) => hit.match.endsWith(`-${k}`));
  if (key === "act") return hit.replacement.endsWith("-ring") ? "act -> ring" : "act -> primary";
  return `${key} -> ${RENAMED[key]}`;
}

/** Whether a file is app code, the set spec section 3.1 counts: src .ts or .tsx, not a test. */
function isCode(rel) {
  return rel.startsWith("src/") && /\.tsx?$/.test(rel) && !/\.test\.tsx?$/.test(rel);
}

function pad(text, width) {
  return String(text).padEnd(width);
}

function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const check = argv.includes("--check");
  const unknown = argv.filter((arg) => !["--dry-run", "--check"].includes(arg));
  if (unknown.length || (dryRun && check)) {
    console.error("Usage: node scripts/rename-tokens.mjs [--dry-run | --check]");
    return 2;
  }

  const perFile = [];
  const tokens = new Map();
  for (const rel of scopeFiles()) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    const hits = findOldNames(text);
    if (!hits.length) continue;
    perFile.push({ rel, text, hits });
    for (const hit of hits) {
      const label = tokenLabel(hit);
      const row = tokens.get(label) ?? { code: 0, codeFiles: new Set(), classes: 0, vars: 0 };
      if (hit.kind === "class") {
        row.classes++;
        if (isCode(rel)) {
          row.code++;
          row.codeFiles.add(rel);
        }
      } else row.vars++;
      tokens.set(label, row);
    }
  }

  const total = perFile.reduce((n, f) => n + f.hits.length, 0);

  if (check) {
    for (const { rel, text, hits } of perFile) {
      for (const hit of hits) {
        const { line, column } = lineAndColumn(text, hit.index);
        console.log(`${rel}:${line}:${column}  ${hit.match} -> ${hit.replacement}`);
      }
    }
    if (total) {
      console.log(`\n${total} old color names in ${perFile.length} files. Run node scripts/rename-tokens.mjs to rename them.`);
      return 1;
    }
    console.log("No old color names.");
    return 0;
  }

  const width = Math.max(0, ...perFile.map((f) => f.rel.length)) + 2;
  for (const { rel, text, hits } of perFile) {
    const classes = hits.filter((h) => h.kind === "class").length;
    console.log(`${pad(rel, width)}${pad(classes, 5)}classes ${hits.length - classes} vars`);
    if (!dryRun) {
      const renamed = renameText(text);
      if (renamed !== text) writeFileSync(join(ROOT, rel), renamed);
    }
  }

  console.log("\nPer token. Code is classes in src .ts and .tsx outside tests, the count in spec section 3.1.");
  console.log(`${pad("token", 46)}${pad("code (files)", 16)}${pad("all classes", 13)}vars`);
  let codeUses = 0;
  const codeFiles = new Set();
  for (const [label, row] of [...tokens].sort((a, b) => b[1].code - a[1].code || a[0].localeCompare(b[0]))) {
    console.log(`${pad(label, 46)}${pad(`${row.code} (${row.codeFiles.size})`, 16)}${pad(row.classes, 13)}${row.vars}`);
    codeUses += row.code;
    for (const rel of row.codeFiles) codeFiles.add(rel);
  }
  const classes = [...tokens.values()].reduce((n, row) => n + row.classes, 0);
  console.log(`\nCode: ${codeUses} class uses in ${codeFiles.size} files.`);
  console.log(`${dryRun ? "Would rename" : "Renamed"} ${total} old names in ${perFile.length} files: ${classes} classes, ${total - classes} vars.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
