import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getConnection } from "@/lib/quickbooks/client";
import { qbo } from "@/lib/quickbooks/config";
import { getFinancialsOverview } from "@/lib/quickbooks/queries";
import type { QboBasis } from "@prisma/client";
import { oauthReturnLine, reconcileGap, reconcileLine } from "@/lib/quickbooks/notices";
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import { fmtDate } from "@/lib/utils";
import { fmtCents } from "../_components/ui";
import { RefreshButton } from "../_components/refresh-button";
import { ClassMappingTable, AccountCategoryTable } from "./tables";
import { BasisToggle, DisconnectButton, OAuthReturnNotice } from "./controls";

export const dynamic = "force-dynamic";

const split = (s: { lineCount: number; inCents: number; outCents: number }) =>
  `${s.lineCount} lines · ${fmtCents(s.inCents)} in · ${fmtCents(s.outCents)} out`;

export default async function FinancialsSettingsPage({
  searchParams,
}: PageProps<"/financials/settings">) {
  await requireUser(); // here as well as in the layout, which doesn't gate every render
  const [conn, sp] = await Promise.all([getConnection(), searchParams]);
  // /api/quickbooks/callback lands here with ?connected=1 or ?error=<code>
  const oauth = oauthReturnLine({ connected: sp.connected, error: sp.error });

  if (!conn || conn.status === "REVOKED") {
    return (
      <Card>
        <CardBody className="space-y-3">
          {/* the Connect button below is the retry */}
          {oauth && <OAuthReturnNotice tone={oauth.tone} text={oauth.text} retryHref={null} />}
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
              Set the <code>QBO_*</code> environment variables to connect QuickBooks.
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
          {oauth && (
            <OAuthReturnNotice
              tone={oauth.tone}
              text={oauth.text}
              retryHref={oauth.retry && qbo.isConfigured() ? "/api/quickbooks/connect" : null}
            />
          )}
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

      {dq && overview && (
        <Card id="cleanup">
          <CardHeader>
            <CardTitle>QuickBooks cleanup list</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1.5 text-sm">
            <DqRow
              label="Unclassified lines"
              value={split(dq.unclassed)}
              bad={
                Math.abs(dq.unclassed.inCents) + Math.abs(dq.unclassed.outCents) > 50_000 ||
                dq.unclassed.lineCount > 3
              }
              note="assign a class in QuickBooks"
            />
            <DqRow
              label="Suspense / clearing balance"
              value={fmtCents(dq.suspenseCents)}
              bad={dq.suspenseCents !== 0}
              note="left out of income until the bookkeeper reclasses it to an escrow or asset account"
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
            {/* the same figure as the Overview's "Not assigned to a property" row */}
            <DqRow
              label="Not assigned to a property"
              value={`${fmtCents(overview.unassigned.incomeCents)} in · ${fmtCents(overview.unassigned.expenseCents)} out`}
              bad={false}
              note="map classes below"
            />
            {dq.ignored.lineCount > 0 && (
              <DqRow
                label="Ignored classes"
                value={split(dq.ignored)}
                bad={false}
                note="left out of every total"
              />
            )}
            <DqRow
              label="Owner-funded rent (P2P)"
              value={fmtCents(dq.ownerFundedCents)}
              bad={dq.ownerFundedCents !== 0}
              note="owner money booked to Rents, left out of NOI and collected rent"
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
            {lastRun?.stats != null && <ReconSummary stats={lastRun.stats} basis={conn.accountingMethod} />}
          </CardBody>
        </Card>
      )}

      <Card id="class-mapping" className="overflow-hidden">
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

      <Card id="account-categories" className="overflow-hidden">
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
      {note && <span className="text-[11px] text-muted">{note}</span>}
    </div>
  );
}

/**
 * The basis these figures are on comes first. The other basis shows only when
 * it doesn't tie, so a ?basis= override banner on the Overview is explained too.
 */
function ReconSummary({ stats, basis }: { stats: unknown; basis: QboBasis }) {
  const recon =
    typeof stats === "object" && stats ? (stats as Record<string, unknown>).reconciliation : undefined;
  const other: QboBasis = basis === "CASH" ? "ACCRUAL" : "CASH";
  const lines = [
    reconcileLine(recon, basis),
    reconcileGap(recon, other).kind === "ok" ? null : reconcileLine(recon, other),
  ].filter((l): l is string => l != null);
  return lines.map((line) => (
    <div key={line} className="pt-1 text-[11px] text-muted">
      {line}
    </div>
  ));
}
