#!/usr/bin/env node
// The record of every stock shadcn/ui file (docs/specs/design-foundation.md,
// section 5.6). The registry is served live and unversioned, so when an item
// is pulled its registry JSON is saved here as <item>.json, and the hash of
// each file `add` wrote goes in files.json. A stock file whose hash still
// matches has no local edit; table.tsx is checked against its recorded edit.
//
//   node scripts/shadcn-snapshot/snapshot.mjs record <item|url> ...
//       After `npx shadcn@4.23.0 add <item>`: saves the item's JSON and the
//       hash of every file it and its registry dependencies wrote. A file
//       that's already recorded keeps its entry; if it no longer matches its
//       hash, record stops and writes nothing, so an edit is never blessed.
//   node scripts/shadcn-snapshot/snapshot.mjs record --update <item|url> ...
//       After `add --overwrite`: takes the new hash of files already recorded.
//   node scripts/shadcn-snapshot/snapshot.mjs record --edit "<why>" <item|url>
//       The same for a file that carries a recorded edit (base-vega's table).
//   node scripts/shadcn-snapshot/snapshot.mjs check
//       Every file in src/components/ui/ matches its recorded hash, and none
//       is unrecorded. Prints each problem and exits 1 if there is one.
//
// `--root <dir>` runs either against another checkout (used to try it out).
// src/lib/shadcn-snapshot.test.ts runs the check in `npm test`.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_ROOT = resolve(import.meta.dirname, "../..");
const REGISTRY = "https://ui.shadcn.com/r/styles";

const snapshotDir = (root) => join(root, "scripts/shadcn-snapshot");
const filesJson = (root) => join(snapshotDir(root), "files.json");

/** components.json, which `add` reads for the style and the folders. */
function componentsConfig(root) {
  return JSON.parse(readFileSync(join(root, "components.json"), "utf8"));
}

/** `@/components/ui` to `src/components/ui`, through tsconfig's `@/*` path. */
function aliasToPath(alias) {
  if (!alias.startsWith("@/")) throw new Error(`Alias "${alias}" isn't under @/, so its folder is unknown.`);
  return `src/${alias.slice(2)}`;
}

/** Where `add` writes one registry file, repo-relative. */
export function targetPath(file, config) {
  if (file.target) return file.target.replace(/^~\//, "");
  const folder = {
    "registry:ui": config.aliases.ui,
    "registry:hook": config.aliases.hooks,
    "registry:lib": config.aliases.lib,
    "registry:component": config.aliases.components,
  }[file.type];
  if (!folder) throw new Error(`No folder for a ${file.type} file (${file.path}).`);
  return `${aliasToPath(folder)}/${basename(file.path)}`;
}

/** The stock folder, repo-relative, from components.json. */
export function stockFolder(root = DEFAULT_ROOT) {
  return aliasToPath(componentsConfig(root).aliases.ui);
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function readRecord(root = DEFAULT_ROOT) {
  return existsSync(filesJson(root)) ? JSON.parse(readFileSync(filesJson(root), "utf8")) : {};
}

function stockFiles(root) {
  const folder = join(root, stockFolder(root));
  if (!existsSync(folder)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // Dotfiles (Finder's .DS_Store) aren't stock files, and git ignores them.
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(root, full).split("\\").join("/"));
    }
  };
  walk(folder);
  return out.sort();
}

/** Every way the stock folder differs from the record, as one line each. Empty means it matches. */
export function checkSnapshot(root = DEFAULT_ROOT) {
  const record = readRecord(root);
  const problems = [];
  for (const [path, entry] of Object.entries(record)) {
    const full = join(root, path);
    if (!existsSync(full)) {
      problems.push(`${path}: recorded from "${entry.item}" but missing. Delete its entry in files.json if the item went on purpose.`);
      continue;
    }
    if (sha256(readFileSync(full, "utf8")) !== entry.sha256) {
      problems.push(
        entry.edit
          ? `${path}: differs from its recorded edit (${entry.edit}). Reapply that edit only, then record it again.`
          : `${path}: edited since \`shadcn add\` wrote it. Stock files stay as written; take the misfit to Connor.`,
      );
    }
  }
  for (const path of stockFiles(root)) {
    if (!record[path]) problems.push(`${path}: not in the record. Pull stock files with \`npx shadcn@4.23.0 add\`, then run \`snapshot.mjs record\`.`);
  }
  return problems;
}

async function fetchItem(spec, style) {
  const url = /^https?:\/\//.test(spec) ? spec : `${REGISTRY}/${style}/${spec}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}.`);
  return { url, item: await res.json() };
}

