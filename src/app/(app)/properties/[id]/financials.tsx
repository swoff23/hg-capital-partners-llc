import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section, Table, Td, TextLink, chromeIconClass } from "@/components/ui";
import { Money } from "@/components/money";
import { fmtDay } from "@/lib/dates";
import { signedLineCents } from "@/lib/quickbooks/compute";
import { getPropertyFinancials } from "@/lib/quickbooks/queries";
import { CATEGORY_LABELS } from "../../financials/_components/labels";
import { periodOf } from "../../financials/_components/period";
import { flushTable, Kpi, MoneyBars, SandboxNotice, SourceLine, Strip } from "../../financials/_components/ui";

/**
 * QuickBooks P&L for this property, as a Section of the record. Renders
 * nothing when QuickBooks isn't connected — no point cluttering the page with
 * an empty section until there's something to show. Once connected, an
 * unmapped property still gets the section (so the gap is visible) with a
 * link to fix the mapping. Its action says where it goes ("All financials"),
 * since "Portfolio" on this page is the property list.
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

  const { noi } = data;

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
          {/* Three $0 figures would read as a property that earned nothing; say there's no data instead. */}
          {data.hasLines ? (
            <Strip className="grid-cols-3">
              <Kpi size="m" label="Income" cents={noi.operatingIncomeCents} />
              <Kpi size="m" label="Opex" cents={noi.operatingExpenseCents} />
              <Kpi size="m" label="NOI" cents={noi.noiCents} />
            </Strip>
          ) : (
            <p className="text-body text-fg-3">No QuickBooks activity for this property yet.</p>
          )}
          <SourceLine
            period={periodOf(data.monthly.map((m) => m.periodMonth))}
            basis={data.basis}
            syncedAt={data.lastSyncAt}
          />
        </div>

        {data.expenseByCategory.length > 0 && (
          <div>
            <h3 className="mb-2 text-meta font-medium text-fg-2">Expense by category</h3>
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
            <h3 className="mb-1 text-meta font-medium text-fg-2">Recent transactions</h3>
            <Table className={flushTable}>
              <tbody className="divide-y divide-line">
                {data.recentLines.map((l, i) => {
                  // Signed from the treatment: money in reads in --ok, money out takes the minus.
                  const cents = signedLineCents(l.treatment, l.amountCents);
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
