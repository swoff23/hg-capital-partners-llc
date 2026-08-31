import type {
  QboBasis,
  QboCategory,
  QboClassRole,
  QboLineTag,
  QboTreatment,
} from "@prisma/client";

/**
 * Shared types for the QuickBooks Online mirror.
 *
 * Money is carried as **integer cents** through every pure module — summing
 * hundreds of report lines in floating-point dollars accumulates penny errors,
 * and reconciliation is to-the-cent. Conversion to `Decimal(14,2)` happens only
 * at the Prisma boundary (`sync.ts`).
 */

/** Sentinel classKey for a line with no QuickBooks class ("Not Specified"). */
export const UNCLASSED = "__UNCLASSED__";

/** The P&L sections the ProfitAndLoss / ProfitAndLossDetail reports group by. */
export type PnlSection = "Income" | "COGS" | "Expenses" | "OtherIncome" | "OtherExpenses";

/** dollars string ("1500.00", "-19102.44", "") -> integer cents. "" -> 0. */
export function toCents(raw: string | number | null | undefined): number {
  if (raw == null || raw === "") return 0;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** integer cents -> a `Decimal`-safe fixed string ("1500.00"). */
export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** One line parsed from ProfitAndLossDetail, before app dimensions are resolved. */
export interface RawDetailLine {
  txnDate: string; // "YYYY-MM-DD"
  periodMonth: string; // "YYYY-MM"
  txnType: string;
  qboTxnId: string | null;
  docNumber: string | null;
  name: string | null;
  memo: string | null;
  businessName: string | null;
  accountQboId: string | null;
  accountName: string;
  splitAccount: string | null;
  classQboId: string | null; // null => "Not Specified" / no class
  className: string | null;
  amountCents: number; // natural sign (income +, expense +, contra/reclass -)
  section: PnlSection;
}

/** A fully-resolved ledger line, ready to write to `LedgerLine`. */
export interface LedgerLineInput extends Omit<RawDetailLine, "qboTxnId"> {
  qboTxnId: string; // resolved: the real Intuit id, or a synthesized stable hash
  basis: QboBasis;
  lineKey: string;
  classKey: string; // classQboId ?? UNCLASSED
  classification: string; // "Revenue" | "Expense" | "Asset" | "Liability" | "Equity"
  category: QboCategory;
  treatment: QboTreatment;
  classRole: QboClassRole;
  propertyId: string | null;
  entityId: string | null;
  lineTags: QboLineTag[];
  vendorQboId: string | null;
  customerName: string | null;
}

/** One (account × class) cell parsed from the ProfitAndLoss-by-Class summary report. */
export interface PnlByClassCell {
  accountQboId: string | null;
  accountName: string;
  classQboId: string | null; // null => "Not Specified"
  className: string;
  section: PnlSection;
  amountCents: number;
}
