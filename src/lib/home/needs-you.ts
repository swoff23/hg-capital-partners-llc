import { dayLabel, daysUntil, fmtDay, toYmd, todayYmdEastern, type Ymd } from "@/lib/dates";
import { STAGE_LABEL, daysInStage, isStuck, type DrawIn } from "@/lib/draws/figures";
import { shortAddress } from "@/lib/normalize";
import { fmtMoney } from "@/lib/utils";

/**
 * Home's Needs you list (docs/home-as-today.md): the things that aren't tasks
 * but need a partner. A property's key date coming up (loan maturity within
 * 90 days, insurance renewal or rental registration within 60; past dates
 * count and read late), a lease end before its notice deadline and the
 * Missing info count (docs/specs/missing-info.md), this year's CapEx as one
 * row, and a QuickBooks link that expired or a sync over 3 days old. Each item is one row that opens
 * its record. Pure; the query that fills it is ./queries, and needs-you.test.ts
 * covers it.
 */

export type NeedsYouKind =
  | "loan"
  | "insurance"
  | "registration"
  | "lease"
  | "missing"
  | "capex"
  | "sync-stale"
  | "sync-lost"
  | "signup"
  | "baselane"
  | "draw"
  | "invoice"
  | "drafts";

/** The rows that carry buttons beside them (contractor onboarding, docs/specs/contractor-onboarding.md 4.5). */
export type NeedsYouActions = "signup" | "baselane";

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
  /** The part of `amount` that's late, a "$4,000 past due" clause in --destructive after it; null when none is. */
  pastDue: number | null;
  /** A key date's label for the date column ("Nov 30", "Tomorrow"), or null. */
  dateLabel: string | null;
  /** The date has passed, so it reads in --destructive. */
  late: boolean;
  /** For ordering: the key date, or null. */
  date: Ymd | null;
  /** The buttons beside the row, and the contractor they act on. Absent on a row that only opens its record. */
  actions?: NeedsYouActions;
  contactId?: string;
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

/**
 * Every key date within its window or already past, oldest past first, then soonest. A loan maturing on a
 * property whose open rehab still holds money back says how much (docs/specs/rehab-draws.md, R11):
 * `undrawn` maps a property's id to that amount.
 */
