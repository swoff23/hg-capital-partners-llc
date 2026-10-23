import type { QboBasis } from "@prisma/client";
import { fmtMoney } from "@/lib/utils";

/**
 * The one-line notices on /financials: what a PARTIAL sync means for the
 * basis on screen, and how the Intuit sign-in round trip ended. Pure;
 * covered by notices.test.ts.
 */

export type ReconcileGap =
  | { kind: "ok" }
  /** no reconciliation recorded for this basis: the run stopped early or ran out of time to check */
  | { kind: "incomplete" }
  | { kind: "noi"; cents: number }
  | { kind: "net"; cents: number }
  | { kind: "cells"; count: number };

interface Check {
  ok?: boolean;
  deltaCents?: number;
  residualCents?: number;
}

function asCheck(v: unknown): Check | null {
  return v && typeof v === "object" ? (v as Check) : null;
}

/**
 * Reads one basis out of QboSyncRun.stats.reconciliation (see reconcile.ts)
 * and names the gap that matters most on the Overview: our NOI against
 * QuickBooks' Net Operating Income first, then net income, then per-cell.
 */
export function reconcileGap(reconciliation: unknown, basis: QboBasis): ReconcileGap {
  const r =
    reconciliation && typeof reconciliation === "object"
      ? (reconciliation as Record<string, unknown>)[basis]
      : null;
  if (!r || typeof r !== "object") return { kind: "incomplete" };
  const rc = r as Record<string, unknown>;

  const noi = asCheck(rc.noiVsQbo);
  if (noi && noi.ok === false) return { kind: "noi", cents: noi.residualCents ?? 0 };
  const whole = asCheck(rc.sumToWhole);
  if (whole && whole.ok === false) return { kind: "net", cents: whole.deltaCents ?? 0 };
  const identity = asCheck(rc.netIncomeIdentity);
  if (identity && identity.ok === false) return { kind: "net", cents: identity.deltaCents ?? 0 };
  const cells = Array.isArray(rc.cellMismatches) ? rc.cellMismatches.length : 0;
  if (cells > 0) return { kind: "cells", count: cells };
  return { kind: "ok" };
}

function offBy(what: string, cents: number, asOf: string): string {
  if (Math.abs(cents) < 100) return `${what} doesn't tie to QuickBooks to the cent as of ${asOf}.`;
  return `${what} is ${fmtMoney(Math.abs(cents) / 100)} off from QuickBooks as of ${asOf}.`;
}

/** The banner line for a PARTIAL sync, or null when the basis on screen ties. `asOf` is a formatted date. */
export function partialSyncLine(gap: ReconcileGap, asOf: string): string | null {
  switch (gap.kind) {
    case "ok":
      return null;
    case "incomplete":
      return "The last sync didn't finish, so these figures may not match QuickBooks.";
    case "noi":
      return offBy("NOI", gap.cents, asOf);
    case "net":
      return offBy("Net income", gap.cents, asOf);
    case "cells":
      return gap.count === 1
        ? `1 account total doesn't match QuickBooks as of ${asOf}.`
        : `${gap.count} account totals don't match QuickBooks as of ${asOf}.`;
  }
}

const BASIS_LABEL: Record<QboBasis, string> = { CASH: "Cash", ACCRUAL: "Accrual" };

const offByShort = (cents: number) =>
  Math.abs(cents) < 100 ? "off by under $1" : `off by ${fmtMoney(Math.abs(cents) / 100)}`;

/**
 * The reconciliation line on Settings for one basis. It names the same three
 * checks as the Overview banner (NOI, net income, account totals), so the
 * banner's Review link lands on the gap it named. null when the run has no
 * reconciliation for this basis.
 */
export function reconcileLine(reconciliation: unknown, basis: QboBasis): string | null {
  const r =
    reconciliation && typeof reconciliation === "object"
      ? (reconciliation as Record<string, unknown>)[basis]
      : null;
  if (!r || typeof r !== "object") return null;
  const rc = r as Record<string, unknown>;

  const noi = asCheck(rc.noiVsQbo);
  const whole = asCheck(rc.sumToWhole);
  const identity = asCheck(rc.netIncomeIdentity);
  const netOff =
    whole?.ok === false ? (whole.deltaCents ?? 0) : identity?.ok === false ? (identity.deltaCents ?? 0) : null;
  const cells = Array.isArray(rc.cellMismatches) ? rc.cellMismatches.length : 0;

  const parts = [
    noi?.ok === false ? `NOI ${offByShort(noi.residualCents ?? 0)}` : "NOI ✓",
    netOff == null ? "net income ✓" : `net income ${offByShort(netOff)}`,
    cells === 0
      ? "account totals ✓"
      : cells === 1
        ? "1 account total doesn't match"
        : `${cells} account totals don't match`,
  ];
  return `${BASIS_LABEL[basis]} reconciliation: ${parts.join(" · ")}`;
}

export interface OAuthReturnLine {
  tone: "info" | "error";
  text: string;
  /** Offer "Connect again" beside the line. */
  retry: boolean;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * /api/quickbooks/callback sends the browser back to Settings with
 * ?connected=1 or ?error=<code> (Intuit's own code, or ours).
 */
export function oauthReturnLine(params: {
  connected?: string | string[];
  error?: string | string[];
}): OAuthReturnLine | null {
  const error = first(params.error);
  if (error) {
    if (error === "access_denied") {
      return { tone: "info", text: "Connection cancelled. Nothing changed.", retry: true };
    }
    if (error === "state_mismatch") {
      return { tone: "error", text: "That sign-in expired.", retry: true };
    }
    return { tone: "error", text: "QuickBooks didn't finish connecting.", retry: true };
  }
  if (first(params.connected) === "1") {
    return { tone: "info", text: "Connected to QuickBooks. A full sync is running now.", retry: false };
  }
  return null;
}
