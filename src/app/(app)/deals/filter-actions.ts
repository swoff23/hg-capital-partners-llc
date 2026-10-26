"use server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dealsWhere, parseDealFilters } from "./query";

/**
 * How many deals a staged set of filters leaves: the number on the Filters
 * sheet's "Show 13 deals". `query` is the sheet's query string, read the way
 * the page reads the URL.
 */
export async function countDealsAction(query: string): Promise<number> {
  await requireUser();
  const filters = parseDealFilters(Object.fromEntries(new URLSearchParams(query)));
  return prisma.deal.count({ where: dealsWhere(filters) });
}
