import "server-only";
import { getAppConfig } from "@/lib/app-config";
import type { MoveInFormSchema } from "@/lib/move-in-form-types";

/** The effective move-in inspection form structure — see getAppConfig for the fallback/caching contract. */
export async function getMoveInFormSchema(): Promise<MoveInFormSchema> {
  return (await getAppConfig()).moveInFormSchema;
}
