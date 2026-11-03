import { z } from "zod";
import { CHECKLIST_ITEM_MAX, COMMENT_MAX, NOTES_MAX, TITLE_MAX, TOO_LONG, UNIT_MAX, WAITING_ON_MAX } from "./limits";

/**
 * The task text limits (limits.ts) as zod schemas, for the server actions and
 * newTaskSchema. Kept apart from limits.ts, which New task's form imports for
 * its own notes check, so the browser never downloads zod (client-weight.test.ts),
 * as repeat-schema.ts is to repeat.ts.
 */

export const titleText = z.string().max(TITLE_MAX, TOO_LONG.title);
export const notesText = z.string().max(NOTES_MAX, TOO_LONG.notes);
export const commentText = z.string().max(COMMENT_MAX, TOO_LONG.comment);
/** A new checklist item: trimmed, not empty, and within its limit. */
export const checklistItemText = z.string().trim().min(1).max(CHECKLIST_ITEM_MAX, TOO_LONG.checklistItem);
export const waitingOnText = z.string().max(WAITING_ON_MAX, TOO_LONG.waitingOn);
export const unitText = z.string().max(UNIT_MAX, TOO_LONG.unit);
