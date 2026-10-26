import "server-only";
import type { QboBasis, QboCategory, QboTreatment } from "@prisma/client";
import { prisma } from "@/lib/db";
import { todayYmdEastern } from "@/lib/dates";
import { getConnection } from "./client";
import { computeNoi, type ComputeLine, type NoiResult } from "./compute";
import { buildDataQuality, type DataQualityReport } from "./data-quality";
import { propertyTokens } from "./mapping";
import { currentMonth, trailingMonths } from "./months";
import {
  comparisonLabel,
  inPriorWindow,
  inSpan,
  periodSpan,
  priorWindow,
  spanInsideHistory,
  throughDay,
  type MonthSpan,
  type PeriodKey,
} from "./period";
import { comparePropertyRows, splitByProperty } from "./rollup";
import {
  expenseBreakdown,
  monthSeries,
  purchaseMonth,
  rentRollGrid,
  type ExpenseRow,
  type MonthPoint,
  type SeriesLine,
} from "./series";

/**
 * Read layer for /financials. All amounts in cents.
 *
 * Each reader takes an optional basis: pass one for a one-off `?basis=`
 * override, or leave it out to use the basis chosen in Settings
 * (QuickbooksConnection.accountingMethod). Lines on a class set to Ignore are
 * left out everywhere; data-quality.ts reports how much that was.
 *
 * Figures cover a stated period (docs/specs/charts.md 2.6, FINANCIALS-001):
 * the Overview's Last month or Year to date, the property card's Year to
 * date. The month chart and the rent roll keep their own 12-month window,
 * ending with the running month. Months are Eastern; a period that ends in
 * the running month runs through the last sync's day. The shaping math is
 * pure and tested in series.ts and period.ts.
 */

const d2c = (v: unknown): number => (v == null ? 0 : Math.round(Number(v) * 100));

const thisMonth = currentMonth;

/** Where the figures stand in time: the running month and today, Eastern, and the last synced day. */
function clock(conn: { lastSuccessfulSyncAt: Date | null; historyStart: string }) {
  const today = todayYmdEastern();
  return {
    today,
    runningMonth: today.slice(0, 7),
    lastSyncDay: conn.lastSuccessfulSyncAt ? todayYmdEastern(conn.lastSuccessfulSyncAt) : null,
    historyStart: conn.historyStart || "2026-01",
  };
}

const COUNTED = { classRole: { not: "IGNORE" } } as const;

const sandboxOf = (conn: { environment: string }) => conn.environment === "sandbox";

async function loadLines(realmId: string, basis: QboBasis, propertyId?: string): Promise<SeriesLine[]> {
  const rows = await prisma.ledgerLine.findMany({
    where: { realmId, basis, ...COUNTED, ...(propertyId ? { propertyId } : {}) },
    select: {
      treatment: true,
      category: true,
      amount: true,
      lineTags: true,
      periodMonth: true,
      txnDate: true,
      propertyId: true,
      classRole: true,
      accountName: true,
      name: true,
    },
  });
  return rows.map(({ amount, txnDate, ...r }) => ({
    ...r,
    txnDay: txnDate.toISOString().slice(0, 10),
    amountCents: d2c(amount),
  }));
}

function toComputeLines(rows: readonly SeriesLine[]): ComputeLine[] {
  return rows.map((r) => ({
    treatment: r.treatment,
    category: r.category,
    amountCents: r.amountCents,
    lineTags: r.lineTags,
    periodMonth: r.periodMonth,
  }));
}

/** Operating expense in the period, three ways, for the Overview's Category | Account | Payee switch. */
export interface ExpenseBreakdowns {
  category: ExpenseRow[];
  account: ExpenseRow[];
  payee: ExpenseRow[];
}

export interface PropertyFinancialRow {
  propertyId: string;
  address: string;
  /** false for a mapped property with no lines in the period and basis */
  hasActivity: boolean;
  /** "YYYY-MM" the property was bought, for "Bought Aug 2026" when it falls inside the period. */
  purchaseMonth: string | null;
  noi: NoiResult;
}

