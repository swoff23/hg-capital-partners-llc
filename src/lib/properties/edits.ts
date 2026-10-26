import { ConflictError } from "@/lib/action-result";
import { toYmd } from "@/lib/dates";

/**
 * What the property editors send, and what the service checks before it
 * writes (G2B-002, G2B-003).
 *
 * The field editors (Details, Loan, Insurance, Notes, the address heading)
 * keep the values they loaded when Edit opened. Save sends only the fields
 * that differ from those, each with the value it loaded, and the service
 * refuses a field whose stored value has moved since, unless it already
 * holds what the editor would write. So a partner's change to one field is
 * never written back over by a form that only showed the old value.
 *
 * The whole-blob editors (units, building CapEx, listings) pin the row's
 * version when Edit opens instead, and the save is refused unless the row
 * is still at it.
 *
 * Pure; see edits.test.ts.
 */

/** A stored or loaded value as its form field holds it: a date as yyyy-mm-dd, a yes/no as "yes" or "no". */
export function fieldText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return toYmd(v) ?? "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

/** Line endings and the ends tidied: a textarea hands back "\n" where the stored text has "\r\n". */
const tidy = (s: string) => s.replace(/\r\n?/g, "\n").trim();

export function sameText(a: string, b: string): boolean {
  return tidy(a) === tidy(b);
}

export type FieldEdits = {
  /** Field name to the text submitted for it. */
  changes: Record<string, string>;
  /** Field name to the text the editor loaded for it. */
  expected: Record<string, string>;
};

/** The submitted fields that differ from what the editor loaded, with what it loaded for each. */
export function changedFields(loaded: Record<string, unknown>, submitted: Record<string, string>): FieldEdits {
  const changes: Record<string, string> = {};
  const expected: Record<string, string> = {};
  for (const [k, v] of Object.entries(submitted)) {
    const before = fieldText(loaded[k]);
    if (sameText(v, before)) continue;
    changes[k] = v;
    expected[k] = before;
  }
  return { changes, expected };
}

/**
 * The fields someone else changed after the editor loaded them: the stored
 * value is neither what the editor loaded nor what it's about to write.
 */
export function staleFields(stored: Record<string, unknown>, edits: FieldEdits): string[] {
  return Object.keys(edits.expected).filter((k) => {
    const now = fieldText(stored[k]);
    return !sameText(now, edits.expected[k]) && !sameText(now, edits.changes[k] ?? "");
  });
}

/** Whether a row's updatedAt is still the version an editor pinned when Edit opened. */
export function isAtVersion(updatedAt: Date, expectedVersion: string): boolean {
  const pinned = new Date(expectedVersion);
  return !Number.isNaN(pinned.getTime()) && pinned.getTime() === updatedAt.getTime();
}

/** The row's last editor, as the property and deal queries select it (`updatedByUser`). */
export type LastEditor = { name: string | null; email: string } | null | undefined;

/** The name a conflict line uses for the last editor: their name, else their email. Undefined when the row doesn't say. */
export function editorName(by: LastEditor): string | undefined {
  return by ? by.name?.trim() || by.email : undefined;
}

/**
 * The refusal for a save that would write over a newer change (forms 2.12):
 * the stale fields, who saved last when the row records it, when, and for a
 * field save what each field holds now, as text, so the editor can say "Pieter
 * set this to $410,000 at 2:14 PM" and offer "Keep Pieter's" and "Save
 * mine". A whole-blob editor (units, building CapEx, listings) names the
 * blob and has no values. Pure; see edits.test.ts.
 */
export function rowConflict(
  row: Record<string, unknown> & { updatedAt: Date; updatedByUser?: LastEditor },
  fields: string[],
  opts: { values?: boolean } = {},
): ConflictError {
  return new ConflictError({
    fields,
    by: editorName(row.updatedByUser) ?? null,
    at: row.updatedAt,
    ...(opts.values ? { theirs: Object.fromEntries(fields.map((k) => [k, fieldText(row[k])])) } : {}),
  });
}
