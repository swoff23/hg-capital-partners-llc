import Link from "next/link";
import type { QboBasis } from "@prisma/client";
import { Card, CardBody, CardHeader, CardTitle, EmptyState, Table, Td, Th } from "@/components/ui";
import { getFinancialsOverview } from "@/lib/quickbooks/queries";
import { qbo } from "@/lib/quickbooks/config";
import { CATEGORY_LABELS } from "./_components/labels";
import { fmtCents, Kpi, MoneyBars, PartialLabel, SourceBadge } from "./_components/ui";
import { RefreshButton } from "./_components/refresh-button";

export const dynamic = "force-dynamic";

function pct(n: number | null): string {
  return n == null ? "—" : `${(n * 100).toFixed(1)}%`;
}

export default async function FinancialsOverviewPage({
  searchParams,
}: PageProps<"/financials">) {
  const sp = await searchParams;
  const basis: QboBasis = sp.basis === "accrual" ? "ACCRUAL" : "CASH";
  const data = await getFinancialsOverview(basis);

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
  const other = basis === "CASH" ? "accrual" : "cash";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SourceBadge basis={basis} syncedAt={data.lastSync?.at ?? null} status={data.lastSync?.status} />
        <div className="flex items-center gap-2">
          <Link
            href={`/financials?basis=${other}`}
            className="text-xs text-primary hover:underline"
            prefetch={false}
          >
            Show {other} basis
          </Link>
          <RefreshButton />
        </div>
      </div>

      {data.lastSync?.status === "PARTIAL" && (
        <div className="rounded-lg border border-amber-300 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:text-amber-500">
          Last sync didn&apos;t reconcile to the cent — figures may be mid-update. See{" "}
          <Link href="/financials/settings" className="underline">
            Settings
          </Link>{" "}
          for the details.
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Operating income" cents={p.operatingIncomeCents} months={p.monthsOfData} strong />
        <Kpi label="Operating expense" cents={p.operatingExpenseCents} months={p.monthsOfData} strong />
        <Kpi label="NOI" cents={p.noiCents} months={p.monthsOfData} hint={pct(p.noiMargin)} strong />
        <Kpi label="Debt interest" cents={p.debtInterestCents} months={p.monthsOfData} />
        <Kpi
          label="Cash flow after debt"
          cents={p.cashFlowAfterDebtCents}
          months={p.monthsOfData}
          hint="principal & CapEx are balance-sheet, not here"
          strong
        />
        <Kpi label="Bank interest (memo)" cents={p.nonOperatingIncomeCents} />
      </div>

      {dq && (
        <div className="grid gap-2 sm:grid-cols-3">
          <DqStat
            label="Unclassified in QuickBooks"
            cents={dq.unclassed.cents}
            sub={`${dq.unclassed.lineCount} lines`}
            bad={Math.abs(dq.unclassed.cents) > 50_000 || dq.unclassed.lineCount > 3}
          />
          <DqStat
            label="Suspense / clearing (excluded)"
            cents={dq.suspenseCents}
            sub="not counted as income"
            bad={dq.suspenseCents !== 0}
          />
          <DqStat
            label="Unattributed (entity / no-class)"
            cents={dq.unattributed.netCents}
            sub="real cost, no property"
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
                        className="block h-full rounded bg-primary/60"
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
              <span className="inline-block h-2 w-2 rounded-sm bg-primary/60 align-middle" /> income
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
            {data.byProperty.map((row) => (
              <tr key={row.propertyId} className="hover:bg-background">
                <Td>
                  <Link href={`/properties/${row.propertyId}`} className="font-medium hover:underline">
                    {row.address}
                  </Link>
                  <PartialLabel months={row.noi.monthsOfData} />
                </Td>
                <Td className="tabular-nums">{fmtCents(row.noi.operatingIncomeCents)}</Td>
                <Td className="tabular-nums">{fmtCents(row.noi.operatingExpenseCents)}</Td>
                <Td className="tabular-nums font-medium">{fmtCents(row.noi.noiCents)}</Td>
                <Td className="tabular-nums text-muted">{pct(row.noi.noiMargin)}</Td>
                <Td className="tabular-nums text-muted">{fmtCents(row.noi.debtInterestCents)}</Td>
              </tr>
            ))}
            <tr className="bg-background/50 text-muted">
              <Td className="italic">
                Unattributed (entity / overhead / no class) —{" "}
                <Link href="/financials/settings" className="text-primary hover:underline">
                  review
                </Link>
              </Td>
              <Td className="tabular-nums">{fmtCents(data.unattributed.incomeCents)}</Td>
              <Td className="tabular-nums">{fmtCents(data.unattributed.expenseCents)}</Td>
              <Td className="tabular-nums">{fmtCents(data.unattributed.noiCents)}</Td>
              <Td />
              <Td />
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <Td>Portfolio</Td>
              <Td className="tabular-nums">{fmtCents(p.operatingIncomeCents)}</Td>
              <Td className="tabular-nums">{fmtCents(p.operatingExpenseCents)}</Td>
              <Td className="tabular-nums">{fmtCents(p.noiCents)}</Td>
              <Td className="tabular-nums">{pct(p.noiMargin)}</Td>
              <Td className="tabular-nums">{fmtCents(p.debtInterestCents)}</Td>
            </tr>
          </tfoot>
        </Table>
        <CardBody className="border-t border-border text-[11px] text-muted">
          Per-property figures use directly-classed lines only. Portfolio NOI = Σ per-property NOI +
          unattributed.
        </CardBody>
      </Card>
    </div>
  );
}

function DqStat({
  label,
  cents,
  sub,
  bad,
}: {
  label: string;
  cents: number;
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
      <div className="mt-0.5 font-medium tabular-nums">{fmtCents(cents)}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}
