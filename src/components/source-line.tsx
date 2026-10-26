import type { ReactNode } from "react";
import type { QboBasis } from "@prisma/client";
import { RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import { periodLabel, type MonthSpan } from "@/lib/quickbooks/period";
import { cn } from "@/lib/utils";

/* Where figures come from and what to know first: the source line, the warn
   mark and the notice above figures (docs/brand-guidelines.md, sections 3
   and 9; docs/specs/charts.md 2.6). Shared by Financials and the property
   record's Financials section. */

/** A notice above the figures: --surface on a --line edge. A glyph carries any state. */
export function Notice({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-line bg-surface px-3 py-2 text-meta text-fg-1">
      {icon}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** One line above the figures while the connected company is Intuit's sandbox. */
export function SandboxNotice() {
  return <Notice>Sandbox test data, not the real books.</Notice>;
}

/**
 * A word a partner should act on, with the lucide icon of the thing at the
 * status mark's size in --warn (section 9): RefreshCw plus "Stale" for a sync.
 * Glyph plus word, so color is never the only signal. The word sets the
 * baseline (the icon centers on it), so it sits level in a sentence.
 */
export function WarnMark({
  icon: Icon = TriangleAlert,
  children,
  className,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1 text-warn", className)}>
      <Icon aria-hidden="true" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 self-center pointer-coarse:h-4 pointer-coarse:w-4" />
      {children}
    </span>
  );
}

/** Plain helper (not a component), so it's safe to call the impure Date.now() here. */
function hoursSince(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const t = typeof d === "string" ? new Date(d) : d;
  return (Date.now() - t.getTime()) / 3_600_000;
}

function ago(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 36) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * Period and source for a figure block (section 3): "Jan 1 to Oct 25, 2026 ·
 * QuickBooks, cash basis, synced 6h ago", in text-meta --fg-3.
 *
 * The period is `period` as given, or `span` read through periodLabel: with
 * `through`, a span ending in the running month runs to the last synced day.
 * When the figures carry a comparison, `comparison` says its basis once in
 * the period's place ("Sep 2026 vs Aug").
 *
 * It stays one line: phones drop the basis clause, and below 480 the
 * source's name too ("Jan to Sep 2026 · synced 6h ago"), and a stale sync
 * reads "Jan 1 to Sep 2, 2026 · Stale" there, the mark standing in for the
 * age. Where a Cash | Accrual control on the page already shows the basis,
 * `showBasis={false}` drops the clause at every size. A sync over 36 hours
 * old reads Stale, and a PARTIAL run whose basis on screen doesn't tie reads
 * Reconciliation off, each as a warn mark; a page whose notice already says
 * what's off passes no `status`.
 */
export function SourceLine({
  period,
  span,
  through,
  comparison,
  basis,
  showBasis = true,
  syncedAt,
  status,
  className,
}: {
  period?: string | null;
  span?: MonthSpan;
  through?: string | null;
  comparison?: string | null;
  basis: QboBasis;
  showBasis?: boolean;
  syncedAt: Date | string | null;
  status?: string | null;
  className?: string;
}) {
  const h = hoursSince(syncedAt);
  const stale = h != null && h > 36;
  const when = comparison || (span ? periodLabel(span.from, span.to, { through }) : period);
  return (
    <p className={cn("text-meta text-fg-3", className)}>
      {when && <>{when} · </>}
      <span className="max-[480px]:hidden">
        QuickBooks
        {showBasis && <span className="max-sm:hidden">, {basis === "CASH" ? "cash" : "accrual"} basis</span>},{" "}
      </span>
      {h == null ? (
        <WarnMark icon={RefreshCw}>not synced yet</WarnMark>
      ) : (
        // On a phone the Stale mark stands in for the age, so the line keeps to one row.
        <span className={cn("whitespace-nowrap", stale && "max-[480px]:hidden")}>synced {ago(h)}</span>
      )}
      {stale && (
        <>
          <span className="max-[480px]:hidden">{" · "}</span>
          <WarnMark icon={RefreshCw}>Stale</WarnMark>
        </>
      )}
      {status === "PARTIAL" && (
        <>
          {" · "}
          <WarnMark>Reconciliation off</WarnMark>
        </>
      )}
    </p>
  );
}
