import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle, TextLink } from "@/components/ui";
import { fmtDay } from "@/lib/dates";
import { signedLineCents } from "@/lib/quickbooks/compute";
import { getPropertyFinancials } from "@/lib/quickbooks/queries";
import { CATEGORY_LABELS } from "../../financials/_components/labels";
import {
  fmtCents,
  MoneyBars,
  PartialLabel,
  SandboxNotice,
  SourceBadge,
} from "../../financials/_components/ui";

/** "+$1,350" for money in, "−$1,350" (a true minus sign) for money out. */
const fmtSignedCents = (cents: number) =>
  cents === 0 ? fmtCents(0) : (cents > 0 ? "+" : "−") + fmtCents(Math.abs(cents));

/**
 * QuickBooks P&L for this property. Renders nothing when QuickBooks isn't
 * connected — no point cluttering the page with an empty-state card until
 * there's something to show. Once connected, an unmapped property still gets
 * a card (so the gap is visible) with a link to fix the mapping.
 */
export async function PropertyFinancialsCard({ propertyId }: { propertyId: string }) {
  const data = await getPropertyFinancials(propertyId); // the basis chosen in Financials → Settings
  if (!data || !data.connected) return null;

  if (!data.mapped) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Financials</CardTitle>
        </CardHeader>
        <CardBody className="text-sm text-muted">
          No QuickBooks class is mapped to this property yet.{" "}
          <TextLink href="/financials/settings">Map it in Financials → Settings</TextLink>
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
        {data.sandbox && <SandboxNotice />}

        {/* Three $0 figures would read as a property that earned nothing; say there's no data instead. */}
        {data.hasLines ? (
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
        ) : (
          <p className="text-sm text-muted">No QuickBooks activity for this property yet.</p>
        )}

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
              {data.recentLines.map((l, i) => (
                <li key={i} className="flex items-center gap-2 py-1.5">
                  <span className="w-16 shrink-0 text-muted">{fmtDay(l.txnDate)}</span>
                  <span className="min-w-0 flex-1 truncate" title={l.name ?? l.accountName}>
                    {l.name || l.accountName}
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums">
                    {fmtSignedCents(signedLineCents(l.treatment, l.amountCents))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[11px] text-muted">
          Direct-classed lines only. Entity and overhead costs show in the{" "}
          <TextLink href="/financials">portfolio view</TextLink>
          .
        </p>
      </CardBody>
    </Card>
  );
}
