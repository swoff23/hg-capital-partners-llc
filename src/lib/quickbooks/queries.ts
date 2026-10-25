import "server-only";
import type { QboBasis, QboCategory, QboTreatment } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getConnection } from "./client";
import { computeNoi, type ComputeLine, type NoiResult } from "./compute";
import { buildDataQuality, type DataQualityReport } from "./data-quality";
import { propertyTokens } from "./mapping";
import { currentMonth } from "./months";
import { comparePropertyRows, splitByProperty } from "./rollup";

/**
 * Read layer for /financials. All amounts in cents.
 *
 * Each reader takes an optional basis: pass one for a one-off `?basis=`
 * override, or leave it out to use the basis chosen in Settings
 * (QuickbooksConnection.accountingMethod). Lines on a class set to Ignore are
 * left out everywhere; data-quality.ts reports how much that was.
 */

const d2c = (v: unknown): number => (v == null ? 0 : Math.round(Number(v) * 100));

const thisMonth = currentMonth;

const COUNTED = { classRole: { not: "IGNORE" } } as const;

const sandboxOf = (conn: { environment: string }) => conn.environment === "sandbox";

async function loadLines(realmId: string, basis: QboBasis, propertyId?: string) {
  const rows = await prisma.ledgerLine.findMany({
    where: { realmId, basis, ...COUNTED, ...(propertyId ? { propertyId } : {}) },
    select: {
      treatment: true,
      category: true,
      amount: true,
      lineTags: true,
      periodMonth: true,
      propertyId: true,
      classRole: true,
    },
  });
  return rows;
}

function toComputeLines(rows: Awaited<ReturnType<typeof loadLines>>): ComputeLine[] {
  return rows.map((r) => ({
    treatment: r.treatment,
    category: r.category,
    amountCents: d2c(r.amount),
    lineTags: r.lineTags,
    periodMonth: r.periodMonth,
  }));
}

export interface PropertyFinancialRow {
  propertyId: string;
  address: string;
  /** false for a mapped property with no lines in this basis */
  hasActivity: boolean;
  noi: NoiResult;
}

export interface MonthlyTrendPoint {
  periodMonth: string;
  incomeCents: number;
  expenseCents: number;
  noiCents: number;
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
  portfolio: NoiResult;
  /** every property with a mapped class, with or without lines */
  byProperty: PropertyFinancialRow[];
  /** entity, overhead, unmapped and no-class lines: the rest of the portfolio */
  unassigned: { incomeCents: number; expenseCents: number; noiCents: number };
  monthlyTrend: MonthlyTrendPoint[];
  dataQuality: DataQualityReport | null;
}

export async function getFinancialsOverview(basisOverride?: QboBasis): Promise<FinancialsOverview | null> {
  const conn = await getConnection();
  if (!conn || conn.status === "REVOKED") return null;
  const basis = basisOverride ?? conn.accountingMethod;

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
  const portfolio = computeNoi(toComputeLines(allRows), { currentMonth: cm });

  const propById = new Map(properties.map((p) => [p.id, p]));
  const { byProperty: byPropMap, unassigned: unassignedRows } = splitByProperty(
    allRows,
    mappedClasses.flatMap((c) => (c.propertyId && propById.has(c.propertyId) ? [c.propertyId] : [])),
  );

  const byProperty: PropertyFinancialRow[] = [...byPropMap.entries()]
    .map(([pid, rows]) => {
      const p = propById.get(pid);
      return {
        propertyId: pid,
        address: p?.address ?? "(unknown)",
        hasActivity: rows.length > 0,
        noi: computeNoi(toComputeLines(rows), {
          currentMonth: cm,
          ownershipStartMonth: p?.purchaseDate
            ? `${p.purchaseDate.getUTCFullYear()}-${String(p.purchaseDate.getUTCMonth() + 1).padStart(2, "0")}`
            : null,
        }),
      };
    })
    .sort((a, b) =>
      comparePropertyRows(
        { hasActivity: a.hasActivity, noiCents: a.noi.noiCents, address: a.address },
        { hasActivity: b.hasActivity, noiCents: b.noi.noiCents, address: b.address },
      ),
    );

  const unassigned = computeNoi(toComputeLines(unassignedRows), { currentMonth: cm });

  // monthly trend
  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const r of allRows) {
    const c = d2c(r.amount);
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
    portfolio,
    byProperty,
    unassigned: {
      incomeCents: unassigned.operatingIncomeCents,
      expenseCents: unassigned.operatingExpenseCents,
      noiCents: unassigned.noiCents,
    },
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
  noi: NoiResult;
  expenseByCategory: { category: QboCategory; cents: number }[];
  monthly: { periodMonth: string; incomeCents: number; expenseCents: number }[];
  /** The 8 latest money-in or money-out lines; EXCLUDED ones (transfers, principal) are left out. */
  recentLines: {
    txnDate: Date;
    txnType: string;
    name: string | null;
    accountName: string;
    className: string | null;
    treatment: QboTreatment;
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

  const [rows, mappedClass, property, recent] = await Promise.all([
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
        amount: true,
      },
    }),
  ]);

  const cm = thisMonth();
  const noi = computeNoi(toComputeLines(rows), {
    currentMonth: cm,
    ownershipStartMonth: property?.purchaseDate
      ? `${property.purchaseDate.getUTCFullYear()}-${String(property.purchaseDate.getUTCMonth() + 1).padStart(2, "0")}`
      : null,
  });

  const expenseByCategory = Object.entries(noi.expenseByCategoryCents)
    .map(([category, cents]) => ({ category: category as QboCategory, cents: cents ?? 0 }))
    .filter((e) => e.cents !== 0)
    .sort((a, b) => b.cents - a.cents);

  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const r of rows) {
    const c = d2c(r.amount);
    const m = byMonth.get(r.periodMonth) ?? { income: 0, expense: 0 };
    if (r.treatment === "OPERATING_INCOME") m.income += c;
    else if (r.treatment === "OPERATING_EXPENSE") m.expense += c;
    byMonth.set(r.periodMonth, m);
  }
  const monthly = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodMonth, v]) => ({ periodMonth, incomeCents: v.income, expenseCents: v.expense }));

  return {
    connected: conn.status === "ACTIVE",
    basis,
    sandbox: sandboxOf(conn),
    mapped: !!mappedClass,
    hasLines: rows.length > 0,
    noi,
    expenseByCategory,
    monthly,
    recentLines: recent.map((r) => ({ ...r, amountCents: d2c(r.amount) })),
    lastSyncAt: conn.lastSuccessfulSyncAt,
  };
}

