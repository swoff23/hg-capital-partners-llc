import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { todayYmdEastern } from "@/lib/dates";
import { propertyOptions } from "@/lib/picker-options";
import { isHouseMeterRow, parseUnits, withUnitIds } from "@/lib/property-types";
import { NewLeaseForm, type LeaseUnit } from "./new-lease-form";

export const metadata: Metadata = { title: "New lease" };

/**
 * New lease (docs/specs/tenants.md section 7): a page like New contractor.
 * `?property=<id>&unit=<unitId>` prefills the where, from the list's button, a
 * vacant unit's Add tenants or the property's Tenants section. A lease points
 * at a unit by its id, so each rentable unit goes to the form with its id (a
 * placeholder for a unit saved before ids existed; the service makes it
 * lasting) and the pickers keep naming units by label. Lockbox codes never
 * leave the server.
 */
export default async function NewLeasePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const propertyId = one(sp.property);
  const unitId = one(sp.unit);

  const options = await propertyOptions([propertyId]);
  const rows = await prisma.property.findMany({ where: { id: { in: options.map((p) => p.id) } }, select: { id: true, units: true } });

  const unitsByProperty: Record<string, LeaseUnit[]> = {};
  for (const row of rows) {
    const seen = new Set<string>();
    unitsByProperty[row.id] = withUnitIds(parseUnits(row.units)).flatMap((u) => {
      const label = u.label?.trim();
      if (!label || !u.id || isHouseMeterRow(u) || seen.has(label)) return [];
      seen.add(label);
      return [{ id: u.id, label }];
    });
  }
  // The pickers offer rentable units only, so a house meter row never reaches the Unit list.
  const properties = options.map((p) => ({ ...p, units: (unitsByProperty[p.id] ?? []).map((u) => u.label) }));

  const property = propertyId ? properties.find((p) => p.id === propertyId) : undefined;
  const unit = property && unitId ? unitsByProperty[property.id]?.find((u) => u.id === unitId) : undefined;
  const only = property && unitsByProperty[property.id]?.length === 1 ? unitsByProperty[property.id][0] : undefined;

  return (
    <NewLeaseForm
      properties={properties}
      unitsByProperty={unitsByProperty}
      initial={{ propertyId: property?.id ?? null, unitLabel: (unit ?? only)?.label ?? null }}
      meId={user.id}
      today={todayYmdEastern()}
    />
  );
}
