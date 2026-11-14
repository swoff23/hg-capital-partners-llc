import { toYmd, type Ymd } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";

/**
 * What a lease's dates say, decided from the dates alone (docs/specs/tenants.md
 * section 3). Pure: every caller passes Buffalo's today (todayYmdEastern), so
 * the list, the property page, the lease page and the portal agree on the day
 * itself, with nothing waiting on a save.
 *
 * A stay runs from `movesIn` up to the day before `movesOut`: they leave on
 * `movesOut`, so the next household can move in that day. A blank `movesIn`
 * means they live there now (an import with no date); a blank `movesOut`
 * means they're staying, month to month included, until they give notice.
 * A term runs from `startsOn` through `endsOn`, both days included.
 */

export type LeaseStatus = "current" | "upcoming" | "past";

export const LEASE_STATUS_LABEL: Record<LeaseStatus, string> = {
  current: "Current",
  upcoming: "Upcoming",
  past: "Past",
};

type Day = Date | string | null | undefined;
export type StayDates = { movesIn: Day; movesOut: Day };

const EARLIEST = "0000-01-01";
const LATEST = "9999-12-31";

export function leaseStatus(l: StayDates, today: Ymd): LeaseStatus {
  const out = toYmd(l.movesOut);
  if (out && out <= today) return "past";
  const into = toYmd(l.movesIn);
  if (into && into > today) return "upcoming";
  return "current";
}

/** Whether two stays share a night. Back to back (one moves out the day the other moves in) doesn't. */
export function staysOverlap(a: StayDates, b: StayDates): boolean {
  const aIn = toYmd(a.movesIn) ?? EARLIEST;
  const aOut = toYmd(a.movesOut) ?? LATEST;
  const bIn = toYmd(b.movesIn) ?? EARLIEST;
  const bOut = toYmd(b.movesOut) ?? LATEST;
  return aIn < bOut && bIn < aOut;
}

type UnitStay = StayDates & { unitId: string | null };

/**
 * The lease living in a unit today, or null when it's vacant. `unitId` null is
 * a property with no units. Leases can't overlap (the service refuses it), so
 * there is at most one; should two ever match, the later move-in wins.
 */
export function livingLease<L extends UnitStay>(leases: readonly L[], unitId: string | null, today: Ymd): L | null {
  let best: L | null = null;
  for (const l of leases) {
    if ((l.unitId ?? null) !== (unitId ?? null) || leaseStatus(l, today) !== "current") continue;
    if (!best || (toYmd(l.movesIn) ?? EARLIEST) > (toYmd(best.movesIn) ?? EARLIEST)) best = l;
  }
  return best;
}

/** The next household waiting to move into a unit: its earliest upcoming lease, or null. */
export function nextLease<L extends UnitStay>(leases: readonly L[], unitId: string | null, today: Ymd): L | null {
  let best: L | null = null;
  for (const l of leases) {
    if ((l.unitId ?? null) !== (unitId ?? null) || leaseStatus(l, today) !== "upcoming") continue;
    if (!best || toYmd(l.movesIn)! < toYmd(best.movesIn)!) best = l;
  }
  return best;
}

export type TermDates = { startsOn: Day; endsOn: Day };

function byStart<T extends TermDates>(terms: readonly T[]): T[] {
  return [...terms].sort((a, b) => (toYmd(a.startsOn) ?? "").localeCompare(toYmd(b.startsOn) ?? ""));
}

/**
 * The term that sets the rent today, and whether they've gone month to month.
 * In a term: that term. Past the last one with nobody moved out: the last term,
 * month to month since the day after it ended. Before any term starts (an
 * upcoming lease): the first term. No terms: null.
 */
export function termToday<T extends TermDates>(terms: readonly T[], today: Ymd): { term: T; monthToMonthSince: Ymd | null } | null {
  if (terms.length === 0) return null;
  const sorted = byStart(terms);
  const started = sorted.filter((t) => (toYmd(t.startsOn) ?? LATEST) <= today);
  if (started.length === 0) return { term: sorted[0], monthToMonthSince: null };
  const term = started[started.length - 1];
  const end = toYmd(term.endsOn);
  if (end && end < today) return { term, monthToMonthSince: dayAfter(end) };
  return { term, monthToMonthSince: null };
}

/** Terms on one lease may not share a day; the next may start the day after one ends. The first pair that does, or null. */
export function overlappingTerms<T extends TermDates>(terms: readonly T[]): [T, T] | null {
  const sorted = byStart(terms);
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = toYmd(sorted[i - 1].endsOn) ?? LATEST;
    const start = toYmd(sorted[i].startsOn) ?? EARLIEST;
    if (start <= prevEnd) return [sorted[i - 1], sorted[i]];
  }
  return null;
}

export function dayAfter(day: Ymd): Ymd {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** "Feb 2027": a lease end or a move date in a row, where the day isn't worth the room. */
export function monthYear(v: Day): string {
  const y = toYmd(v);
  if (!y) return "—";
  const [yr, mo] = y.split("-").map(Number);
  return new Date(Date.UTC(yr, mo - 1, 1)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "numeric" });
}

/**
 * The Lease ends cell: in a term with an end, its month ("Feb 2027"); a term
 * with no end, or past the last one, "Monthly"; a past lease, when they left
 * ("Moved out Aug 2026"); an upcoming lease with no term yet, when they arrive.
 */
export function leaseEndsLabel(lease: StayDates, terms: readonly TermDates[], today: Ymd): string {
  const status = leaseStatus(lease, today);
  if (status === "past") return `Moved out ${monthYear(lease.movesOut)}`;
  const now = termToday(terms, today);
  if (!now) return status === "upcoming" ? `Moves in ${monthYear(lease.movesIn)}` : "—";
  if (now.monthToMonthSince || !toYmd(now.term.endsOn)) return "Monthly";
  return monthYear(now.term.endsOn);
}

/** "647 Prospect Ave. · Front", or the street alone for a whole house: a lease's home, wherever one is named. */
export function homeLabel(address: string, unitLabel: string | null): string {
  const street = shortAddress(address) || address;
  return unitLabel ? `${street} · ${unitLabel}` : street;
}
