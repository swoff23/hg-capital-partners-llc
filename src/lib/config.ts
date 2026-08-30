/** Editable lists that drive dropdowns + badge colors. Safe to adjust anytime. */

// HG's working pipeline (from the "Priority" column of the master spreadsheet).
export const DEAL_STATUSES = [
  "1 - High",
  "2 - Medium",
  "3 - Low",
  "4 - To Schedule",
  "5 - TBD",
  "6 - Holding",
  "Closing",
  "CLOSED!",
  "Pass",
] as const;

export const DEAL_PASS_REASONS = [
  "Price",
  "Condition",
  "Neighborhood",
  "Rents",
  "Taxes",
  "Financing",
  "Title / legal",
  "Tenant issues",
  "Structural",
  "Better use of capital",
  "Seller behavior",
  "Other",
] as const;

export const DEAL_PRIORITIES = ["1 - High", "2 - Medium", "3 - Low", "5 - TBD", "6 - Holding"] as const;

export const TASK_STATUSES = ["OPEN", "DONE"] as const;

export const TASK_BUCKETS = ["Property", "General", "Template", "Unfiled"] as const;

export const PROPERTY_STATUSES = [
  "Rehabbing",
  "Refinancing",
  "Refinanced",
  "Stabilized",
  "Hold",
  "Flip",
  "Sold",
] as const;

export const PROPERTY_STRATEGIES = ["Hold", "Flip", "BRRRR", "Sell", "TBD"] as const;

export const EQUIPMENT_TYPES = [
  "Roof",
  "Refrigerator",
  "Dishwasher",
  "Oven",
  "Microwave",
  "Oven Fan",
  "Garbage Disposal",
  "Washing Machine",
  "Drying Machine",
  "HVAC",
  "Water Heater",
  "Ceiling Fans",
  "Garage Door Opener",
  "Electrical Panel",
  "Sump Pump",
  "Other",
] as const;

type Tone = "gray" | "blue" | "green" | "amber" | "red" | "purple";

export function dealStatusTone(s: string | null): Tone {
  switch (s) {
    case "1 - High":
      return "red";
    case "2 - Medium":
      return "amber";
    case "3 - Low":
    case "6 - Holding":
      return "gray";
    case "4 - To Schedule":
      return "purple";
    case "5 - TBD":
      return "blue";
    case "Closing":
    case "CLOSED!":
      return "green";
    case "Pass":
      return "gray";
    default:
      return "gray";
  }
}

export function propertyStatusTone(s: string | null): Tone {
  switch (s) {
    case "Refinanced":
    case "Stabilized":
    case "Hold":
      return "green";
    case "Rehabbing":
      return "amber";
    case "Refinancing":
      return "blue";
    case "Sold":
      return "gray";
    default:
      return "gray";
  }
}

export function priorityTone(p: string | null): Tone {
  if (!p) return "gray";
  if (p.startsWith("1")) return "red";
  if (p.startsWith("2")) return "amber";
  return "gray";
}
