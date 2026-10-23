import type { QboBasis, QboClassRole, QboTreatment } from "@prisma/client";

/**
 * Small pure pieces of the /financials read layer (queries.ts and
 * data-quality.ts are server-only). Covered by rollup.test.ts.
 */

/**
 * `?basis=` on the money pages. An explicit "cash" or "accrual" is a one-off
 * override; anything else means "use the basis chosen in Settings".
 */
export function basisFromParam(v: string | string[] | undefined): QboBasis | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === "accrual") return "ACCRUAL";
  if (s === "cash") return "CASH";
  return undefined;
}

export interface AttributableLine {
  propertyId: string | null;
  classRole: QboClassRole;
}

/**
 * Lines on a PROPERTY class go to that property; everything else (entity,
 * overhead, unmapped classes, no class) is "not assigned to a property".
 * Every mapped property gets an entry, empty when it has no lines, so a
 * mapped property with no activity still shows up in By property.
 * IGNORE lines are expected to be filtered out before this (loadLines).
 */
export function splitByProperty<T extends AttributableLine>(
  lines: T[],
  mappedPropertyIds: Iterable<string>,
): { byProperty: Map<string, T[]>; unassigned: T[] } {
  const byProperty = new Map<string, T[]>();
  for (const id of mappedPropertyIds) byProperty.set(id, []);
  const unassigned: T[] = [];
  for (const l of lines) {
    if (l.propertyId && l.classRole === "PROPERTY") {
      const arr = byProperty.get(l.propertyId) ?? [];
      arr.push(l);
      byProperty.set(l.propertyId, arr);
    } else {
      unassigned.push(l);
    }
  }
  return { byProperty, unassigned };
}

/** By property order: highest NOI first, properties with no activity last (by address). */
export function comparePropertyRows(
  a: { hasActivity: boolean; noiCents: number; address: string },
  b: { hasActivity: boolean; noiCents: number; address: string },
): number {
  if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
  if (!a.hasActivity) return a.address.localeCompare(b.address);
  return b.noiCents - a.noiCents || a.address.localeCompare(b.address);
}

export interface InOutGroup {
  classification: string;
  treatment: QboTreatment;
  cents: number;
}

/**
 * Money in and money out, kept apart. Ledger amounts are positive for both
 * income and expense, so a plain sum of a mixed set of lines matches nothing
 * in QuickBooks. Revenue accounts count as in and Expense accounts as out,
 * the way QuickBooks' own P&L splits them; a line whose account is unknown
 * falls back to its treatment.
 */
export function inOutCents(groups: InOutGroup[]): { inCents: number; outCents: number } {
  let inCents = 0;
  let outCents = 0;
  for (const g of groups) {
    const out =
      g.classification === "Expense" ||
      (g.classification !== "Revenue" &&
        (g.treatment === "OPERATING_EXPENSE" || g.treatment === "DEBT_INTEREST"));
    if (out) outCents += g.cents;
    else inCents += g.cents;
  }
  return { inCents, outCents };
}