export interface MonthlyTrendPoint {
  periodMonth: string;
  incomeCents: number;
  expenseCents: number;
  noiCents: number;
}

/** The period the figures cover, and what the page needs to say so. */
export interface PeriodInfo {
  key: PeriodKey;
  span: MonthSpan;
  /** The last synced day when the span ends in the running month, else null. */
  through: string | null;
  /** The last synced day, never past today, whatever the span: the month chart's running month. */
  syncedThrough: string | null;
  runningMonth: string;
  /** The first month QuickBooks history covers ("2026-01"). */
  historyStart: string;
}

/** The figures to compare with, when the prior span is fully inside history. */
export interface PriorPeriod {
  span: MonthSpan;
  /** "Sep 2026 vs Aug", said once in the source line. */
  label: string;
  noi: NoiResult;
}

export interface FinancialsOverview {
  connected: boolean;
  basis: QboBasis;
  /** the connected company is Intuit's sandbox: test data, not the real books */
  sandbox: boolean;
  companyName: string | null;
  lastSync: {
    at: Date | null;
    /** when the last SUCCESS / PARTIAL run finished */
    runAt: Date | null;
    status: string | null;
    reconciled: boolean;
    reconcileSummary: unknown;
  } | null;
  period: PeriodInfo;
  /** Any line in the period: without one, the totals give way to a sentence. */
  hasLines: boolean;
  /** Every figure below covers `period`. */
  portfolio: NoiResult;
  /** every property with a mapped class, with or without lines */
  byProperty: PropertyFinancialRow[];
  /** entity, overhead, unmapped and no-class lines: the rest of the portfolio, in the period */
  unassigned: { incomeCents: number; expenseCents: number; noiCents: number };
  /**
   * The same split over every month in the books, whatever the period. The
   * Settings cleanup list reads this one: its source line states the whole
   * history, so its row must cover the same span.
   */
  unassignedAllTime: { incomeCents: number; expenseCents: number; noiCents: number };
  expense: ExpenseBreakdowns;
  /** The comparison under each figure, or null until the prior span is synced. */
  prior: PriorPeriod | null;
  /** The month chart: the 12 months ending with the running month, empty ones included. Its own window, not the period's. */
  months: MonthPoint[];
  /** Every month with lines in the books, oldest first, whatever the period (the cleanup list's span). */
  monthlyTrend: MonthlyTrendPoint[];
  dataQuality: DataQualityReport | null;
}

