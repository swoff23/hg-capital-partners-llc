/** Editable lists that drive dropdowns. Safe to adjust anytime. */

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

/**
 * How each stage reads on screen: the spreadsheet's number prefixes go
 * ("High", not "1 - High"), so typeahead and the number keys never collide,
 * and "CLOSED!" is "Closed" (docs/specs/selectors.md 3.5, build plan section 4
 * item 14). Stored values, the filters and the URL keep the stored names.
 */
export const DEAL_STAGE_LABEL: Record<DealStatus, string> = {
  "1 - High": "High",
  "2 - Medium": "Medium",
  "3 - Low": "Low",
  "4 - To Schedule": "To schedule",
  "5 - TBD": "TBD",
  "6 - Holding": "Holding",
  "CLOSED!": "Closed",
  Pass: "Pass",
};

/** A deal stage's word on screen ("High" for "1 - High"); a legacy value outside the list reads as stored. */
export function dealStageLabel(stage: string): string {
  return DEAL_STAGE_LABEL[stage as DealStatus] ?? stage;
}

/**
 * Today's label, until each surface moves to dealStageLabel with its own
 * package: "Closed" for "CLOSED!", every other stage as stored.
 */
export function dealStatusLabel(status: string): string {
  return status === "CLOSED!" ? DEAL_STAGE_LABEL["CLOSED!"] : status;
}

/**
 * The words for a deal's fields wherever they show: the record's rows, New
 * deal, the list headers, activity sentences and toasts. "Stage" is the deal
 * word (tasks and properties keep "Status"). `ourPrice` is HG's target offer,
 * Connor's answer; the column and its `ourPrice` sort key don't change.
 */
export const DEAL_FIELD_LABEL = {
  address: "Address",
  status: "Stage",
  theirPrice: "Asking price",
  ourPrice: "Target offer",
  currentOffer: "Current offer",
  units: "Units",
  beds: "Beds",
  baths: "Baths",
  sqft: "Sq ft",
  taxes: "Taxes",
  priority: "Priority",
  passReason: "Pass reason",
  sourceUrl: "Listing URL",
  nextAction: "Next action",
  nextActionDue: "Next action due",
  latestNote: "Latest note",
  updatedAt: "Updated",
} as const;

export type DealField = keyof typeof DEAL_FIELD_LABEL;

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
