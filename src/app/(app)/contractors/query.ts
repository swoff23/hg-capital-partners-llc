import type { Prisma } from "@prisma/client";
import { docOnFile } from "@/lib/contacts";
import { tradeKey } from "@/lib/contractors/trade-map";
import {
  accountStatus,
  isAccountStatus,
  onboardingStatus,
  type AccountStatus,
  type OnboardingStatus,
  type SignupSourceValue,
} from "@/lib/contractors/onboarding";
import { portalAccess, type PortalAccessFacts } from "@/lib/portal/access-state";
import { joinFacet, parseFacet } from "@/lib/list-memory";
import { archivedRecord, liveRecord } from "@/lib/record-scope";
import { searchTerms } from "@/lib/search";
import { contactSearchWhere } from "@/lib/search-keys";

/*
 * What the Contractors page asks of the database (docs/specs/selectors.md 5,
 * search 2.11): a search over the name, company, trades, email and phone, the
 * palette's own (lib/search-keys.ts contactSearchWhere); a Trade filter
 * with several picks; a Status filter (New, Invited, Opened, Onboarding, Active,
 * Access off: the Status column); and two yes or no filters, "Has login" and "Needs W-9".
 * A third, "Archived", swaps the list for the archived contractors, whom
 * nothing else shows (lib/archive.ts). Pure, so query.test.ts checks it
 * without a database. The URL: `q`, `trade` (trade ids, comma-joined),
 * `status` (comma-joined), `login=1`, `w9=1` and `archived=1`.
 */

export interface ContractorFilters {
  q: string;
  /** Trade ids, or names from an older link until `resolveTradePicks` reads them. */
  trades: string[];
  /** Account statuses: a row passes when its Status column reads one of them. Empty keeps everyone. */
  status: AccountStatus[];
  hasLogin: boolean;
  needsW9: boolean;
  /** The archived contractors instead of the rest. */
  archived: boolean;
}

type Params = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export function parseContractorFilters(sp: Params): ContractorFilters {
  return {
    q: str(sp.q).trim(),
    trades: parseFacet(str(sp.trade)),
    status: parseFacet(str(sp.status)).filter(isAccountStatus),
    hasLogin: str(sp.login) === "1",
    needsW9: str(sp.w9) === "1",
    archived: str(sp.archived) === "1",
  };
}

/** Who the list starts from: the archived contractors under Archived, everyone else otherwise. */
export const contractorScope = (f: Pick<ContractorFilters, "archived">) => (f.archived ? archivedRecord : liveRecord);

/** Whether anything narrows the list: the subtitle reads "4 of 52" and the result line shows. Archived is a different list, not a narrowing. */
export const isNarrowed = (f: ContractorFilters) => f.q !== "" || f.trades.length > 0 || f.status.length > 0 || f.hasLogin || f.needsW9;

/** The query as a URL query string, for tests and links. */
export function contractorQuery(f: ContractorFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.trades.length) p.set("trade", joinFacet(f.trades));
  if (f.status.length) p.set("status", joinFacet(f.status));
  if (f.hasLogin) p.set("login", "1");
  if (f.needsW9) p.set("w9", "1");
  if (f.archived) p.set("archived", "1");
  return p.toString();
}

/**
 * The Trade filter's picks as trade ids. An id stays; a name, from a link made
 * before trades were a list ("?trade=Plumbing"), becomes its trade's id,
 * ignoring case; anything else drops. The page sends a link with a name on to
 * the same list by id, so the checklist shows the pick.
 */
export function resolveTradePicks(picks: readonly string[], trades: readonly { id: string; name: string }[]): string[] {
  const byId = new Set(trades.map((t) => t.id));
  const byKey = new Map(trades.map((t) => [tradeKey(t.name), t.id]));
  const out = picks.map((p) => (byId.has(p) ? p : byKey.get(tradeKey(p)))).filter((id): id is string => !!id);
  return [...new Set(out)];
}

type TradeRow = { tradeLinks: readonly { trade: { id: string } }[] };

/** Whether a contractor does any of the picked trades (ids); no picks keeps everyone. */
export function matchesTrades(c: TradeRow, picks: readonly string[]): boolean {
  return picks.length === 0 || c.tradeLinks.some((l) => picks.includes(l.trade.id));
}

/** Every trade, A to Z, with how many of the rows do it. A zero stays listed. */
export function tradeOptions(trades: readonly { id: string; name: string }[], rows: readonly TradeRow[]): { key: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) for (const l of r.tradeLinks) counts.set(l.trade.id, (counts.get(l.trade.id) ?? 0) + 1);
  return [...trades]
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
    .map((t) => ({ key: t.id, label: t.name, count: counts.get(t.id) ?? 0 }));
}

/**
 * The search and "Has login" as a `where`, and "Needs W-9" as far as the
 * database can take it (no W-9 link, and no W-9 uploaded). The Trade and Status
 * filters and the rest of "Needs W-9" are applied on the rows (`matchesTrades`,
 * `matchesStatus`, `matchesNeedsW9`):
 * the rows without the Trade filter are what the checklist's counts come
 * from, and a W-9 named in the notes is read by `docOnFile`, as the list's
 * Docs column reads it. A login is an active portal account. The search
 * matches a trade's name.
 */
