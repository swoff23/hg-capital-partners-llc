import type { DataQualityReport } from "./data-quality";

/**
 * Which cleanup checks need the bookkeeper (docs/specs/charts.md, the
 * Financials migration map). The thresholds live here, so the Overview's one
 * line and the Settings cleanup list agree. Pure (data-quality.ts, which
 * builds the report, is server-only); see review.test.ts.
 */

/** Unclassified lines worth a look: more than 3 of them, or over $500 in or out together. */
const UNCLASSED_LINES = 3;
const UNCLASSED_CENTS = 50_000;
/** A handful of negative reclasses is normal bookkeeping; more than 5 is worth a look. */
const NEGATIVE_RECLASS_LINES = 5;

export interface ReviewFlags {
  unclassed: boolean;
  suspense: boolean;
  uncategorized: boolean;
  negativeReclass: boolean;
  ownerFunded: boolean;
  propertyLikeClasses: boolean;
}

/**
 * Each cleanup check that needs a look, for the Settings list's warn marks.
 * Cash and accrual net income always differ by timing (money billed but not
 * yet received, bills not yet paid), so that difference is never flagged
 * (FINANCIALS-059); the list shows it as information.
 */
export function reviewFlags(dq: DataQualityReport): ReviewFlags {
  return {
    unclassed:
      dq.unclassed.lineCount > UNCLASSED_LINES ||
      Math.abs(dq.unclassed.inCents) + Math.abs(dq.unclassed.outCents) > UNCLASSED_CENTS,
    suspense: dq.suspenseCents !== 0,
    uncategorized: dq.uncategorizedCents !== 0,
    negativeReclass: dq.negativeReclass.lineCount > NEGATIVE_RECLASS_LINES,
    ownerFunded: dq.ownerFundedCents !== 0,
    propertyLikeClasses: dq.unmappedPropertyLikeClasses.length > 0,
  };
}

/** One item on the Overview's cleanup line: "14 lines unclassified", "$310 in suspense". */
export type ReviewItem = { key: "unclassed"; lines: number } | { key: "suspense"; cents: number };

/**
 * What the Overview's one cleanup line names: unclassified lines and money
 * in suspense, the two checks that change the figures above it. Empty when
 * both are fine, and then the line doesn't show.
 */
export function needsReview(dq: DataQualityReport | null): ReviewItem[] {
  if (!dq) return [];
  const flags = reviewFlags(dq);
  const items: ReviewItem[] = [];
  if (flags.unclassed) items.push({ key: "unclassed", lines: dq.unclassed.lineCount });
  if (flags.suspense) items.push({ key: "suspense", cents: dq.suspenseCents });
  return items;
}
