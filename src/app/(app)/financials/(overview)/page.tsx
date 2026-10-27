import { TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { buttonClass, EmptyState, flushTable, grandTotalRow, RowCell, Section, Table, Td, Th, TextLink } from "@/components/ui";
import { FactStrip, type Fact } from "@/components/fact-strip";
import { MonthBars } from "@/components/month-bars";
import { Notice, SandboxNotice, SourceLine } from "@/components/source-line";
import { getFinancialsOverview } from "@/lib/quickbooks/queries";
import { qbo } from "@/lib/quickbooks/config";
import { partialSyncLine, reconcileGap } from "@/lib/quickbooks/notices";
import { fmtMonthYear, inSpan, periodFromParam, periodLabel } from "@/lib/quickbooks/period";
import { needsReview } from "@/lib/quickbooks/review";
import { basisFromParam } from "@/lib/quickbooks/rollup";
import { changeWords } from "@/lib/quickbooks/series";
import { cn, fmtMoney } from "@/lib/utils";
import { CATEGORY_LABELS } from "../_components/labels";
import { ExpenseCard } from "../_components/expense-card";
import { PeriodRow } from "../_components/period-row";
import { MoneyCents } from "../_components/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Financials" };

export const dynamic = "force-dynamic";

/** "37.5%", and a loss with a true minus (U+2212), like the money beside it (section 3). */
function pct(n: number | null): string {
  if (n == null) return "—";
  const v = (Math.abs(n) * 100).toFixed(1);
  return n < 0 && v !== "0.0" ? `−${v}%` : `${v}%`;
}

