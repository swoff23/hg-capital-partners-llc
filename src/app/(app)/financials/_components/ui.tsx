import type { ComponentProps } from "react";
import { Money } from "@/components/money";

/* The money pieces only /financials uses, on the Ink and Limestone tokens
   (docs/brand-guidelines.md, sections 3 and 4). The QuickBooks read layer
   works in cents; everything here shows whole dollars through Money. The
   shared pieces moved to src/components: FactStrip, MoneyBars, MonthBars,
   Meter and SourceLine (with WarnMark and Notice), and the statement rules
   (`flushTable`, `grandTotalRow`) to ui.tsx. */

/**
 * Money for an amount in cents, shown as whole dollars: tabular, a true minus
 * for money out. A transaction line that shows its cents uses Money itself.
 */
export function MoneyCents({ cents, ...props }: { cents: number } & Omit<ComponentProps<typeof Money>, "value" | "cents">) {
  return <Money value={cents / 100} {...props} />;
}
