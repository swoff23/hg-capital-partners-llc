import { TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { buttonClass, Card, CardBody, CardHeader, EmptyState, Section, Table, Td, Th, TextLink } from "@/components/ui";
import { getFinancialsOverview } from "@/lib/quickbooks/queries";
import { qbo } from "@/lib/quickbooks/config";
import { partialSyncLine, reconcileGap } from "@/lib/quickbooks/notices";
import { basisFromParam } from "@/lib/quickbooks/rollup";
import { todayYmdEastern } from "@/lib/dates";
import { cn, fmtDate } from "@/lib/utils";
import { CATEGORY_LABELS } from "./_components/labels";
import { periodOf } from "./_components/period";
import {
  flushTable,
  grandTotalRow,
  IncomeExpenseBars,
  Kpi,
  MoneyBars,
  MoneyCents,
  Notice,
  PartialLabel,
  SandboxNotice,
  SourceLine,
  Strip,
  WarnMark,
} from "./_components/ui";
import { RefreshButton } from "./_components/refresh-button";

export const dynamic = "force-dynamic";

function pct(n: number | null): string {
  return n == null ? "—" : `${(n * 100).toFixed(1)}%`;
}

const lines = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "line" : "lines"}`;

/* By property drops columns as the screen narrows, so the table never
   scrolls sideways on a phone: Margin and Debt interest go below sm, Income
   and Opex below 480px, and NOI stays. A hidden cell still counts as the
   row's last child, so NOI sets its own flush edge where it ends the row. */
const fromSm = "max-sm:hidden";
const from480 = "max-[30rem]:hidden";
const noiCol = "max-sm:pr-0";

export default async function FinancialsOverviewPage({
  searchParams,
}: PageProps<"/financials">) {
  // Checked here as well as in the layout: a layout doesn't run for every
  // render of the pages under it (docs/asana-migration-plan.md §5.1).
  await requireUser();
  const sp = await searchParams;
  // ?basis= is a one-off override; without it the basis chosen in Settings applies
  const data = await getFinancialsOverview(basisFromParam(sp.basis));

  if (!data) {
    return (
      <EmptyState
        action={
          qbo.isConfigured() ? (
            <a href="/api/quickbooks/connect" className={buttonClass({ variant: "primary" })}>
              Connect QuickBooks
            </a>
          ) : (
            <p className="text-body text-fg-3">
              Set <code className="font-mono text-code text-fg-2">QBO_CLIENT_ID</code> /{" "}
              <code className="font-mono text-code text-fg-2">QBO_CLIENT_SECRET</code> /{" "}
              <code className="font-mono text-code text-fg-2">QBO_REDIRECT_URI</code> /{" "}
              <code className="font-mono text-code text-fg-2">QBO_TOKEN_SECRET</code> to enable the connection.
            </p>
          )
        }
      >
        QuickBooks isn&apos;t connected yet.
      </EmptyState>
    );
  }

  const p = data.portfolio;
  const dq = data.dataQuality;
  const basis = data.basis;
  const other = basis === "CASH" ? "accrual" : "cash";
  const thisYear = Number(todayYmdEastern().slice(0, 4));
  // The totals add up every synced line, so the period is the span of months with lines.
  const period = periodOf(data.monthlyTrend.map((m) => m.periodMonth));
  // a PARTIAL run can still tie on the basis on screen; only say what's off for this one
  const syncNotice =
    data.lastSync?.status === "PARTIAL"
      ? partialSyncLine(
          reconcileGap(data.lastSync.reconcileSummary, basis),
          fmtDate(data.lastSync.runAt ?? data.lastSync.at),
        )
      : null;

  return (
    <div className="space-y-8 pointer-coarse:space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SourceLine
            period={period}
            basis={basis}
            syncedAt={data.lastSync?.at ?? null}
            status={syncNotice ? data.lastSync?.status : null}
          />
          <div className="flex shrink-0 items-center gap-3">
            <TextLink
              href={`/financials?basis=${other}`}
              className="inline-flex items-center whitespace-nowrap text-meta pointer-coarse:min-h-11"
              prefetch={false}
            >
              Show {other} basis
            </TextLink>
            <RefreshButton />
          </div>
        </div>

        {data.sandbox && <SandboxNotice />}

        {syncNotice && (
          <Notice
            icon={
              <TriangleAlert
                aria-hidden="true"
                strokeWidth={2}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn pointer-coarse:h-4 pointer-coarse:w-4"
              />
            }
          >
            {syncNotice} <TextLink href="/financials/settings#cleanup">Review</TextLink>
          </Notice>
        )}

        <Strip className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Operating income" cents={p.operatingIncomeCents} />
          <Kpi label="Operating expense" cents={p.operatingExpenseCents} />
          <Kpi
            label="NOI"
            cents={p.noiCents}
            hint={p.noiMargin == null ? undefined : `${pct(p.noiMargin)} margin`}
          />
          <Kpi label="Debt interest" cents={p.debtInterestCents} />
          <Kpi label="NOI after interest" cents={p.noiAfterInterestCents} />
          <Kpi
            label={
              <>
                {/* "(memo)" drops at 320 so the label keeps one line */}
                Bank interest<span className="max-[22.5rem]:hidden"> (memo)</span>
              </>
            }
            cents={p.nonOperatingIncomeCents}
          />
        </Strip>

        {dq && (
          <Strip className="md:grid-cols-3">
            <DqStat
              label="Unclassified in QuickBooks"
              value={lines(dq.unclassed.lineCount)}
              sub={
                <>
                  <MoneyCents cents={dq.unclassed.inCents} /> in · <MoneyCents cents={dq.unclassed.outCents} /> out
                </>
              }
              bad={
                Math.abs(dq.unclassed.inCents) + Math.abs(dq.unclassed.outCents) > 50_000 ||
                dq.unclassed.lineCount > 3
              }
            />
            <DqStat
              label="Suspense / clearing (excluded)"
              value={<MoneyCents cents={dq.suspenseCents} />}
              sub="Not counted as income"
              bad={dq.suspenseCents !== 0}
            />
            {/* the same figure as the By property row below, computed once in queries.ts */}
            <DqStat
              label="Not assigned to a property"
              value={<MoneyCents cents={data.unassigned.noiCents} />}
              sub={
                <>
                  <MoneyCents cents={data.unassigned.incomeCents} /> in ·{" "}
                  <MoneyCents cents={data.unassigned.expenseCents} /> out
                </>
              }
              bad={false}
            />
          </Strip>
        )}
      </div>

      {/* Overview modules: flat cards (docs/brand-guidelines.md, section 9). */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-section text-fg-1">Operating expense by category</h2>
          </CardHeader>
          <CardBody>
            <MoneyBars
              rows={Object.entries(p.expenseByCategoryCents)
                .map(([c, cents]) => ({ label: CATEGORY_LABELS[c] ?? c, cents: cents ?? 0 }))
                .sort((a, b) => b.cents - a.cents)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-section text-fg-1">Monthly income vs expense</h2>
          </CardHeader>
          <CardBody>
            <IncomeExpenseBars months={data.monthlyTrend} thisYear={thisYear} />
          </CardBody>
        </Card>
      </div>

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
                Debt int.
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.byProperty.map((row) => {
              // a mapped property with no lines shows the dash, not $0
              const money = (cents: number) =>
                row.hasActivity ? <MoneyCents cents={cents} /> : <span className="text-fg-3">—</span>;
              return (
                <tr key={row.propertyId} className="hover:bg-fill-1">
                  <Td>
                    <TextLink href={`/properties/${row.propertyId}`}>{row.address}</TextLink>
                    {row.hasActivity ? (
                      <PartialLabel months={row.noi.monthsOfData} className="max-sm:block sm:ml-2" />
                    ) : (
                      <span className="whitespace-nowrap text-meta text-fg-3 max-sm:block sm:ml-2">No activity</span>
                    )}
                  </Td>
                  <Td numeric className={from480}>
                    {money(row.noi.operatingIncomeCents)}
                  </Td>
                  <Td numeric className={from480}>
                    {money(row.noi.operatingExpenseCents)}
                  </Td>
                  <Td numeric className={noiCol}>
                    {money(row.noi.noiCents)}
                  </Td>
                  <Td numeric className={cn("text-fg-2", fromSm)}>
                    {row.hasActivity && row.noi.noiMargin != null ? (
                      pct(row.noi.noiMargin)
                    ) : (
                      <span className="text-fg-3">—</span>
                    )}
                  </Td>
                  <Td numeric className={cn("text-fg-2", fromSm)}>
                    {money(row.noi.debtInterestCents)}
                  </Td>
                </tr>
              );
            })}
            <tr className="hover:bg-fill-1">
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
              <Td className={fromSm} />
              <Td className={fromSm} />
            </tr>
          </tbody>
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
        </Table>
        <p className="mt-3 text-meta text-fg-3">
          Per-property figures use directly-classed lines only. Portfolio NOI is the sum of the rows above.
        </p>
      </Section>
    </div>
  );
}

/** One data-quality figure in the strip. A figure that needs a look leads with the warn mark. */
function DqStat({
  label,
  value,
  sub,
  bad,
}: {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  bad: boolean;
}) {
  return (
    <div>
      <p className="text-meta">
        {bad ? <WarnMark>{label}</WarnMark> : <span className="text-fg-3">{label}</span>}
      </p>
      <p className="text-figure-m text-fg-1">{value}</p>
      <p className="text-meta text-fg-3">{sub}</p>
    </div>
  );
}
