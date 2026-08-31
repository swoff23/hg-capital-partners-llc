import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { DEFAULT_CAPEX_RULES, parseCapexRules, type CapexRules } from "@/lib/property-types";

/**
 * The effective CapEx planning rules: the saved `AppConfig` row, or the built-in
 * `DEFAULT_CAPEX_RULES`. ANY error (a DB blip, or the table not migrated yet —
 * Prisma P2021) falls back to defaults, so the dashboard and property pages never
 * 500 on this. `cache()` de-dupes the query within a single request.
 *
 * Deliberately NOT `unstable_cache` / "use cache" — every (app) route is dynamic
 * and cross-request caching would serve stale rules right after a Save.
 */
export const getCapexRules = cache(async (): Promise<CapexRules> => {
  try {
    const row = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
    return row ? parseCapexRules(row.capexRules) : DEFAULT_CAPEX_RULES;
  } catch (err) {
    console.error("getCapexRules: falling back to defaults —", err);
    return DEFAULT_CAPEX_RULES;
  }
});
