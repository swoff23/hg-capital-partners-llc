/**
 * What still names a unit by its label: open tasks and listings. Removing a
 * unit leaves them pointing at a label nothing has any more (and a job page
 * without its lockbox code), so the units editor asks first (decision 19).
 * Pure; see unit-refs.test.ts.
 */

export interface UnitRefs {
  tasks: number;
  listings: number;
}

/** How a row matches a unit: trimmed, case-insensitive, as the rename sync and lockbox lookup match it. */
export function unitRefKey(label: string | null | undefined): string {
  return (label ?? "").trim().toLowerCase();
}

/** Open tasks and listings per unit, keyed by unitRefKey. Rows with no unit aren't counted. */
export function countUnitRefs(
  tasks: readonly { unitLabel: string | null }[],
  listings: readonly { unitLabel: string | null }[],
): Record<string, UnitRefs> {
  const refs: Record<string, UnitRefs> = {};
  const add = (label: string | null, field: keyof UnitRefs) => {
    const key = unitRefKey(label);
    if (key) (refs[key] ??= { tasks: 0, listings: 0 })[field]++;
  };
  for (const t of tasks) add(t.unitLabel, "tasks");
  for (const l of listings) add(l.unitLabel, "listings");
  return refs;
}

/** "Remove Rear?" over "It has an open task and a listing."; null when nothing names the unit. */
export function removeUnitQuestion(label: string, refs: UnitRefs | undefined): { title: string; body: string } | null {
  if (!refs || (refs.tasks === 0 && refs.listings === 0)) return null;
  const parts = [
    refs.tasks === 1 ? "an open task" : refs.tasks > 1 ? `${refs.tasks} open tasks` : null,
    refs.listings === 1 ? "a listing" : refs.listings > 1 ? `${refs.listings} listings` : null,
  ].filter(Boolean);
  return { title: `Remove ${label.trim()}?`, body: `It has ${parts.join(" and ")}.` };
}
