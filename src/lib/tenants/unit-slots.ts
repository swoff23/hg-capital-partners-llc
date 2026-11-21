import { parseUnits, withUnitIds } from "@/lib/property-types";
import { rentableUnits } from "./core";

/**
 * The rows a property's Tenants section draws: one per rentable unit, or a
 * single "Home" for a property with none. Units saved before ids existed get
 * the placeholder New lease offers ("unit-at-<index>", over the whole stored
 * list), so each row keys and links to its own unit.
 */
export function unitSlots(units: unknown): { unitId: string | null; label: string }[] {
  const rentable = rentableUnits(withUnitIds(parseUnits(units)));
  if (!rentable.length) return [{ unitId: null, label: "Home" }];
  return rentable.map((u, i) => ({ unitId: u.id ?? null, label: u.label?.trim() || `Unit ${i + 1}` }));
}
