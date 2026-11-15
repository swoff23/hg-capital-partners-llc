// The Nov 14 color rename (docs/specs/design-foundation.md, sections 3.1, 3.4
// and 6.2): HG's color tokens take shadcn's names. This is the one copy of the
// map. eslint.config.mjs (the old-name ban), src/lib/token-names.test.ts,
// scripts/rename-tokens.mjs and scripts/zero-pixel-proof.mjs import it.
//
// A data module: no side effects and no file IO, so lint can import it.

/** Old token name to new, without the `--` or a utility prefix. */
export const RENAMED = {
  "fg-1": "foreground", "fg-3": "muted-foreground", surface: "background", raised: "popover",
  "fill-1": "muted", "fill-2": "accent", act: "primary", "on-act": "primary-foreground",
  danger: "destructive", line: "border", "line-control": "input",
  "act-hover": "primary-hover", "danger-tint": "destructive-tint", "danger-fill": "destructive-fill",
  "danger-fill-hover": "destructive-fill-hover", "on-danger": "destructive-foreground", // decision 9
};

// Longest first, so `line-control` wins over `line` and `danger-fill-hover` over `danger-fill`.
const KEYS = Object.keys(RENAMED).sort((a, b) => b.length - a.length).join("|");
// Every Tailwind utility that takes a color. Exported for eslint.config.mjs's white and black ban.
export const UTIL = "text|bg|border(?:-(?:[trblxyse]|bs|be))?|divide|ring(?:-offset)?|inset-ring|outline|fill|stroke|decoration|caret|accent|placeholder|shadow|inset-shadow|drop-shadow|text-shadow|from|via|to";

/**
 * A color utility on an old name: group 1 is the utility, group 2 the token.
 * The lookbehind lets a variant chain sit in front (`hover:`, `[&_svg]:`,
 * `group-hover/row:`, an escaped `\:`). The lookahead keeps a `/70` opacity or
 * a `!` and stops `line` matching `line-strong`.
 */
export const OLD_CLASS = new RegExp(`(?<![\\w-])(${UTIL})-(${KEYS})(?![\\w-])`, "g");

/** A CSS variable on an old name, with or without Tailwind's `color-` prefix. Group 1 is the token. */
export const OLD_VAR = new RegExp(`(?<![\\w-])--(?:color-)?(${KEYS})(?![\\w-])`, "g");

// Where a class candidate ends, outside brackets and parentheses. A `.`, `+`
// or `~` ends it too, so a CSS selector's `.focus\:ring-act` reads as
// `focus\:`; no Tailwind variant has one outside brackets.
const STOP = /[\s"'`{}|;,<>.+~]/;

/**
 * The variant chain written right before the utility that starts at `index`,
 * such as "group-hover/row:" or "focus-visible\\:", or "" when there is none.
 * It walks back over the candidate, skipping whatever sits inside [] and ().
 */
function chainBefore(text, index) {
  if (text[index - 1] !== ":") return "";
  let depth = 0;
  let start = index;
  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i];
    const escaped = i > 0 && text[i - 1] === "\\";
    if (ch === "]" || ch === ")") depth++;
    else if (ch === "[" || ch === "(") {
      if (depth === 0) break;
      depth--;
    } else if (depth === 0 && !escaped && STOP.test(ch)) break;
    start = i;
  }
  return text.slice(start, index);
}

