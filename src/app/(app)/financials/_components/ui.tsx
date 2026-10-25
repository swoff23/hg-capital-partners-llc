import type { ComponentProps, ReactNode } from "react";
import type { QboBasis } from "@prisma/client";
import { RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import { Money } from "@/components/money";
import { cn, fmtMoney } from "@/lib/utils";
import { fmtMonth } from "./period";

/* The money pieces of /financials on the Ink and Limestone tokens
   (docs/brand-guidelines.md, sections 3 and 4). The QuickBooks read layer
   works in cents; everything here shows whole dollars through Money. */

export function fmtCents(cents: number, opts: { compact?: boolean } = {}): string {
  return fmtMoney(cents / 100, opts);
}

/**
 * Money for an amount in cents, shown as whole dollars: tabular, a true minus
 * for money out. A transaction line that shows its cents uses Money itself.
 */
export function MoneyCents({ cents, ...props }: { cents: number } & Omit<ComponentProps<typeof Money>, "value" | "cents">) {
  return <Money value={cents / 100} {...props} />;
}

/* ---------------- Statement rules (section 3) ----------------
   A table on a finance screen sits flush with the page gutter: its first and
   last cells drop their outer padding, so the h1, the header and column one
   share an edge. A grand total (portfolio NOI, the rent roll total) takes a
   --fg-1 rule above, a 3px double rule below and weight 600; the 1px top
   edge of a double border draws as a single line. A subtotal row, when one
   comes, is a --line-strong rule above at weight 600. */
export const flushTable = "[&_tr>*:first-child]:pl-0 [&_tr>*:last-child]:pr-0";
export const grandTotalRow = "border-t border-b-3 border-double border-fg-1 font-semibold";

/**
 * "8 mo": how many months a property's figures cover. Shown at 12 and up
 * too, since the totals have no date window and keep adding months.
 */
export function PartialLabel({ months, className }: { months: number; className?: string }) {
  if (months <= 0) return null;
  return <span className={cn("whitespace-nowrap text-meta text-fg-3", className)}>{months} mo</span>;
}

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
 * Glyph plus word, so color is never the only signal.
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
    <span className={cn("inline-flex items-center gap-1 text-warn", className)}>
      <Icon aria-hidden="true" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 pointer-coarse:h-4 pointer-coarse:w-4" />
      {children}
    </span>
  );
}

/**
 * Figures side by side, split by --line rules 16px in from each rule
 * (section 5). Give it the grid columns per size; when the cells wrap to more
 * rows, no row starts with a rule (the first column's rules are clipped).
 */
export function Strip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden">
      <div className={cn("-ml-[17px] grid gap-y-4 *:min-w-0 *:border-l *:border-line *:pl-4", className)}>
        {children}
      </div>
    </div>
  );
}

/**
 * A KPI in a Strip: label over the figure, an optional line under it. The KPI
 * strip takes text-figure-l; a summary or record fact strip passes size "m".
 */
export function Kpi({
  label,
  cents,
  hint,
  size = "l",
}: {
  label: ReactNode;
  cents: number;
  hint?: string;
  size?: "l" | "m";
}) {
  return (
    <div>
      <p className="truncate text-meta text-fg-3">{label}</p>
      <p className={cn(size === "l" ? "text-figure-l" : "text-figure-m", "text-fg-1")}>
        <MoneyCents cents={cents} />
      </p>
      {hint && <p className="text-meta text-fg-3">{hint}</p>}
    </div>
  );
}

/**
 * Horizontal bars, one series in --chart-1 on a --fill-1 track, each labeled
 * directly with its figure (section 4). A negative total (refunds over
 * spend) is the series outline, not a fill. On phones the label and figure
 * share a line over a full-width bar.
 */
