/**
 * How long a task's words may be, the same wherever they're written: New
 * task, the task page and its composer. New task once took any length, so a
 * task could be made with notes the page could never save again. Each
 * refusal says how to fix it in plain words, which reach the screen as
 * written (lib/action-result.ts isPlainMessage) instead of zod's own "Too
 * big: expected string to have <=300 characters". Pure; see limits.test.ts.
 *
 * New task's form imports this file for its notes check, so it holds no zod:
 * the schemas built on these limits are in limits-schema.ts, as
 * repeat-schema.ts is to repeat.ts (client-weight.test.ts).
 */

export const TITLE_MAX = 300;
export const NOTES_MAX = 20_000;
export const COMMENT_MAX = 20_000;
export const CHECKLIST_ITEM_MAX = 300;
export const WAITING_ON_MAX = 300;
export const UNIT_MAX = 100;

const n = (count: number) => count.toLocaleString("en-US");

/** The line for each field that's too long, with the limit in it. */
export const TOO_LONG = {
  title: `Shorten the title to ${n(TITLE_MAX)} characters.`,
  notes: `Shorten the notes to ${n(NOTES_MAX)} characters.`,
  comment: `Shorten it to ${n(COMMENT_MAX)} characters.`,
  checklistItem: `Shorten the item to ${n(CHECKLIST_ITEM_MAX)} characters.`,
  waitingOn: `Shorten the reason to ${n(WAITING_ON_MAX)} characters.`,
  unit: `Shorten the unit to ${n(UNIT_MAX)} characters.`,
} as const;

/**
 * New task's own check before it posts, for the notes the server would
 * refuse: the line to show under Notes, or null when they fit. The title
 * field already stops at TITLE_MAX.
 */
export function newTaskNotesProblem(notes: string): string | null {
  return notes.length > NOTES_MAX ? TOO_LONG.notes : null;
}