// --- rent roll ----------------------------------------------------------

export interface RentRoll {
  connected: boolean;
  basis: QboBasis;
  sandbox: boolean;
  /** every month with rent in the books, assigned to a property or not */
  months: string[];
  rows: {
    propertyId: string;
    address: string;
    byMonth: Record<string, number>; // collected rent cents
    totalCents: number;
    subsidyCents: number;
    ownerFundedCents: number;
    monthsOfData: number;
  }[];
  portfolioByMonth: Record<string, number>;
  lastSyncAt: Date | null;
}

export async function getRentRoll(basisOverride?: QboBasis): Promise<RentRoll | null> {
  const conn = await getConnection();
  if (!conn || conn.status === "REVOKED") return null;
  const basis = basisOverride ?? conn.accountingMethod;

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

  const monthSet = new Set<string>();
  const perProp = new Map<
    string,
    { byMonth: Map<string, number>; subsidy: number; ownerFunded: number }
  >();
  const portfolioByMonth = new Map<string, number>();

  for (const r of rentRows) {
    monthSet.add(r.periodMonth);
    if (!r.propertyId || r.classRole !== "PROPERTY") continue;
    const c = d2c(r.amount);
    const p = perProp.get(r.propertyId) ?? {
      byMonth: new Map<string, number>(),
      subsidy: 0,
      ownerFunded: 0,
    };
    if (r.lineTags.includes("OWNER_FUNDED")) {
      p.ownerFunded += c;
    } else if (r.treatment === "OPERATING_INCOME") {
      p.byMonth.set(r.periodMonth, (p.byMonth.get(r.periodMonth) ?? 0) + c);
      portfolioByMonth.set(r.periodMonth, (portfolioByMonth.get(r.periodMonth) ?? 0) + c);
      if (r.lineTags.includes("SUBSIDY")) p.subsidy += c;
    }
    perProp.set(r.propertyId, p);
  }

  const months = [...monthSet].sort();
  const propById = new Map(properties.map((p) => [p.id, p]));
  const cm = thisMonth();

  const rows = [...perProp.entries()]
    .map(([propertyId, agg]) => {
      const prop = propById.get(propertyId);
      const byMonth: Record<string, number> = {};
      let total = 0;
      for (const [m, c] of agg.byMonth) {
        byMonth[m] = c;
        total += c;
      }
      const dataMonths = [...agg.byMonth.keys()].filter((m) => m < cm);
      return {
        propertyId,
        address: prop?.address ?? "(unknown)",
        byMonth,
        totalCents: total,
        subsidyCents: agg.subsidy,
        ownerFundedCents: agg.ownerFunded,
        monthsOfData: dataMonths.length,
      };
    })
    .sort((a, b) => a.address.localeCompare(b.address));

  return {
    connected: conn.status === "ACTIVE",
    basis,
    sandbox: sandboxOf(conn),
    months,
    rows,
    portfolioByMonth: Object.fromEntries(portfolioByMonth),
    lastSyncAt: conn.lastSuccessfulSyncAt,
  };
}
