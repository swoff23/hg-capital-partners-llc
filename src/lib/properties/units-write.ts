import { randomUUID } from "node:crypto";
import { fmtDay, toYmd, type Ymd } from "@/lib/dates";
import { isAtVersion, rowConflict } from "@/lib/properties/edits";
import {
  countUnitRecords,
  isPlaceholderUnitId,
  lockboxPhotoPaths,
  parseUnits,
  reconcileUnits,
  renamedLabel,
  withUnitIds,
  type PropertyUnit,
} from "@/lib/property-types";
import { renameTaskUnits, type Principal, type Tx } from "@/lib/tasks/core";
import { unitHasTenants } from "@/lib/tenants/core";
import { leaseStatus, type StayDates } from "@/lib/tenants/status";

/**
 * The one write to a property's units list, inside the caller's transaction:
 * properties/service.ts writeUnits runs it on the app's client, and a
 * database test on its own (units.pg.test.ts). It lives apart from the
 * service so a test can reach it, as listing-clean.ts does.
 *
 * Each unit keeps a stable id (reconcileUnits), so a renamed unit is told
 * apart from a removed one and an added one, and everything that names a unit
 * follows in the same transaction: tasks and listings by the old label
 * (G2C-001), leases by the unit's id (docs/specs/tenants.md section 3). A
 * save that removes a unit with current or upcoming tenants is refused
 * (decision 6), and then nothing is written.
 */

export type UnitsWritten = {
  /** Listings moved to a unit's new label. */
  listings: number;
  /** Tasks moved to a unit's new label, for revalidateTasks once the save commits. */
  tasks: string[];
  /** Leases whose unit label now reads as the unit's, for their pages. */
  leases: string[];
  /** The unit count moved, so Portfolio's figure changes too. */
  countChanged: boolean;
  /** Lockbox photos no unit uses now, to delete once the save has landed. */
  dropped: string[];
};

/**
 * `next` turns what's stored into what should be, with ids (placeholders
 * included) as the page showed them to the editor, at the version the editor
 * pinned. `today` is Buffalo's (todayYmdEastern), which decides whether a
 * removed unit's tenants are still there.
 */
export async function writeUnitsTx(
  tx: Tx,
  id: string,
  expectedVersion: string,
  p: Principal,
  by: { id: string } | null,
  next: (stored: PropertyUnit[]) => PropertyUnit[],
  opts: { today: Ymd; newId?: () => string },
): Promise<UnitsWritten> {
  // Locked before anything is read, so the tenant check and the write are one step against a lease being saved:
  // its insert names this property (a foreign key's KEY SHARE), so one still open is waited for and then seen.
  // The update's own lock (NO KEY UPDATE) never waited on it, so a lease could land on a unit this save removes.
  // tenants/core.ts takes the same lock before it reads the units, so a lease that started first is waited for too.
  await tx.$executeRaw`SELECT 1 FROM "Property" WHERE "id" = ${id} FOR UPDATE`;
  const current = await tx.property.findUnique({
    where: { id },
    select: { units: true, unitCount: true, updatedAt: true, updatedByUserId: true, updatedByUser: { select: { name: true, email: true } } },
  });
  if (!current) throw new Error("This property is gone.");
  if (!isAtVersion(current.updatedAt, expectedVersion)) throw rowConflict(current, ["units"], { actorId: by?.id });
  const before = parseUnits(current.units);
  const { units: stored, renames } = reconcileUnits(before, next(withUnitIds(before)), opts.newId ?? randomUUID);
  // Checked before anything is written, so a refused delete leaves the units, tasks, listings and leases as they were.
  await refuseTenantedDeletes(tx, id, before, stored, opts.today);
  // The count is the unit records (propertyUnitCount); store it so the column never disagrees.
  const unitCount = countUnitRecords(stored) || null;
  const r = await tx.property.updateMany({
    where: { id, updatedAt: current.updatedAt },
    data: { units: stored as unknown as object, unitCount, ...(by ? { updatedByUserId: by.id } : {}) },
  });
  if (r.count === 0) {
    // Read through the transaction: a second connection would wait on the one it holds.
    const row = await tx.property.findUnique({ where: { id }, include: { updatedByUser: { select: { name: true, email: true } } } });
    throw row ? rowConflict(row, ["units"], { actorId: by?.id }) : new Error("This property is gone.");
  }
  const countChanged = unitCount !== current.unitCount;
  // Lockbox photos this save stopped using: deleted once it has landed.
  const kept = lockboxPhotoPaths(stored);
  const dropped = [...lockboxPhotoPaths(before)].filter((path) => !kept.has(path));
  const leases = await followUnitLabels(tx, id, stored);
  if (renames.length === 0) return { listings: 0, tasks: [], leases, countChanged, dropped };
  // Listings name their unit by label too. Each is matched against the old labels, so a swap swaps.
  const listings = await tx.listing.findMany({ where: { propertyId: id }, select: { id: true, unitLabel: true } });
  let listingCount = 0;
  for (const l of listings) {
    const to = renamedLabel(renames, l.unitLabel);
    if (!to) continue;
    await tx.listing.update({ where: { id: l.id }, data: { unitLabel: to } });
    listingCount++;
  }
  return { listings: listingCount, tasks: await renameTaskUnits(tx, id, renames, p), leases, countChanged, dropped };
}

