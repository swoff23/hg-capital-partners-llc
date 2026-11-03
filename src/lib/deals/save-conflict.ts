import { conflictBy, conflictWhen, type ActionConflict, type ActionResult } from "@/lib/action-result";
import { dealStageLabel } from "@/lib/config";
import { TOAST_PHONE_CHARS } from "@/lib/toast-line";

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
 * whom and when ("Pieter set Holding at 2:14 PM."), where it said only
 * "Pieter changed this at 2:14 PM.". Null when the refusal doesn't carry the
 * stage.
 *
 * A toast is one truncated line, so the stage and who set it come first and
 * the time goes when the whole line wouldn't show on a phone (a long name or
 * stage: "To schedule", "on Oct 24, 2025"): "Pieter set Holding at 2:14 PM."
 * is 30 characters (TOAST_PHONE_CHARS), and the stage is never the part cut.
 */
export function stageConflictMessage(conflict: Pick<ActionConflict, "by" | "at" | "theirs">, now: Date = new Date()): string | null {
  const stage = conflict.theirs?.status;
  if (!stage) return null;
  const label = dealStageLabel(stage);
  const who = conflictBy(conflict.by);
  const when = conflictWhen(conflict.at, now);
  const lines = who
    ? [when && `${who} set ${label} ${when}.`, `${who} set ${label}.`]
    : [when && `Set to ${label} ${when}.`, `Set to ${label}.`];
  return lines.find((line) => line && line.length <= TOAST_PHONE_CHARS) || lines[lines.length - 1] || null;
}

/** A stage save's result with its conflict worded as `stageConflictMessage`. */
export function withStageConflictLine<T>(res: ActionResult<T>, now: Date = new Date()): ActionResult<T> {
  if (res.ok || !res.conflict) return res;
  return { ...res, error: stageConflictMessage(res.conflict, now) ?? res.error };
}
