import { searchTerms } from "@/lib/search";

/**
 * Whether every word of a typed search is in one of `fields`, in any order:
 * the matcher the lists run in the browser (the account search on Financials
 * settings), reading words the way the server does for Tasks, Deals and
 * Contractors (`searchTerms`), so "util" finds "Utilities" and "Avenue" finds
 * "Ave.". No words matches everything.
 */
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const terms = searchTerms(query);
  if (terms.length === 0) return true;
  const text = fields.filter(Boolean).join(" ").toLowerCase();
  return terms.every((spellings) => spellings.some((s) => text.includes(s)));
}
