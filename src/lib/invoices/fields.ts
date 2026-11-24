import type { InvoiceEventKind, InvoicePayMethod, InvoiceSource, InvoiceStage, Prisma } from "@prisma/client";
import { fmtDay, type Ymd } from "@/lib/dates";
import { firstName } from "@/lib/names";

/**
 * Contractor invoices (docs/contractor-invoices-plan.md): the rules that need
 * no database. What a typed invoice number and total mean, what an invoice is
 * called, what a contractor sees of it and in which words, and the lines a
 * refused move shows. Pure; see fields.test.ts. core.ts enforces these on
 * every write and queries.ts reads with them.
 *
 * Money is counted in integer cents everywhere here, never a float of
 * dollars, so $1,043.10 stays $1,043.10.
 */

// ---------------------------------------------------------------------------
// Stages, views and methods
// ---------------------------------------------------------------------------

/** What staff call each stage (M4), on the Invoices page, the invoice page and the task page. */
export const STAGE_LABEL: Record<InvoiceStage, string> = {
  REVIEW: "To review",
  TO_PAY: "To pay",
  PAID: "Paid",
  NOT_INVOICE: "Not an invoice",
};

/** The Invoices page's switch (`?view=`), in order. */
export const INVOICE_VIEWS = ["review", "pay", "paid"] as const;
export type InvoiceView = (typeof INVOICE_VIEWS)[number];

export const VIEW_STAGE: Record<InvoiceView, InvoiceStage> = { review: "REVIEW", pay: "TO_PAY", paid: "PAID" };

/** The view a `?view=` asks for; anything else is To review. */
export function readInvoiceView(raw: string | string[] | undefined): InvoiceView {
  return typeof raw === "string" && (INVOICE_VIEWS as readonly string[]).includes(raw) ? (raw as InvoiceView) : "review";
}

/** How it was paid (M9), in the picker's order. Baselane is the default. */
export const PAY_METHODS: readonly InvoicePayMethod[] = ["BASELANE", "CHECK", "ZELLE", "VENMO", "CASH", "CARD", "OTHER"];

export const DEFAULT_PAY_METHOD: InvoicePayMethod = "BASELANE";

export const PAY_METHOD_LABEL: Record<InvoicePayMethod, string> = {
  BASELANE: "Baselane transfer",
  CHECK: "Check",
  ZELLE: "Zelle",
  VENMO: "Venmo",
  CASH: "Cash",
  CARD: "Card",
  OTHER: "Other",
};

export function isPayMethod(v: unknown): v is InvoicePayMethod {
  return typeof v === "string" && (PAY_METHODS as readonly string[]).includes(v);
}

/** The invoice inbox, the part of invoices@mail.hgcapitalpartners.com before the @ (4.3). */
export const INVOICE_INBOX = "invoices";

// ---------------------------------------------------------------------------
// Invoice number
// ---------------------------------------------------------------------------

export const INVOICE_NUMBER_MAX = 60;
export const NUMBER_TOO_LONG = `Use ${INVOICE_NUMBER_MAX} characters or fewer.`;

