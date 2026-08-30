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
  ["nationalGridLofl", "NG leave on for landlord"],
  ["nationalFuelAcct", "National Fuel acct #"],
  ["nationalFuelAutopay", "NF autopay"],
  ["nationalFuelLofl", "NF leave on for landlord"],
  ["waterAcct", "Water acct #"],
  ["waterAutopay", "Water autopay"],
];

/** These utility fields are a set status, not free text. */
export const UTILITY_STATUS_FIELDS = new Set<keyof UnitUtilities>([
  "nationalGridAutopay",
  "nationalGridLofl",
  "nationalFuelAutopay",
  "nationalFuelLofl",
  "waterAutopay",
]);

export const UTILITY_STATUS_OPTIONS = ["Done", "Need to set up", "Call to confirm", "NA"] as const;

export function utilityStatusTone(v: string | null | undefined): "green" | "red" | "amber" | "gray" {
  switch ((v ?? "").trim().toLowerCase()) {
    case "done":
      return "green";
    case "need to set up":
      return "red";
    case "call to confirm":
      return "amber";
    default:
      return "gray";
  }
}
