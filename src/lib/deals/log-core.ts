import { DEAL_FIELD_LABEL, dealStageLabel } from "@/lib/config";
import { parseAmount } from "@/lib/money";

/**
 * What an edit to a deal changed, as data (docs/specs/activity-comments.md
 * 2.9): one `{ field, from, to }` per field, stored in `DealNote.data` of a
 * `source = "change"` row beside a readable `body`. Pure, so log.test.ts runs
 * it without a database; log.ts writes the rows.
 *
 * The comparison is on trimmed, normalized values, so an edit that leaves a
 * field as it was ("Next action" re-saved with a trailing space, a price
 * retyped as "425000" for "$425,000") writes nothing (VISUAL-I10).
 */

/** The deal fields a change entry can name, in the rail's order. Each is a `DEAL_FIELD_LABEL` key. */
export const CHANGE_FIELDS = ["address", "status", "priority", "passReason", "theirPrice", "ourPrice", "units", "nextAction", "sourceUrl"] as const;

export type DealChangeField = (typeof CHANGE_FIELDS)[number];

/** One field's change: the values as text, null for empty. A stage is stored as is ("1 - High") and worded at read. */
export interface DealChange {
  field: DealChangeField;
  from: string | null;
  to: string | null;
}

/** The part of a deal an edit compares against. */
export interface DealSnapshot {
  address: string;
  status: string;
  priority: string | null;
  passReason: string | null;
  units: number | null;
  theirPriceRaw: string | null;
  ourPriceRaw: string | null;
  nextAction: string | null;
  sourceUrl: string | null;
}

/** The column each field is written to in a patch's data. */
const COLUMN: Record<DealChangeField, keyof DealSnapshot> = {
  address: "address",
  status: "status",
  priority: "priority",
  passReason: "passReason",
  theirPrice: "theirPriceRaw",
  ourPrice: "ourPriceRaw",
  units: "units",
  nextAction: "nextAction",
  sourceUrl: "sourceUrl",
};

