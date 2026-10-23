import type { PrismaClient } from "@prisma/client";

/**
 * The lockbox code a contractor sees on their job (docs/asana-migration-plan.md
 * D21). Codes live in Property.units, beside utility accounts and equipment,
 * so this is the one portal file that reads that column
 * (src/lib/auth-guard.test.ts), and it hands back one string, never the list.
 *
 * Which code:
 *  - the job names a unit: that unit's code, or none when the unit has none;
 *  - no unit: the property's code when it has exactly one distinct code
 *    across its units, otherwise none (staff are asked to pick a unit).
 *
 * Whether to show it at all (assigned contractor, active job) is the caller's
 * call. Pure apart from readLockboxCode; see access-code.test.ts.
 */

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The code for this job from the property's units JSON, or null. */
export function pickLockboxCode(units: unknown, unitLabel: string | null | undefined): string | null {
  const list = Array.isArray(units) ? units.filter((u): u is Record<string, unknown> => !!u && typeof u === "object") : [];
  const wanted = clean(unitLabel).toLowerCase();
  if (wanted) {
    const unit = list.find((u) => clean(u.label).toLowerCase() === wanted);
    return clean(unit?.lockboxCode) || null;
  }
  const codes = new Set(list.map((u) => clean(u.lockboxCode)).filter(Boolean));
  return codes.size === 1 ? [...codes][0] : null;
}

type PropertyReader = Pick<PrismaClient, "property">;

/** Reads the property's units and returns the one code for this job, or null. */
export async function readLockboxCode(db: PropertyReader, propertyId: string | null, unitLabel: string | null): Promise<string | null> {
  if (!propertyId) return null;
  const row = await db.property.findUnique({ where: { id: propertyId }, select: { units: true } });
  return row ? pickLockboxCode(row.units, unitLabel) : null;
}