/** The number as saved (5.1): trimmed, without a leading "#". "#1043" and "# 1043" save as "1043". Null when blank. */
export function cleanInvoiceNumber(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().replace(/^#+\s*/, "").trim();
  return s || null;
}

/**
 * The number as the duplicate check compares it (M10, 5.1): letters and digits only, lowercased, leading zeros
 * dropped, so "#001043", "1043" and "10-43" all read "1043" and "INV-0042" reads "inv0042". All zeros read "0".
 * Null when nothing is left to compare.
 */
export function normalizeInvoiceNumber(raw: string | null | undefined): string | null {
  const cleaned = cleanInvoiceNumber(raw);
  if (!cleaned) return null;
  const kept = cleaned.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (!kept) return null;
  return kept.replace(/^0+/, "") || "0";
}

// ---------------------------------------------------------------------------
// Total
// ---------------------------------------------------------------------------

/** The most a DECIMAL(12,2) holds, in cents: $9,999,999,999.99. */
export const TOTAL_MAX_CENTS = 999_999_999_999;

export const TOTAL_MESSAGE = "Enter the total, like 850.00.";
export const TOTAL_ABOVE_ZERO = "Enter a total above zero.";
export const TOTAL_TOO_BIG = "Enter a smaller total.";

export type TotalRead = { ok: true; cents: number | null } | { ok: false; message: string };

/** "850", "850.5", "850.", "$1,043.10", ".50": dollars, commas in their thousands places, at most two decimals. */
const PLAIN_TOTAL = /^(\d+|\d{1,3}(?:,\d{3})+)?(?:\.(\d{0,2}))?$/;

/**
 * A typed total, strictly (5.2): a positive amount with at most two decimals. Not money.ts parseAmount, which
 * reads "1.2k" as 1,200 and takes a minus sign; an invoice total is what's printed on it, so anything that isn't
 * plainly one amount is refused rather than guessed at. Blank is no total (a total is optional until Approve).
 * Read from the text, never through a float, so the cents are exact.
 */
export function readTotal(raw: string | null | undefined): TotalRead {
  const s = (raw ?? "").trim();
  if (!s) return { ok: true, cents: null };
  const body = s.replace(/^\$\s*/, "");
  if (/^-|^\(.*\)$|-$/.test(body) || s.startsWith("-")) return { ok: false, message: TOTAL_ABOVE_ZERO };
  const m = PLAIN_TOTAL.exec(body);
  if (!m || (!m[1] && !m[2])) return { ok: false, message: TOTAL_MESSAGE };
  const whole = (m[1] ?? "0").replace(/,/g, "").replace(/^0+(?=\d)/, "");
  if (whole.length > 10) return { ok: false, message: TOTAL_TOO_BIG };
  const cents = Number(whole) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (cents <= 0) return { ok: false, message: TOTAL_ABOVE_ZERO };
  if (cents > TOTAL_MAX_CENTS) return { ok: false, message: TOTAL_TOO_BIG };
  return { ok: true, cents };
}

/** A total the database takes: whole cents, above zero, within the column. */
export function isTotalCents(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= TOTAL_MAX_CENTS;
}

/** Cents as a Decimal column's text: 85050 is "850.50". */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const a = Math.abs(Math.trunc(cents));
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/**
 * A Decimal column's value in cents, read from its text ("850.5", "850.50", "1043"), never Number() of the
 * dollars. Null for null or anything that isn't a plain decimal.
 */
export function decimalToCents(v: { toString(): string } | string | null | undefined): number | null {
  if (v == null) return null;
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(v).trim());
  if (!m) return null;
  const frac = (m[3] ?? "").padEnd(2, "0");
  // A third decimal place can't come from a DECIMAL(12,2); round it rather than drop it, should one ever arrive.
  const cents = Number(m[2]) * 100 + Number(frac.slice(0, 2)) + (frac.length > 2 && Number(frac[2]) >= 5 ? 1 : 0);
  return m[1] ? -cents : cents;
}

// ---------------------------------------------------------------------------
// Names and words
// ---------------------------------------------------------------------------

/** The invoice page's title (6.1, item 4): "Invoice #1043", or "Invoice from Zack", or "Invoice". */
export function invoiceTitle(inv: { invoiceNumber: string | null; contactName?: string | null }): string {
  const number = cleanInvoiceNumber(inv.invoiceNumber);
  if (number) return `Invoice #${number}`;
  const name = firstName(inv.contactName);
  return name ? `Invoice from ${name}` : "Invoice";
}

/**
 * How long a Paid stays the staff's to take back before the contractor hears of it (M15): the Paid email waits it
 * out and the portal shows Approved until it passes, so a contractor never sees Paid flip back. The same window as
 * a job's Approve Undo (tasks/rules.ts APPROVAL_UNDO_MS).
 */
export const PAID_SETTLE_MS = 2 * 60_000;

/** The three stages a contractor sees (M4). */
export type ContractorStage = "RECEIVED" | "APPROVED" | "PAID";

export const CONTRACTOR_STAGE_LABEL: Record<ContractorStage, string> = { RECEIVED: "Received", APPROVED: "Approved", PAID: "Paid" };

/** Whether a Paid marked at `paidAt` has outlasted its Undo window by `now`. */
export function paidHasSettled(paidAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!paidAt) return false;
  const at = new Date(paidAt).getTime();
  return Number.isFinite(at) && now.getTime() - at >= PAID_SETTLE_MS;
}

/**
 * The stage as a contractor reads it: To review is Received, To pay is Approved, and Paid is Paid once its Undo
 * window has passed (Approved until then). Null for Not an invoice, which they never see.
 */
export function contractorStage(inv: { stage: InvoiceStage; paidAt?: Date | string | null }, now: Date = new Date()): ContractorStage | null {
  switch (inv.stage) {
    case "REVIEW":
      return "RECEIVED";
    case "TO_PAY":
      return "APPROVED";
    case "PAID":
      return paidHasSettled(inv.paidAt, now) ? "PAID" : "APPROVED";
    default:
      return null;
  }
}

