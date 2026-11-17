import { dayLabel, fmtDay, toYmd, type Ymd } from "@/lib/dates";
import { dayAfter, homeLabel, leaseStatus } from "@/lib/tenants/status";
import type { NeedsYouItem } from "@/lib/home/needs-you";

/**
 * Lease ends in Needs you (docs/specs/missing-info.md, D5). New York asks for
 * written notice before a landlord doesn't renew or raises the rent 5% or more
 * (Real Property Law § 226-c): 30 days for a stay under a year, 60 for one to
 * two years, 90 for longer. The row shows 30 days before that deadline, so
 * there's a month to decide, and reads Late once the deadline passes (spec
 * call 2), whatever the end date. Pure; lease-notice.test.ts covers it.
 */

type Day = Date | string | null | undefined;

export interface LeaseEndInput {
  id: string;
  address: string;
  unitLabel: string | null;
  movesIn: Day;
  movesOut: Day;
  terms: { id: string; startsOn: Day; endsOn: Day }[];
}

/** How long a deadline gives you to decide before it: the row's lead. */
export const DECIDE_DAYS = 30;

const addDays = (day: Ymd, n: number): Ymd => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/**
 * The notice New York asks for, in days, from how long they'll have lived
 * there by the end: under a year 30, one to two years 60, longer 90. An
 * unknown move-in (an import of someone living there now) gets 90, the safe
 * side (spec call 3).
 */
export function noticeDays(movesIn: Ymd | null, endsOn: Ymd): 30 | 60 | 90 {
  if (!movesIn) return 90;
  const [ay, am, ad] = movesIn.split("-").map(Number);
  const [by, bm, bd] = endsOn.split("-").map(Number);
  const days = (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000;
  if (days < 365) return 30;
  if (days < 730) return 60;
  return 90;
}

export interface LeaseEnd {
  leaseId: string;
  termId: string;
  endsOn: Ymd;
  /** The last day to give notice. */
  noticeBy: Ymd;
  /** The day the row starts to show. */
  showFrom: Ymd;
  late: boolean;
}

/**
 * A lease whose last term ends, with nobody moving out: its end, the notice
 * deadline and whether that's passed. Null when there's nothing to decide: a
 * past lease, a move-out date set, a last term with no end (month to month),
 * or a renewal term already after it. Before `showFrom` it's still returned;
 * the caller decides whether it's time.
 */
export function leaseEnd(l: LeaseEndInput, today: Ymd): LeaseEnd | null {
  if (leaseStatus(l, today) === "past" || toYmd(l.movesOut)) return null;
  const terms = [...l.terms].filter((t) => toYmd(t.startsOn)).sort((a, b) => toYmd(a.startsOn)!.localeCompare(toYmd(b.startsOn)!));
  const last = terms[terms.length - 1];
  const endsOn = toYmd(last?.endsOn);
  if (!last || !endsOn) return null;
  const noticeBy = addDays(endsOn, -noticeDays(toYmd(l.movesIn), endsOn));
  return { leaseId: l.id, termId: last.id, endsOn, noticeBy, showFrom: addDays(noticeBy, -DECIDE_DAYS), late: today > noticeBy };
}

/** The Needs you rows for every lease end that's in its window (D5), soonest deadline first. `skipped` holds "term:<id>" keys. */
export function leaseEndItems(leases: readonly LeaseEndInput[], today: Ymd, skipped: ReadonlySet<string> = new Set()): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  for (const l of leases) {
    const e = leaseEnd(l, today);
    if (!e || today < e.showFrom || skipped.has(`term:${e.termId}`)) continue;
    const ended = e.endsOn < today;
    items.push({
      key: `lease:${l.id}`,
      kind: "lease",
      href: `/tenants/${l.id}`,
      title: `${ended ? "Lease ended" : "Lease ends"} ${fmtDay(e.endsOn, { year: "auto", now: today })}`,
      state: e.late ? "Late" : "Due",
      detail: homeLabel(l.address, l.unitLabel),
      amount: null,
      pastDue: null,
      dateLabel: dayLabel(e.noticeBy, today),
      late: e.late,
      date: e.noticeBy,
    });
  }
  return items.sort((a, b) => a.date!.localeCompare(b.date!) || a.detail.localeCompare(b.detail));
}

/** The line a lease page shows beside its end: "Notice by Jan 30", or "Notice was due Jan 30" once it's passed. */
export function noticeLine(e: LeaseEnd, today: Ymd): string {
  const day = fmtDay(e.noticeBy, { year: "auto", now: today });
  return e.late ? `Notice was due ${day}` : `Notice by ${day}`;
}

/** The term a lease's Month to month answer adds: from the day after the last term ends, with no end. */
export function monthToMonthStart(endsOn: Ymd): Ymd {
  return dayAfter(endsOn);
}
