import { z } from "zod";

const id = z.string().min(1).max(100);

/**
 * What Undo sends back for a removed checklist item (ChecklistSnapshot in
 * core.ts), checked before it is written. The title and the Asana assignee
 * label are not capped: the 300 characters that Add item and Rename allow
 * don't bind items that came in from Asana, a playbook or a repeat copy, and
 * a cap here would let Remove work and then make Undo throw, losing the item.
 * A snapshot is whatever the row held. The request body's own size limit
 * still bounds it.
 */
export const checklistSnapshotSchema = z.object({
  id,
  taskId: id,
  title: z.string().min(1),
  done: z.boolean(),
  doneAt: z.string().max(40).nullable(),
  doneByUserId: z.string().max(100).nullable(),
  doneByContactId: z.string().max(100).nullable(),
  assigneeLabel: z.string().nullable(),
  dueDate: z.string().max(40).nullable(),
  position: z.number().int(),
  asanaGid: z.string().max(100).nullable(),
  createdAt: z.string().max(40),
});
