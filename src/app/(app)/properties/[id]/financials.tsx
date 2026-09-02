import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { fmtDay } from "@/lib/dates";
import { getPropertyFinancials } from "@/lib/quickbooks/queries";
import { CATEGORY_LABELS } from "../../financials/_components/labels";
import { fmtCents, MoneyBars, PartialLabel, SourceBadge } from "../../financials/_components/ui";

/**
 * QuickBooks P&L for this property. Renders nothing when QuickBooks isn't
 * connected — no point cluttering the page with an empty-state card until
 * there's something to show. Once connected, an unmapped property still gets
 * a card (so the gap is visible) with a link to fix the mapping.
 */
export async function PropertyFinancialsCard({ propertyId }: { propertyId: string }) {
  const data = await getPropertyFinancials(propertyId, "CASH");
  if (!data || !data.connected) return null;

  if (!data.mapped) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Financials</CardTitle>
        </CardHeader>
        <CardBody className="text-sm text-muted">
          No QuickBooks class is mapped to this property yet.{" "}
          <Link href="/financials/settings" className="text-primary hover:underline">
            Map it in Financials → Settings
          </Link>
          .
        </CardBody>
      </Card>
    );
  }

  const { noi } = data;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Financials</CardTitle>
        <Link href="/financials" className="text-xs text-primary hover:underline">
          Portfolio →
        </Link>
      </CardHeader>
      <CardBody className="space-y-3">
        <SourceBadge basis={data.basis} syncedAt={data.lastSyncAt} />

        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-xs text-muted">Income</div>
            <div className="font-medium tabular-nums">
              {fmtCents(noi.operatingIncomeCents)}
              <PartialLabel months={noi.monthsOfData} />
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Opex</div>
            <div className="font-medium tabular-nums">{fmtCents(noi.operatingExpenseCents)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">NOI</div>
            <div className="font-medium tabular-nums">{fmtCents(noi.noiCents)}</div>
          </div>
        </div>

        {data.expenseByCategory.length > 0 && (
          <div>
            <div className="mb-1 text-xs text-muted">Expense by category</div>
            <MoneyBars
              rows={data.expenseByCategory.map((e) => ({
                label: CATEGORY_LABELS[e.category] ?? e.category,
                cents: e.cents,
              }))}
            />
          </div>
        )}

        {data.recentLines.length > 0 && (
          <div>
            <div className="mb-1 text-xs text-muted">Recent transactions</div>
            <ul className="divide-y divide-border text-xs">
              {data.recentLines.slice(0, 8).map((l, i) => (
                <li key={i} className="flex items-center gap-2 py-1.5">
                  <span className="w-16 shrink-0 text-muted">{fmtDay(l.txnDate)}</span>
                  <span className="min-w-0 flex-1 truncate" title={l.name ?? l.accountName}>
                    {l.name || l.accountName}
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums">{fmtCents(l.amountCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[11px] text-muted">
          Direct-classed lines only; entity/overhead costs aren&apos;t attributed here — see the{" "}
          <Link href="/financials" className="text-primary hover:underline">
            portfolio view
          </Link>
          .
        </p>
      </CardBody>
    </Card>
  );
}
