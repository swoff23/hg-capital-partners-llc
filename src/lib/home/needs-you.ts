import { dayLabel, daysUntil, fmtDay, toYmd, todayYmdEastern, type Ymd } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";

/**
 * Home's Needs you list (docs/home-as-today.md): the things that aren't tasks
 * but need a partner. A property's key date coming up (loan maturity within
 * 90 days, insurance renewal or rental registration within 60; past dates
 * count and read late), this year's CapEx as one row, and a QuickBooks link
 * that expired or a sync over 3 days old. Each item is one row that opens
 * its record. Pure; the query that fills it is ./queries, and needs-you.test.ts
 * covers it.
 */

export type NeedsYouKind = "loan" | "insurance" | "registration" | "capex" | "sync-stale" | "sync-lost";

/** One row, serializable from the server page to the client list. */
export interface NeedsYouItem {
  key: string;
  kind: NeedsYouKind;
  /** The record the row opens. */
  href: string;
  title: string;
  /** The one word beside the mark: "Due", "Late", "Stale", "Expired". */
  state: string;
  /** The place, or what to know: "118 Congress St", "Reconnect to keep syncing". */
  detail: string;
  /** Dollars set ahead of the detail ("$32,000 across 4 properties"), or null. */
  amount: number | null;
  /** The part of `amount` that's late, a "$4,000 past due" clause in --danger after it; null when none is. */
  pastDue: number | null;
  /** A key date's label for the date column ("Nov 30", "Tomorrow"), or null. */
  dateLabel: string | null;
  /** The date has passed, so it reads in --danger. */
  late: boolean;
  /** For ordering: the key date, or null. */
  date: Ymd | null;
}

/** On a phone the list shows this many rows, then "N more". */
export const PHONE_ROWS = 3;

/** How many rows hide behind "N more" on a phone. */
export function moreCount(total: number): number {
  return Math.max(0, total - PHONE_ROWS);
}

// ---------------------------------------------------------------------------
// Key dates
// ---------------------------------------------------------------------------

export interface KeyDateProperty {
  id: string;
  address: string;
  loanMaturityDate: Date | string | null;
  insuranceRenewalDate: Date | string | null;
  rentalRegistrationExpiry: Date | string | null;
}

const KEY_DATES = [
  { field: "loanMaturityDate", kind: "loan", title: "Loan maturity", withinDays: 90 },
  { field: "insuranceRenewalDate", kind: "insurance", title: "Insurance renewal", withinDays: 60 },
  { field: "rentalRegistrationExpiry", kind: "registration", title: "Rental registration", withinDays: 60 },
] as const;

/** Every key date within its window or already past, oldest past first, then soonest. */
export function keyDateItems(properties: KeyDateProperty[], today: Ymd): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  for (const p of properties) {
    for (const k of KEY_DATES) {
      const date = toYmd(p[k.field]);
      const days = daysUntil(date, today);
      if (date == null || days == null || days > k.withinDays) continue;
      const late = days < 0;
      items.push({
        key: `${k.kind}:${p.id}`,
        kind: k.kind,
        href: `/properties/${p.id}`,
        title: k.title,
        state: late ? "Late" : "Due",
        detail: shortAddress(p.address) || p.address,
        amount: null,
        pastDue: null,
        dateLabel: dayLabel(date, today),
        late,
        date,
      });
    }
  }
  return items.sort(
    (a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0) || a.title.localeCompare(b.title) || a.detail.localeCompare(b.detail),
  );
}

// ---------------------------------------------------------------------------
// CapEx
// ---------------------------------------------------------------------------

/** What the portfolio forecast (portfolioCapexForecast) says about its first year. */
export interface CapexForecastView {
  fromYear: number;
  perYear: number[];
  /** Spend past its replacement age before this year: the part of this year's total that's late. */
  overdueTotal?: number;
  rows: { perYear: number[] }[];
}

/**
 * This calendar year's CapEx as one row that opens the forecast on Portfolio,
 * or null when there's none. Anything past its replacement age adds a
 * "$4,000 past due" clause; the row's mark stays --warn, since a partner
 * decides the spend.
 */
export function capexItem(f: CapexForecastView): NeedsYouItem | null {
  const total = f.perYear[0] ?? 0;
  if (!(total > 0)) return null;
  const properties = f.rows.filter((r) => (r.perYear[0] ?? 0) > 0).length;
  return {
    key: "capex",
    kind: "capex",
    href: "/properties#capex",
    title: `CapEx in ${f.fromYear}`,
    state: "Due",
    detail: `across ${properties} ${properties === 1 ? "property" : "properties"}`,
    amount: total,
    pastDue: (f.overdueTotal ?? 0) > 0 ? f.overdueTotal! : null,
    dateLabel: null,
    late: false,
    date: null,
  };
}

// ---------------------------------------------------------------------------
// QuickBooks
// ---------------------------------------------------------------------------

/** A sync older than this needs a look. */
export const STALE_SYNC_MS = 3 * 24 * 60 * 60 * 1000;

export interface QuickbooksState {
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  lastSuccessfulSyncAt: Date | null;
  /** When the connection was made, standing in for a first sync that never came. */
  createdAt: Date;
}

/**
 * The QuickBooks row, or null. Never connected (no row) and disconnected on
 * purpose (REVOKED, which only the Disconnect button sets) say nothing.
 * EXPIRED means the link was lost: a token refresh failed, or someone
 * disconnected the app in Intuit. An active link whose last good sync is
 * over 3 days old is stale.
 */
export function quickbooksItem(conn: QuickbooksState | null, now: Date): NeedsYouItem | null {
  if (!conn || conn.status === "REVOKED") return null;
  const base = { key: "quickbooks", href: "/financials/settings", amount: null, pastDue: null, dateLabel: null, late: false, date: null };
  if (conn.status === "EXPIRED") {
    return { ...base, kind: "sync-lost", title: "QuickBooks connection", state: "Expired", detail: "Reconnect to keep syncing" };
  }
  const last = conn.lastSuccessfulSyncAt;
  if (now.getTime() - (last ?? conn.createdAt).getTime() <= STALE_SYNC_MS) return null;
  const detail = last
    ? `Last synced ${fmtDay(todayYmdEastern(last), { year: "auto", now: todayYmdEastern(now) })}`
    : "Never synced";
  return { ...base, kind: "sync-stale", title: "QuickBooks sync", state: "Stale", detail };
}

/** The list in order: key dates (late first, then soonest), this year's CapEx, then QuickBooks. */
export function needsYouList(parts: {
  keyDates: NeedsYouItem[];
  capex: NeedsYouItem | null;
  quickbooks: NeedsYouItem | null;
}): NeedsYouItem[] {
  return [...parts.keyDates, ...(parts.capex ? [parts.capex] : []), ...(parts.quickbooks ? [parts.quickbooks] : [])];
}
