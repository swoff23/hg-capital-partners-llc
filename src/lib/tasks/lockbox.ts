import { toYmd, todayYmdEastern } from "@/lib/dates";
import { isHouseMeterRow } from "@/lib/property-types";

/**
 * Which lockbox code a contractor's job shows (docs/asana-migration-plan.md
 * D21): the unit's code when the job has a unit; with no unit, the
 * property's code only when it has exactly one distinct code, as the portal
 * decides it (src/lib/portal/access-code.ts). The staff task page shows
 * that code with a Tag saying the contractor sees it, or asks for a unit
 * when none resolves yet. Pure; see lockbox.test.ts.
 */

export type UnitCode = { id?: string | null; label?: string | null; lockboxCode?: string | null };

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

/**
 * Whose home a job is in, for its tenants (docs/specs/tenant-contact.md Q9,
 * tenants.md section 3): the job's unit, matched by label as the code is;
 * with no unit picked, a property's one rentable unit (house-meter rows don't
 * count). `{ unitId: null }` is a property with no rentable units, whose
 * lease is the whole house's. Null when no household can be named: a
 * building with several units and none picked, a label that matches nothing,
 * or a unit saved before ids existed, which no lease can point at yet.
 */
export function tenantUnit(units: readonly UnitCode[], unitLabel: string | null | undefined): { unitId: string | null } | null {
  if (clean(unitLabel)) {
    const unit = units.find((u) => sameLabel(u.label, unitLabel));
    return unit?.id ? { unitId: unit.id } : null;
  }
  const rentable = units.filter((u) => !isHouseMeterRow(u));
  if (rentable.length === 0) return { unitId: null };
  if (rentable.length === 1) return rentable[0].id ? { unitId: rentable[0].id } : null;
  return null;
}

/**
 * What a job at an occupied or vacant home shows (docs/specs/tenant-contact.md
 * section 2, tenants.md section 8). `living` is the lease living in
 * tenantUnit's unit today (tenants/status.ts livingLease), or null when it's
 * vacant or no unit names one.
 *
 *  - occupied: a household lives there, so the contractor sees its tenants.
 *  - permitted: Permission to enter is set and was given on or after the day
 *    this household moved in, so an earlier household's yes never carries over.
 *  - showsLockbox: the code resolves, and the home is vacant or permitted.
 *
 * The staff task page and the portal (access-code.ts readJobAccess) both
 * decide through this, so the two can't disagree. Pure.
 */
export type AccessState = { code: string | null; occupied: boolean; permitted: boolean; showsLockbox: boolean };

export function accessState(
  units: readonly UnitCode[],
  unitLabel: string | null | undefined,
  living: { movesIn: Date | string | null } | null,
  entryPermittedAt: Date | string | null | undefined,
): AccessState {
  const code = resolveLockboxCode(units, unitLabel);
  const occupied = !!living;
  const given = entryPermittedAt ? todayYmdEastern(new Date(entryPermittedAt)) : null;
  const movedIn = living ? toYmd(living.movesIn) : null;
  const permitted = occupied && !!given && (!movedIn || movedIn <= given);
  return { code, occupied, permitted, showsLockbox: !!code && (!occupied || permitted) };
}
