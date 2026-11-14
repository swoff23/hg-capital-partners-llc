#!/usr/bin/env node
// The zero-pixel proof for landing 1 (docs/specs/design-foundation.md, section
// 7.2). Landing 1 renames HG's color tokens and nothing else, so every pixel
// stays the same in light, dark, print, the public site and email. Each step
// compares the landing worktree with a base worktree at origin/main
// (section 7.1, "The base worktree").
//
// Usage:
//   node scripts/zero-pixel-proof.mjs <step...> --base <dir> [--landing <dir>]
//
// Steps (name one or more, or "all"):
//   css    Both builds' CSS by resolved value. Reads each side's
//          .next-devices/static/chunks/*.css (npm run test:devices builds it),
//          or --css-dir <dir> for both sides, or --base-css-dir and
//          --landing-css-dir.
//   order  Same-property class pairs whose Tailwind order flips with the new
//          names. Fails when one literal or template outside cn() in src
//          carries both classes of a pair.
//   shots  Device-check screenshots, paired by file name:
//          --base-shots <run a> --base-shots <run b> (or "a,b") and
//          --landing-shots <dir>, each a copy of device-report/shots. A shot
//          that differs between the two base runs is noise and is skipped.
//   email  renderPlainEmail and renderJobEmail in both worktrees, compared
//          byte for byte, plus which token each spot reads.
//   db     Both worktrees resolve the same DATABASE_URL. Run it before the
//          device runs.
//   all    css, order and email, plus db and shots when shot folders are given.
//
// Options:
//   --landing <dir>    the landing worktree (default: the current folder)
//   --no-rename        compare names as they are: a self-test with one side twice
//   --diff-dir <dir>   shots: write a PNG per differing shot (real data, keep it here)
//   --threshold <n>    shots: ignore channel differences up to n (default 0)
//   --verbose          also print what matched and what was filtered
//
// Exit code 0 when every step finds no difference, 1 when one does, 2 on bad input.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RENAMED, renameClass, renameVarsInText } from "./token-renames.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const SCRIPT_REPO = path.resolve(path.dirname(SCRIPT), "..");

/** Bad input: a missing folder or option. Exits 2, not 1. */
class InputError extends Error {}

// ---------------------------------------------------------------------------
// Arguments and shared helpers
// ---------------------------------------------------------------------------

const VALUED = new Set(["--base", "--landing", "--css-dir", "--base-css-dir", "--landing-css-dir", "--base-shots", "--landing-shots", "--diff-dir", "--threshold"]);
const STEP_NAMES = ["css", "order", "shots", "email", "db", "all"];

function parseArgs(argv) {
  const opts = { steps: [], baseShots: [], verbose: false, rename: true, threshold: 0 };
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let value;
    if (arg.startsWith("--") && arg.includes("=")) [arg, value] = [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--verbose" || arg === "-v") opts.verbose = true;
    else if (arg === "--no-rename") opts.rename = false;
    else if (VALUED.has(arg)) {
      if (value === undefined) value = argv[++i];
      if (value === undefined) throw new InputError(`${arg} needs a value.`);
      if (arg === "--base-shots") opts.baseShots.push(...value.split(",").filter(Boolean).map((d) => path.resolve(d)));
      else if (arg === "--threshold") opts.threshold = Number(value);
      else opts[arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = path.resolve(value);
    } else if (arg.startsWith("-")) throw new InputError(`Unknown option ${arg}. Run with --help for the list.`);
    else if (STEP_NAMES.includes(arg)) opts.steps.push(arg);
    else throw new InputError(`Unknown step "${arg}". Steps: ${STEP_NAMES.join(", ")}.`);
  }
  opts.landing ??= process.cwd();
  if (!Number.isFinite(opts.threshold) || opts.threshold < 0) throw new InputError("--threshold takes a number of 0 or more.");
  return opts;
}

function usage() {
  const text = fs.readFileSync(SCRIPT, "utf8").split("\n");
  const start = text.findIndex((l) => l.startsWith("// Usage:"));
  const end = text.findIndex((l, i) => i > start && !l.startsWith("//"));
  return text.slice(start, end).map((l) => l.replace(/^\/\/ ?/, "")).join("\n");
}

function needBase(opts, step) {
  if (!opts.base) throw new InputError(`${step} needs --base <path to the base worktree>.`);
  for (const dir of [opts.base, opts.landing]) {
    if (!fs.existsSync(path.join(dir, "src"))) throw new InputError(`${dir} has no src folder. Pass the worktree's root.`);
  }
}

/** A package from the landing's node_modules, else the base's, else this script's repo. */
function dep(opts, name) {
  const dirs = [opts.landing, opts.base, SCRIPT_REPO].filter(Boolean);
  for (const dir of dirs) {
    try {
      return createRequire(path.join(dir, "package.json"))(name);
    } catch {
      // try the next folder
    }
  }
  throw new InputError(`Can't load ${name}. Run npm ci in ${opts.landing}.`);
}

const SKIP_DIRS = new Set(["node_modules", ".next", ".next-devices", ".git"]);
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

function walkFiles(dir, keep, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkFiles(full, keep, out);
    } else if (entry.isFile() && keep(full)) out.push(full);
  }
  return out;
}

/** Non-test files under <side>/src whose names match `ext`, sorted. */
function srcFiles(side, ext) {
  const testDir = `${path.sep}__tests__${path.sep}`;
  return walkFiles(path.join(side, "src"), (f) => ext.test(f) && !TEST_FILE.test(f) && !f.includes(testDir)).sort();
}

const rel = (side, file) => path.relative(side, file).split(path.sep).join("/");

/** The rename as the proof applies it to one base name, or nothing with --no-rename. */
function mappers(opts) {
  return opts.rename
    ? { name: (n) => renameVarsInText(renameClass(n)), text: (t) => renameVarsInText(t) }
    : { name: (n) => n, text: (t) => t };
}

// ---------------------------------------------------------------------------
// CSS text: strings, brackets, identifiers and values
// ---------------------------------------------------------------------------

function skipString(s, i) {
  const quote = s[i];
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === "\\") j += 2;
    else if (s[j] === quote) return j + 1;
    else j++;
  }
  return s.length;
}

/** The index of the bracket that closes the one at `i` ("(" or "["), skipping strings. */
function matchClose(s, i) {
  const open = s[i];
  const close = open === "(" ? ")" : "]";
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") j++;
    else if (c === '"' || c === "'") j = skipString(s, j) - 1;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return j;
  }
  return s.length;
}

/** Splits on commas outside brackets and strings. */
function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") i++;
    else if (c === '"' || c === "'") i = skipString(s, i) - 1;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

const isNameChar = (c) => c !== undefined && (/[A-Za-z0-9_-]/.test(c) || c.charCodeAt(0) >= 0x80);
const isNameStart = (c) => c !== undefined && (/[A-Za-z_]/.test(c) || c.charCodeAt(0) >= 0x80);

function isIdentStart(s, i) {
  const c = s[i];
  if (c === "\\" || isNameStart(c)) return true;
  if (c === "-") return s[i + 1] === "-" || s[i + 1] === "\\" || isNameStart(s[i + 1]);
  return false;
}

/** Reads a CSS identifier at `i`, unescaping it. Returns [name, end]. */
function readIdent(s, i) {
  let name = "";
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      const hex = /^[0-9a-fA-F]{1,6}/.exec(s.slice(i + 1, i + 7));
      if (hex) {
        name += String.fromCodePoint(parseInt(hex[0], 16));
        i += 1 + hex[0].length;
        if (/[ \t\n\r\f]/.test(s[i] ?? "")) i++;
      } else {
        name += s[i + 1] ?? "";
        i += 2;
      }
    } else if (isNameChar(c)) {
      name += c;
      i++;
    } else break;
  }
  return [name, i];
}

/** One spelling for every class name, so both sides escape alike whatever the minifier wrote. */
function escapeIdent(name) {
  let out = "";
  const chars = [...name];
  chars.forEach((c, k) => {
    if (/[0-9]/.test(c) && (k === 0 || (k === 1 && chars[0] === "-"))) out += `\\3${c} `;
    else if (isNameChar(c)) out += c;
    else if (/[\s\x00-\x1f\x7f]/.test(c)) out += `\\${c.codePointAt(0).toString(16)} `;
    else out += `\\${c}`;
  });
  return out;
}