/**
 * Refuses a save that removes a unit while it has current or upcoming
 * tenants (decision 6). Only a unit with a lasting id can have a lease
 * (tenants/core.ts ensureUnitIds), so a placeholder is never asked about. A
 * unit with only past leases may go: they keep its id and label as history.
 */
async function refuseTenantedDeletes(tx: Tx, propertyId: string, before: readonly PropertyUnit[], after: readonly PropertyUnit[], today: Ymd): Promise<void> {
  const kept = new Set(after.map((u) => u.id));
  for (const [i, u] of before.entries()) {
    if (!u.id || isPlaceholderUnitId(u.id) || kept.has(u.id)) continue;
    if (!(await unitHasTenants(tx, propertyId, u.id, today))) continue;
    const leases = await tx.lease.findMany({ where: { propertyId, unitId: u.id }, select: { movesIn: true, movesOut: true } });
    // The name the Units editor gives a unit with none (edit-units.tsx unitName).
    throw new Error(tenantedUnitLine(u.label?.trim() || `Unit ${i + 1}`, leases, today));
  }
}

/** Past this a unit's name is cut in the refusal, so the line stays one a person reads (action-result.ts userMessage). */
const NAME_MAX = 60;

/**
 * Why a unit can't be deleted yet, said with its name: "Front has current
 * tenants. End their lease first." (tenants.md decision 6). With only a
 * household still to come, when they move in: "Front has tenants moving in
 * Feb 1. Delete their lease first."
 */
export function tenantedUnitLine(name: string, leases: readonly StayDates[], today: Ymd): string {
  const unit = name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1).trimEnd()}…` : name;
  const coming = leases
    .filter((l) => leaseStatus(l, today) === "upcoming")
    .map((l) => toYmd(l.movesIn))
    .filter((d): d is Ymd => d !== null)
    .sort();
  if (coming.length === 0 || leases.some((l) => leaseStatus(l, today) === "current")) return `${unit} has current tenants. End their lease first.`;
  return `${unit} has tenants moving in ${fmtDay(coming[0], { year: "auto", now: today })}. Delete their lease first.`;
}

/**
 * Every lease on a unit reads the unit's label as it is now, past leases
 * included. A lease names its unit by id, so a rename follows it even where
 * the label-matched renames don't (two units swapping names, a name another
 * unit had). A lease on a unit no longer listed keeps the label it had.
 * Returns the leases it changed.
 */
async function followUnitLabels(tx: Tx, propertyId: string, units: readonly PropertyUnit[]): Promise<string[]> {
  const labels = new Map<string, string | null>();
  for (const u of units) if (u.id) labels.set(u.id, u.label?.trim() || null);
  if (labels.size === 0) return [];
  const leases = await tx.lease.findMany({
    where: { propertyId, unitId: { in: [...labels.keys()] } },
    select: { id: true, unitId: true, unitLabel: true },
    orderBy: { id: "asc" },
  });
  const moves = new Map<string | null, string[]>();
  for (const l of leases) {
    const to = labels.get(l.unitId ?? "") ?? null;
    if ((l.unitLabel ?? null) === to) continue;
    moves.set(to, [...(moves.get(to) ?? []), l.id]);
  }
  for (const [unitLabel, ids] of moves) await tx.lease.updateMany({ where: { id: { in: ids } }, data: { unitLabel } });
  return [...moves.values()].flat();
}
