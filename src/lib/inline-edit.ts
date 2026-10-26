/**
 * What an in-place edit of a heading or a one-line fact
 * (components/inline-field.tsx) saves on blur or Enter. Runs of whitespace,
 * newlines included, become one space and the ends are trimmed. Null means
 * save nothing and show the stored value again: the text wasn't touched, or
 * it says the same once tidied. A stored value with stray spaces ("256
 * Auburn Avenue   Buffalo") is left alone until someone really edits it.
 * Pure; see inline-edit.test.ts.
 *
 * `inlineEditCommit` is the quiet form: too short is also null. The field
 * itself uses `inlineEdit`, which says why (forms 2.8): nothing snaps back
 * silently, so a draft that is too short stays open with its reason.
 */

import { tidyAddress } from "@/lib/address-suggestions";
import { PHONE_INVALID, readPhone } from "@/lib/contractors/contact-fields";
import { fmtDay } from "@/lib/dates";
import { parseAmount, readNumber, type NumberKind } from "@/lib/money";
import { fmtMoney } from "@/lib/utils";

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

export function inlineEditCommit(draft: string, saved: string, minLength = 1): string | null {
  if (draft === saved) return null;
  const next = tidy(draft);
  if (next.length < minLength || next === tidy(saved)) return null;
  return next;
}

/** What leaving a heading or a one-line fact means: nothing changed, a draft too short for the field, or a value to save. */
export type InlineEdit = { kind: "same" } | { kind: "short"; message: string } | { kind: "save"; value: string };

/**
 * "Enter at least 2 characters." The line a draft shorter than `minLength`
 * gets. A blank where one character is the least reads as `blank` when the
 * field names it ("Enter the address."), else the same line.
 */
export function tooShortMessage(minLength: number, blank?: string): string {
  if (minLength <= 1) return blank ?? "Enter at least 1 character.";
  return `Enter at least ${minLength} characters.`;
}

export function inlineEdit(draft: string, saved: string, opts: { minLength?: number; blank?: string; tooShort?: string } = {}): InlineEdit {
  const { minLength = 1, blank } = opts;
  if (draft === saved) return { kind: "same" };
  const next = tidy(draft);
  if (next === tidy(saved)) return { kind: "same" };
  // Emptied a value that was empty (stray spaces only): nothing to say.
  if (next === "" && tidy(saved) === "") return { kind: "same" };
  if (next.length < minLength) {
    // The field's own words ("Enter the full street address, like 123 Main St.") beat the generic count.
    return { kind: "short", message: opts.tooShort ?? tooShortMessage(minLength, next === "" ? blank : undefined) };
  }
  return { kind: "save", value: next };
}

/* ---------------- The kinds of fact ---------------- */

/** What an `InlineField` holds (forms 2.8). `heading` is the page's h1. */
export type InlineKind =
  | "text"
  | "multiline"
  | "money"
  | "percent"
  | "integer"
  | "year"
  | "decimal"
  | "email"
  | "phone"
  | "url"
  | "date"
  | "choice"
  | "heading";

/** The number kinds read as `NumberKind`; every other kind is null. */
export function numberKindOf(kind: InlineKind): NumberKind | null {
  return kind === "money" || kind === "percent" || kind === "integer" || kind === "year" || kind === "decimal" ? kind : null;
}

export const EMAIL_MESSAGE = "Enter a full email, like name@example.com.";
export const URL_MESSAGE = "Enter a link that starts with https://.";

/**
 * Why a fact's text won't save, or null (forms 2.0): the line the field shows
 * when it's left with a format that can't be read. A blank is always fine
 * here; whether a fact may be empty is the field's `minLength`. Numbers read
 * by their kind (deal prices keep text with `allowText`); an email, a link
 * and a phone by the shapes the server reads.
 */
export function inlineProblem(kind: InlineKind, text: string, opts: { allowText?: boolean } = {}): string | null {
  const t = text.trim();
  if (t === "") return null;
  const numberKind = numberKindOf(kind);
  if (numberKind) {
    const read = readNumber(numberKind, t);
    return read.ok || opts.allowText ? null : read.message;
  }
  if (kind === "email") return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(t) ? null : EMAIL_MESSAGE;
  if (kind === "url") return /^https?:\/\/\S+$/i.test(t) ? null : URL_MESSAGE;
  if (kind === "phone") return readPhone(t) ? null : PHONE_INVALID;
  return null;
}

/** What leaving a fact decides: no change, a draft that can't be read (and why), or the text to save. `value` is the draft once tidied. */
export type InlineDecision = { kind: "same"; value: string } | { kind: "problem"; message: string; value: string } | { kind: "save"; value: string };

/**
 * What a heading saves, after `decideInlineEdit` said to save: an address as
 * `tidyAddress` writes it (the "Saves as" line's promise), so the page, the
 * toast and Undo's expected value read what is stored. Null when that is the
 * saved value already: "767 prospect avenue" over a stored "767 Prospect Ave"
 * is no edit.
 */
export function headingSave(value: string, current: string, opts: { address?: boolean } = {}): string | null {
  const next = opts.address ? tidyAddress(value) : value;
  return next === current ? null : next;
}