export async function getFinancialsOverview(
  opts: { basis?: QboBasis; period?: PeriodKey } = {},
): Promise<FinancialsOverview | null> {
  const conn = await getConnection();
  if (!conn || conn.status === "REVOKED") return null;
  const basis = opts.basis ?? conn.accountingMethod;
  const periodKey = opts.period ?? "ytd";
  const t = clock(conn);
  const span = periodSpan(periodKey, t.runningMonth);
  const period: PeriodInfo = {
    key: periodKey,
    span,
    through: throughDay(span, t.runningMonth, t.lastSyncDay, t.today),
    syncedThrough: throughDay({ from: t.runningMonth, to: t.runningMonth }, t.runningMonth, t.lastSyncDay, t.today),
    runningMonth: t.runningMonth,
    historyStart: t.historyStart,
  };

  const [allRows, properties, mappedClasses, lastRun] = await Promise.all([
    loadLines(conn.realmId, basis),
    prisma.property.findMany({ select: { id: true, address: true, purchaseDate: true } }),
    prisma.qboClass.findMany({
      where: { realmId: conn.realmId, role: "PROPERTY", propertyId: { not: null } },
      select: { propertyId: true },
    }),
    prisma.qboSyncRun.findFirst({
      where: { realmId: conn.realmId, status: { in: ["SUCCESS", "PARTIAL"] } },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const cm = thisMonth();
  // Every figure but the chart and the cleanup list covers the period.
  const rows = allRows.filter((r) => inSpan(r.periodMonth, span));
  const portfolio = computeNoi(toComputeLines(rows), { currentMonth: cm });

  const propById = new Map(properties.map((p) => [p.id, p]));
  const mappedIds = mappedClasses.flatMap((c) => (c.propertyId && propById.has(c.propertyId) ? [c.propertyId] : []));
  const { byProperty: byPropMap, unassigned: unassignedRows } = splitByProperty(rows, mappedIds);

  const byProperty: PropertyFinancialRow[] = [...byPropMap.entries()]
    .map(([pid, propRows]) => {
      const p = propById.get(pid);
      const bought = purchaseMonth(p?.purchaseDate);
      return {
        propertyId: pid,
        address: p?.address ?? "(unknown)",
        hasActivity: propRows.length > 0,
        purchaseMonth: bought,
        noi: computeNoi(toComputeLines(propRows), { currentMonth: cm, ownershipStartMonth: bought }),
      };
    })
    .sort((a, b) =>
      comparePropertyRows(
        { hasActivity: a.hasActivity, noiCents: a.noi.noiCents, address: a.address },
        { hasActivity: b.hasActivity, noiCents: b.noi.noiCents, address: b.address },
      ),
    );

  const unassigned = computeNoi(toComputeLines(unassignedRows), { currentMonth: cm });
  const unassignedAll = computeNoi(toComputeLines(splitByProperty(allRows, mappedIds).unassigned), { currentMonth: cm });

  const expense: ExpenseBreakdowns = {
    category: expenseBreakdown(rows, "category"),
    account: expenseBreakdown(rows, "account"),
    payee: expenseBreakdown(rows, "payee"),
  };

  // The comparison shows only when it is like for like: every month it reaches back to is
  // synced, and a period the sync hasn't finished is set against the same days a year
  // earlier (Year to date) or left out (Last month).
  const window = priorWindow(periodKey, span, period.through);
  const prior: PriorPeriod | null =
    window && spanInsideHistory(window.span, period.historyStart)
      ? {
          span: window.span,
          label: comparisonLabel(periodKey, span, window.span, period.through),
          noi: computeNoi(toComputeLines(allRows.filter((r) => inPriorWindow(r, window)))),
        }
      : null;

  const months = monthSeries(allRows, trailingMonths(t.runningMonth));

  // Every month with lines, for the cleanup list's span
  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const r of allRows) {
    const c = r.amountCents;
    const m = byMonth.get(r.periodMonth) ?? { income: 0, expense: 0 };
    if (r.treatment === "OPERATING_INCOME") m.income += c;
    else if (r.treatment === "OPERATING_EXPENSE") m.expense += c;
    byMonth.set(r.periodMonth, m);
  }
  const monthlyTrend = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodMonth, v]) => ({
      periodMonth,
      incomeCents: v.income,
      expenseCents: v.expense,
      noiCents: v.income - v.expense,
    }));

  const reconStats =
    lastRun && typeof lastRun.stats === "object" && lastRun.stats
      ? (lastRun.stats as Record<string, unknown>).reconciliation
      : null;
  const reconciled = !!conn.lastReconciledAt && conn.lastReconciledAt >= (lastRun?.startedAt ?? new Date(0));

  let dataQuality: DataQualityReport | null = null;
  if (allRows.length > 0) {
    dataQuality = await buildDataQuality(conn.realmId, propertyTokens(properties), basis);
  }

  return {
    connected: conn.status === "ACTIVE",
    basis,
    sandbox: sandboxOf(conn),
    companyName: conn.companyName,
    lastSync: {
      at: conn.lastSuccessfulSyncAt,
      runAt: lastRun?.finishedAt ?? lastRun?.startedAt ?? null,
      status: lastRun?.status ?? null,
      reconciled,
      reconcileSummary: reconStats,
    },
    period,
    hasLines: rows.length > 0,
    portfolio,
    byProperty,
    unassigned: {
      incomeCents: unassigned.operatingIncomeCents,
      expenseCents: unassigned.operatingExpenseCents,
      noiCents: unassigned.noiCents,
    },
    unassignedAllTime: {
      incomeCents: unassignedAll.operatingIncomeCents,
      expenseCents: unassignedAll.operatingExpenseCents,
      noiCents: unassignedAll.noiCents,
    },
    expense,
    prior,
    months,
    monthlyTrend,
    dataQuality,
  };
}