/** One plain word, Paid with its date (6.1, item 2): "Received", "Approved", "Paid Nov 13". Empty when hidden. */
export function contractorStageWord(
  inv: { stage: InvoiceStage; paidAt?: Date | string | null; paidOn?: Date | string | null },
  now: Date,
  today: Ymd,
): string {
  const stage = contractorStage(inv, now);
  if (!stage) return "";
  if (stage === "PAID" && inv.paidOn) return `Paid ${fmtDay(inv.paidOn, { year: "auto", now: today })}`;
  return CONTRACTOR_STAGE_LABEL[stage];
}

// ---------------------------------------------------------------------------
// What a contractor sees (M14)
// ---------------------------------------------------------------------------

export interface VisibilityFields {
  contactId: string | null;
  createdByContactId: string | null;
  source: InvoiceSource;
  stage: InvoiceStage;
}

/**
 * Whether a contractor sees an invoice (M14, 5.2): only one with their contact, never Not an invoice. One they sent
 * from the portal shows at once, in every stage. Any other (an email, a reply, a staff entry) shows only once it's
 * approved, in To pay or Paid, so a misfiled or half-entered one never reaches the wrong contractor. A portal
 * invoice staff moved to another contractor follows the same rule as the others for that contractor: it was never
 * theirs to see as Received. A link session sees none (M16); the reads check that before this.
 */
export function contractorMaySee(inv: VisibilityFields, contactId: string): boolean {
  if (!contactId || inv.contactId !== contactId || inv.stage === "NOT_INVOICE") return false;
  if (inv.source === "PORTAL" && inv.createdByContactId === contactId) return true;
  return inv.stage === "TO_PAY" || inv.stage === "PAID";
}

/** Who asks for an invoice's file (/api/files/invoice/<id>). `onlyTaskId`: a session a job email's link started. */
export type InvoiceFileViewer = { kind: "staff"; onlyTaskId?: string | null } | { kind: "contractor"; contactId: string; onlyTaskId: string | null };

/**
 * Whether a viewer may open one of an invoice's files (5.2): any signed-in partner; a contractor only for an invoice
 * they may see (contractorMaySee), and never from a one-job link session (M16), which sees no invoice at all.
 */
export function mayOpenInvoiceFile(viewer: InvoiceFileViewer, inv: VisibilityFields): boolean {
  if (viewer.onlyTaskId) return false;
  if (viewer.kind === "staff") return true;
  return contractorMaySee(inv, viewer.contactId);
}

/** The same rule as a Prisma filter, for the portal's reads. */
export function contractorInvoiceWhere(contactId: string): Prisma.InvoiceWhereInput {
  return {
    contactId,
    deletedAt: null,
    stage: { not: "NOT_INVOICE" },
    OR: [{ source: "PORTAL", createdByContactId: contactId }, { stage: { in: ["TO_PAY", "PAID"] } }],
  };
}

// ---------------------------------------------------------------------------
// Approve, and the lines a refused move shows
// ---------------------------------------------------------------------------

/**
 * Why Approve can't go yet (M5, 6.1 item 4), the line under a disabled Approve; null when it can. It needs a
 * contractor and a total above zero; jobs are optional.
 */
export function approveBlocker(inv: { contactId: string | null; totalCents: number | null }): string | null {
  const noContractor = !inv.contactId;
  const noTotal = !(inv.totalCents != null && inv.totalCents > 0);
  if (noContractor && noTotal) return "Add a contractor and a total to approve.";
  if (noContractor) return "Add a contractor to approve.";
  if (noTotal) return "Add a total to approve.";
  return null;
}

/**
 * The line when a move lost to someone else's (5.2): the invoice is in `current` now, and `lastMove` is the
 * history line that put it there, made by `who` (a first name, "You" for the caller's own other tab, or null when
 * no line says). "Pieter already marked this paid."
 */
export function movedMessage(current: InvoiceStage, lastMove: InvoiceEventKind | null, who: string | null): string {
  const w = who || "Someone";
  if (current === "NOT_INVOICE") return `${w} marked this not an invoice.`;
  if (lastMove === "RESTORED") return `${w} already put this back.`;
  switch (current) {
    case "PAID":
      return `${w} already marked this paid.`;
    case "TO_PAY":
      return lastMove === "UNDONE" ? `${w} moved this back to To pay.` : `${w} already approved this.`;
    default:
      return `${w} moved this back to To review.`;
  }
}