export function keyDateItems(properties: KeyDateProperty[], today: Ymd, undrawn: ReadonlyMap<string, number> = new Map()): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  for (const p of properties) {
    for (const k of KEY_DATES) {
      const date = toYmd(p[k.field]);
      const days = daysUntil(date, today);
      if (date == null || days == null || days > k.withinDays) continue;
      const late = days < 0;
      const place = shortAddress(p.address) || p.address;
      const held = k.kind === "loan" ? (undrawn.get(p.id) ?? 0) : 0;
      items.push({
        key: `${k.kind}:${p.id}`,
        kind: k.kind,
        href: `/properties/${p.id}`,
        title: k.title,
        state: late ? "Late" : "Due",
        detail: held > 0 ? `${place} · ${fmtMoney(held)} not drawn` : place,
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
// Missing info
// ---------------------------------------------------------------------------

/**
 * The one Missing info row (docs/specs/missing-info.md, D1): the count of
 * required gaps and where they are, opening the worklist. Null with none.
 */
export function missingItem(required: number, places: string): NeedsYouItem | null {
  if (required <= 0) return null;
  return {
    key: "missing",
    kind: "missing",
    href: "/missing",
    title: "Missing info",
    state: "Missing",
    detail: [`${required.toLocaleString("en-US")} to fill in`, places].filter(Boolean).join(" · "),
    amount: null,
    pastDue: null,
    dateLabel: null,
    late: false,
    date: null,
  };
}

// ---------------------------------------------------------------------------
// Drafts from Claude
// ---------------------------------------------------------------------------

/**
 * The one "Drafts from Claude" row (docs/specs/tasks-from-claude.md 6.3, D22):
 * how many of the viewer's own drafts wait, opening the Tasks list where My
 * drafts sits on top. It leads Needs you (`withDraftsItem`). Null with none. The other partner's drafts never count
 * here: they have their own reminder.
 */
export function draftsItem(count: number): NeedsYouItem | null {
  if (!(count > 0)) return null;
  return {
    key: "drafts",
    kind: "drafts",
    href: "/tasks",
    title: "Drafts from Claude",
    state: "Draft",
    detail: `${count.toLocaleString("en-US")} to add`,
    amount: null,
    pastDue: null,
    dateLabel: null,
    late: false,
    date: null,
  };
}

/**
 * The list with the drafts row (see `draftsItem`) first. It is the only reminder that drafts wait (D22), and a
 * phone shows three rows and hides the rest behind "N more", so it never goes behind the key dates.
 */
export function withDraftsItem(items: NeedsYouItem[], count: number): NeedsYouItem[] {
  const row = draftsItem(count);
  return row ? [row, ...items] : items;
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

// ---------------------------------------------------------------------------
// Contractor onboarding
// ---------------------------------------------------------------------------

export interface SignupContact {
  id: string;
  fullName: string;
  phoneE164: string | null;
  email: string | null;
  /** Their trades on one line ("Electric, Handyman"), or null with none. */
  trades: string | null;
  createdAt: Date;
}

/** Someone already in Contractors, for the same-phone and same-email check. */
export interface KnownContact {
  id: string;
  fullName: string;
  phoneE164: string | null;
  email: string | null;
}

const sameEmail = (a: string | null, b: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** "Same phone as Zack Reading" when another contractor has this mobile, else "Same email as ...", else null. A phone wins over an email. */
export function duplicateLine(person: Pick<SignupContact, "id" | "phoneE164" | "email">, others: KnownContact[]): string | null {
  const rest = others.filter((o) => o.id !== person.id);
  const byPhone = person.phoneE164 ? rest.find((o) => o.phoneE164 === person.phoneE164) : undefined;
  if (byPhone) return `Same phone as ${byPhone.fullName}`;
  const byEmail = rest.find((o) => sameEmail(o.email, person.email));
  return byEmail ? `Same email as ${byEmail.fullName}` : null;
}

/** "Tony Bell signed up" rows, oldest first. `others` are the non-archived contractors the sign-ups are checked against. */
export function signupItems(people: SignupContact[], others: KnownContact[]): NeedsYouItem[] {
  return [...people]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    .map((p) => ({
      key: `signup:${p.id}`,
      kind: "signup",
      href: `/contractors/${p.id}`,
      title: `${p.fullName.trim()} signed up`,
      state: "New",
      detail: duplicateLine(p, others) ?? [p.trades, "with your sign-up link"].filter(Boolean).join(" · "),
      amount: null,
      pastDue: null,
      dateLabel: null,
      late: false,
      date: null,
      actions: "signup",
      contactId: p.id,
    }));
}

export interface BaselaneContact {
  id: string;
  fullName: string;
  setupDoneAt: Date;
}

/** "Send Dana Fox the Baselane link" rows, whoever finished setup first on top. */
export function baselaneItems(people: BaselaneContact[], today: Ymd): NeedsYouItem[] {
  return [...people]
    .sort((a, b) => a.setupDoneAt.getTime() - b.setupDoneAt.getTime() || a.id.localeCompare(b.id))
    .map((p) => {
      const day = todayYmdEastern(p.setupDoneAt);
      return {
        key: `baselane:${p.id}`,
        kind: "baselane",
        href: `/contractors/${p.id}`,
        title: `Send ${p.fullName.trim()} the Baselane link`,
        state: "Send",
        detail: day === today ? "Finished setup today" : `Finished setup ${fmtDay(day, { year: "auto", now: today })}`,
        amount: null,
        pastDue: null,
        dateLabel: null,
        late: false,
        date: null,
        actions: "baselane",
        contactId: p.id,
      };
    });
}

// ---------------------------------------------------------------------------
// Rehab draws
// ---------------------------------------------------------------------------

export interface DrawRehab {
  id: string;
  name: string;
  draws: Pick<DrawIn, "number" | "stage" | "stageChangedAt">[];
}

/**
 * Draws that need a partner (docs/specs/rehab-draws.md, R11): one with the lender that hasn't moved in 10 days,
 * the longest stuck first. A draw being built doesn't earn a row.
 */
export function drawItems(rehabs: readonly DrawRehab[], today: Ymd): NeedsYouItem[] {
  const stuck: { item: NeedsYouItem; days: number }[] = [];
  for (const r of rehabs) {
    for (const d of r.draws) {
      if (!isStuck(d, today)) continue;
      const days = daysInStage(d, today);
      stuck.push({
        days,
        item: {
          key: `draw-stuck:${r.id}:${d.number}`,
          kind: "draw",
          href: `/draws/${r.id}`,
          title: `${r.name} · draw ${d.number}`,
          state: "Stuck",
          detail: `No change in ${days} days · ${STAGE_LABEL[d.stage]}`,
          amount: null,
          pastDue: null,
          dateLabel: null,
          late: false,
          date: null,
        },
      });
    }
  }
  return stuck.sort((a, b) => b.days - a.days || a.item.title.localeCompare(b.item.title)).map((s) => s.item);
}

// ---------------------------------------------------------------------------
// Contractor invoices
// ---------------------------------------------------------------------------

/**
 * The one invoices row (docs/contractor-invoices-plan.md, M12 and 6.1 item 9): how many wait in To review and who
 * sent them, opening that view. Null with none. `contractors` are the names of those with a contractor on them,
 * oldest invoice first and each once; `senders` is everyone who sent one, an unmatched address included, so
 * "and N more" counts the senders we can't name. No dollar figure and no date: an emailed invoice has no total
 * until someone types it, so a sum would read low. Snooze comes when snooze and dismiss does.
 */
export function invoicesItem(count: number, senders: number, contractors: readonly string[]): NeedsYouItem | null {
  if (count <= 0) return null;
  const names = contractors.slice(0, 2);
  const more = Math.max(0, senders - names.length);
  const parts = [...names, ...(more > 0 && names.length > 0 ? [`${more} more`] : [])];
  const detail =
    names.length === 0
      ? senders > 1
        ? `${senders} unknown senders`
        : senders === 1
          ? "Unknown sender"
          : "No contractor yet"
      : parts.length === 1
        ? parts[0]
        : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return {
    key: "invoices",
    kind: "invoice",
    href: "/invoices?view=review",
    title: `${count.toLocaleString("en-US")} ${count === 1 ? "invoice" : "invoices"} to review`,
    state: "Review",
    detail,
    amount: null,
    pastDue: null,
    dateLabel: null,
    late: false,
    date: null,
  };
}

/**
 * The To pay row: approved invoices waiting to be paid, opening that view, with what's owed (every To pay invoice has
 * a total, since Approve needs one). Names the contractors oldest first, two then "and N more". Null with none.
 */
export function invoicesToPayItem(count: number, contractors: readonly string[], totalDollars: number): NeedsYouItem | null {
  if (count <= 0) return null;
  const names = contractors.slice(0, 2);
  const more = Math.max(0, contractors.length - names.length);
  const parts = [...names, ...(more > 0 ? [`${more} more`] : [])];
  const detail = parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return {
    key: "invoices-pay",
    kind: "invoice",
    href: "/invoices?view=pay",
    title: `${count.toLocaleString("en-US")} ${count === 1 ? "invoice" : "invoices"} to pay`,
    state: "Pay",
    detail,
    amount: totalDollars,
    pastDue: null,
    dateLabel: null,
    late: false,
    date: null,
  };
}

/**
 * The list in order: key dates and lease ends (late first, then soonest), draws that need us, invoices to review, invoices to pay, new sign-ups,
 * Baselane links to send, the Missing info row, this year's CapEx, then QuickBooks.
 */
export function needsYouList(parts: {
  keyDates: NeedsYouItem[];
  leaseEnds?: NeedsYouItem[];
  draws?: NeedsYouItem[];
  invoices?: NeedsYouItem | null;
  invoicesToPay?: NeedsYouItem | null;
  signups?: NeedsYouItem[];
  baselane?: NeedsYouItem[];
  missing?: NeedsYouItem | null;
  capex: NeedsYouItem | null;
  quickbooks: NeedsYouItem | null;
}): NeedsYouItem[] {
  const dated = [...parts.keyDates, ...(parts.leaseEnds ?? [])].sort(
    (a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0) || a.title.localeCompare(b.title) || a.detail.localeCompare(b.detail),
  );
  return [
    ...dated,
    ...(parts.draws ?? []),
    ...(parts.invoices ? [parts.invoices] : []),
    ...(parts.invoicesToPay ? [parts.invoicesToPay] : []),
    ...(parts.signups ?? []),
    ...(parts.baselane ?? []),
    ...(parts.missing ? [parts.missing] : []),
    ...(parts.capex ? [parts.capex] : []),
    ...(parts.quickbooks ? [parts.quickbooks] : []),
  ];
}
