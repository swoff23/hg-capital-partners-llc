import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { flushTable, Section, Table, Td, TextLink, chromeIconClass } from "@/components/ui";
import { FactStrip } from "@/components/fact-strip";
import { Money } from "@/components/money";
import { MoneyBars } from "@/components/money-bars";
import { MonthBars } from "@/components/month-bars";
import { SandboxNotice, SourceLine } from "@/components/source-line";
import { fmtDay } from "@/lib/dates";
import { signedLineCents } from "@/lib/quickbooks/compute";
import { periodLabel } from "@/lib/quickbooks/period";
import { getPropertyFinancials } from "@/lib/quickbooks/queries";
import { CATEGORY_LABELS } from "../../financials/_components/labels";

/** "37.5%", and a loss with a true minus (U+2212), like the money beside it (section 3). */
function pct(n: number | null): string | null {
  if (n == null) return null;
  const v = (Math.abs(n) * 100).toFixed(1);
  return n < 0 && v !== "0.0" ? `−${v}%` : `${v}%`;
}

/**
 * QuickBooks P&L for this property, as a Section of the record (charts 4,
 * the property Financials card): Income, Expense, NOI and Margin for Year to
 * date (2 by 2 on phones), the source line, the month chart at 120px with
 * the months before purchase saying so, expense by category (top 7, then
 * Everything else), then the latest transactions. Renders nothing when
 * QuickBooks isn't connected; once connected, an unmapped property still
 * gets the section (so the gap is visible) with a link to fix the mapping.
 * Its action says where it goes ("All financials"), since "Portfolio" on
 * this page is the property list.
 */
export async function PropertyFinancialsCard({ propertyId }: { propertyId: string }) {
  const data = await getPropertyFinancials(propertyId); // the basis chosen in Financials → Settings
  if (!data || !data.connected) return null;

  if (!data.mapped) {
    return (
      <Section title="Financials">
        <p className="text-body text-fg-3">
          No QuickBooks class is mapped to this property yet.{" "}
          <TextLink href="/financials/settings#class-mapping">Map it in Financials settings</TextLink>
        </p>
      </Section>
    );
  }

  const { noi, period } = data;
  const periodText = periodLabel(period.span.from, period.span.to, { through: period.through }) ?? "";

  return (
    <Section
      title="Financials"
      actions={
        // As tall as the rail's Edit button (32px, 44 on touch), so this heading lines up with Details beside it.
        <Link
          href="/financials"
          className="inline-flex min-h-8 items-center gap-1.5 text-label text-fg-1 hover:underline pointer-coarse:min-h-11"
        >
          All financials
          <ArrowRight aria-hidden="true" className={chromeIconClass} />
        </Link>
      }
    >
      <div className="space-y-6">
        {data.sandbox && <SandboxNotice />}

        <div className="space-y-2">
          {/* Four $0 figures would read as a property that earned nothing; say there's no data instead. */}
          {data.hasLinesInPeriod ? (
            <FactStrip
              facts={[
                { label: "Income", value: <Money value={noi.operatingIncomeCents / 100} />, fadeKey: noi.operatingIncomeCents },
                { label: "Expense", value: <Money value={noi.operatingExpenseCents / 100} />, fadeKey: noi.operatingExpenseCents },
                { label: "NOI", value: <Money value={noi.noiCents / 100} />, fadeKey: noi.noiCents },
                { label: "Margin", value: pct(noi.noiMargin) },
              ]}
            />
          ) : (
            <p className="text-body text-fg-3">
              {data.hasLines ? `No QuickBooks lines for ${periodText}.` : "No QuickBooks activity for this property yet."}
            </p>
          )}
          <SourceLine period={periodText} basis={data.basis} syncedAt={data.lastSyncAt} />
        </div>

        {data.hasLines && (
          <MonthBars
            frame="plain"
            size="record"
            months={data.months}
            runningMonth={period.runningMonth}
            through={period.syncedThrough}
            historyStart={period.historyStart}
            purchaseMonth={data.purchaseMonth}
            synced={data.lastSyncAt != null}
          />
        )}

        {data.expenseByCategory.length > 0 && (
          <div>
            <h3 className="mb-2 text-meta font-medium text-fg-2">Expense by category</h3>
            <MoneyBars
              rows={data.expenseByCategory.map((e) => ({
                key: e.category,
                label: CATEGORY_LABELS[e.category] ?? e.category,
                cents: e.cents,
              }))}
              emptyLabel={`No operating expenses in QuickBooks for ${periodText}.`}
            />
          </div>
        )}

        {data.recentLines.length > 0 && (
          <div>
            <h3 className="mb-1 text-meta font-medium text-fg-2">Recent transactions</h3>
            <Table className={flushTable}>
              <tbody className="divide-y divide-line">
                {data.recentLines.map((l, i) => {
                  // Signed from the treatment: money in reads in --ok, money out takes the minus.
                  const cents = signedLineCents(l.treatment, l.amountCents, l.category);
                  return (
                    <tr key={i}>
                      <Td className="num w-px whitespace-nowrap align-middle text-meta text-fg-3">
                        {fmtDay(l.txnDate, { year: "auto" })}
                      </Td>
                      {/* max-w-0 lets the name take what's left and truncate there. Touch has
                          no hover to show the title, so there the name wraps instead. */}
                      <Td
                        className="w-full max-w-0 truncate align-middle pointer-coarse:whitespace-normal pointer-coarse:break-words"
                        title={l.name || l.accountName}
                      >
                        {l.name || l.accountName}
                      </Td>
                      <Td numeric className="align-middle">
                        <Money value={cents / 100} cents inflow={cents > 0} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}

        {data.hasLines && <p className="text-meta text-fg-3">Lines classed to this property only, without entity overhead.</p>}
      </div>
    </Section>
  );
}
