"use server";
import { requireUser } from "@/lib/auth";
import { todayYmdEastern } from "@/lib/dates";
import { countQuery } from "@/lib/list-count";
import { tenantRows } from "@/lib/tenants/queries";
import { inProperties, parseTenantFilters } from "./query";

/**
 * How many tenants a staged set of filters leaves: the number on the Filters
 * sheet's "Show 4 tenants". `query` is the sheet's query string, read the way
 * the page reads the URL.
 */
export async function countTenantsAction(query: string): Promise<number> {
  await requireUser();
  const f = parseTenantFilters(Object.fromEntries(new URLSearchParams(countQuery.parse(query))));
  const rows = await tenantRows({ view: f.view, q: f.q }, todayYmdEastern());
  return inProperties(rows, f.properties).length;
}
