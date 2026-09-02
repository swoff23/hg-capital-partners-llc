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

function epochDays(v: Ymd): number {
  const p = parts(v)!;
  return Date.UTC(p.y, p.m - 1, p.d) / 86_400_000;
}

/** Whole days from today until `v` (negative = past). Null when `v` is blank/invalid. */
export function daysUntil(v: Date | string | null | undefined, now: Date = new Date()): number | null {
  const y = toYmd(v);
  if (!y) return null;
  return epochDays(y) - epochDays(todayYmd(now));
}

/** Strictly before today. False for blank/invalid. */
export function isPastDay(v: Date | string | null | undefined, now: Date = new Date()): boolean {
  const d = daysUntil(v, now);
  return d != null && d < 0;
}

/** "Mar 1, 2026" — never shifts by timezone. "—" for blank/invalid. */
export function fmtDay(
  v: Date | string | null | undefined,
  opts: { year?: "always" | "auto"; now?: Date } = {},
): string {
  const y = toYmd(v);
  if (!y) return "—";
  const p = parts(y)!;
  const showYear = opts.year !== "auto" || p.y !== (opts.now ?? new Date()).getFullYear();
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(showYear ? { year: "numeric" } : {}),
  });
}

/** "today" / "tomorrow" / "yesterday" / "3d ago" / "in 3d". "" for blank/invalid. */
export function relativeDays(v: Date | string | null | undefined, now: Date = new Date()): string {
  const days = daysUntil(v, now);
  if (days == null) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < 0) return `${-days}d ago`;
  return `in ${days}d`;
}

/**
 * Due-date label: anything overdue → "yesterday"; due today → "today"; within
 * the next week → the weekday name; further out → the calendar date (year
 * shown only when it isn't the current one). "" for blank/invalid.
 */
export function dueLabel(v: Date | string | null | undefined, now: Date = new Date()): string {
  const y = toYmd(v);
  if (!y) return "";
  const days = daysUntil(y, now)!;
  if (days < 0) return "yesterday";
  if (days === 0) return "today";
  const p = parts(y)!;
  if (days < 7) {
    return new Date(Date.UTC(p.y, p.m - 1, p.d)).toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "long",
    });
  }
  return fmtDay(y, { year: "auto", now });
}
