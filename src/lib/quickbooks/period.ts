/**
 * Month labels and the period choice for the QuickBooks figures
 * (docs/brand-guidelines.md, section 3: every figure block states its period
 * and source; docs/specs/charts.md 2.6). Months are QuickBooks' "YYYY-MM"
 * period keys and days are "YYYY-MM-DD", both Eastern. Pure; see
 * period.test.ts.
 */
import { addMonths } from "./months";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function split(ym: string): { y: number; m: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  return m >= 1 && m <= 12 ? { y, m } : null;
}

function splitDay(ymd: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const p = split(`${match[1]}-${match[2]}`);
  const d = Number(match[3]);
  return p && d >= 1 && d <= 31 ? { ...p, d } : null;
}

/** "Sep", or "Sep 2025" when it isn't `thisYear`. A key it can't read comes back as is. */
export function fmtMonth(ym: string, thisYear: number): string {
  const p = split(ym);
  if (!p) return ym;
  return p.y === thisYear ? MONTHS[p.m - 1] : `${MONTHS[p.m - 1]} ${p.y}`;
}

/** "Sep 2026", always with the year. A key it can't read comes back as is. */
export function fmtMonthYear(ym: string): string {
  const p = split(ym);
  return p ? `${MONTHS[p.m - 1]} ${p.y}` : ym;
}

/** "Sep" alone, for an axis that states the year on its own line. */
export function monthShort(ym: string): string {
  const p = split(ym);
  return p ? MONTHS[p.m - 1] : ym;
}

/** "S" for September: the axis label below 384px. */
export function monthInitial(ym: string): string {
  return monthShort(ym).slice(0, 1);
}

/**
 * The span a figure covers, first month to last: "Jan to Sep 2026",
 * "Nov 2025 to Feb 2026", or "Sep 2026" for one month. Always with the year,
 * since it heads the figures. null when there are no months.
 *
 * `through` is the last day the figures reach when the span ends in the
 * running month (the last sync, Eastern): "Jan 1 to Oct 25, 2026",
 * "Oct 1 to 25, 2026", "Nov 1, 2025 to Oct 25, 2026". A day outside the span
 * is left out and the months read as usual.
 */
export function periodLabel(
  first: string | null | undefined,
  last: string | null | undefined,
  opts: { through?: string | null } = {},
): string | null {
  const a = first ? split(first) : null;
  const b = last ? split(last) : null;
  if (!a && !b) return null;
  if (!a || !b) {
    const only = (a ?? b)!;
    return `${MONTHS[only.m - 1]} ${only.y}`;
  }
  const [from, to] = a.y * 12 + a.m <= b.y * 12 + b.m ? [a, b] : [b, a];
  const t = opts.through ? splitDay(opts.through) : null;
  const tIndex = t ? t.y * 12 + t.m : 0;
  if (t && tIndex >= from.y * 12 + from.m && tIndex <= to.y * 12 + to.m) {
    if (t.y === from.y && t.m === from.m) {
      return t.d === 1 ? `${MONTHS[t.m - 1]} 1, ${t.y}` : `${MONTHS[t.m - 1]} 1 to ${t.d}, ${t.y}`;
    }
    if (t.y === from.y) return `${MONTHS[from.m - 1]} 1 to ${MONTHS[t.m - 1]} ${t.d}, ${t.y}`;
    return `${MONTHS[from.m - 1]} 1, ${from.y} to ${MONTHS[t.m - 1]} ${t.d}, ${t.y}`;
  }
  if (from.y === to.y && from.m === to.m) return `${MONTHS[to.m - 1]} ${to.y}`;
  if (from.y === to.y) return `${MONTHS[from.m - 1]} to ${MONTHS[to.m - 1]} ${to.y}`;
  return `${MONTHS[from.m - 1]} ${from.y} to ${MONTHS[to.m - 1]} ${to.y}`;
}

/** periodLabel over a list of months in any order. */
export function periodOf(months: readonly string[], opts: { through?: string | null } = {}): string | null {
  if (months.length === 0) return null;
  const sorted = [...months].sort();
  return periodLabel(sorted[0], sorted[sorted.length - 1], opts);
}

/**
 * The running month so far, for the month chart's readout: "Oct 1 to 25"
 * through the last synced day, "Oct 1" on its first day, or "Oct so far"
 * when the last sync was before the month began.
 */
export function monthToDateLabel(ym: string, through: string | null | undefined): string {
  const p = split(ym);
  if (!p) return ym;
  const t = through ? splitDay(through) : null;
  if (!t || t.y !== p.y || t.m !== p.m) return `${MONTHS[p.m - 1]} so far`;
  return t.d === 1 ? `${MONTHS[p.m - 1]} 1` : `${MONTHS[p.m - 1]} 1 to ${t.d}`;
}

/* ---------------- The period row (FINANCIALS-001) ---------------- */

/** The Overview's period: the last complete month, or January to today. */
export type PeriodKey = "last" | "ytd";

export const PERIOD_LABEL: Record<PeriodKey, string> = { last: "Last month", ytd: "Year to date" };

