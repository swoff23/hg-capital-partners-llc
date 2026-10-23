/**
 * Date-only values ("YYYY-MM-DD") — purchase dates, loan maturity, insurance
 * renewal, task due dates. These have no time and no timezone, but Postgres
 * stores them as TIMESTAMP at UTC midnight and JavaScript's `new Date(...)`
 * will happily shift that by the viewer's offset: `new Date("2026-03-01")`
 * rendered in Buffalo is "Feb 28". Every helper here works on the calendar
 * date only, so the same value formats identically on the UTC server, in a
 * Buffalo browser, and in local dev.
 *
 * Conventions:
 *  - `Ymd` is the wire/storage shape for a calendar date.
 *  - A `Date` passed in is read by its UTC fields (that is how the DB values
 *    come back). Never pass a "now"-style instant expecting local semantics.
 *  - "today" is the LOCAL calendar date of whoever is running the code (the
 *    browser for client components, UTC on Vercel). That is what a person
 *    means by "due today".
 *
 * Pure and dependency-free; see dates.test.ts.
 */

export type Ymd = string; // "YYYY-MM-DD"

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parts(v: Ymd): { y: number; m: number; d: number } | null {
  const m = YMD_RE.exec(v);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // reject Feb 30 etc. by round-tripping through Date.UTC
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

/**
 * Normalize to "YYYY-MM-DD" or null. A Date is read by its UTC fields; a string
 * must start with a valid calendar date (an ISO instant at UTC midnight is
 * accepted, since that is how a stored date serializes).
 */
export function toYmd(v: Date | string | null | undefined): Ymd | null {
  if (v == null) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  const p = parts(v.trim());
  return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : null;
}

/** For writing to a Prisma DateTime column: UTC midnight, or null when invalid/blank. */
export function ymdToDate(v: string | null | undefined): Date | null {
  const y = toYmd(v);
  if (!y) return null;
  const p = parts(y)!;
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

/** The local calendar date of `now` (browser-local on the client, UTC on Vercel). */
export function todayYmd(now: Date = new Date()): Ymd {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** HG works on Buffalo time. */
export const HG_TIME_ZONE = "America/New_York";

/**
 * Today's calendar date in Buffalo, wherever the code runs. Server code that
 * decides "today" or "overdue" (task lists, emails, crons) must use this:
 * todayYmd() on Vercel is UTC, which rolls over at 8pm Eastern.
 */
export function todayYmdEastern(now: Date = new Date()): Ymd {
  const get = (type: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: HG_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The instant a Buffalo calendar day starts, for counting what happened "today"
 * in a timestamp column (the D30 email cap). Eastern midnight is 04:00 or
 * 05:00 UTC depending on daylight time; whichever lands on 00:00 that day.
 */
export function easternDayStart(v: Ymd): Date {
  const p = parts(v);
  if (!p) throw new Error(`Not a date: ${v}`);
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: HG_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (const h of [4, 5]) {
    const at = new Date(Date.UTC(p.y, p.m - 1, p.d, h));
    if (todayYmdEastern(at) === v && clock.format(at) === "00:00") return at;
  }
  throw new Error(`No Eastern midnight found for ${v}`);
}

function epochDays(v: Ymd): number {
  const p = parts(v)!;
  return Date.UTC(p.y, p.m - 1, p.d) / 86_400_000;
}

/**
 * "Now" for the helpers below: an instant (read as the local calendar date,
 * see todayYmd) or an explicit "YYYY-MM-DD" such as todayYmdEastern().
 */
type Now = Date | Ymd;
const todayOf = (now: Now): Ymd => (typeof now === "string" ? now : todayYmd(now));

/** Whole days from today until `v` (negative = past). Null when `v` is blank/invalid. */
export function daysUntil(v: Date | string | null | undefined, now: Now = new Date()): number | null {
  const y = toYmd(v);
  if (!y) return null;
  return epochDays(y) - epochDays(todayOf(now));
}

/** Strictly before today. False for blank/invalid. */
export function isPastDay(v: Date | string | null | undefined, now: Now = new Date()): boolean {
  const d = daysUntil(v, now);
  return d != null && d < 0;
}

/**
 * "Mar 1, 2026", or "Sun, Mar 1, 2026" with `weekday`. Never shifts by
 * timezone. "—" for blank/invalid.
 */
export function fmtDay(
  v: Date | string | null | undefined,
  opts: { year?: "always" | "auto"; now?: Now; weekday?: boolean } = {},
): string {
  const y = toYmd(v);
  if (!y) return "—";
  const p = parts(y)!;
  const showYear = opts.year !== "auto" || p.y !== Number(todayOf(opts.now ?? new Date()).slice(0, 4));
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    ...(opts.weekday ? { weekday: "short" } : {}),
    month: "short",
    day: "numeric",
    ...(showYear ? { year: "numeric" } : {}),
  });
}

/** "today" / "tomorrow" / "yesterday" / "3d ago" / "in 3d". "" for blank/invalid. */
export function relativeDays(v: Date | string | null | undefined, now: Now = new Date()): string {
  const days = daysUntil(v, now);
  if (days == null) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < 0) return `${-days}d ago`;
  return `in ${days}d`;
}

/**
 * Due-date label. Overdue: "yesterday", then "3d late" up to a week, then the
 * calendar date (so a task 40 days late doesn't read like one a day late).
 * Due today → "today"; within the next week → the weekday name; further out →
 * the calendar date (year shown only when it isn't the current one). "" for
 * blank/invalid.
 */
export function dueLabel(v: Date | string | null | undefined, now: Now = new Date()): string {
  const y = toYmd(v);
  if (!y) return "";
  const today = todayOf(now);
  const days = daysUntil(y, today)!;
  if (days === -1) return "yesterday";
  if (days < 0 && days > -7) return `${-days}d late`;
  if (days === 0) return "today";
  const p = parts(y)!;
  if (days > 0 && days < 7) {
    return new Date(Date.UTC(p.y, p.m - 1, p.d)).toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "long",
    });
  }
  return fmtDay(y, { year: "auto", now: today });
}