/** Rewrites every class in a selector through `fn` (given the unescaped name), skipping strings. */
function mapClasses(selector, fn) {
  let out = "";
  let i = 0;
  while (i < selector.length) {
    const c = selector[i];
    if (c === '"' || c === "'") {
      const j = skipString(selector, i);
      out += selector.slice(i, j);
      i = j;
    } else if (c === "\\") {
      out += selector.slice(i, i + 2);
      i += 2;
    } else if (c === "." && isIdentStart(selector, i + 1)) {
      const [name, end] = readIdent(selector, i + 1);
      out += "." + escapeIdent(fn(name));
      i = end;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function classTokens(selector) {
  const out = [];
  mapClasses(selector, (n) => (out.push(n), n));
  return out;
}

/** Turbopack's CSS module hash (type-module__mvzQEG__display): a file hash, never a pixel. */
const moduleHash = (name) => name.replace(/(-module__)[A-Za-z0-9_-]{6}(__)/g, "$1*$2");

const INVALID = "<invalid>";

/**
 * Substitutes var() references in a value. `lookup(name)` gives the computed
 * value, INVALID, or undefined for a variable the proof doesn't model (one a
 * utility sets on the same element, like --tw-ring-color), which stays as text.
 */
function substitute(value, lookup) {
  let out = "";
  let i = 0;
  while (i < value.length) {
    const c = value[i];
    if (c === '"' || c === "'") {
      const j = skipString(value, i);
      out += value.slice(i, j);
      i = j;
      continue;
    }
    if ((c === "v" || c === "V") && /^var\(/i.test(value.slice(i, i + 4)) && !isNameChar(value[i - 1])) {
      const close = matchClose(value, i + 3);
      const inner = value.slice(i + 4, close);
      const [rawName, ...rest] = splitTopLevel(inner);
      const name = rawName.trim();
      const fallback = rest.length ? rest.join(",") : undefined;
      const got = lookup(name);
      if (got === undefined) out += `var(${name}${fallback !== undefined ? "," + substitute(fallback, lookup) : ""})`;
      else if (got === INVALID) out += fallback !== undefined ? ` ${substitute(fallback, lookup)} ` : INVALID;
      else out += ` ${got} `;
      i = close + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Collapses whitespace outside strings and drops it next to brackets and commas. */
function normalizeValue(v) {
  let out = "";
  let space = false;
  for (let i = 0; i < v.length; ) {
    const c = v[i];
    if (/\s/.test(c)) {
      space = true;
      i++;
      continue;
    }
    if (c !== ")" && c !== "," && space && out && !/[(,]$/.test(out)) out += " ";
    space = false;
    if (c === '"' || c === "'") {
      const j = skipString(v, i);
      out += v.slice(i, j);
      i = j;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// css: the built stylesheets as flat entries
// ---------------------------------------------------------------------------

function cssDirFor(opts, side) {
  const own = side === "base" ? opts.baseCssDir : opts.landingCssDir;
  return own ?? opts.cssDir ?? path.join(side === "base" ? opts.base : opts.landing, ".next-devices", "static", "chunks");
}

function readCssDir(dir, side) {
  if (!fs.existsSync(dir)) throw new InputError(`No CSS at ${dir}. Run npm run test:devices in the ${side} worktree first, or pass --${side}-css-dir.`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".css")).sort();
  if (!files.length) throw new InputError(`No .css files in ${dir}.`);
  return files.map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), "utf8") }));
}

/**
 * Every rule, at-rule with declarations, and statement, in document order,
 * with its at-rule context. Layers are ranked by first appearance, as the
 * cascade ranks them.
 */
function flattenCss(postcss, files) {
  const entries = [];
  const layerRank = new Map();
  let order = 0;
  const decls = (node) => node.nodes.filter((n) => n.type === "decl").map((d) => ({ prop: d.prop, value: d.value, important: !!d.important }));
  const noteLayer = (name) => layerRank.has(name) || layerRank.set(name, layerRank.size);

  function walk(container, ctx, file) {
    for (const node of container.nodes ?? []) {
      if (node.type === "rule") {
        if (node.nodes.some((n) => n.type === "rule" || n.type === "atrule")) {
          throw new InputError(`${file} nests CSS inside "${node.selector}". The proof reads flat CSS only.`);
        }
        entries.push({ kind: "rule", ctx, selectors: node.selectors, decls: decls(node), order: order++, file });
      } else if (node.type === "atrule") {
        const name = node.name.toLowerCase();
        const params = normalizeValue(node.params);
        if (name === "layer") {
          const prefix = ctx.filter((a) => a.name === "layer").map((a) => a.params).join(".");
          for (const n of params.split(",").filter(Boolean)) noteLayer(prefix ? `${prefix}.${n}` : n);
        }
        if (!node.nodes) {
          entries.push({ kind: "statement", ctx, text: `@${name} ${params}`, order: order++, file });
          continue;
        }
        const own = decls(node);
        if (own.length) entries.push({ kind: "atrule", ctx, text: `@${name} ${params}`, decls: own, order: order++, file });
        walk(node, [...ctx, { name, params }], file);
      }
    }
  }
  for (const f of files) walk(postcss.parse(f.text, { from: f.name }), [], f.name);
  return { entries, layerRank };
}

const ctxText = (ctx) => ctx.map((a) => `@${a.name} ${a.params}`).join(" ");
const layerOf = (ctx) => ctx.filter((a) => a.name === "layer").map((a) => a.params).join(".");
const inLayer = (ctx, name) => layerOf(ctx).split(".")[0] === name;

// ---------------------------------------------------------------------------
// css: the token values each element computes
// ---------------------------------------------------------------------------

// The page states the proof resolves against. An app page's elements read the
// root; a public page's read the [data-surface="public"] wrapper, which
// inherits from the root and restates its own tokens.
const STATES = [
  { name: "light", dark: false, page: "app" },
  { name: "dark", dark: true, page: "app" },
  { name: "public", dark: false, page: "public" },
  { name: "public under dark", dark: true, page: "public" },
];
const PUBLIC_EL = { tag: "div", root: false, attrs: new Map([["data-surface", "public"]]), hasPublic: false };
const rootEl = (state) => ({ tag: "html", root: true, attrs: new Map(state.dark ? [["data-theme", "dark"]] : []), hasPublic: state.page === "public" });

const PSEUDO_ELEMENTS = new Set(["before", "after", "first-line", "first-letter", "marker", "placeholder", "selection", "backdrop", "file-selector-button"]);

/** A compound selector as simple parts, or null when it has a combinator. */
function parseCompound(selector) {
  const s = selector.trim();
  const parts = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "*") {
      parts.push({ t: "univ" });
      i++;
    } else if (c === "." || c === "#") {
      const [name, end] = readIdent(s, i + 1);
      parts.push({ t: c === "." ? "class" : "id", name });
      i = end;
    } else if (c === "[") {
      const end = matchClose(s, i);
      parts.push(parseAttr(s.slice(i + 1, end)));
      i = end + 1;
    } else if (c === ":") {
      const element = s[i + 1] === ":";
      const [name, end] = readIdent(s, i + (element ? 2 : 1));
      let arg = null;
      i = end;
      if (s[i] === "(") {
        const close = matchClose(s, i);
        arg = s.slice(i + 1, close);
        i = close + 1;
      }
      parts.push({ t: element || PSEUDO_ELEMENTS.has(name.toLowerCase()) ? "pe" : "pc", name: name.toLowerCase(), arg });
    } else if (isIdentStart(s, i)) {
      const [name, end] = readIdent(s, i);
      parts.push({ t: "type", name: name.toLowerCase() });
      i = end;
    } else return null;
  }
  return parts.length ? parts : null;
}

function parseAttr(inner) {
  const m = /^\s*([^\s~|^$*=]+)\s*(?:([~|^$*]?=)\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s]+?))\s*([iIsS])?)?\s*$/.exec(inner);
  if (!m) return { t: "unknown" };
  return { t: "attr", name: m[1], op: m[2], value: m[3] ?? m[4] ?? m[5] };
}

/** Whether a compound selector list matches `el`: true, false, or null when it can't tell. */
function matchList(list, el) {
  let unknown = false;
  for (const sel of splitTopLevel(list)) {
    const parts = parseCompound(sel);
    const hit = parts ? matchParts(parts, el) : null;
    if (hit === true) return true;
    if (hit === null) unknown = true;
  }
  return unknown ? null : false;
}