/** Line endings as "\n" and the ends trimmed: what a textarea hands back on any platform. */
const tidyBlock = (s: string) => s.replace(/\r\n?/g, "\n").trim();

/**
 * What leaving an open fact means (forms 2.0, 2.8), the one check every kind
 * runs before anything is sent. Notes keep their line breaks and compare
 * without the line-ending difference; a number compares as a number, so
 * "$425,000" over a stored "425000" saves nothing; any other text is tidied
 * to one line and checked against the field's minimum (`minLength`, 0 for a
 * fact that may be emptied) and the shape of an email, a link or a phone.
 * A draft that can't be read is a `problem` and the field stays open.
 */
export function decideInlineEdit(
  kind: InlineKind,
  draft: string,
  current: string,
  opts: { minLength?: number; blank?: string; tooShort?: string; allowText?: boolean },
): InlineDecision {
  const nk = numberKindOf(kind);
  if (nk) {
    const next = draft.trim();
    if (next === current.trim() || sameNumberText(nk, next, current)) return { kind: "same", value: next };
    const problem = inlineProblem(kind, next, { allowText: opts.allowText });
    return problem ? { kind: "problem", message: problem, value: next } : { kind: "save", value: next };
  }
  if (kind === "multiline") {
    const next = tidyBlock(draft);
    return next === tidyBlock(current) ? { kind: "same", value: next } : { kind: "save", value: next };
  }
  const r = inlineEdit(draft, current, { minLength: opts.minLength ?? 0, blank: opts.blank, tooShort: opts.tooShort });
  const next = tidy(draft);
  if (r.kind === "same") return { kind: "same", value: next };
  if (r.kind === "short") return { kind: "problem", message: r.message, value: next };
  const problem = inlineProblem(kind, r.value);
  return problem ? { kind: "problem", message: problem, value: next } : { kind: "save", value: r.value };
}

/**
 * What the server keeps of what was typed, as text: "290k" is "290000" in a
 * Decimal column, "Zack@Example.com" is lowercase, "716 555 0199" reads
 * "716-555-0199". Undo writes the old value back expecting what is stored now,
 * which is this, not the typed text, or the check that nothing moved
 * meanwhile would refuse the undo of every edit the server tidied. A deal
 * price (`allowText`) is kept as typed. Pure; the readers it mirrors are
 * properties/numbers.ts and contractors/contact-fields.ts.
 */
export function storedText(kind: InlineKind, text: string, opts: { allowText?: boolean } = {}): string {
  const t = text.trim();
  if (t === "") return "";
  const nk = numberKindOf(kind);
  if (nk && !opts.allowText) {
    const n = parseAmount(t);
    if (n === null) return t;
    if (nk === "money") return String(Number(n.toFixed(2)));
    if (nk === "percent") return String(Number(n.toFixed(3)));
    return String(n);
  }
  switch (kind) {
    case "email":
      return t.toLowerCase();
    case "phone":
      return readPhone(t)?.phone ?? t;
    case "multiline":
      return tidyBlock(t);
    case "date":
    case "choice":
      return t;
    default:
      return tidy(t);
  }
}

/** Whether two number texts are the same number ("425000" and "$425,000"), so tidying a field isn't an edit. */
export function sameNumberText(kind: NumberKind, a: string, b: string): boolean {
  const x = readNumber(kind, a);
  const y = readNumber(kind, b);
  return x.ok && y.ok && x.value === y.value;
}

/**
 * A fact's value as plain text, for a toast or a conflict line: "$425,000",
 * "6.875%", "1,200 sq ft", "Jun 1, 2031". A number that isn't one (a deal
 * price kept as text) shows as typed. `choice` shows the option's label
 * through `label`. Long text is shortened to one line.
 */
export function inlineShown(kind: InlineKind, text: string, opts: { unit?: string; label?: (text: string) => string | undefined } = {}): string {
  const t = text.trim();
  if (t === "") return "";
  const n = numberKindOf(kind) ? parseAmount(t) : null;
  switch (kind) {
    case "money":
      return n === null ? t : fmtMoney(n);
    case "percent":
      return n === null ? t : `${n}%`;
    case "integer":
      return n === null ? t : `${n.toLocaleString("en-US")}${opts.unit ? ` ${opts.unit}` : ""}`;
    case "year":
    case "decimal":
      return n === null ? t : String(n);
    case "date":
      return fmtDay(t);
    case "choice":
      return opts.label?.(t) ?? t;
    default: {
      const line = tidy(t);
      return line.length > 40 ? `${line.slice(0, 39).trimEnd()}…` : line;
    }
  }
}

/**
 * The toast after a fact saves (forms 2.13): "Rate set to 6.875%", "Lender
 * cleared", "Notes saved". The ripple clause ("Reminder task added") is the
 * toast's `detail`, not part of this line.
 */
export function inlineSavedMessage(
  label: string,
  kind: InlineKind,
  next: string,
  opts: { unit?: string; label?: (text: string) => string | undefined } = {},
): string {
  if (next.trim() === "") return `${label} cleared`;
  if (kind === "multiline") return `${label} saved`;
  if (kind === "heading") return `${label} changed`;
  return `${label} set to ${inlineShown(kind, next, opts)}`;
}
