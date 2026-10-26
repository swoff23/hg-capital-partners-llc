/**
 * Which lockbox code a contractor's job shows (docs/asana-migration-plan.md
 * D21): the unit's code when the job has a unit; with no unit, the
 * property's code only when it has exactly one distinct code, as the portal
 * decides it (src/lib/portal/access-code.ts). The staff task page uses
 * the state to say whether the contractor will see a code; it never shows
 * the code itself. Pure; see lockbox.test.ts.
 */

export type UnitCode = { label?: string | null; lockboxCode?: string | null };

const clean = (s: string | null | undefined) => (s ?? "").trim();
const sameLabel = (a: string | null | undefined, b: string | null | undefined) =>
  clean(a).toLowerCase() === clean(b).toLowerCase();

/** The code the job resolves to, or null. */
export function resolveLockboxCode(units: readonly UnitCode[], unitLabel: string | null | undefined): string | null {
  if (clean(unitLabel)) {
    const unit = units.find((u) => sameLabel(u.label, unitLabel));
    return clean(unit?.lockboxCode) || null;
  }
  // Units sharing one lockbox count once: the contractor sees that code.
  const codes = new Set(units.map((u) => clean(u.lockboxCode)).filter(Boolean));
  return codes.size === 1 ? [...codes][0] : null;
}

/**
 * "shown": a code resolves. "pick-unit": the property has codes but none
 * resolves until a unit is picked. "none": nothing to show (no codes, or the
 * picked unit has none).
 */
export type LockboxState = "shown" | "pick-unit" | "none";

export function lockboxState(units: readonly UnitCode[], unitLabel: string | null | undefined): LockboxState {
  if (resolveLockboxCode(units, unitLabel)) return "shown";
  if (clean(unitLabel)) return "none";
  return units.some((u) => clean(u.lockboxCode)) ? "pick-unit" : "none";
}
