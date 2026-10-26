import type { QboCategory, QboClassRole, QboLineTag, QboTreatment } from "@prisma/client";
import { fmtMoney } from "@/lib/utils";

/**
 * Pure pieces of the /financials read layer that shape lines into what the
 * charts and the rent roll draw (docs/specs/charts.md 2.1, 2.4, 2.6 and 2.7).
 * queries.ts is server-only, so the math lives here; series.test.ts covers it
 * with hand-computed figures. Amounts are cents, in the ledger's convention:
 * income and expense both positive, a refund or reclass negative.
 */

export interface SeriesLine {
  treatment: QboTreatment;
  category: QboCategory;
  amountCents: number;
  lineTags: QboLineTag[];
  periodMonth: string;
  /** "YYYY-MM-DD" the line is dated, for bounding a comparison by day. */
  txnDay?: string | null;
  propertyId: string | null;
  classRole: QboClassRole;
  accountName: string;
  /** QuickBooks' Name column (payee or customer), verbatim. */
  name: string | null;
}

/** One month of the chart: operating income, operating expense and NOI, and how many lines it holds. */
export interface MonthPoint {
  periodMonth: string;
  incomeCents: number;
  expenseCents: number;
  noiCents: number;
  /** Every line booked to the month, any treatment: 0 means QuickBooks has nothing for it. */
  lineCount: number;
}

/**
 * Income, expense and NOI for each of `months`, in that order, with a zero
 * point for a month that has no lines, so the chart keeps every slot. Income
 * is operating income and expense operating expense, the lines inside NOI,
 * as the strip's NOI counts them. A line outside `months` is left out.
 */
export function monthSeries(
  lines: readonly Pick<SeriesLine, "treatment" | "amountCents" | "periodMonth">[],
  months: readonly string[],
): MonthPoint[] {
  const by = new Map(months.map((m) => [m, { income: 0, expense: 0, count: 0 }]));
  for (const l of lines) {
    const m = by.get(l.periodMonth);
    if (!m) continue;
    m.count += 1;
    if (l.treatment === "OPERATING_INCOME") m.income += l.amountCents;
    else if (l.treatment === "OPERATING_EXPENSE") m.expense += l.amountCents;
  }
  return months.map((periodMonth) => {
    const m = by.get(periodMonth)!;
    return { periodMonth, incomeCents: m.income, expenseCents: m.expense, noiCents: m.income - m.expense, lineCount: m.count };
  });
}

/** How operating expense is grouped: the Overview's Category | Account | Payee switch. */
export type ExpenseBy = "category" | "account" | "payee";

/** One group of operating expense. `key` is the category enum, the account's name or the payee ("" for none). */
export interface ExpenseRow {
  key: string;
  cents: number;
}

/**
 * Operating expense grouped by category, account or payee, largest first, so
 * a group whose refunds outran its spend (a negative total) sorts last. A
 * group that nets to zero is left out. Payees are QuickBooks' Name, trimmed;
 * lines with none share the "" key, which the page labels "No payee".
 */
export function expenseBreakdown(
  lines: readonly Pick<SeriesLine, "treatment" | "category" | "amountCents" | "accountName" | "name">[],
  by: ExpenseBy,
): ExpenseRow[] {
  const sums = new Map<string, number>();
  for (const l of lines) {
    if (l.treatment !== "OPERATING_EXPENSE") continue;
    const key = by === "category" ? l.category : by === "account" ? l.accountName : (l.name ?? "").trim();
    sums.set(key, (sums.get(key) ?? 0) + l.amountCents);
  }
  return [...sums.entries()]
    .filter(([, cents]) => cents !== 0)
    .map(([key, cents]) => ({ key, cents }))
    .sort((a, b) => b.cents - a.cents || a.key.localeCompare(b.key));
}

/**
 * A comparison in words, for the line under a figure: "Up $310",
 * "Down $1,200", "No change". Whole dollars, as the figure above it shows;
 * no arrows and no color (charts 2.6).
 */
export function changeWords(nowCents: number, beforeCents: number): string {
  const diff = Math.round(nowCents / 100) - Math.round(beforeCents / 100);
  if (diff === 0) return "No change";
  return `${diff > 0 ? "Up" : "Down"} ${fmtMoney(Math.abs(diff))}`;
}

