export type UnitUtilities = {
  nationalGridAcct?: string | null;
  nationalGridAutopay?: string | null;
  nationalGridLofl?: string | null;
  nationalFuelAcct?: string | null;
  nationalFuelAutopay?: string | null;
  nationalFuelLofl?: string | null;
  waterAcct?: string | null;
  waterAutopay?: string | null;
};

export type UnitEquipment = { type: string; model?: string | null; installYear?: string | null };

export type PropertyUnit = {
  label?: string | null;
  lockboxCode?: string | null;
  utilities?: UnitUtilities;
  equipment?: UnitEquipment[];
};

export function parseUnits(json: unknown): PropertyUnit[] {
  return Array.isArray(json) ? (json as PropertyUnit[]) : [];
}

export const UTILITY_LABELS: [keyof UnitUtilities, string][] = [
  ["nationalGridAcct", "National Grid acct #"],
  ["nationalGridAutopay", "NG autopay"],
  ["nationalGridLofl", "NG landlord program"],
  ["nationalFuelAcct", "National Fuel acct #"],
  ["nationalFuelAutopay", "NF autopay"],
  ["nationalFuelLofl", "NF landlord program"],
  ["waterAcct", "Water acct #"],
  ["waterAutopay", "Water autopay"],
];
