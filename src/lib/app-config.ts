import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { blobVersion } from "@/lib/app-config-version";
import { DEFAULT_CAPEX_RULES, parseCapexRules, type CapexRules } from "@/lib/property-types";
import { DEFAULT_MOVE_IN_FORM_SCHEMA, parseMoveInFormSchema, type MoveInFormSchema } from "@/lib/move-in-form-types";

export interface AppConfigSnapshot {
  capexRules: CapexRules;
  moveInFormSchema: MoveInFormSchema;
  /** `updatedAt` of the singleton row as ISO, or null when the row doesn't exist yet. Kept for callers that predate the per-blob versions. */
  version: string | null;
  /**
   * The version of the CapEx rules blob as stored (`blobVersion`), or null
   * when nothing was saved into it. The CapEx editor sends it back with a
   * save, so saving the move-in form can't conflict it (forms 2.12).
   */
  capexVersion: string | null;
  /** The same for the move-in form blob. */
  moveInVersion: string | null;
}

const DEFAULTS: AppConfigSnapshot = {
  capexRules: DEFAULT_CAPEX_RULES,
  moveInFormSchema: DEFAULT_MOVE_IN_FORM_SCHEMA,
  version: null,
  capexVersion: null,
  moveInVersion: null,
};

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
    if (!row) return DEFAULTS;
    return {
      capexRules: parseCapexRules(row.capexRules),
      moveInFormSchema: parseMoveInFormSchema(row.moveInFormSchema),
      version: row.updatedAt.toISOString(),
      capexVersion: blobVersion(row.capexRules),
      moveInVersion: blobVersion(row.moveInFormSchema),
    };
  } catch (err) {
    console.error("getAppConfig failed, using defaults:", err);
    return DEFAULTS;
  }
});
