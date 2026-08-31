import { fmtDate, fmtMoney } from "@/lib/utils";

/**
 * One-row answer-at-a-glance strip. Values are derived on the page from data we
 * already have. Cash flow / mo joins once the rent roll (step C) lands.
 */
export function PropertySummary({
  allInBasis,
  value,
  currentLoan,
  capexDueSoon,
  nextKeyDate,
}: {
  allInBasis: number | null;
  value: number | null;
  currentLoan: number | null;
  capexDueSoon: number;
  /** Soonest of the property's key dates, or a fallback (next task due). */
  nextKeyDate: { label: string; date: Date | string } | null;
}) {
  const equity = value != null && currentLoan != null ? value - currentLoan : null;
  const ltv = value != null && value > 0 && currentLoan != null ? currentLoan / value : null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Tile label="All-in basis" value={allInBasis != null ? fmtMoney(allInBasis) : "—"} />
      <Tile label="Value" value={value != null ? fmtMoney(value) : "—"} />
      <Tile label="Equity" value={equity != null ? fmtMoney(equity) : "—"} />
      <Tile
        label="LTV"
        value={ltv != null ? `${Math.round(ltv * 100)}%` : "—"}
        tone={ltv != null && ltv > 0.8 ? "amber" : undefined}
      />
      <Tile
        label="CapEx due soon"
        value={capexDueSoon > 0 ? fmtMoney(capexDueSoon) : "—"}
        tone={capexDueSoon > 0 ? "red" : undefined}
      />
      <Tile
        label={nextKeyDate ? nextKeyDate.label : "Next key date"}
        value={nextKeyDate ? fmtDate(nextKeyDate.date) : "—"}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "red" | "amber";
}) {
  const toneClass =
    tone === "red"
      ? "text-red-600 dark:text-red-400"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : "";
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm">
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}