// --- per property --------------------------------------------------------

export interface PropertyFinancials {
  connected: boolean;
  basis: QboBasis;
  sandbox: boolean;
  mapped: boolean;
  /** Any synced line at all is classed to this property (false: the figures would all be $0). */
  hasLines: boolean;
  /** The figures' period: Year to date, through the last synced day. */
  period: PeriodInfo;
  /** Any line in the period. */
  hasLinesInPeriod: boolean;
  /** Income, expense, NOI and margin for the period. */
  noi: NoiResult;
  /** The period's operating expense by category, largest first. */
  expenseByCategory: { category: QboCategory; cents: number }[];
  /** The month chart: the 12 months ending with the running month, empty ones included. */
  months: MonthPoint[];
  /** "YYYY-MM" the property was bought, so the chart says so before it. */
  purchaseMonth: string | null;
  /** The 8 latest money-in or money-out lines; EXCLUDED ones (transfers, principal) are left out. */
  recentLines: {
    txnDate: Date;
    txnType: string;
    name: string | null;
    accountName: string;
    className: string | null;
    treatment: QboTreatment;
    /** With the treatment, signs a below-NOI line (signedLineCents). */
    category: QboCategory;
    amountCents: number;
  }[];
  lastSyncAt: Date | null;
}

export async function getPropertyFinancials(
  propertyId: string,
  basisOverride?: QboBasis,
): Promise<PropertyFinancials | null> {
  const conn = await getConnection();
  if (!conn || conn.status === "REVOKED") return null;
  const basis = basisOverride ?? conn.accountingMethod;
  const t = clock(conn);
  // The record shows Year to date (charts 4, the property Financials card).
  const span = periodSpan("ytd", t.runningMonth);
  const period: PeriodInfo = {
    key: "ytd",
    span,
    through: throughDay(span, t.runningMonth, t.lastSyncDay, t.today),
    syncedThrough: throughDay({ from: t.runningMonth, to: t.runningMonth }, t.runningMonth, t.lastSyncDay, t.today),
    runningMonth: t.runningMonth,
    historyStart: t.historyStart,
  };

  const [allRows, mappedClass, property, recent] = await Promise.all([
    loadLines(conn.realmId, basis, propertyId),
    prisma.qboClass.findFirst({ where: { realmId: conn.realmId, propertyId, role: "PROPERTY" } }),
    prisma.property.findUnique({ where: { id: propertyId }, select: { purchaseDate: true } }),
    prisma.ledgerLine.findMany({
      where: { realmId: conn.realmId, basis, propertyId, treatment: { not: "EXCLUDED" }, ...COUNTED },
      orderBy: { txnDate: "desc" },
      take: 8,
      select: {
        txnDate: true,
        txnType: true,
        name: true,
        accountName: true,
        className: true,
        treatment: true,
        category: true,
        amount: true,
      },
    }),
  ]);

  const bought = purchaseMonth(property?.purchaseDate);
  const rows = allRows.filter((r) => inSpan(r.periodMonth, span));
  const noi = computeNoi(toComputeLines(rows), { currentMonth: thisMonth(), ownershipStartMonth: bought });

  return {
    connected: conn.status === "ACTIVE",
    basis,
    sandbox: sandboxOf(conn),
    mapped: !!mappedClass,
    hasLines: allRows.length > 0,
    period,
    hasLinesInPeriod: rows.length > 0,
    noi,
    expenseByCategory: expenseBreakdown(rows, "category").map((e) => ({ category: e.key as QboCategory, cents: e.cents })),
    months: monthSeries(allRows, trailingMonths(t.runningMonth)),
    purchaseMonth: bought,
    recentLines: recent.map((r) => ({ ...r, amountCents: d2c(r.amount) })),
    lastSyncAt: conn.lastSuccessfulSyncAt,
  };
}

