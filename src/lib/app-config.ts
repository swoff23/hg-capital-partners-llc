import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { DEFAULT_CAPEX_RULES, parseCapexRules, type CapexRules } from "@/lib/property-types";
import { DEFAULT_MOVE_IN_FORM_SCHEMA, parseMoveInFormSchema, type MoveInFormSchema } from "@/lib/move-in-form-types";

export interface AppConfigSnapshot {
  capexRules: CapexRules;
  moveInFormSchema: MoveInFormSchema;
  /** `updatedAt` of the singleton row as ISO, or null when the row doesn't exist yet. Sent back with a save as the expected version. */
  version: string | null;
}

/**
 * The single `AppConfig` row, parsed with the tolerant parsers, or the
 * built-in defaults. ANY error (a DB blip, the table not migrated yet —
 * Prisma P2021) falls back to defaults so no page 500s on this. `cache()`
 * de-dupes within a request; deliberately not cross-request (a save must be
 * visible immediately).
 */
export const getAppConfig = cache(async (): Promise<AppConfigSnapshot> => {
  try {
    const row = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
    if (!row) {
      return { capexRules: DEFAULT_CAPEX_RULES, moveInFormSchema: DEFAULT_MOVE_IN_FORM_SCHEMA, version: null };
    }
    return {
      capexRules: parseCapexRules(row.capexRules),
      moveInFormSchema: parseMoveInFormSchema(row.moveInFormSchema),
      version: row.updatedAt.toISOString(),
    };
  } catch (err) {
    console.error("getAppConfig: falling back to defaults —", err);
    return { capexRules: DEFAULT_CAPEX_RULES, moveInFormSchema: DEFAULT_MOVE_IN_FORM_SCHEMA, version: null };
  }
});
