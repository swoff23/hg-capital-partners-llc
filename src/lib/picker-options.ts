import "server-only";
import { prisma } from "@/lib/db";
import { shapePropertyOptions, type PropertyOption } from "@/lib/picker-options-shape";

export type { PropertyOption } from "@/lib/picker-options-shape";

/**
 * Every building as the pickers and filters offer it, in street order:
 * `{ id, label, address, photoUrl, units }` (selectors 3.3). The one query
 * behind PropertyPicker, UnitPicker and the property filter chips; unit
 * labels only, so lockbox codes never reach the client.
 *
 * `photoUrl` is the property's front photo (public Blob); null until one is
 * set, and the pickers show the House tile.
 */
export async function propertyOptions(): Promise<PropertyOption[]> {
  const rows = await prisma.property.findMany({ select: { id: true, address: true, units: true, photoUrl: true } });
  return shapePropertyOptions(rows);
}
