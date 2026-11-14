"use server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { countQuery } from "@/lib/list-count";
import { STATUS_INCLUDE, contractorsWhere, matchesNeedsW9, matchesStatus, matchesTrades, parseContractorFilters } from "./query";

/**
 * How many contractors a staged set of filters leaves: the number on the
 * Filters sheet's "Show 4 contractors". `query` is the sheet's query string,
 * read the way the page reads the URL.
 */
export async function countContractorsAction(query: string): Promise<number> {
  await requireUser();
  const filters = parseContractorFilters(Object.fromEntries(new URLSearchParams(countQuery.parse(query))));
  const rows = await prisma.contact.findMany({
    where: contractorsWhere(filters),
    select: {
      w9Url: true,
      comments: true,
      signupSource: true,
      needsReview: true,
      setupDoneAt: true,
      documents: { where: { kind: "W9" }, select: { kind: true } },
      tradeLinks: { select: { trade: { select: { id: true } } } },
      ...STATUS_INCLUDE,
    },
  });
  return rows.filter((r) => matchesNeedsW9(r, filters) && matchesStatus(r, filters.status) && matchesTrades(r, filters.trades)).length;
}
