"use client";
import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/segmented-control";
import type { InvoiceCounts } from "@/lib/invoices/queries";
import type { InvoiceView } from "@/lib/invoices/fields";
import { viewHref } from "./lines";

/**
 * To review | To pay | Paid on Invoices, kept in the URL (`?view=`) so Back and a pasted link land on the same
 * list. Paid shows no count: a third count pushes the switch past the page's width at 320 (plan 6.1, item 3).
 */
export function ViewSwitch({ view, counts }: { view: InvoiceView; counts: Pick<InvoiceCounts, "review" | "pay"> }) {
  const router = useRouter();
  return (
    <SegmentedControl
      aria-label="Invoices"
      size="md"
      value={view}
      onChange={(next) => router.replace(viewHref(next), { scroll: false })}
      options={[
        { key: "review", label: "To review", count: counts.review },
        { key: "pay", label: "To pay", count: counts.pay },
        { key: "paid", label: "Paid" },
      ]}
    />
  );
}
