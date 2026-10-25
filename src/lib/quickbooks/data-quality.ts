import "server-only";
import type { Prisma, QboBasis } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isNonOperatingExpense } from "./compute";
import { looksLikeProperty } from "./mapping";
import { inOutCents } from "./rollup";
import { UNCLASSED } from "./types";

/**
 * The data-quality punch list — computed each sync into QboSyncRun.stats
 * (Cash basis), and recomputed live on /financials and /financials/settings
 * for the basis on screen. Lines on an IGNORE class are left out of every
 * figure except `ignored`, which says how much was left out. Amounts in cents.
 */

/** Line count plus money in and money out, kept apart (see inOutCents). */
export interface LineSplit {
  lineCount: number;
  inCents: number;
  outCents: number;
}

export interface DataQualityReport {
  basis: QboBasis;
  unclassed: LineSplit;
  /** lines on classes set to Ignore, left out of every total */
  ignored: LineSplit;
  suspenseCents: number;
  uncategorizedCents: number;
  negativeReclass: { grossCents: number; lineCount: number };
  ownerFundedCents: number;
  subsidyCents: number;
  /** UNMAPPED classes whose name still contains a known property token. */
  unmappedPropertyLikeClasses: { qboId: string; fullyQualifiedName: string }[];
  cashVsAccrualNetIncomeDeltaCents: number;
}

const d2c = (v: Prisma.Decimal | null | undefined): number =>
  v == null ? 0 : Math.round(Number(v) * 100);

const COUNTED = { classRole: { not: "IGNORE" } } satisfies Prisma.LedgerLineWhereInput;

async function sumWhere(where: Prisma.LedgerLineWhereInput): Promise<number> {
  const r = await prisma.ledgerLine.aggregate({ where, _sum: { amount: true } });
  return d2c(r._sum.amount);
}

async function splitWhere(where: Prisma.LedgerLineWhereInput): Promise<LineSplit> {
  const groups = await prisma.ledgerLine.groupBy({
    by: ["classification", "treatment"],
    where,
    _sum: { amount: true },
    _count: { _all: true },
  });
  return {
    lineCount: groups.reduce((n, g) => n + g._count._all, 0),
    ...inOutCents(
      groups.map((g) => ({
        classification: g.classification,
        treatment: g.treatment,
        cents: d2c(g._sum.amount),
      })),
    ),
  };
}

async function netIncomeCents(realmId: string, basis: QboBasis): Promise<number> {
  const rows = await prisma.ledgerLine.groupBy({
    by: ["treatment", "category"],
    where: { realmId, basis, ...COUNTED },
    _sum: { amount: true },
  });
  let net = 0;
  for (const row of rows) {
    const c = d2c(row._sum.amount);
    // income treatments add, expense treatments subtract (a below-NOI expense
    // too); EXCLUDED lines are below the P&L line but QBO's "Net Income" still
    // nets them, so include all
    if (
      row.treatment === "OPERATING_EXPENSE" ||
      row.treatment === "DEBT_INTEREST" ||
      isNonOperatingExpense(row.treatment, row.category)
    )
      net -= c;
    else net += c;
  }
  return net;
}

export async function buildDataQuality(
  realmId: string,
  propTokens: Set<string>,
  basis: QboBasis = "CASH",
): Promise<DataQualityReport> {
  const base = { realmId, basis, ...COUNTED };

  const [
    unclassed,
    ignored,
    suspenseCents,
    uncategorizedCents,
    negAgg,
    ownerFundedCents,
    subsidyCents,
    unmappedClasses,
    cashNet,
    accrualNet,
  ] = await Promise.all([
    splitWhere({ ...base, classKey: UNCLASSED }),
    splitWhere({ realmId, basis, classRole: "IGNORE" }),
    sumWhere({ ...base, category: "SUSPENSE" }),
    sumWhere({ ...base, category: "UNCATEGORIZED" }),
    prisma.ledgerLine.aggregate({
      where: { ...base, lineTags: { has: "NEGATIVE_RECLASS" } },
      _sum: { amount: true },
      _count: true,
    }),
    sumWhere({ ...base, lineTags: { has: "OWNER_FUNDED" } }),
    sumWhere({ ...base, lineTags: { has: "SUBSIDY" } }),
    prisma.qboClass.findMany({
      where: { realmId, role: "UNMAPPED" },
      select: { qboId: true, fullyQualifiedName: true },
    }),
    netIncomeCents(realmId, "CASH"),
    netIncomeCents(realmId, "ACCRUAL"),
  ]);

  return {
    basis,
    unclassed,
    ignored,
    suspenseCents,
    uncategorizedCents,
    negativeReclass: { grossCents: d2c(negAgg._sum.amount), lineCount: negAgg._count },
    ownerFundedCents,
    subsidyCents,
    unmappedPropertyLikeClasses: unmappedClasses.filter((c) =>
      looksLikeProperty(c.fullyQualifiedName, propTokens),
    ),
    cashVsAccrualNetIncomeDeltaCents: cashNet - accrualNet,
  };
}
