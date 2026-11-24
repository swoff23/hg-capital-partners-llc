import { z } from "zod";
import { CHECKLIST_FULL, NEW_CHECKLIST_MAX, TITLE_MAX, TOO_LONG } from "./limits";
import { checklistItemText, notesText, unitText, waitingOnText } from "./limits-schema";

/**
 * What New task posts (new/actions.ts createTask), as form fields. The title,
 * notes, Waiting reason and unit are held to the limits the task page saves
 * within (limits.ts), so a task is never made with words its own page can't
 * save again. Apart from new-task.ts, which the form imports, so zod stays
 * out of the browser (client-weight.test.ts), as repeat-schema.ts is to
 * repeat.ts.
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
  // Make task (docs/specs/missing-info.md, D9): the Missing info rows, "<check>|<subject>", comma-joined.
  missing: z.string().max(20_000).optional(),
  // Permission to enter (docs/specs/tenants.md section 8): "on" only while the switch shows and is on.
  entryPermitted: z.literal("on").optional(),
  // The Checklist section's items, JSON (docs/specs/new-task-checklist-photos.md); read by newChecklistSchema.
  checklist: z.string().max(64_000).optional(),
  // The form whose held files become the task's (new-task-files.ts); set once a file was picked.
  formId: z.string().max(64).optional(),
});

/** The Checklist section's items as posted: each held to the task page's own limit, at most NEW_CHECKLIST_MAX. */
export const newChecklistSchema = z.array(checklistItemText).max(NEW_CHECKLIST_MAX, CHECKLIST_FULL);
