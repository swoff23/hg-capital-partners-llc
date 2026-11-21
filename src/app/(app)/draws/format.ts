import { tidyAmount } from "@/lib/money";
import { fmtDay, toYmd, type Ymd } from "@/lib/dates";
import { STAGE_LABEL, atLender, daysInStage, daysLabel, type DrawIn } from "@/lib/draws/figures";

/**
 * A draw's stage as a row says it (docs/specs/rehab-draws.md, L2): "Inspection · 6 days" while it's with the
 * lender, "Funded Oct 23" once it has landed, "Funded" for a past draw that came in without a date.
 */
export function stageText(d: Pick<DrawIn, "stage" | "stageChangedAt" | "fundedOn">, today: Ymd): string {
  if (d.stage === "FUNDED") {
    const day = toYmd(d.fundedOn);
    return day ? `Funded ${fmtDay(day, { year: "auto", now: today })}` : "Funded";
  }
  if (atLender(d.stage)) return `${STAGE_LABEL[d.stage]} · ${daysLabel(daysInStage(d, today))}`;
  return STAGE_LABEL[d.stage];
}

/** "$2,680": a draw's amount in a toast or a line of words, where a component can't go. */
export function fmtCents(n: number): string {
  const body = Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return n < 0 ? `−${body}` : body;
}

/** A stored amount as the text a money field starts with: grouped ("1,500.45"), and a real zero as "0"; "" for none. */
export function amountText(n: number | null | undefined): string {
  if (n == null) return "";
  return tidyAmount("money", String(n)) ?? String(n);
}

/** The same for a field where nothing and zero are one thing (a change order, a draft): zero starts blank. */
export function optionalAmountText(n: number | null | undefined): string {
  return n ? amountText(n) : "";
}