function matchParts(parts, el) {
  let unknown = false;
  for (const p of parts) {
    let hit;
    if (p.t === "univ") hit = true;
    else if (p.t === "type") hit = p.name === el.tag;
    else if (p.t === "class" || p.t === "id" || p.t === "pe") hit = false;
    else if (p.t === "attr") {
      const v = el.attrs.get(p.name);
      if (!p.op) hit = el.attrs.has(p.name);
      else if (v === undefined) hit = false;
      else if (p.op === "=") hit = v === p.value;
      else if (p.op === "~=") hit = v.split(/\s+/).includes(p.value);
      else if (p.op === "|=") hit = v === p.value || v.startsWith(`${p.value}-`);
      else if (p.op === "^=") hit = v.startsWith(p.value);
      else if (p.op === "$=") hit = v.endsWith(p.value);
      else hit = v.includes(p.value);
    } else if (p.t === "pc") {
      if (p.name === "root") hit = el.root;
      else if (p.name === "host") hit = false;
      else if (p.name === "is" || p.name === "where") hit = matchList(p.arg ?? "", el);
      else if (p.name === "not") {
        const inner = matchList(p.arg ?? "", el);
        hit = inner === null ? null : !inner;
      } else if (p.name === "has") hit = el.root ? el.hasPublic && matchList(p.arg ?? "", PUBLIC_EL) === true : false;
      else hit = null;
    } else hit = null;
    if (hit === false) return false;
    if (hit === null) unknown = true;
  }
  return unknown ? null : true;
}

function specificity(parts) {
  let a = 0;
  let b = 0;
  let c = 0;
  for (const p of parts) {
    if (p.t === "id") a++;
    else if (p.t === "class" || p.t === "attr") b++;
    else if (p.t === "type" || p.t === "pe") c++;
    else if (p.t === "pc") {
      if (p.name === "where") continue;
      if (p.name === "is" || p.name === "not" || p.name === "has") {
        const best = Math.max(0, ...splitTopLevel(p.arg ?? "").map((s) => parseCompound(s)).filter(Boolean).map(specificity));
        a += Math.floor(best / 1e6);
        b += Math.floor(best / 1e3) % 1e3;
        c += best % 1e3;
      } else b++;
    }
  }
  return a * 1e6 + b * 1e3 + c;
}

/** The rules that set custom properties on the root or the public wrapper, with what the cascade needs. */
function envItems(entries, layerRank, notes) {
  const items = [];
  for (const e of entries) {
    if (e.kind !== "rule" || e.ctx.some((a) => a.name.endsWith("keyframes"))) continue;
    const custom = e.decls.filter((d) => d.prop.startsWith("--"));
    if (!custom.length) continue;
    if (e.ctx.some((a) => !["media", "supports", "layer"].includes(a.name))) continue;
    const layer = layerOf(e.ctx);
    const rank = layer ? layerRank.get(layer) ?? 0 : Infinity;
    const media = e.ctx.filter((a) => a.name === "media").map((a) => a.params);
    for (const sel of e.selectors) {
      const parts = parseCompound(sel);
      // A bare * (Tailwind's --tw-* defaults) sits on every element, where the
      // element's own utilities override it; it isn't a token.
      if (!parts || parts.every((p) => p.t === "univ")) continue;
      const matches = {};
      let reaches = false;
      for (const state of STATES) {
        matches[state.name] = { root: matchParts(parts, rootEl(state)), pub: matchParts(parts, PUBLIC_EL) };
        if (matches[state.name].root === true || matches[state.name].pub === true) reaches = true;
        if ((matches[state.name].root === null || matches[state.name].pub === null) && /:root|html|data-surface|data-theme/.test(sel)) {
          notes.add(`Custom properties on "${sel}" depend on state the proof doesn't model, so its token values leave them out.`);
        }
      }
      if (reaches) items.push({ sel, custom, media, rank, spec: specificity(parts), order: e.order, matches });
    }
  }
  return items;
}

/** The media states to resolve in: screen, print, and each other query a token rule sits under. */
function envVariants(...itemLists) {
  const queries = new Set();
  for (const items of itemLists) for (const it of items) for (const m of it.media) if (!/^(all|screen|print|not print)$/i.test(m)) queries.add(m);
  return [
    { name: "", print: false, on: new Set() },
    { name: "print", print: true, on: new Set() },
    ...[...queries].sort().map((q) => ({ name: q, print: false, on: new Set([q]) })),
  ];
}

function mediaActive(media, variant) {
  return media.every((m) => {
    const q = m.toLowerCase();
    if (q === "all") return true;
    if (q === "screen" || q === "not print") return !variant.print;
    if (q === "print") return variant.print;
    return variant.on.has(m);
  });
}

