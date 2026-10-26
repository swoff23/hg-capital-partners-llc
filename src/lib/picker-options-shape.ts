import { compareStreet, shortAddress } from "@/lib/normalize";
import { isHouseMeterRow, parseUnits } from "@/lib/property-types";

/**
 * One building as every property picker and filter offers it. Pure, so the
 * client pickers can import the type and the shaping is tested without a
 * database (picker-options.test.ts); the query is picker-options.ts.
 */
export type PropertyOption = {
  id: string;
  /** The short address, "56 Tamarack St": the row's title. */
  label: string;
  /** The address as stored ("56 Tamarack St, Buffalo, NY 14209"), which search matches too. */
  address: string;
  /** The front photo's public URL; null until the property has one (the House tile shows). */
  photoUrl: string | null;
  /** Unit labels as written, once each, in the order stored. Lockbox codes never ride along. */
  units: string[];
};

export type PropertyRow = { id: string; address: string; units: unknown; photoUrl?: string | null };

/** Unit labels as written, trimmed, once each. */
export function unitLabels(units: unknown): string[] {
  return [...new Set(parseUnits(units).map((u) => u.label?.trim()).filter((l): l is string => !!l))];
}

/** Every building as an option, in street order (street, then house number as a number: 15 before 118). */
export function shapePropertyOptions(rows: readonly PropertyRow[]): PropertyOption[] {
  return rows
    .map((p) => ({
      id: p.id,
      label: shortAddress(p.address),
      address: p.address,
      photoUrl: p.photoUrl ?? null,
      units: unitLabels(p.units),
    }))
    .sort((a, b) => compareStreet(a.address, b.address) || a.id.localeCompare(b.id));
}

/**
 * The town in a stored address: "Buffalo" from "56 Tamarack St, Buffalo, NY
 * 14209" and from "118 Congress St. Buffalo, NY 14213", where the comma
 * after the street is missing; "" when it has none. The state and ZIP never
 * count, and the street is whatever `shortAddress` calls it.
 */
export function townOf(address: string | null | undefined): string {
  if (!address) return "";
  const withoutState = address.replace(/,?\s*(?:NY|New York)\b.*$/i, "");
  return withoutState.slice(shortAddress(address).length).replace(/^[\s,.]+/, "").trim();
}

/** How many units a building has to show in a subline: its labels, less the house meter ("HSE (house)"). */
export function rentableUnitCount(units: readonly string[]): number {
  return units.filter((label) => !isHouseMeterRow({ label })).length;
}

/** "Buffalo · 3 units": the town and the unit count, whichever it has. */
export function propertySubline(p: Pick<PropertyOption, "address" | "units">): string {
  const n = rentableUnitCount(p.units);
  return [townOf(p.address), n > 0 ? `${n} ${n === 1 ? "unit" : "units"}` : ""].filter(Boolean).join(" · ");
}

/**
 * Whether a building is asked for a unit: it has two or more, or the task
 * already holds a unit label (kept visible even if the building lost its
 * units since). One unit is the building itself (selectors 3.3).
 */
export function offersUnits(units: readonly string[], currentUnit: string | null | undefined): boolean {
  return units.length >= 2 || !!currentUnit;
}

/** A bare unit number reads "Unit 5"; labels like "Floor 1 / Lower" read as written. */
export function unitDisplay(label: string): string {
  return /^\d+[A-Za-z]?$/.test(label) ? `Unit ${label}` : label;
}
