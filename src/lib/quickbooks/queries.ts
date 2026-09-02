import "server-only";
import type { QboBasis, QboCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getConnection } from "./client";
import { computeNoi, type ComputeLine, type NoiResult } from "./compute";
import { buildDataQuality, type DataQualityReport } from "./data-quality";
import { propertyTokens } from "./mapping";
import { currentMonth } from "./months";

/** Read layer for /financials. All amounts in cents. */

const d2c = (v: unknown): number => (v == null ? 0 : Math.round(Number(v) * 100));

const thisMonth = currentMonth;

async function loadLines(realmId: string, basis: QboBasis, propertyId?: string) {
  const rows = await prisma.ledgerLine.findMany({
    where: { realmId, basis, ...(propertyId ? { propertyId } : {}) },
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
  companyName: string | null;
  lastSync: {
    at: Date | null;
    status: string | null;
    reconciled: boolean;
    reconcileSummary: unknown;
  } | null;
  portfolio: NoiResult;
  byProperty: PropertyFinancialRow[];
  /** entity / overhead / no-class — the reconciling remainder */
  unattributed: { incomeCents: number; expenseCents: number; noiCents: number };
  monthlyTrend: MonthlyTrendPoint[];
  dataQuality: DataQualityReport | null;
}

export async function getFinancialsOverview(basis: QboBasis): Promise<FinancialsOverview | null> {
  const conn = await getConnection();
  if (!conn || conn.status === "REVOKED") return null;

  const [allRows, properties, lastRun] = await Promise.all([
    loadLines(conn.realmId, basis),
    prisma.property.findMany({ select: { id: true, address: true, purchaseDate: true } }),
    prisma.qboSyncRun.findFirst({
      where: { realmId: conn.realmId, status: { in: ["SUCCESS", "PARTIAL"] } },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const cm = thisMonth();
  const portfolio = computeNoi(toComputeLines(allRows), { currentMonth: cm });

  const propById = new Map(properties.map((p) => [p.id, p]));
  const byPropMap = new Map<string, typeof allRows>();
  const unattributedRows: typeof allRows = [];
  for (const r of allRows) {
    if (r.propertyId && r.classRole === "PROPERTY") {
      const arr = byPropMap.get(r.propertyId) ?? [];
      arr.push(r);
      byPropMap.set(r.propertyId, arr);
    } else {
      unattributedRows.push(r);
    }
  }

  const byProperty: PropertyFinancialRow[] = [...byPropMap.entries()]
    .map(([pid, rows]) => {
      const p = propById.get(pid);
      return {
        propertyId: pid,
        address: p?.address ?? "(unknown)",
        noi: computeNoi(toComputeLines(rows), {
          currentMonth: cm,
          ownershipStartMonth: p?.purchaseDate
            ? `${p.purchaseDate.getUTCFullYear()}-${String(p.purchaseDate.getUTCMonth() + 1).padStart(2, "0")}`
            : null,
        }),
      };
    })
    .sort((a, b) => b.noi.noiCents - a.noi.noiCents);

  const unattr = computeNoi(toComputeLines(unattributedRows), { currentMonth: cm });

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
    dataQuality = await buildDataQuality(conn.realmId, propertyTokens(properties));
  }

  return {
    connected: conn.status === "ACTIVE",
    basis,
    companyName: conn.companyName,
    lastSync: {
      at: conn.lastSuccessfulSyncAt,
      status: lastRun?.status ?? null,
      reconciled,
      reconcileSummary: reconStats,
    },
    portfolio,
    byProperty,
    unattributed: {
      incomeCents: unattr.operatingIncomeCents,
      expenseCents: unattr.operatingExpenseCents,
      noiCents: unattr.noiCents,
    },
    monthlyTrend,
    dataQuality,
  };
}

// --- per property --------------------------------------------------------

export interface PropertyFinancials {
  connected: boolean;
  basis: QboBasis;
  mapped: boolean;
  noi: NoiResult;
  expenseByCategory: { category: QboCategory; cents: number }[];
  monthly: { periodMonth: string; incomeCents: number; expenseCents: number }[];
  recentLines: {
    txnDate: Date;
    txnType: string;
    name: string | null;
    accountName: string;
    className: string | null;
    amountCents: number;
  }[];
  lastSyncAt: Date | null;
}

export async function getPropertyFinancials(
  propertyId: string,
  basis: QboBasis,
): Promise<PropertyFinancials | null> {
  const conn = await getConnection();
  if (!conn || conn.status === "REVOKED") return null;

  const [rows, mappedClass, property, recent] = await Promise.all([
    loadLines(conn.realmId, basis, propertyId),
    prisma.qboClass.findFirst({ where: { realmId: conn.realmId, propertyId, role: "PROPERTY" } }),
    prisma.property.findUnique({ where: { id: propertyId }, select: { purchaseDate: true } }),
    prisma.ledgerLine.findMany({
      where: { realmId: conn.realmId, basis, propertyId },
      orderBy: { txnDate: "desc" },
      take: 15,
      select: {
        txnDate: true,
        txnType: true,
        name: true,
        accountName: true,
        className: true,
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
    mapped: !!mappedClass,
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

export async function getRentRoll(basis: QboBasis): Promise<RentRoll | null> {
  const conn = await getConnection();
  if (!conn || conn.status === "REVOKED") return null;

  const [rentRows, properties] = await Promise.all([
    prisma.ledgerLine.findMany({
      where: { realmId: conn.realmId, basis, category: "RENT" },
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
    months,
    rows,
    portfolioByMonth: Object.fromEntries(portfolioByMonth),
    lastSyncAt: conn.lastSuccessfulSyncAt,
  };
}
