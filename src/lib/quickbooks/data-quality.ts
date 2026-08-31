import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { looksLikeProperty } from "./mapping";
import { UNCLASSED } from "./types";

/**
 * The data-quality punch list — computed each sync into QboSyncRun.stats, and
 * recomputed live for /financials/settings. Everything is Cash basis (the
 * default view). Amounts in cents.
 */

export interface DataQualityReport {
  basis: "CASH";
  unclassed: { cents: number; lineCount: number };
  suspenseCents: number;
  uncategorizedCents: number;
  negativeReclass: { grossCents: number; lineCount: number };
  /** entity / "General" / no-class activity — real cost, not attributable to a property. */
  unattributed: { netCents: number; incomeCents: number; expenseCents: number };
  ownerFundedCents: number;
  subsidyCents: number;
  /** UNMAPPED classes whose name still contains a known property token. */
  unmappedPropertyLikeClasses: { qboId: string; fullyQualifiedName: string }[];
  cashVsAccrualNetIncomeDeltaCents: number;
}

const d2c = (v: Prisma.Decimal | null | undefined): number =>
  v == null ? 0 : Math.round(Number(v) * 100);

async function sumWhere(where: Prisma.LedgerLineWhereInput): Promise<number> {
  const r = await prisma.ledgerLine.aggregate({ where, _sum: { amount: true } });
  return d2c(r._sum.amount);
}

async function netIncomeCents(realmId: string, basis: "CASH" | "ACCRUAL"): Promise<number> {
  const rows = await prisma.ledgerLine.groupBy({
    by: ["treatment"],
    where: { realmId, basis },
    _sum: { amount: true },
  });
  let net = 0;
  for (const row of rows) {
    const c = d2c(row._sum.amount);
    // income treatments add, expense treatments subtract; EXCLUDED lines are
    // below the P&L line but QBO's "Net Income" still nets them, so include all
    if (row.treatment === "OPERATING_EXPENSE" || row.treatment === "DEBT_INTEREST") net -= c;
    else net += c;
  }
  return net;
}

export async function buildDataQuality(
  realmId: string,
  propTokens: Set<string>,
): Promise<DataQualityReport> {
  const basis = "CASH" as const;
  const base = { realmId, basis };

  const [
    unclassedAgg,
    suspenseCents,
    uncategorizedCents,
    negAgg,
    ownerFundedCents,
    subsidyCents,
    unattrIncome,
    unattrExpense,
    unmappedClasses,
    cashNet,
    accrualNet,
  ] = await Promise.all([
    prisma.ledgerLine.aggregate({
      where: { ...base, classKey: UNCLASSED },
      _sum: { amount: true },
      _count: true,
    }),
    sumWhere({ ...base, category: "SUSPENSE" }),
    sumWhere({ ...base, category: "UNCATEGORIZED" }),
    prisma.ledgerLine.aggregate({
      where: { ...base, lineTags: { has: "NEGATIVE_RECLASS" } },
      _sum: { amount: true },
      _count: true,
    }),
    sumWhere({ ...base, lineTags: { has: "OWNER_FUNDED" } }),
    sumWhere({ ...base, lineTags: { has: "SUBSIDY" } }),
    sumWhere({
      ...base,
      OR: [{ classRole: "OVERHEAD" }, { classRole: "ENTITY" }, { classKey: UNCLASSED }],
      treatment: { in: ["OPERATING_INCOME", "NON_OPERATING"] },
    }),
    sumWhere({
      ...base,
      OR: [{ classRole: "OVERHEAD" }, { classRole: "ENTITY" }, { classKey: UNCLASSED }],
      treatment: { in: ["OPERATING_EXPENSE", "DEBT_INTEREST"] },
    }),
    prisma.qboClass.findMany({
      where: { realmId, role: "UNMAPPED" },
      select: { qboId: true, fullyQualifiedName: true },
    }),
    netIncomeCents(realmId, "CASH"),
    netIncomeCents(realmId, "ACCRUAL"),
  ]);

  return {
    basis,
    unclassed: { cents: d2c(unclassedAgg._sum.amount), lineCount: unclassedAgg._count },
    suspenseCents,
    uncategorizedCents,
    negativeReclass: { grossCents: d2c(negAgg._sum.amount), lineCount: negAgg._count },
    unattributed: {
      netCents: unattrIncome - unattrExpense,
      incomeCents: unattrIncome,
      expenseCents: unattrExpense,
    },
    ownerFundedCents,
    subsidyCents,
    unmappedPropertyLikeClasses: unmappedClasses.filter((c) =>
      looksLikeProperty(c.fullyQualifiedName, propTokens),
    ),
    cashVsAccrualNetIncomeDeltaCents: cashNet - accrualNet,
  };
}
