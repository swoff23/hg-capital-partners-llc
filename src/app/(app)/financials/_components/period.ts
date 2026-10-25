/**
 * Month labels for the figures on /financials (docs/brand-guidelines.md,
 * section 3: every figure block states its period and source). Months are
 * QuickBooks' "YYYY-MM" period keys. Pure; see period.test.ts.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function split(ym: string): { y: number; m: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  return m >= 1 && m <= 12 ? { y, m } : null;
}

/** "Sep", or "Sep 2025" when it isn't `thisYear`. A key it can't read comes back as is. */
export function fmtMonth(ym: string, thisYear: number): string {
  const p = split(ym);
  if (!p) return ym;
  return p.y === thisYear ? MONTHS[p.m - 1] : `${MONTHS[p.m - 1]} ${p.y}`;
}

/**
 * The span a figure covers, first month to last: "Jan to Sep 2026",
 * "Nov 2025 to Feb 2026", or "Sep 2026" for one month. Always with the year,
 * since it heads the figures. null when there are no months.
 */
export function periodLabel(first: string | null | undefined, last: string | null | undefined): string | null {
  const a = first ? split(first) : null;
  const b = last ? split(last) : null;
  if (!a && !b) return null;
  if (!a || !b) {
    const only = (a ?? b)!;
    return `${MONTHS[only.m - 1]} ${only.y}`;
  }
  const [from, to] = a.y * 12 + a.m <= b.y * 12 + b.m ? [a, b] : [b, a];
  if (from.y === to.y && from.m === to.m) return `${MONTHS[to.m - 1]} ${to.y}`;
  if (from.y === to.y) return `${MONTHS[from.m - 1]} to ${MONTHS[to.m - 1]} ${to.y}`;
  return `${MONTHS[from.m - 1]} ${from.y} to ${MONTHS[to.m - 1]} ${to.y}`;
}

/** periodLabel over a list of months in any order. */
export function periodOf(months: readonly string[]): string | null {
  if (months.length === 0) return null;
  const sorted = [...months].sort();
  return periodLabel(sorted[0], sorted[sorted.length - 1]);
}