export function contractorsWhere(f: ContractorFilters): Prisma.ContactWhereInput {
  const terms = searchTerms(f.q);
  const parts: Prisma.ContactWhereInput[] = [
    contractorScope(f),
    terms.length > 0 ? contactSearchWhere(f.q, terms) : {},
    f.hasLogin ? { portalAccount: { is: { status: "ACTIVE" } } } : {},
    f.needsW9 ? { w9Url: null, documents: { none: { kind: "W9" } } } : {},
  ];
  return { AND: parts.filter((p) => Object.keys(p).length > 0) };
}

/**
 * Whether a contractor passes "Needs W-9": no link, no uploaded W-9, and no
 * "W-9 on file:" line with a name after it in the notes. The same rule the
 * Docs column shows.
 */
export function matchesNeedsW9(
  c: { w9Url: string | null; comments: string | null; documents?: readonly { kind: string }[] },
  f: Pick<ContractorFilters, "needsW9">,
): boolean {
  return !f.needsW9 || (!c.w9Url && !c.documents?.some((d) => d.kind === "W9") && !docOnFile(c.comments, "W-9"));
}

/** What the onboarding badge reads: the invite, the login and the setup fields (include `STATUS_INCLUDE` for them). */
export type StatusRow = {
  signupSource: SignupSourceValue;
  needsReview: boolean;
  setupDoneAt: Date | null;
  portalAccount: { id: string } | null;
  /** Their newest personal invite, alone. */
  portalInvites: readonly { openedAt: Date | null }[];
  /** Archived: no badge (an archived sign-up keeps needsReview so Undo brings them back as New). */
  archivedAt?: Date | null;
};

/**
 * The relations a row needs for `statusOf` and `accountStatusOf`: the login (what sign-in does with it, never the
 * password hash) and the newest personal invite's opened time.
 */
export const STATUS_INCLUDE = {
  portalAccount: { select: { id: true, status: true, mustChangePassword: true, lastSignInAt: true, lastSeenAt: true } },
  portalInvites: { where: { shared: false }, orderBy: { createdAt: "desc" }, take: 1, select: { openedAt: true } },
} as const satisfies Prisma.ContactInclude;

/** The badge a row carries (New, Invited, Opened, Onboarding), or null. The list and the filter both read it. */
export function statusOf(c: StatusRow): OnboardingStatus | null {
  if (c.archivedAt) return null;
  return onboardingStatus({
    signupSource: c.signupSource,
    needsReview: c.needsReview,
    setupDoneAt: c.setupDoneAt,
    hasLogin: !!c.portalAccount,
    inviteOpened: !!c.portalInvites[0]?.openedAt,
  });
}

/** What the Status column reads: a `StatusRow` with the whole login and whether the contact is active. */
export type AccountRow = Omit<StatusRow, "portalAccount"> & {
  active: boolean;
  portalAccount: ({ id: string } & PortalAccessFacts) | null;
};

/** The Status column (lib/contractors/onboarding.ts `accountStatus`): the onboarding badge, else the login's state. Archived is the dash. */
export function accountStatusOf(c: AccountRow): AccountStatus | null {
  if (c.archivedAt) return null;
  return accountStatus(statusOf(c), c.portalAccount ? portalAccess(c.portalAccount, c.active).state : null);
}

/** Whether a contractor's Status column is one of the picked statuses; no picks keeps everyone. */
export function matchesStatus(c: AccountRow, picks: readonly AccountStatus[]): boolean {
  if (picks.length === 0) return true;
  const s = accountStatusOf(c);
  return !!s && picks.includes(s);
}

/**
 * The one sentence an empty list says, and the way out. `total` is the
 * list's whole: the archived ones under Archived. A search with a filter on
 * (Has login, Needs W-9, a trade, a status) blames neither alone: "these filters", and
 * Clear filters takes off both, as the Tasks and Deals lists do. Blaming the
 * search offered Clear search, which only led to a second empty list.
 */
export function emptyContractors(f: ContractorFilters, total: number): { line: string; clear: "search" | "filters" | null } {
  if (f.archived && total === 0) return { line: "No archived contractors.", clear: "filters" };
  if (total === 0) return { line: "No contractors yet.", clear: null };
  const filtered = f.trades.length > 0 || f.status.length > 0 || f.hasLogin || f.needsW9;
  if (f.q && !filtered) return { line: `No contractors match “${f.q}”.`, clear: "search" };
  return { line: "No contractors match these filters.", clear: "filters" };
}

/**
 * The header's count: always the whole list, as Portfolio's is. The line under
 * the filters says how many show. Under Archived the whole is the archived
 * contractors: "2 archived".
 */
export function contractorsCount(total: number, archived = false): string {
  const n = total.toLocaleString("en-US");
  if (archived) return `${n} archived`;
  return `${n} ${total === 1 ? "contractor" : "contractors"}`;
}
