import type { ReactNode } from "react";
import { Money } from "@/components/money";
import { fmtDay } from "@/lib/dates";
import { toMoneyNumber } from "@/lib/utils";

/* A rail fact's value, or null when it's empty so the row shows its verb
   ("Add purchase price") instead of a dash. */

/** Whole dollars through Money. */
export function moneyFact(v: string | null): ReactNode {
  return toMoneyNumber(v) == null ? null : <Money value={v} />;
}

/** A calendar date: "Mar 1, 2026". */
export function dayFact(v: string | null): ReactNode {
  return v ? <span className="num">{fmtDay(v)}</span> : null;
}

/** Plain text, trimmed. */
export function textFact(v: string | null | undefined): string | null {
  return v?.trim() || null;
}
