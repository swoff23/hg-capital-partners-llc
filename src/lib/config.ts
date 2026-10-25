/** Editable lists that drive dropdowns + badge colors. Safe to adjust anytime. */
import type { BadgeTone } from "@/components/ui";

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

/**
 * The badge tone for a deal stage, picked from the one tone map in
 * components/ui.tsx (Badge, badgeToneClass). A pipeline rank is a label, not
 * a state, so every stage is neutral except a closed deal, which is done
 * (ok). Property statuses are plain neutral badges for the same reason. The
 * status ring replaces both badges (docs/brand-guidelines.md, section 9).
 */
export function dealStatusTone(s: string | null): BadgeTone {
  return s === "CLOSED!" ? "ok" : "neutral";
}
