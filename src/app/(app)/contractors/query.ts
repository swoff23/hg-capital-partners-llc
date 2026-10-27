import type { Prisma } from "@prisma/client";
import { cleanTrades, docOnFile } from "@/lib/contacts";
import { joinFacet, parseFacet } from "@/lib/list-memory";
import { everyTermMatches, searchTerms } from "@/lib/search";

/*
 * What the Contractors page asks of the database (docs/specs/selectors.md 5,
 * search 2.11): a search over the name, company and trades; a Trade filter
 * with several picks; and two yes or no filters, "Has login" and "Needs W-9".
 * Pure, so query.test.ts checks it without a database. The URL: `q`, `trade`
 * (comma-joined), `login=1` and `w9=1`.
 */

export interface ContractorFilters {
  q: string;
  trades: string[];
  hasLogin: boolean;
  needsW9: boolean;
}

type Params = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export function parseContractorFilters(sp: Params): ContractorFilters {
  return {
    q: str(sp.q).trim(),
    trades: parseFacet(str(sp.trade)),
    hasLogin: str(sp.login) === "1",
    needsW9: str(sp.w9) === "1",
  };
}

/** Whether anything narrows the list: the subtitle reads "4 of 52" and the result line shows. */
export const isNarrowed = (f: ContractorFilters) => f.q !== "" || f.trades.length > 0 || f.hasLogin || f.needsW9;

/** The query as a URL query string, for tests and links. */
export function contractorQuery(f: ContractorFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.trades.length) p.set("trade", joinFacet(f.trades));
  if (f.hasLogin) p.set("login", "1");
  if (f.needsW9) p.set("w9", "1");
  return p.toString();
}

/** The trades one contractor does, once each: "Plumbing / HVAC" is two. The import's repeats are folded first. */
export function tradeTokens(trades: string | null | undefined): string[] {
  const clean = cleanTrades(trades);
  return clean ? clean.split("/").map((t) => t.trim()).filter(Boolean) : [];
}

/** Whether a contractor does any of the picked trades (exact words, any case); no picks keeps everyone. */
export function matchesTrades(trades: string | null | undefined, picks: readonly string[]): boolean {
  if (picks.length === 0) return true;
  const has = new Set(tradeTokens(trades).map((t) => t.toLowerCase()));
  return picks.some((p) => has.has(p.toLowerCase()));
}

/** Every trade in the rows, A to Z (case folded together, the first spelling kept), with how many contractors do it. */
export function tradeOptions(rows: readonly { trades: string | null }[]): { key: string; label: string; count: number }[] {
  const seen = new Map<string, { label: string; count: number }>();
  for (const r of rows) {
    for (const t of tradeTokens(r.trades)) {
      const k = t.toLowerCase();
      const prev = seen.get(k);
      seen.set(k, { label: prev?.label ?? t, count: (prev?.count ?? 0) + 1 });
    }
  }
  return [...seen.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((v) => ({ key: v.label, label: v.label, count: v.count }));
}

/**
 * The search and "Has login" as a `where`, and "Needs W-9" as far as the
 * database can take it (no W-9 link). The Trade filter and the rest of
 * "Needs W-9" are applied on the rows (`matchesTrades`, `matchesNeedsW9`):
 * trades are free text, and a substring would find "Electric" in "Electrical";
 * a W-9 named in the notes is read by `docOnFile`, as the list's Docs column
 * reads it. A login is an active portal account.
 */
export function contractorsWhere(f: ContractorFilters): Prisma.ContactWhereInput {
  const terms = searchTerms(f.q);
  const parts: Prisma.ContactWhereInput[] = [
    terms.length > 0 ? everyTermMatches<Prisma.ContactWhereInput>(terms, (t) => [{ fullName: t }, { company: t }, { trades: t }]) : {},
    f.hasLogin ? { portalAccount: { is: { status: "ACTIVE" } } } : {},
    f.needsW9 ? { w9Url: null } : {},
  ];
  return { AND: parts.filter((p) => Object.keys(p).length > 0) };
}

/**
 * Whether a contractor passes "Needs W-9": no link, and no "W-9 on file:" line
 * with a name after it in the notes. The same rule the Docs column shows.
 */
export function matchesNeedsW9(c: { w9Url: string | null; comments: string | null }, f: Pick<ContractorFilters, "needsW9">): boolean {
  return !f.needsW9 || (!c.w9Url && !docOnFile(c.comments, "W-9"));
}

/**
 * The one sentence an empty list says, and the way out. A search with a
 * filter on (Has login, Needs W-9, a trade) blames neither alone: "these
 * filters", and Clear filters takes off both, as the Tasks and Deals lists
 * do. Blaming the search offered Clear search, which only led to a second
 * empty list.
 */
export function emptyContractors(f: ContractorFilters, total: number): { line: string; clear: "search" | "filters" | null } {
  if (total === 0) return { line: "No contractors yet.", clear: null };
  const filtered = f.trades.length > 0 || f.hasLogin || f.needsW9;
  if (f.q && !filtered) return { line: `No contractors match “${f.q}”.`, clear: "search" };
  return { line: "No contractors match these filters.", clear: "filters" };
}

/** The header's count: always the whole list, as Portfolio's is. The line under the filters says how many show. */
export function contractorsCount(total: number): string {
  return `${total.toLocaleString("en-US")} ${total === 1 ? "contractor" : "contractors"}`;
}
