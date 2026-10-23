import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Card, CardBody, CardHeader, CardTitle, EmptyState, Table, Td, Th, TextLink } from "@/components/ui";
import { getFinancialsOverview } from "@/lib/quickbooks/queries";
import { qbo } from "@/lib/quickbooks/config";
import { partialSyncLine, reconcileGap } from "@/lib/quickbooks/notices";
import { basisFromParam } from "@/lib/quickbooks/rollup";
import { fmtDate } from "@/lib/utils";
import { CATEGORY_LABELS } from "./_components/labels";
import { fmtCents, Kpi, MoneyBars, PartialLabel, SandboxNotice, SourceBadge } from "./_components/ui";
import { RefreshButton } from "./_components/refresh-button";

export const dynamic = "force-dynamic";

function pct(n: number | null): string {
  return n == null ? "—" : `${(n * 100).toFixed(1)}%`;
}

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
      <Card>
        <CardBody className="space-y-3">
          <EmptyState>QuickBooks isn&apos;t connected yet.</EmptyState>
          {qbo.isConfigured() ? (
            <a
              href="/api/quickbooks/connect"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Connect QuickBooks
            </a>
          ) : (
            <p className="text-sm text-muted">
              Set <code>QBO_CLIENT_ID</code> / <code>QBO_CLIENT_SECRET</code> /{" "}
              <code>QBO_REDIRECT_URI</code> / <code>QBO_TOKEN_SECRET</code> to enable the connection.
            </p>
          )}
        </CardBody>
      </Card>
    );
  }

  const p = data.portfolio;
  const dq = data.dataQuality;
  const basis = data.basis;
  const other = basis === "CASH" ? "accrual" : "cash";
  // a PARTIAL run can still tie on the basis on screen; only say what's off for this one
  const syncNotice =
    data.lastSync?.status === "PARTIAL"
      ? partialSyncLine(
          reconcileGap(data.lastSync.reconcileSummary, basis),
          fmtDate(data.lastSync.runAt ?? data.lastSync.at),
        )
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SourceBadge
          basis={basis}
          syncedAt={data.lastSync?.at ?? null}
          status={syncNotice ? data.lastSync?.status : null}
        />
        <div className="flex items-center gap-2">
          <TextLink href={`/financials?basis=${other}`} className="text-xs" prefetch={false}>
            Show {other} basis
          </TextLink>
          <RefreshButton />
        </div>
      </div>

      {data.sandbox && <SandboxNotice />}

      {syncNotice && (
        <div className="rounded-lg border border-amber-300 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:text-amber-500">
          {syncNotice}{" "}
          <Link href="/financials/settings#cleanup" className="underline">
            Review
          </Link>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Operating income" cents={p.operatingIncomeCents} months={p.monthsOfData} strong />
        <Kpi label="Operating expense" cents={p.operatingExpenseCents} months={p.monthsOfData} strong />
        <Kpi label="NOI" cents={p.noiCents} months={p.monthsOfData} hint={pct(p.noiMargin)} strong />
        <Kpi label="Debt interest" cents={p.debtInterestCents} months={p.monthsOfData} />
        <Kpi label="NOI after interest" cents={p.noiAfterInterestCents} months={p.monthsOfData} strong />
        <Kpi label="Bank interest (memo)" cents={p.nonOperatingIncomeCents} />
      </div>

      {dq && (
        <div className="grid gap-2 sm:grid-cols-3">
          <DqStat
            label="Unclassified in QuickBooks"
            value={`${dq.unclassed.lineCount} lines`}
            sub={`${fmtCents(dq.unclassed.inCents)} in · ${fmtCents(dq.unclassed.outCents)} out`}
            bad={
              Math.abs(dq.unclassed.inCents) + Math.abs(dq.unclassed.outCents) > 50_000 ||
              dq.unclassed.lineCount > 3
            }
          />
          <DqStat
            label="Suspense / clearing (excluded)"
            value={fmtCents(dq.suspenseCents)}
            sub="not counted as income"
            bad={dq.suspenseCents !== 0}
          />
          {/* the same figure as the By property row below, computed once in queries.ts */}
          <DqStat
            label="Not assigned to a property"
            value={fmtCents(data.unassigned.noiCents)}
            sub={`${fmtCents(data.unassigned.incomeCents)} in · ${fmtCents(data.unassigned.expenseCents)} out`}
            bad={false}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Operating expense by category</CardTitle>
          </CardHeader>
          <CardBody>
            <MoneyBars
              rows={Object.entries(p.expenseByCategoryCents).map(([c, cents]) => ({
                label: CATEGORY_LABELS[c] ?? c,
                cents: cents ?? 0,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly income vs expense</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1.5">
            {data.monthlyTrend.map((m) => {
              const max = Math.max(
                ...data.monthlyTrend.flatMap((x) => [x.incomeCents, x.expenseCents]),
                1,
              );
              return (
                <div key={m.periodMonth} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 tabular-nums text-muted">{m.periodMonth}</span>
                  <div className="flex-1 space-y-0.5">
                    <span className="block h-2.5 overflow-hidden rounded bg-background">
                      <span
                        className="block h-full rounded bg-chart-1/60"
                        style={{ width: `${(m.incomeCents / max) * 100}%` }}
                      />
                    </span>
                    <span className="block h-2.5 overflow-hidden rounded bg-background">
                      <span
                        className="block h-full rounded bg-amber-500/60"
                        style={{ width: `${(m.expenseCents / max) * 100}%` }}
                      />
                    </span>
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums">{fmtCents(m.noiCents)}</span>
                </div>
              );
            })}
            <p className="pt-1 text-[11px] text-muted">
              <span className="inline-block h-2 w-2 rounded-sm bg-chart-1/60 align-middle" /> income
              &nbsp;·&nbsp;
              <span className="inline-block h-2 w-2 rounded-sm bg-amber-500/60 align-middle" /> expense
              &nbsp;·&nbsp; right column = NOI
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>By property</CardTitle>
        </CardHeader>
        <Table>
          <thead>
            <tr>
              <Th>Property</Th>
              <Th>Income</Th>
              <Th>Opex</Th>
              <Th>NOI</Th>
              <Th>Margin</Th>
              <Th>Debt int.</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.byProperty.map((row) => {
              // a mapped property with no lines shows "—", not $0
              const money = (cents: number) => (row.hasActivity ? fmtCents(cents) : "—");
              return (
                <tr key={row.propertyId} className="hover:bg-background">
                  <Td>
                    <Link href={`/properties/${row.propertyId}`} className="font-medium hover:underline">
                      {row.address}
                    </Link>
                    {row.hasActivity ? (
                      <PartialLabel months={row.noi.monthsOfData} />
                    ) : (
                      <span className="ml-1 text-[11px] font-normal text-muted">No activity</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">{money(row.noi.operatingIncomeCents)}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{money(row.noi.operatingExpenseCents)}</Td>
                  <Td className="whitespace-nowrap tabular-nums font-medium">{money(row.noi.noiCents)}</Td>
                  <Td className="whitespace-nowrap tabular-nums text-muted">{pct(row.noi.noiMargin)}</Td>
                  <Td className="whitespace-nowrap tabular-nums text-muted">{money(row.noi.debtInterestCents)}</Td>
                </tr>
              );
            })}
            <tr className="bg-background/50 text-muted">
              <Td className="italic">
                Not assigned to a property{" "}
                <TextLink href="/financials/settings#class-mapping">Map classes</TextLink>
              </Td>
              <Td className="whitespace-nowrap tabular-nums">{fmtCents(data.unassigned.incomeCents)}</Td>
              <Td className="whitespace-nowrap tabular-nums">{fmtCents(data.unassigned.expenseCents)}</Td>
              <Td className="whitespace-nowrap tabular-nums">{fmtCents(data.unassigned.noiCents)}</Td>
              <Td />
              <Td />
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <Td>Portfolio</Td>
              <Td className="whitespace-nowrap tabular-nums">{fmtCents(p.operatingIncomeCents)}</Td>
              <Td className="whitespace-nowrap tabular-nums">{fmtCents(p.operatingExpenseCents)}</Td>
              <Td className="whitespace-nowrap tabular-nums">{fmtCents(p.noiCents)}</Td>
              <Td className="whitespace-nowrap tabular-nums">{pct(p.noiMargin)}</Td>
              <Td className="whitespace-nowrap tabular-nums">{fmtCents(p.debtInterestCents)}</Td>
            </tr>
          </tfoot>
        </Table>
        <CardBody className="border-t border-border text-[11px] text-muted">
          Per-property figures use directly-classed lines only. Portfolio NOI is the sum of the rows
          above.
        </CardBody>
      </Card>
    </div>
  );
}

function DqStat({
  label,
  value,
  sub,
  bad,
}: {
  label: string;
  value: string;
  sub: string;
  bad: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border px-3 py-2 text-sm " +
        (bad
          ? "border-amber-300 bg-amber-500/10 dark:border-amber-900"
          : "border-border bg-background")
      }
    >
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 font-medium tabular-nums">{value}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}
