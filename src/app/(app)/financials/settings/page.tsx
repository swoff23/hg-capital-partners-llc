import Link from "next/link";
import { prisma } from "@/lib/db";
import { getConnection } from "@/lib/quickbooks/client";
import { qbo } from "@/lib/quickbooks/config";
import { getFinancialsOverview } from "@/lib/quickbooks/queries";
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import { fmtDate } from "@/lib/utils";
import { fmtCents } from "../_components/ui";
import { RefreshButton } from "../_components/refresh-button";
import { ClassMappingTable, AccountCategoryTable } from "./tables";
import { BasisToggle, DisconnectButton } from "./controls";

export const dynamic = "force-dynamic";

export default async function FinancialsSettingsPage() {
  const conn = await getConnection();

  if (!conn || conn.status === "REVOKED") {
    return (
      <Card>
        <CardBody className="space-y-3">
          <EmptyState>QuickBooks isn&apos;t connected.</EmptyState>
          {qbo.isConfigured() ? (
            <a
              href="/api/quickbooks/connect"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Connect QuickBooks
            </a>
          ) : (
            <p className="text-sm text-muted">
              Not configured — set the <code>QBO_*</code> environment variables first.
            </p>
          )}
        </CardBody>
      </Card>
    );
  }

  const [classes, accounts, entities, properties, lastRun, overview] = await Promise.all([
    prisma.qboClass.findMany({
      where: { realmId: conn.realmId },
      include: { property: { select: { address: true } } },
      orderBy: { fullyQualifiedName: "asc" },
    }),
    prisma.qboAccount.findMany({
      where: { realmId: conn.realmId },
      orderBy: [{ acctType: "asc" }, { fullyQualifiedName: "asc" }],
    }),
    prisma.qboEntity.findMany({ where: { realmId: conn.realmId }, orderBy: { sortOrder: "asc" } }),
    prisma.property.findMany({ select: { id: true, address: true }, orderBy: { address: "asc" } }),
    prisma.qboSyncRun.findFirst({
      where: { realmId: conn.realmId },
      orderBy: { startedAt: "desc" },
    }),
    getFinancialsOverview(conn.accountingMethod),
  ]);

  const dq = overview?.dataQuality ?? null;
  const rank = { UNMAPPED: 0, PROPERTY: 1, OVERHEAD: 2, ENTITY: 3, IGNORE: 4 } as const;
  const sortedClasses = [...classes].sort(
    (a, b) =>
      (a.autoMatched ? 0.5 : 0) + rank[a.role] - ((b.autoMatched ? 0.5 : 0) + rank[b.role]) ||
      a.fullyQualifiedName.localeCompare(b.fullyQualifiedName),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Connection</CardTitle>
          <RefreshButton />
        </CardHeader>
        <CardBody className="space-y-2 text-sm">
          <Row label="Status">
            <Badge tone={conn.status === "ACTIVE" ? "green" : "red"}>{conn.status}</Badge>
            {conn.status === "EXPIRED" && (
              <a href="/api/quickbooks/connect" className="ml-2 text-primary hover:underline">
                Reconnect
              </a>
            )}
          </Row>
          <Row label="Company">{conn.companyName ?? conn.realmId}</Row>
          <Row label="Environment">{conn.environment}</Row>
          <Row label="Basis">
            <BasisToggle current={conn.accountingMethod} />
          </Row>
          <Row label="Last successful sync">
            {conn.lastSuccessfulSyncAt ? fmtDate(conn.lastSuccessfulSyncAt) : "never"}
            {lastRun && <span className="ml-2 text-xs text-muted">({lastRun.status})</span>}
          </Row>
          <Row label="Reconnect before">
            {conn.refreshTokenExpiresAt ? fmtDate(conn.refreshTokenExpiresAt) : "—"}
          </Row>
          <Row label="History from">{conn.historyStart}</Row>
          <div className="pt-2">
            <DisconnectButton />
          </div>
        </CardBody>
      </Card>

      {dq && (
        <Card>
          <CardHeader>
            <CardTitle>Data quality — a QuickBooks cleanup punch list</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1.5 text-sm">
            <DqRow
              label="Unclassified lines"
              value={`${fmtCents(dq.unclassed.cents)} · ${dq.unclassed.lineCount} lines`}
              bad={Math.abs(dq.unclassed.cents) > 50_000 || dq.unclassed.lineCount > 3}
              note="assign a class in QuickBooks"
            />
            <DqRow
              label="Suspense / clearing balance"
              value={fmtCents(dq.suspenseCents)}
              bad={dq.suspenseCents !== 0}
              note="excluded from income — ask the bookkeeper to reclass to an escrow/asset account"
            />
            <DqRow
              label="Uncategorized Expense"
              value={fmtCents(dq.uncategorizedCents)}
              bad={dq.uncategorizedCents !== 0}
            />
            <DqRow
              label="Negative reclass lines this period"
              value={`${fmtCents(dq.negativeReclass.grossCents)} · ${dq.negativeReclass.lineCount} lines`}
              bad={dq.negativeReclass.lineCount > 5}
            />
            <DqRow
              label="Unattributed (entity / General / no class)"
              value={`${fmtCents(dq.unattributed.netCents)} net · +${fmtCents(dq.unattributed.incomeCents)} / −${fmtCents(dq.unattributed.expenseCents)}`}
              bad={false}
              note="real cost, not attributable to a property"
            />
            <DqRow
              label="Owner-funded rent (P2P)"
              value={fmtCents(dq.ownerFundedCents)}
              bad={dq.ownerFundedCents !== 0}
              note="booked to Rents but owner-sourced — excluded from NOI & collected rent"
            />
            <DqRow
              label="Section-8 / voucher rent"
              value={fmtCents(dq.subsidyCents)}
              bad={false}
              note="counted as collected rent, tagged"
            />
            <DqRow
              label="Cash vs accrual net income"
              value={fmtCents(dq.cashVsAccrualNetIncomeDeltaCents)}
              bad={Math.abs(dq.cashVsAccrualNetIncomeDeltaCents) > 10_000}
            />
            {dq.unmappedPropertyLikeClasses.length > 0 && (
              <DqRow
                label="⚠ Unmapped classes that look like a property"
                value={dq.unmappedPropertyLikeClasses.map((c) => c.fullyQualifiedName).join(", ")}
                bad
                note="map these below or that property's income is dropped"
              />
            )}
            {lastRun?.stats != null && <ReconSummary stats={lastRun.stats} />}
          </CardBody>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Class → property mapping</CardTitle>
        </CardHeader>
        <ClassMappingTable
          classes={sortedClasses.map((c) => ({
            id: c.id,
            fqn: c.fullyQualifiedName,
            role: c.role,
            propertyId: c.propertyId,
            entityId: c.entityId,
            autoMatched: c.autoMatched,
            note: c.autoMatchNote,
          }))}
          properties={properties}
          entities={entities.map((e) => ({ id: e.id, name: e.name }))}
        />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Account categories</CardTitle>
        </CardHeader>
        <AccountCategoryTable
          accounts={accounts.map((a) => ({
            id: a.id,
            fqn: a.fullyQualifiedName,
            acctType: a.acctType,
            classification: a.classification,
            category: a.category,
            locked: a.categoryLocked,
          }))}
        />
      </Card>

      <p className="text-xs text-muted">
        Reconciliation target: our numbers tie to QuickBooks&apos; own{" "}
        <Link
          href="https://qbo.intuit.com"
          className="text-primary hover:underline"
          target="_blank"
        >
          Profit &amp; Loss by Class
        </Link>{" "}
        report. Independent check: per-property rent vs the old rent spreadsheet.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-40 shrink-0 text-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function DqRow({
  label,
  value,
  bad,
  note,
}: {
  label: string;
  value: string;
  bad: boolean;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={"w-64 shrink-0 " + (bad ? "text-amber-700 dark:text-amber-500" : "text-muted")}>
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
      {note && <span className="text-[11px] text-muted">— {note}</span>}
    </div>
  );
}

function ReconSummary({ stats }: { stats: unknown }) {
  const recon =
    typeof stats === "object" && stats
      ? ((stats as Record<string, unknown>).reconciliation as Record<string, unknown> | undefined)
      : undefined;
  const cash = recon?.CASH as
    | { sumToWhole?: { ok?: boolean; deltaCents?: number }; noiVsQbo?: { ok?: boolean; residualCents?: number }; cellMismatches?: unknown[] }
    | undefined;
  if (!cash) return null;
  return (
    <div className="pt-1 text-[11px] text-muted">
      Cash reconciliation: sum-to-whole {cash.sumToWhole?.ok ? "✓" : `off by ${fmtCents(cash.sumToWhole?.deltaCents ?? 0)}`}
      {" · "}NOI vs QBO {cash.noiVsQbo?.ok ? "✓" : `off by ${fmtCents(cash.noiVsQbo?.residualCents ?? 0)}`}
      {" · "}
      {(cash.cellMismatches?.length ?? 0) === 0 ? "no cell mismatches" : `${cash.cellMismatches?.length} cell mismatches`}
    </div>
  );
}