/** `?period=` on the Overview. "last" is Last month; anything else is Year to date, the default. */
export function periodFromParam(v: string | string[] | undefined): PeriodKey {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "last" ? "last" : "ytd";
}

/** A run of whole months, both ends included. */
export interface MonthSpan {
  from: string;
  to: string;
}

/** The months a period covers, given the running month: Last month is the one before it. */
export function periodSpan(key: PeriodKey, runningMonth: string): MonthSpan {
  if (key === "last") {
    const m = addMonths(runningMonth, -1);
    return { from: m, to: m };
  }
  return { from: `${runningMonth.slice(0, 4)}-01`, to: runningMonth };
}

/**
 * What a period is compared with: Last month against the month before it,
 * Year to date against the same months a year earlier.
 */
export function priorSpan(key: PeriodKey, span: MonthSpan): MonthSpan {
  if (key === "last") {
    const m = addMonths(span.from, -1);
    return { from: m, to: m };
  }
  return { from: addMonths(span.from, -12), to: addMonths(span.to, -12) };
}

/** Whether every month of a span is inside the synced history, so a comparison with it is fair. */
export function spanInsideHistory(span: MonthSpan, historyStart: string): boolean {
  return span.from >= historyStart;
}

/** Whether a month falls in a span. */
export function inSpan(ym: string, span: MonthSpan): boolean {
  return ym >= span.from && ym <= span.to;
}

/** "2026-09-30": the last calendar day of a month key. null for a key it can't read. */
export function monthEnd(ym: string): string | null {
  const p = split(ym);
  if (!p) return null;
  const d = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
  return `${ym}-${String(d).padStart(2, "0")}`;
}

/**
 * The last day the figures reach when the span isn't complete: the last
 * sync's Eastern day, never past today. A span ending in the running month
 * is always partial, so it gets the day; a span that ended earlier gets it
 * only when the sync stopped inside it (Last month, with the last sync
 * early in that month). null when the span is whole, or nothing has synced.
 */
export function throughDay(span: MonthSpan, runningMonth: string, lastSyncDay: string | null, today: string): string | null {
  if (!lastSyncDay) return null;
  const reached = lastSyncDay < today ? lastSyncDay : today;
  if (span.to === runningMonth) return reached;
  const end = monthEnd(span.to);
  return end && reached < end ? reached : null;
}

/** The same calendar day a year earlier; Feb 29 becomes Feb 28. null for a day it can't read. */
export function sameDayYearBefore(ymd: string): string | null {
  const t = splitDay(ymd);
  if (!t) return null;
  const ym = `${t.y - 1}-${String(t.m).padStart(2, "0")}`;
  const last = Number(monthEnd(ym)!.slice(8));
  return `${ym}-${String(Math.min(t.d, last)).padStart(2, "0")}`;
}

/**
 * What a partial period is fairly compared with. Whole months compare with
 * whole months. A Year to date that stops mid-month compares with the same
 * days a year earlier (`through` bounds the prior span by day), so ten days of
 * January never sit beside all of last January. Last month that the sync
 * hasn't finished has no fair match, so it gets none: null. So does a span
 * the sync never reached.
 */
export interface PriorWindow {
  span: MonthSpan;
  /** Lines after this day are left out of the prior span; null takes it whole. */
  through: string | null;
}

export function priorWindow(key: PeriodKey, span: MonthSpan, through: string | null): PriorWindow | null {
  const before = priorSpan(key, span);
  if (!through) return { span: before, through: null };
  if (key === "last") return null;
  // A sync that stopped before the span began left it empty: nothing to compare.
  if (through < `${span.from}-01`) return null;
  const bound = sameDayYearBefore(through);
  return bound ? { span: before, through: bound } : null;
}

/** Whether a line belongs to a prior window: its month is in the span and, when bounded, its day is on or before the bound. */
export function inPriorWindow(line: { periodMonth: string; txnDay?: string | null }, w: PriorWindow): boolean {
  if (!inSpan(line.periodMonth, w.span)) return false;
  return !w.through || !line.txnDay || line.txnDay <= w.through;
}

/**
 * The comparison's basis, said once in the source line: "Sep 2026 vs Aug",
 * "Jan to Oct 2027 vs 2026". A Year to date that stops mid-month keeps its
 * last day ("Jan 1 to 10, 2027 vs 2026"), since it's the only place the line
 * says the period is partial.
 */
export function comparisonLabel(key: PeriodKey, span: MonthSpan, prior: MonthSpan, through: string | null = null): string {
  if (key === "last") {
    const now = split(span.to);
    const before = split(prior.to);
    if (!now || !before) return "";
    return before.y === now.y
      ? `${MONTHS[now.m - 1]} ${now.y} vs ${MONTHS[before.m - 1]}`
      : `${MONTHS[now.m - 1]} ${now.y} vs ${MONTHS[before.m - 1]} ${before.y}`;
  }
  return `${periodLabel(span.from, span.to, { through })} vs ${prior.to.slice(0, 4)}`;
}
