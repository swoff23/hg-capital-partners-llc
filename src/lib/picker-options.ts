import "server-only";
import { prisma } from "@/lib/db";
import { liveOrKept } from "@/lib/record-scope";
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
 *
 * An archived property isn't offered (lib/archive.ts), except the ones in
 * `keep`: the value a picker already holds (a task's own property) or a pick
 * in the URL, so nothing it shows goes missing. "all" offers every one, for
 * the QuickBooks class mapping, where an archived building still has books.
 */
export async function propertyOptions(keep: readonly (string | null | undefined)[] | "all" = []): Promise<PropertyOption[]> {
  const rows = await prisma.property.findMany({
    ...(keep === "all" ? {} : { where: liveOrKept(keep) }),
    select: { id: true, address: true, units: true, photoUrl: true },
  });
  return shapePropertyOptions(rows);
}
