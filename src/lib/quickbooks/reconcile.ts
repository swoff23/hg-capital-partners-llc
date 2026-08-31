import { classKeyOf } from "./report-parse";
import type { NoiResult } from "./compute";
import type { PnlByClassCell, PnlSection } from "./types";

/** cents per cell; also in config.ts as qbo.reconcileToleranceCents */
export const DEFAULT_RECONCILE_TOLERANCE_CENTS = 1;

/**
 * Cross-checks run every sync. Pure; covered by reconcile.test.ts.
 *
 *  1. sum-to-whole — Σ(all by-class cells, section-signed) == plain P&L net
 *     income. Independent of our category/treatment logic; catches parse bugs,
 *     dropped rows, class-split leakage.
 *  2. net-income identity — computeNoi's decomposition ties to plain net income:
 *     cashFlowAfterDebt + nonOpIncome + excluded + ownerFunded == netIncome.
 *  3. per-cell — Σ ledger (account × class) == the by-class report cell.
 */

const INCOME_SECTIONS = new Set<PnlSection>(["Income", "OtherIncome"]);

export function byClassNetCents(cells: PnlByClassCell[]): number {
  let income = 0;
  let expense = 0;
  for (const c of cells) {
    if (INCOME_SECTIONS.has(c.section)) income += c.amountCents;
    else expense += c.amountCents;
  }
  return income - expense;
}

export interface CellMismatch {
  accountQboId: string | null;
  classKey: string;
  className: string;
  ledgerCents: number;
  reportCents: number;
  deltaCents: number;
}

export interface ReconcileInput {
  byClassCells: PnlByClassCell[];
  plainNetIncomeCents: number;
  /** QBO's own "Net Operating Income" line from the plain P&L, if present. */
  qboNetOperatingIncomeCents?: number | null;
  /** key `${accountQboId ?? "?"}::${classKey}` -> Σ raw ledger amountCents */
  ledgerCellSums: Map<string, number>;
  noi: NoiResult;
  toleranceCents?: number;
}

export interface ReconcileResult {
  ok: boolean;
  sumToWhole: { byClassNetCents: number; plainNetIncomeCents: number; deltaCents: number; ok: boolean };
  netIncomeIdentity: {
    computedCents: number;
    plainNetIncomeCents: number;
    deltaCents: number;
    ok: boolean;
  };
  /** our NOI vs QBO's "Net Operating Income", allowing for our known reclasses. */
  noiVsQbo: {
    ourNoiCents: number;
    qboNoiCents: number | null;
    expectedDeltaCents: number; // −(ownerFunded + excludedRent) — our reclasses out of operating income
    residualCents: number; // what's left after the expected delta; should be ~0
    ok: boolean;
  };
  cellMismatches: CellMismatch[];
}

function cellKey(accountQboId: string | null, classKey: string): string {
  return `${accountQboId ?? "?"}::${classKey}`;
}

export function checkReconciliation(input: ReconcileInput): ReconcileResult {
  const tol = input.toleranceCents ?? DEFAULT_RECONCILE_TOLERANCE_CENTS;

  const byClassNet = byClassNetCents(input.byClassCells);
  const sumDelta = byClassNet - input.plainNetIncomeCents;
  const sumToWhole = {
    byClassNetCents: byClassNet,
    plainNetIncomeCents: input.plainNetIncomeCents,
    deltaCents: sumDelta,
    ok: Math.abs(sumDelta) <= tol,
  };

  const computed =
    input.noi.cashFlowAfterDebtCents +
    input.noi.nonOperatingIncomeCents +
    input.noi.excludedCents +
    input.noi.ownerFundedCents;
  const idDelta = computed - input.plainNetIncomeCents;
  const netIncomeIdentity = {
    computedCents: computed,
    plainNetIncomeCents: input.plainNetIncomeCents,
    deltaCents: idDelta,
    ok: Math.abs(idDelta) <= tol,
  };

  // our NOI should equal QBO's "Net Operating Income" minus exactly the amounts
  // we reclassified out of operating income (owner P2P + internal transfers).
  // This catches mis-bucketing that the conservation identity can't (e.g.
  // suspense counted as income inflates our NOI without touching net income).
  const qboNoi = input.qboNetOperatingIncomeCents ?? null;
  const expectedDelta = -(input.noi.ownerFundedCents + input.noi.excludedRentCents);
  const residual = qboNoi == null ? 0 : input.noi.noiCents - (qboNoi + expectedDelta);
  const noiVsQbo = {
    ourNoiCents: input.noi.noiCents,
    qboNoiCents: qboNoi,
    expectedDeltaCents: expectedDelta,
    residualCents: residual,
    ok: qboNoi == null || Math.abs(residual) <= tol,
  };

  // per-cell: union of report cells and ledger cells
  const reportByKey = new Map<string, PnlByClassCell>();
  for (const c of input.byClassCells) {
    const k = cellKey(c.accountQboId, classKeyOf(c.classQboId));
    reportByKey.set(k, {
      ...c,
      amountCents: (reportByKey.get(k)?.amountCents ?? 0) + c.amountCents,
    });
  }

  const cellMismatches: CellMismatch[] = [];
  const seen = new Set<string>();
  for (const [k, c] of reportByKey) {
    seen.add(k);
    const ledger = input.ledgerCellSums.get(k) ?? 0;
    const delta = ledger - c.amountCents;
    if (Math.abs(delta) > tol) {
      cellMismatches.push({
        accountQboId: c.accountQboId,
        classKey: classKeyOf(c.classQboId),
        className: c.className,
        ledgerCents: ledger,
        reportCents: c.amountCents,
        deltaCents: delta,
      });
    }
  }
  for (const [k, ledger] of input.ledgerCellSums) {
    if (seen.has(k) || Math.abs(ledger) <= tol) continue;
    const [acct, classKey] = k.split("::");
    cellMismatches.push({
      accountQboId: acct === "?" ? null : acct,
      classKey,
      className: "(in ledger, not in by-class report)",
      ledgerCents: ledger,
      reportCents: 0,
      deltaCents: ledger,
    });
  }

  return {
    ok: sumToWhole.ok && netIncomeIdentity.ok && noiVsQbo.ok && cellMismatches.length === 0,
    sumToWhole,
    netIncomeIdentity,
    noiVsQbo,
    cellMismatches,
  };
}