/**
 * Saves each item's JSON and its files' hashes, following registry dependencies.
 *
 * A file already in the record keeps its entry, its `edit` note included, when
 * it still matches. One that doesn't stops the whole run before anything is
 * written, since recording a dependency must never bless a hand edit to it;
 * `update` (after `add --overwrite`) takes the new hash instead. An item's
 * JSON is saved only when it records or updates a file, so the saved JSON
 * stays the version that wrote the files.
 *
 * @param {string[]} specs item names or registry URLs
 * @param {{ root?: string, edit?: string, update?: boolean }} [options]
 * @returns {Promise<string[]>} the paths recorded or updated
 */
export async function record(specs, { root = DEFAULT_ROOT, edit, update = false } = {}) {
  const config = componentsConfig(root);
  const entries = readRecord(root);
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const queue = specs.map((spec) => ({ spec, edit }));
  const items = [];
  const changes = {};
  const problems = [];
  while (queue.length) {
    const { spec, edit: why } = queue.shift();
    if (seen.has(spec)) continue;
    seen.add(spec);
    const { url, item } = await fetchItem(spec, config.style);
    const paths = (item.files ?? []).map((file) => targetPath(file, config));
    const missing = paths.find((path) => !existsSync(join(root, path)));
    if (missing) throw new Error(`${missing} isn't there. Run \`npx shadcn@4.23.0 add ${spec}\` first.`);
    let touched = false;
    for (const path of paths) {
      if (changes[path]) continue;
      const hash = sha256(readFileSync(join(root, path), "utf8"));
      const old = entries[path];
      if (old && old.sha256 === hash) {
        // Already recorded and unchanged: keep the entry, adding an edit note given for this item.
        if (why && old.edit !== why) changes[path] = { ...old, edit: why };
        touched ||= Boolean(changes[path]);
        continue;
      }
      if (old && !update) {
        problems.push(
          old.edit
            ? `${path}: differs from its recorded edit (${old.edit}). Reapply that edit only, or pass --update after \`add --overwrite\`.`
            : `${path}: edited since \`shadcn add\` wrote it. Stock files stay as written; take the misfit to Connor, or pass --update after \`add --overwrite\`.`,
        );
        continue;
      }
      const note = why ?? old?.edit;
      changes[path] = { item: old?.item ?? item.name, source: old?.source ?? url, sha256: hash, recordedAt: today, ...(note ? { edit: note } : {}) };
      touched = true;
    }
    if (touched) items.push(item);
    // A dependency is a name in the same style, or a full URL; an edit belongs to the item named, not its dependencies.
    for (const dep of item.registryDependencies ?? []) queue.push({ spec: dep, edit: undefined });
  }
  if (problems.length) throw new Error(`Nothing recorded.\n${problems.join("\n")}`);
  mkdirSync(snapshotDir(root), { recursive: true });
  for (const item of items) writeFileSync(join(snapshotDir(root), `${item.name}.json`), JSON.stringify(item, null, 2) + "\n");
  const sorted = Object.fromEntries(Object.entries({ ...entries, ...changes }).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(filesJson(root), JSON.stringify(sorted, null, 2) + "\n");
  return Object.keys(changes);
}

async function main(argv) {
  const args = [...argv];
  const take = (flag) => {
    const i = args.indexOf(flag);
    if (i === -1) return undefined;
    const [, value] = args.splice(i, 2);
    return value;
  };
  const root = resolve(take("--root") ?? DEFAULT_ROOT);
  const edit = take("--edit");
  const updateAt = args.indexOf("--update");
  const update = updateAt !== -1;
  if (update) args.splice(updateAt, 1);
  const [command, ...specs] = args;
  if (command === "record" && specs.length) {
    const paths = await record(specs, { root, edit, update });
    for (const path of paths) console.log(`recorded ${path}`);
    if (!paths.length) console.log("Every file was already recorded and still matches.");
    return 0;
  }
  if (command === "check") {
    const problems = checkSnapshot(root);
    const count = Object.keys(readRecord(root)).length;
    if (!problems.length) {
      console.log(`${count} stock file${count === 1 ? "" : "s"} in ${stockFolder(root)}, all as recorded.`);
      return 0;
    }
    for (const p of problems) console.error(p);
    return 1;
  }
  console.error('Usage: snapshot.mjs record [--update] [--edit "<why>"] <item|url> ... | snapshot.mjs check   [--root <dir>]');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