/** The custom properties one element declares in a state: the cascade's winner per name. */
function declared(items, stateName, which, variant) {
  const winners = new Map();
  const rankOf = (it, d) => (d.important ? [1, it.rank === Infinity ? -1 : 1e6 - it.rank] : [0, it.rank === Infinity ? 1e9 : it.rank]);
  for (const it of items) {
    if (it.matches[stateName][which] !== true || !mediaActive(it.media, variant)) continue;
    for (const d of it.custom) {
      const key = [...rankOf(it, d), it.spec, it.order];
      const prev = winners.get(d.prop);
      if (!prev || compareKeys(key, prev.key) >= 0) winners.set(d.prop, { key, value: d.value });
    }
  }
  return new Map([...winners].map(([name, w]) => [name, w.value]));
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

/** Computes each declared custom property against the element's own values, inheriting the rest. */
function computeElement(decl, parent) {
  const out = new Map(parent);
  const done = new Set();
  const visiting = new Set();
  const get = (name) => {
    if (!decl.has(name)) return parent.get(name);
    if (done.has(name)) return out.get(name);
    if (visiting.has(name)) return INVALID;
    visiting.add(name);
    const raw = decl.get(name).trim();
    let value;
    if (raw === "initial") value = INVALID;
    else if (raw === "inherit" || raw === "unset") value = parent.get(name);
    else {
      value = normalizeValue(substitute(decl.get(name), get));
      if (value.includes(INVALID)) value = INVALID;
    }
    visiting.delete(name);
    done.add(name);
    if (value === undefined) out.delete(name);
    else out.set(name, value);
    return value;
  };
  for (const name of decl.keys()) get(name);
  return out;
}

function computeEnvs(items, variants) {
  const envs = [];
  for (const variant of variants) {
    for (const state of STATES) {
      let computed = computeElement(declared(items, state.name, "root", variant), new Map());
      if (state.page === "public") computed = computeElement(declared(items, state.name, "pub", variant), computed);
      const media = `@media ${variant.name || "screen"}`;
      envs.push({ name: variant.name ? `${state.name} ${media}` : state.name, state: state.name, media, computed });
    }
  }
  return envs;
}

/** A short label for a set of contexts: "light, dark @media print" or "dark except @media print". */
function envLabel(envs, names) {
  const set = new Set(names);
  const parts = [];
  for (const state of STATES) {
    const mine = envs.filter((e) => e.state === state.name);
    const inside = mine.filter((e) => set.has(e.name));
    if (!inside.length) continue;
    if (inside.length === mine.length) parts.push(state.name);
    else if (inside.length * 2 >= mine.length) parts.push(`${state.name} except ${mine.filter((e) => !set.has(e.name)).map((e) => e.media).join(", ")}`);
    else parts.push(...inside.map((e) => e.name));
  }
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// css: comparing the two sides
// ---------------------------------------------------------------------------

// Section 3.2's pointers, which landing 1 adds. --chart-ref is in both sides
// already, so it's compared, not expected.
const POINTERS = {
  "--card": "var(--background)",
  "--card-foreground": "var(--foreground)",
  "--popover-foreground": "var(--foreground)",
  "--accent-foreground": "var(--foreground)",
  "--secondary": "var(--accent)",
  "--secondary-foreground": "var(--fg-2)",
  "--ring": "var(--primary)",
  "--sidebar": "var(--canvas)",
  "--sidebar-foreground": "var(--fg-2)",
  "--sidebar-primary": "var(--primary)",
  "--sidebar-primary-foreground": "var(--primary-foreground)",
  "--sidebar-accent": "var(--accent)",
  "--sidebar-accent-foreground": "var(--foreground)",
  "--sidebar-border": "var(--border)",
  "--sidebar-ring": "var(--ring)",
};

// Where a class can start and end in source text. Not after a ":" or "/":
// Tailwind never reads "ring-ring" out of "focus-visible:ring-ring".
const CLASS_BEFORE = /[\s"'`{(,;=>|]/;
const CLASS_AFTER = /[\s"'`})\],;<|]/;

/** The candidates and the variables a side's non-test src files use, for the filters. */
function srcIndex(side) {
  const files = srcFiles(side, /\.(?:[cm]?[jt]sx?|css|mdx?|json|html|svg|txt)$/);
  const texts = files.map((f) => [f, fs.readFileSync(f, "utf8")]);
  const text = texts.map(([, t]) => t).join("\n");
  const tokens = new Set(text.split(/[\s"'`]+/));
  // A variable is read through var() anywhere, or by name in script (style
  // props, getPropertyValue). A CSS file declaring it doesn't count.
  const vars = new Set();
  for (const [f, t] of texts) {
    for (const m of t.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) vars.add(m[1]);
    if (/\.[cm]?[jt]sx?$/.test(f)) for (const m of t.matchAll(/--[A-Za-z0-9_-]+/g)) vars.add(m[0]);
  }
  const has = (candidate) => {
    if (tokens.has(candidate)) return true;
    for (let i = text.indexOf(candidate); i >= 0; i = text.indexOf(candidate, i + 1)) {
      const end = i + candidate.length;
      if ((i === 0 || CLASS_BEFORE.test(text[i - 1])) && (end === text.length || CLASS_AFTER.test(text[end]))) return true;
    }
    return false;
  };
  return { has, vars, files: files.length };
}

function loadCssSide(opts, postcss, which) {
  const root = which === "base" ? opts.base : opts.landing;
  const dir = cssDirFor(opts, which);
  const { entries, layerRank } = flattenCss(postcss, readCssDir(dir, which));
  const notes = new Set();
  const items = envItems(entries, layerRank, notes);
  const map = which === "base" ? mappers(opts) : mappers({ rename: false });
  return { which, root, dir, entries, items, notes, map, src: srcIndex(root) };
}

/** Each side's rules as (context, one selector, resolved declarations) records. */
function sideRecords(side, envs) {
  const { map } = side;
  const cache = new Map();
  const resolve = (value) => {
    if (cache.has(value)) return cache.get(value);
    let sig;
    if (!/var\(/i.test(value)) sig = normalizeValue(map.text(value));
    else {
      const groups = new Map();
      for (const env of envs) {
        const v = normalizeValue(map.text(substitute(value, (n) => env.computed.get(n))));
        if (!groups.has(v)) groups.set(v, []);
        groups.get(v).push(env.name);
      }
      sig = groups.size === 1 ? [...groups.keys()][0] : `{${[...groups].map(([v, names]) => `${v} in ${envLabel(envs, names)}`).join(" | ")}}`;
    }
    cache.set(value, sig);
    return sig;
  };

  // The filter: a utility whose candidate no non-test src file writes came
  // from docs, tests or scripts, which Tailwind also scans.
  const filtered = [];
  const keepSelector = (e, sel) => {
    if (!inLayer(e.ctx, "utilities")) return true;
    const candidate = classTokens(sel).sort((a, b) => b.length - a.length)[0];
    if (!candidate || side.src.has(candidate)) return true;
    filtered.push(candidate);
    return false;
  };
  const kept = [];
  for (const e of side.entries) {
    if (e.kind === "rule") {
      const selectors = e.selectors.filter((sel) => keepSelector(e, sel));
      if (selectors.length) kept.push({ ...e, selectors });
    } else kept.push(e);
  }

  // A theme variable nothing reads (no kept rule and no src file) came with a
  // filtered utility; it can't change a pixel.
  const used = new Set(side.src.vars);
  for (const e of kept) for (const d of e.decls ?? []) for (const m of d.value.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) used.add(m[1]);
  const droppedTheme = new Set();

  // Section 3.2's pointers on the landing's root and public blocks are expected.
  const pointers = new Map();
  const wrongPointers = [];
  const isTokenRule = (e) => e.selectors.some((sel) => {
    const parts = parseCompound(sel);
    return parts && STATES.some((s) => matchParts(parts, rootEl(s)) === true || matchParts(parts, PUBLIC_EL) === true);
  });

  const records = [];
  for (const e of kept) {
    const ctx = map.text(ctxText(e.ctx));
    if (e.kind === "statement") {
      records.push({ ctx, sel: map.text(e.text), sigs: null, order: e.order });
      continue;
    }
    let decls = e.decls;
    if (inLayer(e.ctx, "theme")) {
      decls = decls.filter((d) => {
        if (!d.prop.startsWith("--") || used.has(d.prop)) return true;
        droppedTheme.add(d.prop);
        return false;
      });
    }
    if (side.which === "landing" && e.kind === "rule" && isTokenRule(e)) {
      decls = decls.filter((d) => {
        const want = POINTERS[d.prop];
        if (want === undefined) return true;
        if (normalizeValue(d.value) !== normalizeValue(want)) {
          wrongPointers.push(`${d.prop} is ${normalizeValue(d.value)} on ${e.selectors.join(", ")}, not ${want} as section 3.2 has it.`);
          return true;
        }
        for (const sel of e.selectors) pointers.set(sel, [...(pointers.get(sel) ?? []), d.prop]);
        return false;
      });
    }
    if (!decls.length) continue;
    const sigs = decls.map((d) => `${d.prop.startsWith("--") ? map.text(d.prop) : d.prop}:${resolve(d.value)}${d.important ? " !important" : ""}`);
    if (e.kind === "atrule") {
      records.push({ ctx, sel: map.text(e.text), sigs, order: e.order });
      continue;
    }
    for (const sel of e.selectors) records.push({ ctx, sel: mapClasses(sel, (n) => moduleHash(map.name(n))), sigs, order: e.order });
  }
  return { records, filtered, droppedTheme: new Set([...droppedTheme].map(map.text)), pointers, wrongPointers };
}

const recordKey = (r) => (r.sigs ? `${r.ctx} || ${r.sel} {${r.sigs.join("; ")}}` : `${r.ctx} || ${r.sel}`);
const groupKey = (r) => `${r.ctx} || ${r.sel}`;

/** Records on one side with no twin on the other, after folding rules the minifier merged differently. */
function unmatched(baseRecords, landingRecords) {
  const count = new Map();
  for (const r of baseRecords) count.set(recordKey(r), (count.get(recordKey(r)) ?? 0) + 1);
  for (const r of landingRecords) count.set(recordKey(r), (count.get(recordKey(r)) ?? 0) - 1);
  const take = (records, sign) => {
    const left = new Map([...count].filter(([, n]) => Math.sign(n) === sign).map(([k, n]) => [k, Math.abs(n)]));
    const out = [];
    for (const r of records) {
      const k = recordKey(r);
      if (left.get(k) > 0) {
        out.push(r);
        left.set(k, left.get(k) - 1);
      }
    }
    return out;
  };
  let onlyBase = take(baseRecords, 1);
  let onlyLanding = take(landingRecords, -1);
  // Same selector in the same context, declarations split or joined differently.
  const joined = (records) => {
    const m = new Map();
    for (const r of records) m.set(groupKey(r), [...(m.get(groupKey(r)) ?? []), ...(r.sigs ?? [])]);
    return new Map([...m].map(([k, sigs]) => [k, sigs.join("; ")]));
  };
  const jb = joined(onlyBase);
  const jl = joined(onlyLanding);
  const folded = new Set([...jb].filter(([k, v]) => jl.get(k) === v).map(([k]) => k));
  onlyBase = onlyBase.filter((r) => !folded.has(groupKey(r)));
  onlyLanding = onlyLanding.filter((r) => !folded.has(groupKey(r)));
  return { onlyBase, onlyLanding, folded: folded.size };
}

/**
 * One selector's unmatched rules on both sides. Each base rule pairs with the
 * landing rule it shares most declarations with, and only the declarations
 * that differ print.
 */
function describeGroup(g) {
  const out = [];
  // Split one way and merged the other: compare the joined declarations.
  if (g.base.length && g.landing.length && g.base.length !== g.landing.length) {
    const join = (list) => [{ sigs: list.flatMap((r) => r.sigs ?? []) }];
    g = { base: join(g.base), landing: join(g.landing) };
  }
  const landing = [...g.landing];
  const count = (sigs) => sigs.reduce((m, s) => m.set(s, (m.get(s) ?? 0) + 1), new Map());
  const minus = (a, b) => {
    const left = count(b);
    return a.filter((s) => !(left.get(s) > 0 && left.set(s, left.get(s) - 1)));
  };
  for (const b of g.base) {
    const sb = b.sigs ?? [];
    let best = -1;
    let score = -1;
    landing.forEach((l, i) => {
      const shared = sb.length - minus(sb, l.sigs ?? []).length;
      if (shared > score) [best, score] = [i, shared];
    });
    if (best < 0) {
      out.push(`      only in base: {${sb.join("; ")}}`);
      continue;
    }
    const sl = landing.splice(best, 1)[0].sigs ?? [];
    const [gone, added] = [minus(sb, sl), minus(sl, sb)];
    if (!gone.length && !added.length) out.push("      the same declarations, in another order");
    for (const s of gone) out.push(`      base:    ${s}`);
    for (const s of added) out.push(`      landing: ${s}`);
  }
  for (const l of landing) out.push(`      only in landing: {${(l.sigs ?? []).join("; ")}}`);
  return out;
}

/** Token values that differ between the sides, per context. */
function envDifferences(base, landing, envsB, envsL, skip) {
  const out = [];
  for (let i = 0; i < envsB.length; i++) {
    const b = new Map([...envsB[i].computed].map(([k, v]) => [base.map.text(k), v === INVALID ? v : base.map.text(v)]));
    const l = new Map([...envsL[i].computed].filter(([k]) => !(k in POINTERS)));
    for (const name of new Set([...b.keys(), ...l.keys()])) {
      if (skip.has(name) || b.get(name) === l.get(name)) continue;
      out.push({ env: envsB[i].name, name, base: b.get(name), landing: l.get(name) });
    }
  }
  return out;
}

async function stepCss(opts) {
  const postcss = dep(opts, "postcss");
  const base = loadCssSide(opts, postcss, "base");
  const landing = loadCssSide(opts, postcss, "landing");
  const variants = envVariants(base.items, landing.items);
  const envsB = computeEnvs(base.items, variants);
  const envsL = computeEnvs(landing.items, variants);
  const B = sideRecords(base, envsB);
  const L = sideRecords(landing, envsL);
  const { onlyBase, onlyLanding, folded } = unmatched(B.records, L.records);
  const tokenDiffs = envDifferences(base, landing, envsB, envsL, new Set([...B.droppedTheme, ...L.droppedTheme]));

  // The pointers must reach their targets in every context.
  const pointerDiffs = [];
  const pointerMissing = new Map();
  for (const env of envsL) {
    for (const [name, want] of Object.entries(POINTERS)) {
      const got = env.computed.get(name);
      if (got === undefined) pointerMissing.set(name, (pointerMissing.get(name) ?? 0) + 1);
      else if (got !== env.computed.get(want.slice(4, -1))) pointerDiffs.push({ env: env.name, name, got, want: env.computed.get(want.slice(4, -1)) });
    }
  }

  const lines = [];
  for (const side of [base, landing]) for (const note of side.notes) lines.push(`  note (${side.which}): ${note}`);
  if (folded) lines.push(`  note: ${folded} selectors matched once their split or merged declarations were joined.`);
  if (opts.verbose) {
    lines.push(`  base CSS: ${base.dir}`, `  landing CSS: ${landing.dir}`);
    lines.push(`  records: ${B.records.length} base, ${L.records.length} landing, in ${envsB.length} contexts: ${envsB.map((e) => e.name).join("; ")}`);
    lines.push(`  filtered as not in src: ${B.filtered.length} base, ${L.filtered.length} landing`);
    if (L.filtered.length) lines.push(`    landing: ${[...new Set(L.filtered)].slice(0, 40).join(" ")}${L.filtered.length > 40 ? " ..." : ""}`);
    lines.push(`  theme variables nothing reads: ${B.droppedTheme.size} base, ${L.droppedTheme.size} landing`);
    if (B.droppedTheme.size || L.droppedTheme.size) lines.push(`    ${[...new Set([...B.droppedTheme, ...L.droppedTheme])].join(" ")}`);
    for (const [sel, names] of L.pointers) lines.push(`  pointers on ${sel}: ${names.length} of ${Object.keys(POINTERS).length}`);
  }
  if (opts.rename && pointerMissing.size) {
    const everywhere = [...pointerMissing].every(([, n]) => n === envsL.length);
    lines.push(`  note: the landing has no ${[...pointerMissing.keys()].join(", ")} (section 3.2 pointers) ${everywhere ? "anywhere" : "in some contexts"}.`);
  }

  const problems = tokenDiffs.length + pointerDiffs.length + onlyBase.length + onlyLanding.length;
  if (tokenDiffs.length) {
    lines.push(`  Token values that differ (${tokenDiffs.length}):`);
    const byName = new Map();
    for (const d of tokenDiffs) {
      const k = `${d.name}: ${d.base ?? "(unset)"} in base, ${d.landing ?? "(unset)"} in landing`;
      byName.set(k, [...(byName.get(k) ?? []), d.env]);
    }
    for (const [k, names] of byName) lines.push(`    ${k} (${envLabel(envsB, names)})`);
  }
  for (const d of pointerDiffs) lines.push(`  Pointer ${d.name} is ${d.got}, not ${d.want}, in ${d.env}.`);
  for (const w of new Set(L.wrongPointers)) lines.push(`  Pointer ${w}`);
  if (onlyBase.length || onlyLanding.length) {
    lines.push(`  Rules that differ (${onlyBase.length} only in base, ${onlyLanding.length} only in landing):`);
    const groups = new Map();
    for (const [label, list] of [["base", onlyBase], ["landing", onlyLanding]]) {
      for (const r of list) {
        const g = groups.get(groupKey(r)) ?? { order: r.order, base: [], landing: [] };
        g[label].push(r);
        groups.set(groupKey(r), g);
      }
    }
    for (const [, g] of [...groups].sort((a, b) => a[1].order - b[1].order)) {
      const r = g.base[0] ?? g.landing[0];
      lines.push(`    ${r.ctx ? `${r.ctx} > ` : ""}${r.sel}`, ...describeGroup(g));
    }
  }
  const verdict = problems
    ? `css: ${problems} differences. Each one stops the landing until Connor has seen it.`
    : `css: no differences. ${B.records.length} rules match by resolved value in ${envsB.length} contexts.`;
  print([verdict, ...lines]);
  return problems === 0;
}

// ---------------------------------------------------------------------------
// order: same-property pairs whose Tailwind order flips
// ---------------------------------------------------------------------------

function chunkTokens(text, after, before) {
  // `after`: a substitution comes right before this chunk; `before`: one comes right after.
  const parts = text.split(/\s+/);
  if (after && !/^\s/.test(text)) parts.shift();
  if (before && !/\s$/.test(text)) parts.pop();
  return parts.filter(Boolean);
}

const MAX_WORLDS = 256;

function product(a, b) {
  if (a.length * b.length > MAX_WORLDS) return [new Set([...a, ...b].flatMap((s) => [...s]))];
  const out = [];
  for (const x of a) for (const y of b) out.push(new Set([...x, ...y]));
  return out;
}

/**
 * Reads every string literal and template in a side's non-test src files.
 * A carrier is a class string written outside cn(): a literal, a template, or
 * literals joined by +, a ternary, && or [..].join(). Its worlds are the token
 * sets it can produce, so ternary branches never count as one element.
 */
function scanLiterals(ts, side) {
  const K = ts.SyntaxKind;
  const tokens = new Set();
  const carriers = [];
  const cnCalls = [];
  const isWrapper = (n) => ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isTypeAssertionExpression(n) || (ts.isSatisfiesExpression?.(n) ?? false);
  const isCn = (n) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "cn";
  const joinArray = (n) => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression) || n.expression.name.text !== "join") return null;
    let recv = n.expression.expression;
    while (ts.isCallExpression(recv) && ts.isPropertyAccessExpression(recv.expression) && recv.expression.name.text === "filter") recv = recv.expression.expression;
    return ts.isArrayLiteralExpression(recv) ? recv : null;
  };
  const flowsToJoin = (arr) => {
    let p = arr.parent;
    while (p && ts.isPropertyAccessExpression(p) && p.parent && ts.isCallExpression(p.parent) && p.parent.expression === p) {
      if (p.name.text === "join") return true;
      if (p.name.text !== "filter") return false;
      p = p.parent.parent;
    }
    return false;
  };
  const isComposable = (n) =>
    ts.isStringLiteral(n) ||
    ts.isNoSubstitutionTemplateLiteral(n) ||
    ts.isTemplateExpression(n) ||
    isWrapper(n) ||
    ts.isConditionalExpression(n) ||
    (ts.isBinaryExpression(n) && [K.PlusToken, K.AmpersandAmpersandToken, K.BarBarToken, K.QuestionQuestionToken].includes(n.operatorToken.kind)) ||
    !!joinArray(n);
  const composedInto = (n) => {
    const p = n.parent;
    if (!p) return false;
    if (isWrapper(p) || ts.isTemplateSpan(p)) return true;
    if (ts.isConditionalExpression(p)) return n === p.whenTrue || n === p.whenFalse;
    if (ts.isBinaryExpression(p)) {
      const k = p.operatorToken.kind;
      if (k === K.AmpersandAmpersandToken) return n === p.right;
      return k === K.PlusToken || k === K.BarBarToken || k === K.QuestionQuestionToken;
    }
    if (ts.isArrayLiteralExpression(p)) return flowsToJoin(p);
    return false;
  };
  const allLiteralTokens = (node, into) => {
    const visit = (n) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) for (const t of chunkTokens(n.text)) into.add(t);
      else if (ts.isTemplateExpression(n)) {
        for (const t of chunkTokens(n.head.text, false, true)) into.add(t);
        n.templateSpans.forEach((s, i) => {
          for (const t of chunkTokens(s.literal.text, true, i < n.templateSpans.length - 1)) into.add(t);
        });
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return into;
  };
  const worlds = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return [new Set(chunkTokens(n.text))];
    if (ts.isTemplateExpression(n)) {
      let acc = [new Set(chunkTokens(n.head.text, false, true))];
      n.templateSpans.forEach((s, i) => {
        acc = product(acc, worlds(s.expression));
        acc = product(acc, [new Set(chunkTokens(s.literal.text, true, i < n.templateSpans.length - 1))]);
      });
      return acc;
    }
    if (isWrapper(n)) return worlds(n.expression);
    if (ts.isConditionalExpression(n)) return [...worlds(n.whenTrue), ...worlds(n.whenFalse)];
    if (ts.isBinaryExpression(n)) {
      const k = n.operatorToken.kind;
      if (k === K.PlusToken) return product(worlds(n.left), worlds(n.right));
      if (k === K.AmpersandAmpersandToken) return [...worlds(n.right), new Set()];
      if (k === K.BarBarToken || k === K.QuestionQuestionToken) return [...worlds(n.left), ...worlds(n.right)];
    }
    const arr = joinArray(n);
    if (arr) return arr.elements.reduce((acc, el) => product(acc, ts.isSpreadElement(el) ? [new Set()] : worlds(el)), [new Set()]);
    // cn() inside a template still lands in that template's string.
    if (isCn(n)) return [allLiteralTokens(n, new Set())];
    return [new Set()];
  };

  for (const file of srcFiles(side, /\.[cm]?[jt]sx?$/)) {
    const text = fs.readFileSync(file, "utf8");
    const kind = /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    const where = (n) => `${rel(side, file)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
    const visit = (n, inCn) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) allLiteralTokens(n, tokens);
      if (isCn(n) && !inCn) {
        cnCalls.push({ where: where(n), tokens: allLiteralTokens(n, new Set()) });
        ts.forEachChild(n, (c) => visit(c, true));
        return;
      }
      if (!inCn && isComposable(n) && !composedInto(n)) {
        const w = worlds(n);
        if (w.some((s) => s.size > 1)) carriers.push({ where: where(n), kind: ts.SyntaxKind[n.kind], worlds: w, tokens: new Set(w.flatMap((s) => [...s])) });
      }
      ts.forEachChild(n, (c) => visit(c, inCn));
    };
    visit(sf, false);
  }
  return { tokens, carriers, cnCalls };
}

async function loadDesignSystem(tw, side) {
  const file = path.join(side, "src", "app", "globals.css");
  if (!fs.existsSync(file)) throw new InputError(`No ${file}.`);
  return tw.__unstable__loadDesignSystem(fs.readFileSync(file, "utf8"), { base: path.dirname(file) });
}

function tailwindVersion(side) {
  try {
    return JSON.parse(fs.readFileSync(path.join(side, "node_modules", "tailwindcss", "package.json"), "utf8")).version;
  } catch {
    return null;
  }
}

async function stepOrder(opts) {
  const ts = dep(opts, "typescript");
  const tw = dep(opts, "@tailwindcss/node");
  const postcss = dep(opts, "postcss");
  const map = mappers(opts);
  const lines = [];
  const versions = [tailwindVersion(opts.base), tailwindVersion(opts.landing)];
  if (versions[0] && versions[1] && versions[0] !== versions[1]) lines.push(`  note: Tailwind ${versions[0]} in base, ${versions[1]} in landing. Both sides sort with the landing's.`);

  const dsB = await loadDesignSystem(tw, opts.base);
  const dsL = await loadDesignSystem(tw, opts.landing);
  const scanB = scanLiterals(ts, opts.base);
  const scanL = scanLiterals(ts, opts.landing);

  // The base's classes, what each sets, and where each sorts on both sides.
  const words = [...scanB.tokens];
  const css = dsB.candidatesToCss(words);
  const props = new Map();
  words.forEach((w, i) => {
    if (!css[i]) return;
    const set = new Set();
    postcss.parse(css[i]).walkDecls((d) => set.add(d.prop));
    props.set(w, set);
  });
  const classes = [...props.keys()];
  const orderB = new Map(dsB.getClassOrder(classes));
  const newName = new Map(classes.map((c) => [c, map.name(c)]));
  const orderL = new Map(dsL.getClassOrder([...new Set(newName.values())]));
  const noCompile = classes.filter((c) => orderL.get(newName.get(c)) == null);

  const byProp = new Map();
  for (const [c, set] of props) for (const p of set) byProp.set(p, [...(byProp.get(p) ?? []), c]);
  const flips = new Map();
  for (const [prop, list] of byProp) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        let [a, b] = [list[i], list[j]];
        if (newName.get(a) === a && newName.get(b) === b) continue;
        const ob = orderB.get(a) - orderB.get(b);
        const ol = orderL.get(newName.get(a)) - orderL.get(newName.get(b));
        if (orderL.get(newName.get(a)) == null || orderL.get(newName.get(b)) == null || ob === 0n || ol === 0n || ob < 0n === ol < 0n) continue;
        if (ob > 0n) [a, b] = [b, a];
        const key = `${a}\u0000${b}`;
        flips.set(key, { a, b, props: [...(flips.get(key)?.props ?? []), prop] });
      }
    }
  }

  const index = (list) => {
    const m = new Map();
    list.forEach((item, i) => {
      for (const t of item.tokens) m.set(t, [...(m.get(t) ?? []), i]);
    });
    return m;
  };
  const sides = [
    { label: "base", scan: scanB, names: (f) => [f.a, f.b] },
    { label: "landing", scan: scanL, names: (f) => [newName.get(f.a), newName.get(f.b)] },
  ].map((s) => ({ ...s, carrierIndex: index(s.scan.carriers), cnIndex: index(s.scan.cnCalls) }));
  const both = (idx, x, y) => {
    const ys = new Set(idx.get(y) ?? []);
    return (idx.get(x) ?? []).filter((i) => ys.has(i));
  };

  let failing = 0;
  let inCn = 0;
  let apart = 0;
  const report = [];
  for (const f of [...flips.values()].sort((x, y) => (`${x.a} ${x.b}` < `${y.a} ${y.b}` ? -1 : 1))) {
    const out = [];
    let fails = 0;
    let listed = false;
    for (const s of sides) {
      const [x, y] = s.names(f);
      for (const i of both(s.carrierIndex, x, y)) {
        const c = s.scan.carriers[i];
        if (c.worlds.some((w) => w.has(x) && w.has(y))) {
          out.push(`      FAIL ${s.label}: ${c.where} carries both outside cn() (${c.kind})`);
          fails++;
        }
      }
      const calls = both(s.cnIndex, x, y).map((i) => s.scan.cnCalls[i].where);
      if (calls.length) {
        listed = true;
        out.push(`      in cn() (${s.label}): ${calls.join(", ")}`);
      }
    }
    failing += fails;
    if (fails) report.push([f, out]);
    else if (listed) {
      inCn++;
      report.push([f, out]);
    } else {
      apart++;
      if (opts.verbose) report.push([f, ["      never written together"]]);
    }
  }
  for (const [f, out] of report) {
    lines.push(`  ${f.a} / ${f.b} (${f.props.join(", ")}): ${f.b} wins in base, ${newName.get(f.a)} wins over ${newName.get(f.b)} in landing`);
    lines.push(...out);
  }
  for (const c of noCompile) lines.push(`  FAIL: ${c} becomes ${newName.get(c)}, which the landing's Tailwind theme doesn't know.`);
  const total = flips.size;
  const verdict =
    failing || noCompile.length
      ? `order: ${failing} literals or templates outside cn() carry a flipped pair${noCompile.length ? `, and ${noCompile.length} new names don't compile` : ""}.`
      : `order: ${total} same-property pairs flip. ${inCn} sit inside cn() calls, which keep the last class; ${apart} are never written together; none share a literal or template outside cn().`;
  print([verdict, ...lines]);
  return failing === 0 && noCompile.length === 0;
}

// ---------------------------------------------------------------------------
// shots: the device check's screenshots
// ---------------------------------------------------------------------------

async function stepShots(opts) {
  if (opts.baseShots.length !== 2 || !opts.landingShots) {
    throw new InputError("shots needs --base-shots <run a> --base-shots <run b> and --landing-shots <dir>.");
  }
  const sharp = dep(opts, "sharp");
  const [dirA, dirB] = opts.baseShots;
  const dirL = opts.landingShots;
  const list = (d) => {
    if (!fs.existsSync(d)) throw new InputError(`No screenshots at ${d}.`);
    return new Set(fs.readdirSync(d).filter((f) => /\.(jpe?g|png)$/i.test(f)));
  };
  const [setA, setB, setL] = [list(dirA), list(dirB), list(dirL)];
  const names = [...new Set([...setA, ...setB, ...setL])].sort();
  const hash = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  const decode = async (p) => {
    const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  };
  const compare = async (p, q) => {
    const [x, y] = [await decode(p), await decode(q)];
    if (x.width !== y.width || x.height !== y.height) return { pixels: Math.max(x.width * x.height, y.width * y.height), size: `${x.width}x${x.height} vs ${y.width}x${y.height}`, y };
    let pixels = 0;
    let box = null;
    const mask = new Uint8Array(x.width * x.height);
    for (let i = 0, px = 0; i < x.data.length; i += 4, px++) {
      let delta = 0;
      for (let k = 0; k < 3; k++) delta = Math.max(delta, Math.abs(x.data[i + k] - y.data[i + k]));
      if (delta > opts.threshold) {
        pixels++;
        mask[px] = 1;
        const [cx, cy] = [px % x.width, Math.floor(px / x.width)];
        box = box ? [Math.min(box[0], cx), Math.min(box[1], cy), Math.max(box[2], cx), Math.max(box[3], cy)] : [cx, cy, cx, cy];
      }
    }
    return { pixels, box, mask, y };
  };

  const missing = [];
  const noise = [];
  const differ = [];
  let same = 0;
  let oneRun = 0;
  for (const name of names) {
    const [pa, pb, pl] = [path.join(dirA, name), path.join(dirB, name), path.join(dirL, name)];
    if (!setA.has(name) || !setL.has(name)) {
      missing.push(`${name}: ${setA.has(name) ? "not in the landing run" : "not in base run a"}`);
      continue;
    }
    const [ha, hl] = [hash(pa), hash(pl)];
    let hb = null;
    if (setB.has(name)) {
      hb = hash(pb);
      if (ha !== hb && (await compare(pa, pb)).pixels > 0) {
        noise.push(name);
        continue;
      }
    } else oneRun++;
    if (hl === ha || hl === hb) {
      same++;
      continue;
    }
    const r = await compare(pa, pl);
    if (r.pixels === 0) {
      same++;
      continue;
    }
    differ.push({ name, ...r });
    if (opts.diffDir && r.mask) {
      fs.mkdirSync(opts.diffDir, { recursive: true });
      const { data, width, height } = r.y;
      const out = Buffer.alloc(width * height * 4);
      for (let px = 0; px < width * height; px++) {
        const i = px * 4;
        const gray = Math.round(178 + 0.3 * (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]));
        out.set(r.mask[px] ? [255, 0, 0, 255] : [gray, gray, gray, 255], i);
      }
      await sharp(out, { raw: { width, height, channels: 4 } }).png().toFile(path.join(opts.diffDir, name.replace(/\.\w+$/, ".diff.png")));
    }
  }

  const lines = [];
  if (noise.length) lines.push(`  Skipped as noise (the two base runs differ): ${noise.join(", ")}`);
  if (oneRun) lines.push(`  note: ${oneRun} shots are in base run a only, so they have no noise check.`);
  for (const m of missing) lines.push(`  Missing: ${m}`);
  for (const d of differ) {
    const where = d.size ? `sizes ${d.size}` : `${d.pixels} pixels in x ${d.box[0]} to ${d.box[2]}, y ${d.box[1]} to ${d.box[3]}`;
    lines.push(`  Differs: ${d.name}, ${where}`);
  }
  const problems = missing.length + differ.length;
  const verdict = problems
    ? `shots: ${problems} differences out of ${names.length} shots.`
    : `shots: no differences. ${same} of ${names.length} shots match, ${noise.length} skipped as noise.`;
  print([verdict, ...lines]);
  return problems === 0;
}

// ---------------------------------------------------------------------------
// email: both renderers in both worktrees
// ---------------------------------------------------------------------------

const MARK = "@@zero-pixel-proof@@";

/** render.test.ts's fixtures, plus every optional part, so every token key in render.ts lands in the HTML. */
function emailFixtures() {
  const input = {
    line: "Choose a new password for your HG jobs login.",
    buttonLabel: "Choose a new password",
    buttonUrl: "https://hg.example.com/login/reset?token=abc_DEF-123",
  };
  const T = "https://hg.example.com/j/tok";
  const job = {
    preview: 'Connor moved the due date to Mon, Nov 23. Connor: "Faucet\'s in the garage."',
    headline: "Connor moved the due date to Mon, Nov 23.",
    lines: ['Connor: "Faucet\'s in the garage."'],
    primary: { label: "Start job", url: "https://hg.example.com/p/jobs/t1" },
    secondary: [{ label: "Add photos", url: "https://hg.example.com/p/jobs/t1" }],
    job: {
      title: "Replace kitchen faucet",
      where: "118 Congress St · Rear",
      directionsUrl: "https://maps.apple.com/?daddr=118%20Congress%20St",
      photoUrl: "https://blob.example.com/front.jpg",
      due: "Mon, Nov 23",
      notes: "New faucet is in the garage.\nShut-off sticks.",
      checklist: [
        { title: "Swap faucet", done: false },
        { title: "Check for leaks", done: true },
      ],
      contractor: null,
      checklistLine: null,
    },
    footnote: "Reply in the job so Connor and Pieter both see it.",
  };
  return [
    { name: "plain", kind: "plain", input },
    {
      name: "plain with items, closing and footnote",
      kind: "plain",
      input: { ...input, items: ["Zack started the job", 'Zack: "Uppers in" <b>\nTwo coats.'], closing: "Thanks, Zack.", footnote: "Didn't ask for this? You can ignore it." },
    },
    { name: "job", kind: "job", input: job },
    {
      name: "job with photos and every link",
      kind: "job",
      input: {
        ...job,
        photos: [{ src: "https://hg.example.com/api/files/task/p1?v=thumb&l=tok", href: T }],
        morePhotos: 3,
        closing: "Thanks, Connor.",
        job: {
          ...job.job,
          contractor: "Zack Smith",
          checklistLine: "1 of 2 done",
          calendarUrl: `${T}/calendar`,
          accessUrl: `${T}?do=access`,
          dateUrl: `${T}?do=date`,
          photos: [{ src: "https://hg.example.com/api/files/task/h1?v=thumb&l=tok", href: T }],
          morePhotos: 2,
        },
      },
    },
    {
      name: "job with nothing to do and no date",
      kind: "job",
      input: { ...job, primary: null, secondary: [], footnote: undefined, job: { ...job.job, due: null, photoUrl: null, dateUrl: `${T}?do=date` } },
    },
  ];
}

/**
 * Runs inside tsx, with the side's tsconfig, so render.ts's "@/" imports
 * resolve. "cov" swaps every token for a marker before render.ts loads, so the
 * HTML shows which key each spot reads; "direct" renders as the app does.
 */
async function emailChild(side, mode) {
  const url = (p) => pathToFileURL(path.join(side, p)).href;
  const { brandTokens } = await import(url("src/lib/brand-tokens.ts"));
  const values = { ...brandTokens };
  if (mode === "cov") for (const k of Object.keys(brandTokens)) brandTokens[k] = `@@${k}@@`;
  const render = await import(url("src/lib/email/render.ts"));
  const out = {};
  for (const f of emailFixtures()) out[f.name] = f.kind === "plain" ? render.renderPlainEmail(f.input) : render.renderJobEmail(f.input);
  const source = fs.readFileSync(path.join(side, "src/lib/email/render.ts"), "utf8");
  const spec = /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/brand-tokens["']/.exec(source)?.[1] ?? "";
  const alias = /\bbrandTokens(?:\s+as\s+(\w+))?/.exec(spec)?.[1] ?? "brandTokens";
  const referenced = [...new Set([...source.matchAll(new RegExp(`\\b${alias}\\.(\\w+)`, "g"))].map((m) => m[1]))].filter((k) => k in values);
  process.stdout.write(`\n${MARK}${JSON.stringify({ values, out, referenced })}`);
}

function runEmailChild(opts, side, mode) {
  const tsx = [opts.landing, opts.base, SCRIPT_REPO].map((d) => path.join(d, "node_modules", ".bin", "tsx")).find((p) => fs.existsSync(p));
  if (!tsx) throw new InputError(`No tsx in ${opts.landing}/node_modules. Run npm ci.`);
  const r = spawnSync(tsx, ["--tsconfig", path.join(side, "tsconfig.json"), SCRIPT, "__email", side, mode], { cwd: side, encoding: "utf8", maxBuffer: 64 << 20 });
  const at = (r.stdout ?? "").lastIndexOf(MARK);
  if (r.status !== 0 || at < 0) throw new InputError(`The email render failed in ${side}:\n${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout.slice(at + MARK.length));
}

const camel = (name) => name.replace(/-(\d)/g, "$1").replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function firstDifference(x, y) {
  let i = 0;
  while (i < x.length && x[i] === y[i]) i++;
  const show = (s) => JSON.stringify(s.slice(Math.max(0, i - 60), i + 60));
  return `at character ${i}:\n        base:    ${show(x)}\n        landing: ${show(y)}`;
}

async function stepEmail(opts) {
  const keyMap = opts.rename ? new Map(Object.entries(RENAMED).map(([o, n]) => [camel(o), camel(n)])) : new Map();
  const lines = [];
  let problems = 0;
  const sides = {};
  for (const [label, root] of [["base", opts.base], ["landing", opts.landing]]) {
    const direct = runEmailChild(opts, root, "direct");
    const cov = runEmailChild(opts, root, "cov");
    const covered = new Set();
    for (const [name, r] of Object.entries(cov.out)) {
      for (const m of (r.html + r.text).matchAll(/@@(\w+)@@/g)) covered.add(m[1]);
      const back = r.html.replace(/@@(\w+)@@/g, (_, k) => cov.values[k]);
      if (back !== direct.out[name].html) {
        problems++;
        lines.push(`  ${label}: "${name}" reads a token other than by plain interpolation, so the marker check can't vouch for it.`);
      }
    }
    const unreached = cov.referenced.filter((k) => !covered.has(k));
    if (unreached.length) {
      problems++;
      lines.push(`  ${label}: the fixtures never reach ${unreached.map((k) => `t.${k}`).join(", ")} in render.ts. Add a fixture that does.`);
    }
    sides[label] = { direct, cov, covered };
  }
  for (const f of emailFixtures()) {
    const [b, l] = [sides.base.direct.out[f.name], sides.landing.direct.out[f.name]];
    for (const part of ["html", "text"]) {
      if (b[part] !== l[part]) {
        problems++;
        lines.push(`  "${f.name}" ${part} differs ${firstDifference(b[part], l[part])}`);
      }
    }
    // Same bytes can still hide a swap between two tokens of equal value, so
    // each spot must read the renamed key of what it read before.
    const mapped = sides.base.cov.out[f.name].html.replace(/@@(\w+)@@/g, (_, k) => `@@${keyMap.get(k) ?? k}@@`);
    const landingCov = sides.landing.cov.out[f.name].html;
    if (mapped !== landingCov) {
      const split = (s) => s.split(/@@(\w+)@@/);
      const [pb, pl, raw] = [split(mapped), split(landingCov), split(sides.base.cov.out[f.name].html)];
      const sameShape = pb.length === pl.length && pb.every((p, i) => i % 2 === 1 || p === pl[i]);
      if (!sameShape) {
        problems++;
        lines.push(`  "${f.name}" reads tokens in other places ${firstDifference(mapped, landingCov)}`);
      } else {
        for (let i = 1; i < pb.length; i += 2) {
          if (pb[i] === pl[i]) continue;
          problems++;
          const was = raw[i] === pb[i] ? `t.${raw[i]}` : `t.${raw[i]}, which is t.${pb[i]} after the rename`;
          lines.push(`  "${f.name}" reads t.${pl[i]} where base read ${was}, after ${JSON.stringify(pb[i - 1].slice(-50))}`);
        }
      }
    }
  }
  const keys = [...sides.landing.covered].sort();
  const verdict = problems
    ? `email: ${problems} differences.`
    : `email: no differences. ${emailFixtures().length} renders match byte for byte, and each spot reads the renamed token (${keys.length} keys: ${keys.join(", ")}).`;
  print([verdict, ...lines]);
  return problems === 0;
}