/** Splits an unescaped variant chain ("a:[&:b]:c:") into its variants, keeping colons inside brackets. */
function variants(chain) {
  const out = [];
  let depth = 0;
  let current = "";
  for (const ch of chain) {
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    if (ch === ":" && depth === 0) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  if (current) out.push(current);
  return out;
}

const FOCUS_CORE = /^(?:data-)?focus(?:-visible|-within)?$|^data-\[focus(?:-visible)?\]$|^\[&?:focus(?:-visible|-within)?\]$/;

/** Whether one variant targets focus: focus, focus-visible, focus-within, data-focus-visible, group-focus-visible and kin. */
function isFocusVariant(variant) {
  // A leading `!` (important) or markdown `*` isn't part of the variant; `/row` names a group.
  let v = variant.replace(/^[!*]+/, "").replace(/\/[\w-]+$/, "");
  // group-, peer-, has- and in- still draw a focus ring; not- doesn't, so it isn't stripped.
  while (/^(?:group|peer|has|in)-/.test(v)) v = v.replace(/^(?:group|peer|has|in)-/, "");
  return FOCUS_CORE.test(v);
}

/** Whether a variant chain (escaped or not) has a focus variant in it. */
export function hasFocusVariant(chain) {
  return variants(chain.replace(/\\/g, "")).some(isFocusVariant);
}

/**
 * The new name for one `act` utility. `outline-act`, and `ring-act` or
 * `border-act` under a focus variant, draw focus, so they become `ring`. Every
 * other `act` (fills, edges, checked and pressed states) becomes `primary`.
 * The two are equal, so a wrong pick moves no pixel.
 */
function actName(util, chain) {
  if (util === "outline") return "ring";
  if ((util === "ring" || util.startsWith("border")) && hasFocusVariant(chain)) return "ring";
  return "primary";
}

/** The new utility for an old one, given the variant chain in front of it. */
function newClass(util, key, chain) {
  return `${util}-${key === "act" ? actName(util, chain) : RENAMED[key]}`;
}

/** The new variable for an old one: `--fg-3` to `--muted-foreground`, `--color-fg-3` to `--color-muted-foreground`. */
function newVar(match, key) {
  return `${match.startsWith("--color-") ? "--color-" : "--"}${RENAMED[key]}`;
}

/**
 * Renames every old color class in arbitrary text (source, templates, JSX,
 * CSS, markdown). Each match sees the variant chain in front of it, for the
 * `act` rule.
 */
export function renameClassesInText(text) {
  return text.replace(OLD_CLASS, (_match, util, key, offset, whole) => newClass(util, key, chainBefore(whole, offset)));
}

/**
 * Renames every old CSS variable. `--act` always becomes `--primary`: a
 * variable has no focus context, so `:focus-visible`'s outline moves to
 * `--ring` by hand.
 */
export function renameVarsInText(text) {
  return text.replace(OLD_VAR, (match, key) => newVar(match, key));
}

/** Both passes, classes first. Old names never reappear in new ones, so running it twice changes nothing more. */
export function renameText(text) {
  return renameVarsInText(renameClassesInText(text));
}

/**
 * The new name for ONE unescaped class candidate, its variant chain included
 * ("hover:bg-fill-1" to "hover:bg-muted", "focus-visible:outline-act" to
 * "focus-visible:outline-ring"), or the input unchanged when it holds no old
 * name. The whole prefix in front of the utility counts as its chain. A
 * variable inside an arbitrary value (`bg-[var(--fill-1)]`) is renamed too, as
 * the rename script would rename it in source.
 */
export function renameClass(className) {
  const renamed = className.replace(OLD_CLASS, (_match, util, key, offset, whole) =>
    newClass(util, key, whole.slice(0, offset)),
  );
  return renameVarsInText(renamed);
}

/**
 * Every old name in `text`, in order: where it starts, what it says, what it
 * becomes, and whether it's a class or a CSS variable. For lint, the tests and
 * `rename-tokens.mjs --check`.
 */
export function findOldNames(text) {
  const found = [];
  for (const m of text.matchAll(OLD_CLASS)) {
    found.push({ index: m.index, match: m[0], replacement: newClass(m[1], m[2], chainBefore(text, m.index)), kind: "class" });
  }
  for (const m of text.matchAll(OLD_VAR)) {
    found.push({ index: m.index, match: m[0], replacement: newVar(m[0], m[1]), kind: "var" });
  }
  return found.sort((a, b) => a.index - b.index);
}
