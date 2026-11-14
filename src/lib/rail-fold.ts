/**
 * Which rows of a facts rail fold away (docs/specs/property-page.md 2.2). A
 * `fold` row always does, filled or not: a detail most visits don't need
 * (Details' Attorney, Loan's Servicer). Otherwise a row folds when it's empty,
 * isn't kept (`keep`: a reminder date, a switch, a fact Connor wants in
 * sight), and hasn't been seen filled on this visit. A row filled on this
 * visit and then cleared stays out, so it doesn't vanish under the finger
 * that cleared it.
 */
export type FoldRow = { key: string; empty: boolean; keep?: boolean; fold?: boolean };

export function foldedKeys(rows: readonly FoldRow[], seenFilled: ReadonlySet<string>): string[] {
  return rows.filter((r) => r.fold || (r.empty && !r.keep && !seenFilled.has(r.key))).map((r) => r.key);
}

/** The fold's row: "7 more fields", "1 more field". */
export function moreFieldsLabel(n: number): string {
  return `${n} more ${n === 1 ? "field" : "fields"}`;
}
