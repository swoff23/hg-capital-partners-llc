import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { DEFAULT_MOVE_IN_FORM_SCHEMA, parseMoveInFormSchema, type MoveInFormSchema } from "@/lib/move-in-form-types";

/**
 * The effective move-in inspection form structure: the saved `AppConfig` row, or
 * the built-in `DEFAULT_MOVE_IN_FORM_SCHEMA`. Same fallback/caching contract as
 * getCapexRules — any error falls back to defaults so neither the settings tab
 * nor the public form ever 500; cache() de-dupes within a request, deliberately
 * not cross-request (a save must be visible immediately).
 */
export const getMoveInFormSchema = cache(async (): Promise<MoveInFormSchema> => {
  try {
    const row = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
    return row ? parseMoveInFormSchema(row.moveInFormSchema) : DEFAULT_MOVE_IN_FORM_SCHEMA;
  } catch (err) {
    console.error("getMoveInFormSchema: falling back to defaults —", err);
    return DEFAULT_MOVE_IN_FORM_SCHEMA;
  }
});