export function MoneyBars({
  rows,
  emptyLabel = "No operating expenses in QuickBooks yet.",
}: {
  rows: { label: string; cents: number }[];
  emptyLabel?: string;
}) {
  const shown = rows.filter((r) => r.cents !== 0);
  if (shown.length === 0) return <p className="text-body text-fg-3">{emptyLabel}</p>;
  const max = Math.max(...shown.map((r) => Math.abs(r.cents)), 1);
  return (
    <ul className="space-y-2 pointer-coarse:space-y-3">
      {shown.map((r) => (
        <li
          key={r.label}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[9rem_minmax(0,1fr)_6rem]"
        >
          <span className="truncate text-meta text-fg-2">{r.label}</span>
          <span className="text-right text-body text-fg-1 sm:order-last">
            <MoneyCents cents={r.cents} />
          </span>
          <span aria-hidden="true" className="col-span-2 block h-2 overflow-hidden rounded-xs bg-fill-1 sm:col-span-1">
            <span
              className={cn("block h-full rounded-xs", r.cents < 0 ? "border border-chart-1" : "bg-chart-1")}
              style={{ width: `${(Math.abs(r.cents) / max) * 100}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

const incomeBar = "bg-chart-1";
const expenseBar = "border-[1.5px] border-dashed border-chart-ref";

/**
 * One bar with its figure at its head. The bar scales within its line less
 * 5rem kept for the figure, so the largest bar and its figure still fit. A
 * net refund month (zero or below) has no bar, only the figure.
 */
function HeadBar({ cents, max, look }: { cents: number; max: number; look: string }) {
  return (
    <span className="flex h-3.5 items-center gap-1.5">
      {cents > 0 && (
        <span
          className={cn("block h-2 min-w-0 rounded-xs", look)}
          style={{ width: `calc((100% - 5rem) * ${cents / max})` }}
        />
      )}
      <span className="shrink-0 text-meta leading-none text-fg-3">
        <MoneyCents cents={cents} />
      </span>
    </span>
  );
}

/**
 * Income against expense by month: income is the series in --chart-1, expense
 * the dashed --chart-ref reference under it, each figure at the head of its
 * bar; NOI on the right (section 4). No color beyond those two. The legend
 * has its own line over the rows. On phones the month and NOI share a line
 * over full-width bars, as in MoneyBars.
 */
export function IncomeExpenseBars({
  months,
  thisYear,
}: {
  months: { periodMonth: string; incomeCents: number; expenseCents: number; noiCents: number }[];
  thisYear: number;
}) {
  if (months.length === 0) return <p className="text-body text-fg-3">No income or expense in QuickBooks yet.</p>;
  const max = Math.max(...months.flatMap((m) => [m.incomeCents, m.expenseCents]), 1);
  return (
    <div>
      <div aria-hidden="true" className="mb-2 flex items-center justify-between gap-3 text-meta text-fg-3">
        <span className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-3 rounded-xs", incomeBar)} />
            Income
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-3 rounded-xs", expenseBar)} />
            Expense
          </span>
        </span>
        <span>NOI</span>
      </div>
      <ul className="space-y-2 pointer-coarse:space-y-3">
        {months.map((m) => (
          <li
            key={m.periodMonth}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[4.5rem_minmax(0,1fr)_6rem]"
          >
            <span className="num text-meta text-fg-3">
              {fmtMonth(m.periodMonth, thisYear)}
              <span className="sr-only">
                : income {fmtCents(m.incomeCents)}, expense {fmtCents(m.expenseCents)}, NOI {fmtCents(m.noiCents)}
              </span>
            </span>
            <span aria-hidden="true" className="text-right text-body text-fg-1 sm:order-last">
              <MoneyCents cents={m.noiCents} />
            </span>
            <span aria-hidden="true" className="col-span-2 space-y-0.5 sm:col-span-1">
              <HeadBar cents={m.incomeCents} max={max} look={incomeBar} />
              <HeadBar cents={m.expenseCents} max={max} look={expenseBar} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Plain helper (not a component) — safe to call the impure Date.now() here. */
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
 * Period and source for a figure block (section 3): "Jan to Sep 2026 ·
 * QuickBooks, cash basis, synced 6h ago", in text-meta --fg-3. Phones drop
 * the basis clause so it stays one line. A sync over 36 hours old reads
 * Stale, and a PARTIAL run whose basis on screen doesn't tie reads
 * Reconciliation off, each as a warn mark.
 */
export function SourceLine({
  period,
  basis,
  syncedAt,
  status,
  className,
}: {
  period: string | null;
  basis: QboBasis;
  syncedAt: Date | string | null;
  status?: string | null;
  className?: string;
}) {
  const h = hoursSince(syncedAt);
  return (
    <p className={cn("text-meta text-fg-3", className)}>
      {period && <>{period} · </>}
      QuickBooks<span className="max-sm:hidden">, {basis === "CASH" ? "cash" : "accrual"} basis</span>
      {h == null ? (
        <>
          , <WarnMark icon={RefreshCw}>not synced yet</WarnMark>
        </>
      ) : (
        <>, synced {ago(h)}</>
      )}
      {h != null && h > 36 && (
        <>
          {" · "}
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
