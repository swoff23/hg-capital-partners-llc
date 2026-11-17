"use server";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { withResult } from "@/lib/server-action";
import * as missing from "@/lib/missing/service";
import type { UnitUtilities } from "@/lib/property-types";

/**
 * Thin server actions for Missing info (docs/specs/missing-info.md):
 * authenticate, then the service, which checks the keys and owns the writes.
 * Each answers with a value, so a refusal is a toast and the row stays.
 */

/** Doesn't apply (D3). Answers with the record key the skip was kept under, for Undo. */
export async function skipGapAction(check: string, subject: string): Promise<ActionResult<{ subject: string }>> {
  return withResult("skipGap", async () => ({ subject: await missing.skipGap(check, subject, await requireUser()) }));
}

/** Undo of Doesn't apply, or putting a skipped row back on the list. */
export async function unskipGapAction(check: string, subject: string): Promise<ActionResult<void>> {
  return withResult("unskipGap", async () => {
    await requireUser();
    await missing.unskipGap(check, subject);
  });
}

/** Done or NA on a utility status, in place (D4). Answers with what the box held before, for Undo. */
export async function answerUtilityAction(
  propertyId: string,
  unitId: string,
  field: keyof UnitUtilities,
  value: string | null,
): Promise<ActionResult<{ before: string | null }>> {
  return withResult("answerUtility", async () => ({ before: await missing.answerUtility(propertyId, unitId, field, value, await requireUser()) }));
}

/** Mark vacant (D6), or its Undo. */
export async function setVacantAction(propertyId: string, unitId: string, vacant: boolean): Promise<ActionResult<void>> {
  return withResult("setVacant", async () => {
    await missing.setVacant(propertyId, unitId, vacant, await requireUser());
  });
}
