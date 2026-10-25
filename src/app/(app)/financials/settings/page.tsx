import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getConnection } from "@/lib/quickbooks/client";
import { qbo } from "@/lib/quickbooks/config";
import { getFinancialsOverview } from "@/lib/quickbooks/queries";
import type { QboBasis } from "@prisma/client";
import { oauthReturnLine, reconcileGap, reconcileLine } from "@/lib/quickbooks/notices";
import { Badge, buttonClass, EmptyState, Section, TextLink, textLinkClass } from "@/components/ui";
import { Code } from "@/components/code";
import { fmtDate } from "@/lib/utils";
import { periodLabel, periodOf } from "../_components/period";
import { MoneyCents, SourceLine, WarnMark } from "../_components/ui";
import { RefreshButton } from "../_components/refresh-button";
import { ClassMappingTable, AccountCategoryTable } from "./tables";
import { BasisToggle, DisconnectButton, OAuthReturnNotice } from "./controls";

export const dynamic = "force-dynamic";

const lines = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "line" : "lines"}`;

const split = (s: { lineCount: number; inCents: number; outCents: number }) => (
  <>
    {lines(s.lineCount)} · <MoneyCents cents={s.inCents} /> in · <MoneyCents cents={s.outCents} /> out
  </>
);

/** The latest run's status as a word; a failed run reads in --danger. */
const RUN_WORD: Record<string, string> = {
  RUNNING: "Running",
  SUCCESS: "Success",
  PARTIAL: "Partial",
  FAILED: "Failed",
};

const dash = <span className="text-fg-3">—</span>;

/* A section a link can land on (the Overview's Review, Map classes): it
   stops clear of the fixed app bar instead of under it. */
const anchor = "scroll-mt-[calc(var(--app-bar-h)+1rem)]";

export default async function FinancialsSettingsPage({
  searchParams,
}: PageProps<"/financials/settings">) {
  await requireUser(); // here as well as in the layout, which doesn't gate every render
  const [conn, sp] = await Promise.all([getConnection(), searchParams]);
  // /api/quickbooks/callback lands here with ?connected=1 or ?error=<code>
  const oauth = oauthReturnLine({ connected: sp.connected, error: sp.error });

  if (!conn || conn.status === "REVOKED") {
    return (
      <div className="max-w-300 space-y-3">
        {/* the Connect button below is the retry */}
        {oauth && <OAuthReturnNotice tone={oauth.tone} text={oauth.text} retryHref={null} />}
        <EmptyState
          action={
            qbo.isConfigured() ? (
              <a href="/api/quickbooks/connect" className={buttonClass({ variant: "primary" })}>
                Connect QuickBooks
              </a>
            ) : (
              <p className="text-body text-fg-3">
                Set the <code className="font-mono text-code text-fg-2">QBO_*</code> environment variables to
                connect QuickBooks.
              </p>
            )
          }
        >
          QuickBooks isn&apos;t connected.
        </EmptyState>
      </div>
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
    // Capped at 1200 like /settings: its rows pair a label with a control.
    <div className="max-w-300 space-y-8 pointer-coarse:space-y-6">
      <Section title="Connection" actions={<RefreshButton />}>
        {oauth && (
          <div className="mb-2">
            <OAuthReturnNotice
              tone={oauth.tone}
              text={oauth.text}
              retryHref={oauth.retry && qbo.isConfigured() ? "/api/quickbooks/connect" : null}
            />
          </div>
        )}
        <dl>
          <Row label="Status">
            {conn.status === "ACTIVE" ? <Badge tone="ok">Connected</Badge> : <Badge tone="danger">Expired</Badge>}
            {conn.status === "EXPIRED" && (
              <a href="/api/quickbooks/connect" className={textLinkClass}>
                Reconnect
              </a>
            )}
          </Row>
          <Row label="Company">{conn.companyName ?? <Code value={conn.realmId} label="Company ID" />}</Row>
          <Row label="Environment">{conn.environment === "sandbox" ? "Sandbox" : "Production"}</Row>
          <Row label="Basis">
            <BasisToggle current={conn.accountingMethod} />
          </Row>
          <Row label="Last successful sync">
            {conn.lastSuccessfulSyncAt ? fmtDate(conn.lastSuccessfulSyncAt) : "Not yet"}
            {lastRun && (
              <span className={lastRun.status === "FAILED" ? "text-meta text-danger" : "text-meta text-fg-3"}>
                ({RUN_WORD[lastRun.status] ?? lastRun.status})
              </span>
            )}
          </Row>
          <Row label="Reconnect before">
            {conn.refreshTokenExpiresAt ? fmtDate(conn.refreshTokenExpiresAt) : dash}
          </Row>
          <Row label="History from">{periodLabel(conn.historyStart, conn.historyStart) ?? dash}</Row>
        </dl>
        <div className="pt-3">
          <DisconnectButton />
        </div>
      </Section>

      {dq && overview && (
        <div id="cleanup" className={anchor}>
          <Section title="QuickBooks cleanup list">
            <SourceLine
              className="mb-1"
              period={periodOf(overview.monthlyTrend.map((m) => m.periodMonth))}
              basis={overview.basis}
              syncedAt={overview.lastSync?.at ?? null}
            />
            <dl>
              <DqRow
                label="Unclassified lines"
                value={split(dq.unclassed)}
                bad={
                  Math.abs(dq.unclassed.inCents) + Math.abs(dq.unclassed.outCents) > 50_000 ||
                  dq.unclassed.lineCount > 3
                }
                note="Assign a class in QuickBooks"
              />
              <DqRow
                label="Suspense / clearing balance"
                value={<MoneyCents cents={dq.suspenseCents} />}
                bad={dq.suspenseCents !== 0}
                note="Left out of income until the bookkeeper reclasses it to an escrow or asset account"
              />
              <DqRow
                label="Uncategorized Expense"
                value={<MoneyCents cents={dq.uncategorizedCents} />}
                bad={dq.uncategorizedCents !== 0}
              />
              <DqRow
                label="Negative reclass lines this period"
                value={
                  <>
                    <MoneyCents cents={dq.negativeReclass.grossCents} /> · {lines(dq.negativeReclass.lineCount)}
                  </>
                }
                bad={dq.negativeReclass.lineCount > 5}
              />
              {/* the same figure as the Overview's "Not assigned to a property" row */}
              <DqRow
                label="Not assigned to a property"
                value={
                  <>
                    <MoneyCents cents={overview.unassigned.incomeCents} /> in ·{" "}
                    <MoneyCents cents={overview.unassigned.expenseCents} /> out
                  </>
                }
                bad={false}
                note="Map classes below"
              />
              {dq.ignored.lineCount > 0 && (
                <DqRow
                  label="Ignored classes"
                  value={split(dq.ignored)}
                  bad={false}
                  note="Left out of every total"
                />
              )}
              <DqRow
                label="Owner-funded rent (P2P)"
                value={<MoneyCents cents={dq.ownerFundedCents} />}
                bad={dq.ownerFundedCents !== 0}
                note="Owner money booked to Rents, left out of NOI and collected rent"
              />
              <DqRow
                label="Section-8 / voucher rent"
                value={<MoneyCents cents={dq.subsidyCents} />}
                bad={false}
                note="Counted as collected rent, tagged"
              />
              <DqRow
                label="Cash vs accrual net income"
                value={<MoneyCents cents={dq.cashVsAccrualNetIncomeDeltaCents} />}
                bad={Math.abs(dq.cashVsAccrualNetIncomeDeltaCents) > 10_000}
              />
              {dq.unmappedPropertyLikeClasses.length > 0 && (
                <DqRow
                  label="Unmapped classes that look like a property"
                  value={dq.unmappedPropertyLikeClasses.map((c) => c.fullyQualifiedName).join(", ")}
                  bad
                  note="Map these below or that property's income is dropped"
                />
              )}
            </dl>
            {lastRun?.stats != null && <ReconSummary stats={lastRun.stats} basis={conn.accountingMethod} />}
          </Section>
        </div>
      )}

      <div id="class-mapping" className={anchor}>
        <Section title="Class mapping">
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
        </Section>
      </div>

      <div id="account-categories" className={anchor}>
        <Section title="Account categories">
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
        </Section>
      </div>

      <p className="text-meta text-fg-3">
        Reconciliation target: our numbers tie to QuickBooks&apos; own{" "}
        <TextLink href="https://qbo.intuit.com" target="_blank" rel="noopener noreferrer">
          Profit &amp; Loss by Class
        </TextLink>{" "}
        report. Independent check: per-property rent vs the old rent spreadsheet.
      </p>
    </div>
  );
}

/** A label and its value in the Connection rail: 160px labels, 96px on phones (section 5). */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-10 grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 border-b border-line py-1.5 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)] pointer-coarse:min-h-12">
      <dt className="text-meta text-fg-3">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body text-fg-1">{children}</dd>
    </div>
  );
}

/** One cleanup check. One that needs the bookkeeper leads with the warn mark. */
function DqRow({
  label,
  value,
  bad,
  note,
}: {
  label: string;
  value: React.ReactNode;
  bad: boolean;
  note?: string;
}) {
  return (
    <div className="grid gap-x-3 gap-y-0.5 border-b border-line py-2 last:border-b-0 sm:grid-cols-[16rem_minmax(0,1fr)]">
      <dt className="text-meta">{bad ? <WarnMark>{label}</WarnMark> : <span className="text-fg-3">{label}</span>}</dt>
      <dd className="min-w-0">
        <span className="num text-body text-fg-1">{value}</span>
        {note && <span className="block text-meta text-fg-3">{note}</span>}
      </dd>
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
    <p key={line} className="pt-2 text-meta text-fg-3">
      {line}
    </p>
  ));
}
