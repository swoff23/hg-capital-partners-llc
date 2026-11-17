/**
 * One-off for docs/specs/lockbox-location.md (section 3.7): moves the
 * location typed into a lockbox code ("1924 (back entrance)") into the
 * unit's own Location, and turns "Same lockbox for all units" on for every
 * property whose rentable units all carry one code.
 *
 *   npx tsx --env-file=.env scripts/migrate/lockbox-locations.ts            # dry run: prints the plan, writes nothing
 *   npx tsx --env-file=.env scripts/migrate/lockbox-locations.ts --apply    # writes it
 *
 * Safe to run again: a unit that already has a location is left alone, and a
 * property already shared stays as it is. Each property is written only if
 * nobody saved it since the script read it (Property.updatedAt), so a units
 * sheet saved meanwhile is never overwritten; it is listed and skipped.
 *
 * Two values are fixed by hand on the way (Connor, Nov 15 2026): "gate"
 * reads "On the gate" (the lockbox is on the gate at 23 Sherwood), and the
 * old "back entrace" typo reads "Back entrance". House-meter rows never
 * share a lockbox.
 */
import { prisma } from "../../src/lib/db";
import { isHouseMeterRow, parseUnits, splitLockboxValue, type PropertyUnit } from "../../src/lib/property-types";

/** Locations as Connor wants them read, by what the split gives. */
const HAND_FIXES: Record<string, string> = {
  Gate: "On the gate",
  "Back entrace": "Back entrance",
};

type Change = { address: string; unit: string; before: string; code: string | null; location: string | null };

/** The units as they should be, and what changed, for one property. */
export function planUnits(units: readonly PropertyUnit[]): { units: PropertyUnit[]; changes: Omit<Change, "address">[]; shared: boolean; warning: string | null } {
  const changes: Omit<Change, "address">[] = [];
  const next = units.map((u) => {
    const raw = u.lockboxCode ?? "";
    if (u.lockboxLocation?.trim() || !/\(.+\)\s*$/.test(raw)) return u;
    const split = splitLockboxValue(raw);
    if (!split.location) return u;
    const location = HAND_FIXES[split.location] ?? split.location;
    changes.push({ unit: u.label?.trim() || "(no name)", before: raw, code: split.code, location });
    return { ...u, lockboxCode: split.code, lockboxLocation: location };
  });

  const rentable = next.filter((u) => !isHouseMeterRow(u));
  const codes = new Set(rentable.map((u) => u.lockboxCode?.trim() ?? ""));
  const [only] = [...codes];
  // Two or more rentable units, every one on the same code, and that code isn't blank.
  const oneCode = rentable.length > 1 && codes.size === 1 && !!only;
  if (!oneCode || rentable.every((u) => u.lockboxShared)) return { units: next, changes, shared: false, warning: null };

  // Shared from now on: every rentable unit takes the one location and photo on file, as a save would.
  const locations = new Set(rentable.map((u) => u.lockboxLocation?.trim() || "").filter(Boolean));
  const photos = new Set(rentable.map((u) => u.lockboxPhoto?.pathname || "").filter(Boolean));
  if (locations.size > 1 || photos.size > 1) {
    return { units: next, changes, shared: false, warning: "one code, but the units disagree on the location or photo, so it isn't shared" };
  }
  const location = rentable.find((u) => u.lockboxLocation?.trim())?.lockboxLocation ?? null;
  const photo = rentable.find((u) => u.lockboxPhoto?.pathname)?.lockboxPhoto ?? null;
  const sharedUnits = next.map((u) => (isHouseMeterRow(u) ? u : { ...u, lockboxLocation: location, lockboxPhoto: photo, lockboxShared: true }));
  return { units: sharedUnits, changes, shared: true, warning: null };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await prisma.property.findMany({ select: { id: true, address: true, units: true, updatedAt: true }, orderBy: { address: "asc" } });

  const changes: Change[] = [];
  const shared: string[] = [];
  const warnings: string[] = [];
  const writes: { id: string; address: string; units: PropertyUnit[]; updatedAt: Date }[] = [];

  for (const row of rows) {
    const plan = planUnits(parseUnits(row.units));
    for (const c of plan.changes) changes.push({ address: row.address, ...c });
    if (plan.shared) shared.push(row.address);
    if (plan.warning) warnings.push(`${row.address}: ${plan.warning}`);
    if (plan.changes.length > 0 || plan.shared) writes.push({ id: row.id, address: row.address, units: plan.units, updatedAt: row.updatedAt });
  }

  console.log(`Locations split out of the code (${changes.length}):`);
  for (const c of changes) console.log(`  ${c.address} · ${c.unit}: "${c.before}" -> code "${c.code}", location "${c.location}"`);
  console.log(`\n"Same lockbox for all units" turned on (${shared.length}):`);
  for (const a of shared) console.log(`  ${a}`);
  if (warnings.length > 0) {
    console.log(`\nLeft as they are (${warnings.length}):`);
    for (const w of warnings) console.log(`  ${w}`);
  }

  if (!apply) {
    console.log(`\nDry run: nothing written. ${writes.length} properties would change. Run again with --apply to write.`);
    return;
  }

  let written = 0;
  for (const w of writes) {
    // Only if nobody saved the property since it was read: a units sheet saved meanwhile wins.
    const r = await prisma.property.updateMany({ where: { id: w.id, updatedAt: w.updatedAt }, data: { units: w.units as unknown as object } });
    if (r.count === 1) written++;
    else console.log(`  Skipped ${w.address}: it was saved while this ran. Run the script again.`);
  }
  console.log(`\nWrote ${written} of ${writes.length} properties.`);
}

// Run from the command line only: the test imports planUnits.
if (process.argv[1]?.endsWith("lockbox-locations.ts")) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
