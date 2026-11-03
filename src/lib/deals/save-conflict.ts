import { conflictBy, conflictWhen, type ActionConflict, type ActionResult } from "@/lib/action-result";
import { dealStageLabel } from "@/lib/config";

/**
 * What the deal page's stage pick says when a save loses to a newer one
 * (forms 2.12). The refusal said only "Connor changed this at 8:31 AM.", so
 * the toast didn't say which field or what it holds now. The page itself
 * comes back with the stored stage: the service refreshes it on a conflict
 * (edits.ts `refreshOnConflict`). Pure, so save-conflict.test.ts runs it
 * without a browser.
 */

/**
 * The toast for a stage pick someone else beat: what the stage is now, by
 * whom and when ("Pieter changed the stage to Holding at 2:14 PM."), where it
 * said only "Pieter changed this at 2:14 PM.". Null when the refusal doesn't
 * carry the stage.
 */
export function stageConflictMessage(conflict: Pick<ActionConflict, "by" | "at" | "theirs">, now: Date = new Date()): string | null {
  const stage = conflict.theirs?.status;
  if (!stage) return null;
  const who = conflictBy(conflict.by);
  const when = conflictWhen(conflict.at, now);
  const tail = when ? ` ${when}` : "";
  return who ? `${who} changed the stage to ${dealStageLabel(stage)}${tail}.` : `The stage changed to ${dealStageLabel(stage)}${tail}.`;
}

/** A stage save's result with its conflict worded as `stageConflictMessage`. */
export function withStageConflictLine<T>(res: ActionResult<T>, now: Date = new Date()): ActionResult<T> {
  if (res.ok || !res.conflict) return res;
  return { ...res, error: stageConflictMessage(res.conflict, now) ?? res.error };
}