// ---------------------------------------------------------------------------
// db: both worktrees on the same database
// ---------------------------------------------------------------------------

function readEnvFile(file) {
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out.set(m[1], v);
  }
  return out;
}

/** Where a URL points, without its password. */
function dbLabel(url) {
  if (!url) return "unset";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "set, but not a URL";
  }
}

async function stepDb(opts) {
  const shell = process.env.DATABASE_URL;
  const seen = [];
  for (const [label, root] of [["base", opts.base], ["landing", opts.landing]]) {
    const files = [".env.production.local", ".env.local", ".env.production", ".env"].map((f) => readEnvFile(path.join(root, f)));
    // next build and next start read .env.local first; Prisma (and so the device setup) reads .env.
    const next = shell ?? files.map((m) => m.get("DATABASE_URL")).find((v) => v !== undefined);
    const prisma = shell ?? files[3].get("DATABASE_URL");
    seen.push({ who: `${label} server`, url: next }, { who: `${label} setup`, url: prisma });
  }
  const urls = new Set(seen.map((s) => s.url));
  const lines = seen.map((s) => `  ${s.who}: ${dbLabel(s.url)}`);
  if (shell) lines.push("  note: DATABASE_URL is set in this shell, so it wins over every .env file.");
  const ok = urls.size === 1 && seen[0].url;
  print([ok ? "db: both worktrees use the same database." : "db: the worktrees resolve different databases. Fix the .env files before the device runs.", ...lines]);
  return !!ok;
}

