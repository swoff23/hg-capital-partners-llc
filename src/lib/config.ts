/** Editable lists that drive dropdowns + badge colors. Safe to adjust anytime. */

// HG's working pipeline (from the "Priority" column of the master spreadsheet).
export const DEAL_STATUSES = [
  "1 - High",
  "2 - Medium",
  "3 - Low",
  "4 - To Schedule",
  "5 - TBD",
  "6 - Holding",
  "CLOSED!",
  "Pass",
] as const;

export type DealStatus = (typeof DEAL_STATUSES)[number];

export function isDealStatus(s: unknown): s is DealStatus {
  return typeof s === "string" && (DEAL_STATUSES as readonly string[]).includes(s);
}

/**
 * Status for a deal created without one. The Prisma column still defaults to
 * the legacy "Active" (not in DEAL_STATUSES — a deal with it would vanish from
 * the Active tab); the app never relies on that default. Changing the column
 * default is a schema migration, tracked for the schema batch.
 */
export const DEFAULT_DEAL_STATUS: DealStatus = "5 - TBD";

// "Active" filter = everything ranked above TBD in the pipeline (excludes TBD, Holding, Closed, and Pass).
export const ACTIVE_DEAL_STATUSES = DEAL_STATUSES.slice(0, DEAL_STATUSES.indexOf("5 - TBD"));

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

/**
 * Imported Asana playbooks ("NEW TENANT [address]" etc.) live as Task rows in
 * this bucket with no property. They are templates, not work: every task list
 * and count must exclude them (see excludeTemplateTasks in @/lib/task-scope).
 */
export const TEMPLATE_BUCKET = "Template";

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
  "Furnace",
  "Boiler",
  "Water Heater",
  "Ceiling Fans",
  "Garage Door Opener",
  "Electrical Panel",
  "Sump Pump",
  "Other",
] as const;

type Tone = "gray" | "blue" | "green" | "amber" | "red" | "purple";

const TONE_CLASSES: Record<Tone, string> = {
  gray: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
  blue: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900",
  green: "bg-green-50 text-green-700 ring-green-200 dark:bg-green-950 dark:text-green-300 dark:ring-green-900",
  amber: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  red: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
  purple: "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:ring-purple-900",
};
/** Tailwind classes for a `Tone` — shared by the deal status badge/select wherever it's rendered. */
export function toneClass(tone: Tone): string {
  return TONE_CLASSES[tone];
}

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

