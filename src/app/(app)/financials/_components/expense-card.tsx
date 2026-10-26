"use client";
import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { Money } from "@/components/money";
import { MoneyBars, type MoneyBarRow } from "@/components/money-bars";
import { SegmentedControl } from "@/components/segmented-control";
import type { ExpenseBy } from "@/lib/quickbooks/series";

const BY = [
  { key: "category", label: "Category" },
  { key: "account", label: "Account" },
  { key: "payee", label: "Payee" },
] as const;

/**
 * The Overview's "Operating expense" card (charts 2.4): where the period's
 * operating expense went, by category, account or payee. The list follows
 * the page's period, not the chart's picked month (choice D3 A), and the
 * switch swaps it at once, like a tab. Title and switch share a row from a
 * 400px card; narrower, the switch takes its own line under the title.
 * Amounts are cents.
 */
export function ExpenseCard({
  rows,
  totalCents,
  period,
}: {
  rows: Record<ExpenseBy, MoneyBarRow[]>;
  /** null when the period has no QuickBooks lines: the header then states the period alone, never $0. */
  totalCents: number | null;
  /** "Jan 1 to Oct 25, 2026": the period the list covers. */
  period: string;
}) {
  const [by, setBy] = useState<ExpenseBy>("category");
  return (
    <Card className="@container">
      <CardHeader className="grid gap-x-3 gap-y-2 py-2.5 @min-[400px]:grid-cols-[minmax(0,1fr)_auto] @min-[400px]:items-center">
        <div className="min-w-0">
          <h2 className="truncate text-section text-fg-1">Operating expense</h2>
          <p className="truncate text-meta text-fg-3">
            {period}
            {totalCents != null && (
              <>
                {" · "}
                <Money value={totalCents / 100} />
              </>
            )}
          </p>
        </div>
        <SegmentedControl
          aria-label="Group by"
          options={BY}
          value={by}
          onChange={setBy}
          className="justify-self-start @min-[400px]:justify-self-end"
        />
      </CardHeader>
      <CardBody>
        {/* Keyed by the grouping, so an open "Everything else" closes on a switch. */}
        <MoneyBars
          key={by}
          rows={rows[by]}
          emptyLabel={`No operating expenses in QuickBooks for ${period}.`}
        />
      </CardBody>
    </Card>
  );
}