/* ---------------- Rent roll ---------------- */

export type RentLine = Pick<SeriesLine, "propertyId" | "classRole" | "periodMonth" | "amountCents" | "treatment" | "lineTags">;

export interface RentRollRow {
  propertyId: string;
  /** Rent per month in the window, cents; a month with none is absent. */
  byMonth: Record<string, number>;
  totalCents: number;
  /** Section-8 and voucher rent, part of the total. */
  subsidyCents: number;
  /** Owner money booked to Rents, left out of the total. */
  ownerFundedCents: number;
}

export interface RentRollGrid {
  rows: RentRollRow[];
  /** Rent on no property's class (entity, overhead, unmapped or no class), so the Portfolio row matches the Overview's rent. */
  unassigned: { byMonth: Record<string, number>; totalCents: number } | null;
  /** Each month's rent across every row, the unassigned one included; a month with none is absent. */
  portfolioByMonth: Record<string, number>;
  portfolioTotalCents: number;
}

/**
 * Rent by property and month over `months`, the rent roll's window. Rent is
 * operating income on the Rents category, voucher rent included. A line
 * tagged owner-funded is owner money, not rent: it shows apart on its
 * property's row and never in a total. A line on no property's class goes to
 * the unassigned row, so the Portfolio row sums every rent line the Overview
 * counts for the same months. Rows are the properties with a rent line in the
 * window, in the order `order` gives.
 */
export function rentRollGrid(
  lines: readonly RentLine[],
  months: readonly string[],
  order: (a: string, b: string) => number = (a, b) => a.localeCompare(b),
): RentRollGrid {
  const window = new Set(months);
  const perProp = new Map<string, RentRollRow>();
  const unassignedByMonth = new Map<string, number>();
  const portfolio = new Map<string, number>();

  for (const l of lines) {
    if (!window.has(l.periodMonth)) continue;
    const assigned = l.propertyId && l.classRole === "PROPERTY" ? l.propertyId : null;
    if (assigned) {
      const row = perProp.get(assigned) ?? { propertyId: assigned, byMonth: {}, totalCents: 0, subsidyCents: 0, ownerFundedCents: 0 };
      perProp.set(assigned, row);
      if (l.lineTags.includes("OWNER_FUNDED")) {
        row.ownerFundedCents += l.amountCents;
        continue;
      }
      if (l.treatment !== "OPERATING_INCOME") continue;
      row.byMonth[l.periodMonth] = (row.byMonth[l.periodMonth] ?? 0) + l.amountCents;
      row.totalCents += l.amountCents;
      if (l.lineTags.includes("SUBSIDY")) row.subsidyCents += l.amountCents;
    } else {
      if (l.lineTags.includes("OWNER_FUNDED") || l.treatment !== "OPERATING_INCOME") continue;
      unassignedByMonth.set(l.periodMonth, (unassignedByMonth.get(l.periodMonth) ?? 0) + l.amountCents);
    }
    portfolio.set(l.periodMonth, (portfolio.get(l.periodMonth) ?? 0) + l.amountCents);
  }

  const rows = [...perProp.values()].sort((a, b) => order(a.propertyId, b.propertyId));
  const unassignedTotal = [...unassignedByMonth.values()].reduce((s, c) => s + c, 0);
  return {
    rows,
    unassigned:
      unassignedByMonth.size > 0 ? { byMonth: Object.fromEntries(unassignedByMonth), totalCents: unassignedTotal } : null,
    portfolioByMonth: Object.fromEntries(portfolio),
    portfolioTotalCents: [...portfolio.values()].reduce((s, c) => s + c, 0),
  };
}

/**
 * The month a property's purchase falls in, "YYYY-MM", from the stored date
 * (a UTC midnight), or null with no date.
 */
export function purchaseMonth(purchaseDate: Date | null | undefined): string | null {
  if (!purchaseDate) return null;
  return `${purchaseDate.getUTCFullYear()}-${String(purchaseDate.getUTCMonth() + 1).padStart(2, "0")}`;
}
