"use server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { contractorsWhere, matchesNeedsW9, matchesTrades, parseContractorFilters } from "./query";

/**
 * How many contractors a staged set of filters leaves: the number on the
 * Filters sheet's "Show 4 contractors". `query` is the sheet's query string,
 * read the way the page reads the URL.
 */
export async function countContractorsAction(query: string): Promise<number> {
  await requireUser();
  const filters = parseContractorFilters(Object.fromEntries(new URLSearchParams(query)));
  const rows = await prisma.contact.findMany({ where: contractorsWhere(filters), select: { trades: true, w9Url: true, comments: true } });
  return rows.filter((r) => matchesNeedsW9(r, filters) && matchesTrades(r.trades, filters.trades)).length;
}
