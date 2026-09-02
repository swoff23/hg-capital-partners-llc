/**
 * Month arithmetic and the per-run month plan for the QuickBooks sync.
 * Pure; see months.test.ts.
 *
 * Why a plan instead of "everything, every night": one run has a ~45s wall
 * budget on Vercel. Refetching every month since historyStart on every cron
 * run grows linearly with the age of the books and, once it overruns, fails
 * every night with no progress. So:
 *   - a MANUAL / INITIAL run is a full rebuild (the operator asked for it);
 *   - a CRON run rebuilds the last RECENT_MONTHS (where nearly all edits land)
 *     plus a SWEEP_MONTHS-wide window of older history that rotates each
 *     night, so a reclassed old transaction is picked up within
 *     ceil(history / SWEEP_MONTHS) nights and the per-night cost is bounded.
 * Every month × basis is written in its own transaction, so a budget hit
 * mid-run keeps what was done.
 */

export const RECENT_MONTHS = 3;
export const SWEEP_MONTHS = 4;

export function currentMonth(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Inclusive "YYYY-MM" range, ascending. Empty when start > end. */
export function monthRange(startYm: string, endYm: string): string[] {
  const out: string[] = [];
  let [y, m] = startYm.split("-").map(Number);
  const [ey, em] = endYm.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** First and last calendar day of the month, "YYYY-MM-DD". */
export function monthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // day 0 of next month = last day
  return { start, end };
}

export type SyncScope = "full" | "incremental";

export interface MonthPlan {
  /** Months to (re)build this run, ascending. */
  months: string[];
  /** Where the next incremental run's sweep should start (a month string), or null when history is short. */
  nextSweepCursor: string | null;
}

/**
 * Which months a run should rebuild.
 *  - full: every month from historyStart to now.
 *  - incremental: the last RECENT_MONTHS months, plus SWEEP_MONTHS older
 *    months starting at `sweepCursor` (wrapping around to historyStart).
 */
export function planMonths(
  historyStart: string,
  nowMonth: string,
  scope: SyncScope,
  sweepCursor: string | null,
): MonthPlan {
  const all = monthRange(historyStart, nowMonth);
  if (all.length === 0) return { months: [], nextSweepCursor: null };
  if (scope === "full") return { months: all, nextSweepCursor: null };

  const recent = all.slice(-RECENT_MONTHS);
  const older = all.slice(0, Math.max(0, all.length - RECENT_MONTHS));
  if (older.length === 0) return { months: recent, nextSweepCursor: null };

  let start = sweepCursor ? older.indexOf(sweepCursor) : 0;
  if (start < 0) start = 0;
  const sweep: string[] = [];
  for (let i = 0; i < Math.min(SWEEP_MONTHS, older.length); i++) sweep.push(older[(start + i) % older.length]);
  const nextIdx = (start + sweep.length) % older.length;

  const months = [...new Set([...sweep, ...recent])].sort();
  return { months, nextSweepCursor: older[nextIdx] };
}
