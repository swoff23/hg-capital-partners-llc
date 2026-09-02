"use server";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { withResult } from "@/lib/server-action";
import { migrateDocumentsToPrivate, type MigrationReport } from "@/lib/attachments/migrate";

export async function moveDocumentsToPrivate(): Promise<ActionResult<MigrationReport>> {
  return withResult("moveDocumentsToPrivate", async () => {
    await requireUser();
    return migrateDocumentsToPrivate();
  });
}
