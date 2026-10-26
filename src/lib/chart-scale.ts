/**
 * Scale and label math for the charts (docs/specs/charts.md 2.1 and 2.4):
 * the month chart's ticks and the ranked bars' shares and cap. Pure; see
 * chart-scale.test.ts.
 */

/** A minus sign (U+2212), as Money uses. */
const MINUS = "−";

/**
 * The top tick: the smallest of 1, 2, 2.5 or 5 times a power of ten at or
 * above `max`. 4,210 gives 5,000, 12,400 gives 20,000, 2,100 gives 2,500.
 * 0 for nothing above zero, so there's no tick to draw.
 */
export function niceTop(max: number): number {
  if (!(max > 0) || !Number.isFinite(max)) return 0;
  let power = 10 ** Math.floor(Math.log10(max));
  // Float error can leave log10(1000) a hair under 3; step back down if so.
  if (power * 10 <= max) power *= 10;
  for (const step of [1, 2, 2.5, 5, 10]) {
    const tick = step * power;
    if (tick >= max) return tick;
  }
  return 10 * power;
}

/**
 * Compact dollars for a tick, the one place they appear (brand section 3):
 * "$500", "$5k", "$2.5k", "$1.2M", and "−$5k" below zero.
 */
export function tickLabel(dollars: number): string {
  const sign = dollars < 0 ? MINUS : "";
  const a = Math.abs(dollars);
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (a >= 1_000_000) return `${sign}$${trim(a / 1_000_000)}M`;
  if (a >= 1_000) return `${sign}$${trim(a / 1_000)}k`;
  return `${sign}$${Math.round(a)}`;
}

/**
 * A row's share of the total as a whole percent: "31%", or "<1%" for a
 * sliver that rounds to nothing. null when there's no share to state: a
 * refund row (zero or below) or a total that isn't above zero.
 */
export function shareLabel(part: number, total: number): string | null {
  if (!(part > 0) || !(total > 0)) return null;
  const pct = Math.round((part / total) * 100);
  return pct < 1 ? "<1%" : `${pct}%`;
}

/**
 * What a ranked list's shares are of: the groups that spent money, added up.
 * A group whose refunds outran its spend has no share, and leaving it out of
 * the base keeps the shown shares from adding past 100%.
 */
export function shareBase(cents: readonly number[]): number {
  return cents.reduce((sum, c) => (c > 0 ? sum + c : sum), 0);
}

/**
 * The ranked list's cap: the top `top` rows, then the rest summed into one
 * "Everything else" row. A list that would leave a single row behind shows
 * it instead, since "Everything else · 1 more" says less than the row.
 */
export function capRows<T extends { cents: number }>(
  rows: readonly T[],
  top = 7,
): { shown: T[]; rest: { cents: number; rows: T[] } | null } {
  if (rows.length <= top + 1) return { shown: [...rows], rest: null };
  const shown = rows.slice(0, top);
  const restRows = rows.slice(top);
  return { shown, rest: { cents: restRows.reduce((s, r) => s + r.cents, 0), rows: restRows } };
}
