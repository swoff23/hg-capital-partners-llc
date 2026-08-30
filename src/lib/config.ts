/** Editable lists that drive dropdowns + badge colors. Safe to adjust anytime. */

export const DEAL_STATUSES = [
  "Active",
  "Reviewing",
  "Underwriting",
  "Interested",
  "Tour Scheduled",
  "Offer Submitted",
  "Negotiating",
  "Under Contract",
  "Closed",
  "Pass",
  "Lost",
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

export const TASK_BUCKETS = [
  "Property",
  "General",
  "Template",
  "Pieter properties",
  "JMPL",
  "Unfiled",
] as const;

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

type Tone = "gray" | "blue" | "green" | "amber" | "red" | "purple";

export function dealStatusTone(s: string | null): Tone {
  switch (s) {
    case "Active":
    case "Reviewing":
      return "blue";
    case "Under Contract":
    case "Closed":
      return "green";
    case "Negotiating":
    case "Offer Submitted":
      return "amber";
    case "Pass":
    case "Lost":
      return "gray";
    default:
      return "purple";
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
