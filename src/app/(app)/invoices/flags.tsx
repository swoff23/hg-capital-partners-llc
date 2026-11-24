import { CircleHelp, TriangleAlert } from "lucide-react";
import { WarnMark } from "@/components/source-line";
import type { InvoiceRow } from "@/lib/invoices/queries";

/**
 * A row's flags (plan 6.1, item 3): an icon plus one word in --warn, never a fill alone. Possible duplicate (M10)
 * can show in To pay too, since a partner's own entry lands there straight away; Who's this from? (M11) is for
 * an emailed invoice no contractor was found for.
 */
export function Flags({
  row,
  className,
  firstOnly,
}: {
  row: Pick<InvoiceRow, "possibleDuplicate" | "needsContractor">;
  className?: string;
  /** One flag, Who's this from? before Possible duplicate: the phone's line has room for one. */
  firstOnly?: boolean;
}) {
  if (!row.possibleDuplicate && !row.needsContractor) return null;
  const duplicate = row.possibleDuplicate && !(firstOnly && row.needsContractor);
  return (
    <span className={className}>
      {duplicate && <WarnMark icon={TriangleAlert} className="whitespace-nowrap">Possible duplicate</WarnMark>}
      {row.needsContractor && <WarnMark icon={CircleHelp} className="whitespace-nowrap">Who&apos;s this from?</WarnMark>}
    </span>
  );
}
