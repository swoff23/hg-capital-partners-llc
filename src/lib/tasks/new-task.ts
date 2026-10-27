/**
 * The rules behind the New task form (forms 4.4) that don't need React:
 * which draft is whose, and where a created task leaves the person.
 * Pure; see new-task.test.ts.
 */

/** The New task page, which the intercepting sheet shares: both live at this path. */
export const NEW_TASK_PATH = "/tasks/new";

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
