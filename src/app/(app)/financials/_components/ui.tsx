import type { QboBasis } from "@prisma/client";
import { Badge } from "@/components/ui";
import { cn, fmtMoney } from "@/lib/utils";

export function fmtCents(cents: number, opts: { compact?: boolean } = {}): string {
  return fmtMoney(cents / 100, opts);
}

/** "(8 mo)" pill shown next to any figure derived from < 12 months of data. */
export function PartialLabel({ months }: { months: number }) {
  if (months <= 0 || months >= 12) return null;
  return <span className="ml-1 text-[11px] font-normal text-muted">({months} mo)</span>;
}

export function Kpi({
  label,
  cents,
  months,
  hint,
  strong,
}: {
  label: string;
  cents: number;
  months?: number;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={cn(
          "mt-0.5 tabular-nums",
          strong ? "text-lg font-semibold" : "text-base font-medium",
          cents < 0 && "text-red-600",
        )}
      >
        {fmtCents(cents)}
        {months != null && <PartialLabel months={months} />}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

/** Horizontal bars — the app's hand-built idiom (portfolio-capex.tsx). */
export function MoneyBars({
  rows,
  emptyLabel = "No data",
}: {
  rows: { label: string; cents: number; note?: string }[];
  emptyLabel?: string;
}) {
  const shown = rows.filter((r) => r.cents !== 0);
  if (shown.length === 0) return <p className="text-sm text-muted">{emptyLabel}</p>;
  const max = Math.max(...shown.map((r) => Math.abs(r.cents)), 1);
  return (
    <div className="space-y-1.5">
      {shown.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-sm">
          <span className="w-32 shrink-0 truncate text-muted" title={r.label}>
            {r.label}
          </span>
          <span className="h-4 flex-1 overflow-hidden rounded bg-background">
            <span
              className={cn("block h-full rounded", r.cents < 0 ? "bg-amber-500/70" : "bg-primary/50")}
              style={{ width: `${(Math.abs(r.cents) / max) * 100}%` }}
            />
          </span>
          <span className="w-24 shrink-0 text-right tabular-nums" title={r.note}>
            {fmtCents(r.cents)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Plain helper (not a component) — safe to call the impure Date.now() here. */
function hoursSince(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const t = typeof d === "string" ? new Date(d) : d;
  return (Date.now() - t.getTime()) / 3_600_000;
}

function relTime(d: Date | string | null | undefined): string {
  const h = hoursSince(d);
  if (h == null) return "never";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 36) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function SourceBadge({
  basis,
  syncedAt,
  status,
}: {
  basis: QboBasis;
  syncedAt: Date | string | null;
  status?: string | null;
}) {
  const h = hoursSince(syncedAt);
  const stale = h == null || h > 36;
  const tone = status === "PARTIAL" || stale ? "amber" : "green";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <Badge tone={tone}>QuickBooks</Badge>
      {basis === "CASH" ? "Cash" : "Accrual"} basis · synced {relTime(syncedAt)}
      {status === "PARTIAL" && " · reconciliation off"}
    </span>
  );
}