/** A value as text for comparing and showing: trimmed, runs of space collapsed, and null when nothing is left. */
export function normalizeValue(v: unknown): string | null {
  if (v == null) return null;
  const s = (typeof v === "string" ? v : typeof v === "number" || typeof v === "bigint" ? String(v) : "").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

const isPrice = (field: DealChangeField) => field === "theirPrice" || field === "ourPrice";

/** Whether two values read as the same for this field: prices by their amount when both are one, everything else by its normalized text. */
export function sameValue(field: DealChangeField, a: unknown, b: unknown): boolean {
  const x = normalizeValue(a);
  const y = normalizeValue(b);
  if (x === y) return true;
  if (x === null || y === null) return false;
  if (isPrice(field)) {
    const px = parseAmount(x);
    const py = parseAmount(y);
    return px !== null && py !== null && px === py;
  }
  return false;
}

/**
 * The fields a patch really changed: each key present in `data` whose new
 * value differs from the deal as it was. A key that is absent, or present
 * with the same value, is no change.
 */
export function diffDealChanges(before: DealSnapshot, data: Record<string, unknown>): DealChange[] {
  const out: DealChange[] = [];
  for (const field of CHANGE_FIELDS) {
    const column = COLUMN[field];
    if (!(column in data)) continue;
    if (sameValue(field, before[column], data[column])) continue;
    out.push({ field, from: normalizeValue(before[column]), to: normalizeValue(data[column]) });
  }
  return out;
}

const lower = (s: string) => s.toLowerCase();

/** A field's name inside a sentence: "asking price", "stage", "next action". */
export function fieldWords(field: DealChangeField): string {
  return lower(DEAL_FIELD_LABEL[field]);
}

/** A value as the log shows it: a stage by its word ("High"), everything else as typed; "—" for empty. */
export function showValue(field: DealChangeField, value: string | null): string {
  if (value === null) return "—";
  return field === "status" ? dealStageLabel(value) : value;
}

/**
 * The readable line stored in the row's `body`, which the data keeps beside
 * it for anything that reads text: "Stage: High → Pass", "Listing link
 * added". The log reads `data` first and draws its own sentence.
 */
export function changeText(c: DealChange): string {
  if (c.field === "sourceUrl") {
    const word = c.from === null ? "added" : c.to === null ? "removed" : "updated";
    return `${DEAL_FIELD_LABEL.sourceUrl} ${word}`;
  }
  return `${DEAL_FIELD_LABEL[c.field]}: ${showValue(c.field, c.from)} → ${showValue(c.field, c.to)}`;
}

/** Longest value a sentence carries before cutting it ("…"); the opened row shows it whole. */
const SENTENCE_VALUE_MAX = 60;

const cut = (s: string) => (s.length > SENTENCE_VALUE_MAX ? `${s.slice(0, SENTENCE_VALUE_MAX - 1).trimEnd()}…` : s);

/**
 * A single change as the log words it, after the person's first name:
 * "changed the stage to High", "removed the listing link", "added the
 * listing link", "changed the asking price to $410,000". A cleared value is
 * "removed the …" (DEALS-042, COPY-031).
 */
export function changePhrase(c: DealChange): string {
  const what = fieldWords(c.field);
  if (c.to === null) return `removed the ${what}`;
  if (c.field === "sourceUrl") return c.from === null ? `added the ${what}` : `updated the ${what}`;
  return `changed the ${what} to ${cut(showValue(c.field, c.to))}`;
}

/** The sentence for several changes by one person: "changed the asking price and 2 other fields". */
export function changesPhrase(changes: readonly DealChange[]): string {
  if (changes.length === 1) return changePhrase(changes[0]);
  const rest = changes.length - 1;
  return `changed the ${fieldWords(changes[0].field)} and ${rest} other ${rest === 1 ? "field" : "fields"}`;
}

/** What a change row stores as `data`: the same three keys, nothing else. */
export function changeData(c: DealChange): { field: DealChangeField; from: string | null; to: string | null } {
  return { field: c.field, from: c.from, to: c.to };
}

/** Reads a row's `data` back as a change, or null when it holds none (notes, task lines, rows from before this). */
export function readChange(data: unknown): DealChange | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const field = (CHANGE_FIELDS as readonly unknown[]).includes(d.field) ? (d.field as DealChangeField) : null;
  if (!field) return null;
  const text = (v: unknown) => (typeof v === "string" ? normalizeValue(v) : null);
  return { field, from: text(d.from), to: text(d.to) };
}

/** The labels old change lines used, by the field they were about. */
const LEGACY_LABEL: Record<string, DealChangeField> = {
  Status: "status",
  Stage: "status",
  Priority: "priority",
  "Pass reason": "passReason",
  Units: "units",
  "Asking price": "theirPrice",
  "Their price": "theirPrice",
  "Target offer": "ourPrice",
  "Our price": "ourPrice",
  "Next action": "nextAction",
  Address: "address",
};

/**
 * An old change line ("Next action: — → Call Friday") read back as a change,
 * or null when it isn't one of that shape ("Deal created", "Task added: …",
 * "Listing URL added"). The dash that stood for empty reads as empty.
 */
export function parseLegacyChange(text: string): DealChange | null {
  const m = /^([^:→]+): ([\s\S]*) → ([\s\S]*)$/.exec(text.trim());
  if (!m) return null;
  const field = LEGACY_LABEL[m[1].trim()];
  if (!field) return null;
  const side = (s: string) => {
    const v = normalizeValue(s);
    return v === "—" ? null : v;
  };
  return { field, from: side(m[2]), to: side(m[3]) };
}

/**
 * Whether an old change line recorded nothing: both sides read the same
 * ("Next action: — → —", "Units: 8 → 8"). Existing rows like these are hidden
 * at read; new ones are never written (VISUAL-I10).
 */
export function isNoopLine(text: string): boolean {
  const c = parseLegacyChange(text);
  return c !== null && sameValue(c.field, c.from, c.to);
}
