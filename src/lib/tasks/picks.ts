/**
 * The Tasks list's picked rows for bulk edit (docs/specs/bulk-edit.md), as
 * pure state: which task ids are picked, in which scope (the view, filters
 * and search they were picked under), and the anchor a Shift-click ranges
 * from. app/(app)/tasks/task-picks.tsx holds it in React. See picks.test.ts.
 */

export type PickState = "none" | "some" | "all";

export interface Picks {
  /** The view, filters and search the picks were made under: a new scope starts with none. */
  scope: string;
  ids: ReadonlySet<string>;
  /** The last row picked or unpicked one at a time, where a Shift-click's range starts. */
  anchor: string | null;
}

export const noPicks = (scope: string): Picks => ({ scope, ids: new Set(), anchor: null });

/** The picks for this scope: the same picks, or none when the scope changed. */
export function inScope(picks: Picks, scope: string): Picks {
  return picks.scope === scope ? picks : noPicks(scope);
}

/**
 * One row, Cmd-click's or a tap's: picked if it wasn't, unpicked if it was.
 * With `range` (Shift), every row from the anchor to this one, in list order
 * (`order`), takes the state this row is heading to, as Finder and Gmail do;
 * with no anchor on the list it's this row alone.
 */
export function togglePick(picks: Picks, order: readonly string[], id: string, range = false): Picks {
  const next = new Set(picks.ids);
  const pick = !next.has(id);
  const from = range && picks.anchor ? order.indexOf(picks.anchor) : -1;
  const to = order.indexOf(id);
  if (from >= 0 && to >= 0 && from !== to) {
    const [lo, hi] = from < to ? [from, to] : [to, from];
    for (const x of order.slice(lo, hi + 1)) {
      if (pick) next.add(x);
      else next.delete(x);
    }
  } else if (pick) next.add(id);
  else next.delete(id);
  return { ...picks, ids: next, anchor: id };
}

/** These rows together: a heading's Select or Deselect, or Select all. The anchor stays. */
export function setPicks(picks: Picks, ids: readonly string[], pick: boolean): Picks {
  const next = new Set(picks.ids);
  for (const x of ids) {
    if (pick) next.add(x);
    else next.delete(x);
  }
  return { ...picks, ids: next };
}

/**
 * The picks with every row that left the list dropped (finished in Open,
 * moved out of the filter, past the first page after a sort), so it comes
 * back unpicked. The same picks when nothing left.
 */
export function prunePicks(picks: Picks, onScreen: ReadonlySet<string>): Picks {
  if ([...picks.ids].every((id) => onScreen.has(id))) return picks;
  return { ...picks, ids: new Set([...picks.ids].filter((id) => onScreen.has(id))) };
}

/** How many of these rows are picked: none, some or all. An empty group is "none". */
export function pickState(picked: ReadonlySet<string>, ids: readonly string[]): PickState {
  const n = ids.filter((x) => picked.has(x)).length;
  return n === 0 ? "none" : n === ids.length ? "all" : "some";
}