const lines = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "line" : "lines"}`;

/** How wide a figure prints, sign included, for the strip's size: past eight characters it stays at 20px. */
const figureWidth = (cents: number) => (cents < 0 ? 1 : 0) + fmtMoney(Math.abs(Math.round(cents / 100))).length;

/* By property drops columns as the screen narrows, so the table never
   scrolls sideways on a phone: Margin and Interest go below sm, Income
   and Opex below 480px, and NOI stays. A hidden cell still counts as the
   row's last child, so NOI sets its own flush edge where it ends the row. */
const fromSm = "max-sm:hidden";
const from480 = "max-[30rem]:hidden";
const noiCol = "max-sm:pr-0";
/* The table's rows are 40px with a mouse and 48 on touch, denser than a record list. */
const dense = "min-h-10 pointer-coarse:min-h-12";

/**
 * The Financials Overview (docs/specs/charts.md, the /financials migration
 * map; choices D1 to D3 A): the period row, the source line, the four
 * headline figures with their comparison, one cleanup line when a check
 * fails, then the month chart beside where operating expense went, then By
 * property. Every figure but the chart covers the period; the chart keeps
 * its own 12 months, and picking a month there changes only its readout.
 */
export default async function FinancialsOverviewPage({ searchParams }: PageProps<"/financials">) {
  // Checked here as well as in the layout: a layout doesn't run for every
  // render of the pages under it (docs/asana-migration-plan.md §5.1).
  await requireUser();
  const sp = await searchParams;
  // ?basis= is a one-off override; without it the basis chosen in Settings applies.
  const data = await getFinancialsOverview({ basis: basisFromParam(sp.basis), period: periodFromParam(sp.period) });

  if (!data) {
    return (
      <EmptyState
        action={
          qbo.isConfigured() ? (
            <a href="/api/quickbooks/connect" className={buttonClass({ variant: "primary" })}>
              Connect QuickBooks
            </a>
          ) : null
        }
      >
        {/* Connecting needs QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI and QBO_TOKEN_SECRET (README). */}
        {qbo.isConfigured() ? "QuickBooks isn't connected yet." : "QuickBooks isn't set up yet."}
      </EmptyState>
    );
  }

  const p = data.portfolio;
  const { span, through } = data.period;
  const basis = data.basis;
  const periodText = periodLabel(span.from, span.to, { through }) ?? "";
  // Every synced line lands in a month, so no months means no lines at all: a first sync
  // that failed or hasn't finished, or an expired connection that never synced.
  const anyLines = data.monthlyTrend.length > 0;
  // a PARTIAL run can still tie on the basis on screen; only say what's off for this one
  const syncNotice =
    data.lastSync?.status === "PARTIAL" ? partialSyncLine(reconcileGap(data.lastSync.reconcileSummary, basis)) : null;
  const review = needsReview(data.dataQuality);
  // The comparison shows under the figures, and its basis in the source line, only when both have something to say.
  const prior = data.hasLines ? (data.prior?.noi ?? null) : null;

  // Read left to right, the strip is DATA-I18's equation: income less expense is NOI, less interest.
  const figures = [p.operatingIncomeCents, p.operatingExpenseCents, p.noiCents, p.noiAfterInterestCents];
  const facts: Fact[] = [
    { label: "Income", cents: p.operatingIncomeCents, before: prior?.operatingIncomeCents },
    { label: "Expense", cents: p.operatingExpenseCents, before: prior?.operatingExpenseCents },
    { label: "NOI", cents: p.noiCents, before: prior?.noiCents },
    {
      label: (
        <>
          {/* "NOI" drops below 360px so the label keeps one line */}
          <span className="max-[22.5rem]:hidden">NOI after interest</span>
          <span className="min-[22.5rem]:hidden">After interest</span>
        </>
      ),
      cents: p.noiAfterInterestCents,
      before: prior?.noiAfterInterestCents,
    },
  ].map((f) => ({
    label: f.label,
    value: <MoneyCents cents={f.cents} />,
    fadeKey: f.cents,
    sub: f.before != null ? changeWords(f.cents, f.before) : undefined,
  }));

  const expenseRows = {
    category: data.expense.category.map((r) => ({ key: r.key, label: CATEGORY_LABELS[r.key] ?? r.key, cents: r.cents })),
    account: data.expense.account.map((r) => ({ key: r.key, label: r.key, cents: r.cents })),
    payee: data.expense.payee.map((r) => ({ key: r.key || "(none)", label: r.key || "No payee", cents: r.cents })),
  };

  return (
    <div className="space-y-8 pointer-coarse:space-y-6">
      <div className="space-y-4">
        <PeriodRow period={data.period.key} basis={basis} />
        {/* The controls above show the basis, so the line leaves it out. */}
        <SourceLine
          span={span}
          through={through}
          comparison={prior ? data.prior?.label : null}
          basis={basis}
          showBasis={false}
          syncedAt={data.lastSync?.at ?? null}
        />

        {data.sandbox && <SandboxNotice />}

        {syncNotice && (
          <Notice icon={<WarnIcon />}>
            {syncNotice} <TextLink href="/financials/settings#cleanup">Review</TextLink>
          </Notice>
        )}

        {data.hasLines ? (
          <FactStrip size={figures.some((c) => figureWidth(c) > 8) ? "m" : "l"} facts={facts} />
        ) : (
          // Four $0 figures would read as a portfolio that earned nothing (section 3: a missing feed is a sentence).
          <p className="text-body text-fg-3">
            {anyLines ? `No QuickBooks lines for ${periodText}.` : "No QuickBooks activity yet."}
          </p>
        )}

        {/* One line, only when a check fails; Settings keeps the whole cleanup list. */}
        {review.length > 0 && (
          <Notice icon={<WarnIcon />}>
            <span className="max-sm:hidden">
              {review.map((item, i) => (
                <span key={item.key}>
                  {i > 0 && " · "}
                  {item.key === "unclassed" ? (
                    `${lines(item.lines)} unclassified`
                  ) : (
                    <>
                      <MoneyCents cents={item.cents} /> in suspense
                    </>
                  )}
                </span>
              ))}
            </span>
            <span className="sm:hidden">
              {review.length} {review.length === 1 ? "item needs" : "items need"} cleanup
            </span>
            {" · "}
            <TextLink href="/financials/settings#cleanup">Review</TextLink>
          </Notice>
        )}
      </div>

      {/* By month on the left, where operating expense went on the right; each card keeps its own height. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <MonthBars
          frame="card"
          size="overview"
          months={data.months}
          runningMonth={data.period.runningMonth}
          through={data.period.syncedThrough}
          historyStart={data.period.historyStart}
          synced={data.lastSync?.at != null}
        />
        <ExpenseCard rows={expenseRows} totalCents={data.hasLines ? p.operatingExpenseCents : null} period={periodText} />
      </div>

      {/* With no lines and no mapped property there's nothing to list; the sentence above says so. */}
      {(data.hasLines || data.byProperty.length > 0) && (
        <Section title="By property">
          <Table className={flushTable}>
            <thead>
              <tr>
                <Th>Property</Th>
                <Th numeric className={from480}>
                  Income
                </Th>
                <Th numeric className={from480}>
                  Opex
                </Th>
                <Th numeric className={noiCol}>
                  NOI
                </Th>
                <Th numeric className={fromSm}>
                  Margin
                </Th>
                <Th numeric className={fromSm}>
                  Interest
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.byProperty.map((row) => {
                const href = `/properties/${row.propertyId}`;
                // a mapped property with no lines shows the dash, not $0
                const money = (cents: number) =>
                  row.hasActivity ? <MoneyCents cents={cents} /> : <span className="text-fg-3">—</span>;
                // "Bought Aug 2026" only when the purchase falls inside the period, so a short row reads why.
                const bought = row.purchaseMonth && inSpan(row.purchaseMonth, span) ? row.purchaseMonth : null;
                return (
                  <tr key={row.propertyId} className="transition-colors duration-fast hover:bg-fill-1">
                    <RowCell href={href} first className={cn(dense, "block py-2.5 pl-0 pointer-coarse:py-3")}>
                      <span className="text-fg-1">{row.address}</span>
                      {!row.hasActivity ? (
                        <span className="whitespace-nowrap text-meta text-fg-3 max-sm:block sm:ml-2">No activity</span>
                      ) : (
                        bought && (
                          <span className="whitespace-nowrap text-meta text-fg-3 max-sm:block sm:ml-2">
                            Bought {fmtMonthYear(bought)}
                          </span>
                        )
                      )}
                    </RowCell>
                    <RowCell href={href} numeric cell={from480} className={dense}>
                      {money(row.noi.operatingIncomeCents)}
                    </RowCell>
                    <RowCell href={href} numeric cell={from480} className={dense}>
                      {money(row.noi.operatingExpenseCents)}
                    </RowCell>
                    <RowCell href={href} numeric className={cn(dense, noiCol)}>
                      {money(row.noi.noiCents)}
                    </RowCell>
                    <RowCell href={href} numeric cell={fromSm} className={cn(dense, "text-fg-2")}>
                      {row.hasActivity && row.noi.noiMargin != null ? (
                        pct(row.noi.noiMargin)
                      ) : (
                        <span className="text-fg-3">—</span>
                      )}
                    </RowCell>
                    <RowCell href={href} numeric cell={fromSm} className={cn(dense, "pr-0 text-fg-2")}>
                      {money(row.noi.debtInterestCents)}
                    </RowCell>
                  </tr>
                );
              })}
              {/* the unassigned remainder and the Portfolio total only mean something once lines exist */}
              {data.hasLines && (
                <tr>
                  <Td className="text-fg-2">
                    Not assigned to a property{" "}
                    <TextLink href="/financials/settings#class-mapping" className="whitespace-nowrap">
                      Map classes
                    </TextLink>
                  </Td>
                  <Td numeric className={cn("text-fg-2", from480)}>
                    <MoneyCents cents={data.unassigned.incomeCents} />
                  </Td>
                  <Td numeric className={cn("text-fg-2", from480)}>
                    <MoneyCents cents={data.unassigned.expenseCents} />
                  </Td>
                  <Td numeric className={cn("text-fg-2", noiCol)}>
                    <MoneyCents cents={data.unassigned.noiCents} />
                  </Td>
                  {/* No margin or interest of its own: the empty-cell dash, as on the rows above. */}
                  <Td numeric className={cn("text-fg-3", fromSm)}>
                    —
                  </Td>
                  <Td numeric className={cn("text-fg-3", fromSm)}>
                    —
                  </Td>
                </tr>
              )}
            </tbody>
            {data.hasLines && (
              <tfoot>
                <tr className={grandTotalRow}>
                  <Td>Portfolio</Td>
                  <Td numeric className={from480}>
                    <MoneyCents cents={p.operatingIncomeCents} />
                  </Td>
                  <Td numeric className={from480}>
                    <MoneyCents cents={p.operatingExpenseCents} />
                  </Td>
                  <Td numeric className={noiCol}>
                    <MoneyCents cents={p.noiCents} />
                  </Td>
                  <Td numeric className={fromSm}>
                    {p.noiMargin == null ? <span className="font-normal text-fg-3">—</span> : pct(p.noiMargin)}
                  </Td>
                  <Td numeric className={fromSm}>
                    <MoneyCents cents={p.debtInterestCents} />
                  </Td>
                </tr>
              </tfoot>
            )}
          </Table>
          {data.hasLines && <p className="mt-3 text-meta text-fg-3">Each row counts only the lines classed to it.</p>}
        </Section>
      )}
    </div>
  );
}

function WarnIcon() {
  return (
    <TriangleAlert
      aria-hidden="true"
      strokeWidth={2}
      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn pointer-coarse:h-4 pointer-coarse:w-4"
    />
  );
}