// ---------------------------------------------------------------------------

function print(lines) {
  process.stdout.write(lines.join("\n") + "\n");
}

const STEPS = { css: stepCss, order: stepOrder, shots: stepShots, email: stepEmail, db: stepDb };

async function main(argv) {
  if (argv[0] === "__email") return emailChild(argv[1], argv[2]);
  const opts = parseArgs(argv);
  if (opts.help || !opts.steps.length) {
    print([usage()]);
    return opts.help ? 0 : 2;
  }
  const shotsGiven = opts.baseShots.length > 0 || !!opts.landingShots;
  const steps = opts.steps.includes("all") ? ["css", "order", "email", ...(shotsGiven ? ["db", "shots"] : [])] : [...new Set(opts.steps)];
  let ok = true;
  for (const step of steps) {
    if (step !== "shots") needBase(opts, step);
    if (!(await STEPS[step](opts))) ok = false;
  }
  if (!opts.rename) print(["note: --no-rename compared names as they are. It's a self-test, not the proof."]);
  return ok ? 0 : 1;
}

main(process.argv.slice(2)).then(
  (code) => {
    if (typeof code === "number") process.exitCode = code;
  },
  (err) => {
    if (err instanceof InputError) {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`${err.stack ?? err}\n`);
      process.exitCode = 2;
    }
  },
);