// --- rent roll ----------------------------------------------------------

/*
 * Rent is summed across every class mapped to a property, so an entity
 * transfer on refinance shows no gap. There's no lease data yet, so
 * scheduled and market rent, delinquency and vacancy are out of scope.
 * Section-8 and voucher rent is included and tagged; owner P2P deposits
 * mis-booked to Rents are left out and shown on their row (and on the
 * Settings cleanup list). Rent on no property's class is its own row, so the
 * Portfolio row matches the Overview's rent. The basis says what the figures
 * are: rent received on cash, rent billed on accrual.
 */

export interface RentRollRowView {
  propertyId: string;
  address: string;
  /** "YYYY-MM" the property was bought: a month before it is blank, not a missed month. */
  purchaseMonth: string | null;
  byMonth: Record<string, number>;
  totalCents: number;
  subsidyCents: number;
  ownerFundedCents: number;
}

export interface RentRoll {
  connected: boolean;
  basis: QboBasis;
  sandbox: boolean;
  /** The 12 months ending with the running month, oldest first, empty ones included. */
  months: string[];
  runningMonth: string;
  /** The last synced day, for the running month and the source line. */
  through: string | null;
  historyStart: string;
  /** Any rent line in the books, in or out of the window. */
  hasRent: boolean;
  rows: RentRollRowView[];
  /** Rent on no property's class, or null when there's none in the window. */
  unassigned: { byMonth: Record<string, number>; totalCents: number } | null;
  portfolioByMonth: Record<string, number>;
  portfolioTotalCents: number;
  lastSyncAt: Date | null;
}

export async function getRentRoll(basisOverride?: QboBasis): Promise<RentRoll | null> {
  const conn = await getConnection();
  if (!conn || conn.status === "REVOKED") return null;
  const basis = basisOverride ?? conn.accountingMethod;
  const t = clock(conn);
  const months = trailingMonths(t.runningMonth);

  const [rentRows, properties] = await Promise.all([
    prisma.ledgerLine.findMany({
      where: { realmId: conn.realmId, basis, category: "RENT", ...COUNTED },
      select: {
        propertyId: true,
        periodMonth: true,
        amount: true,
        treatment: true,
        lineTags: true,
        classRole: true,
      },
    }),
    prisma.property.findMany({ select: { id: true, address: true, purchaseDate: true } }),
  ]);

  const propById = new Map(properties.map((p) => [p.id, p]));
  const address = (id: string) => propById.get(id)?.address ?? "(unknown)";
  const grid = rentRollGrid(
    rentRows.map(({ amount, ...r }) => ({ ...r, amountCents: d2c(amount) })),
    months,
    (a, b) => address(a).localeCompare(address(b)),
  );

  return {
    connected: conn.status === "ACTIVE",
    basis,
    sandbox: sandboxOf(conn),
    months,
    runningMonth: t.runningMonth,
    through: throughDay({ from: months[0], to: t.runningMonth }, t.runningMonth, t.lastSyncDay, t.today),
    historyStart: t.historyStart,
    hasRent: rentRows.length > 0,
    rows: grid.rows.map((r) => ({
      ...r,
      address: address(r.propertyId),
      purchaseMonth: purchaseMonth(propById.get(r.propertyId)?.purchaseDate),
    })),
    unassigned: grid.unassigned,
    portfolioByMonth: grid.portfolioByMonth,
    portfolioTotalCents: grid.portfolioTotalCents,
    lastSyncAt: conn.lastSuccessfulSyncAt,
  };
}
