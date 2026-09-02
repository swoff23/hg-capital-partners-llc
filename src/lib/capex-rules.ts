import "server-only";
import { getAppConfig } from "@/lib/app-config";
import type { CapexRules } from "@/lib/property-types";

/** The effective CapEx planning rules — see getAppConfig for the fallback/caching contract. */
export async function getCapexRules(): Promise<CapexRules> {
  return (await getAppConfig()).capexRules;
}
