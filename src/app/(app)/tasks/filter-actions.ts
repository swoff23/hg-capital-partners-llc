"use server";
import { requireUser } from "@/lib/auth";
import { parseAllFilters } from "@/lib/tasks/list-query";
import { countAllTasks, legacyNamesFor } from "@/lib/tasks/queries";

/**
 * How many tasks a staged set of filters leaves: the number on the Filters
 * sheet's "Show 13 tasks". `query` is the sheet's query string, read the way
 * the page reads the URL.
 */
export async function countTasksAction(query: string): Promise<number> {
  const user = await requireUser();
  const filters = parseAllFilters(Object.fromEntries(new URLSearchParams(query)), user.id);
  return countAllTasks(filters, await legacyNamesFor(filters.owner));
}
