import { z } from "zod";
import { TITLE_MAX, TOO_LONG, notesText, unitText, waitingOnText } from "./limits";

/**
 * The rules behind the New task form (forms 4.4) that don't need React:
 * what it posts, which draft is whose, and where a created task leaves the
 * person. Pure; see new-task.test.ts.
 */

/** The New task page, which the intercepting sheet shares: both live at this path. */
export const NEW_TASK_PATH = "/tasks/new";

/**
 * What New task posts (new/actions.ts createTask), as form fields. The title,
 * notes, Waiting reason and unit are held to the limits the task page saves
 * within (limits.ts), so a task is never made with words its own page can't
 * save again.
 */
export const newTaskSchema = z.object({
  title: z.string({ error: "Enter a title." }).trim().min(2, "Enter at least 2 characters.").max(TITLE_MAX, TOO_LONG.title),
  description: notesText.optional(),
  // The assignee picker: "u:<userId>", "c:<contactId>", or blank for nobody.
  assignee: z.string().optional(),
  assigneeUserId: z.string().optional(),
  assigneeName: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.string().optional(),
  propertyId: z.string().optional(),
  unitLabel: unitText.optional(),
  dealId: z.string().optional(),
  status: z.enum(["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING"], { error: "Pick a status." }).optional(),
  waitingOn: waitingOnText.optional(),
  scheduledFor: z.string().optional(),
  // JSON from the Repeat step in the due date's panel; blank for Doesn't repeat.
  repeatRule: z.string().optional(),
});

/**
 * The draft's key: the person, then what the task is about. Drafts live in
 * this browser's storage, so without the person a second user of a shared
 * browser would be handed the first one's half-typed task.
 */
export function newTaskDraftKey(meId: string, context: { kind: string; id: string } | null): string {
  return `new-task:${meId}:${context ? `${context.kind}:${context.id}` : "none"}`;
}

/**
 * What to do once the task is created. Create more stays on the form. The
 * sheet goes back to where it opened over; the flat page lands on the new
 * task. If the person has already left (the Back button or an iOS swipe while
 * Create was in flight), there is nowhere to navigate: a second back would
 * leave the page they went back to, and a replace would overwrite it. The
 * toast, with its way to the task, still shows.
 */
export function afterCreate(variant: "sheet" | "page", more: boolean, stillHere: boolean): "back" | "replace" | "stay" {
  if (more || !stillHere) return "stay";
  return variant === "sheet" ? "back" : "replace";
}

/** Whether the form is still on screen at its own path, for `afterCreate`. */
export function isStillOnNewTask(mounted: boolean, pathname: string): boolean {
  return mounted && pathname === NEW_TASK_PATH;
}
