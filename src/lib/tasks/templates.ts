import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type { Ymd } from "@/lib/dates";
import { unitLabels } from "@/lib/picker-options-shape";
import * as core from "./core";

/**
 * Apply a playbook (docs/asana-migration-plan.md D28): one property, the
 * reviewed list of tasks, all created through core.createTask in a single
 * transaction so it's all or nothing. Each task records the template it came
 * from. The template editor comes later; templates are imported from Asana
 * for now (src/lib/asana/import.ts writeTemplate). Token filling and due
 * offsets happen in the review step (template-items.ts); what arrives here is
 * what staff saw and kept.
 */

export interface PlaybookRow {
  title: string;
  notes?: string | null;
  assignee: core.Assignee;
  dueDate: Ymd | null;
  checklist?: string[];
}

export interface ApplyPlaybookInput {
  propertyId: string;
  /** The unit of the building every task is about (move-in and move-out playbooks, BPLAY-004); one of the building's own labels. */
  unitLabel?: string | null;
  rows: PlaybookRow[];
}

/** Rows to a transaction this long: a playbook is a few dozen tasks, each with its own event and access rows. */
const APPLY_TIMEOUT_MS = 60_000;

export async function applyPlaybook(
  templateId: string,
  input: ApplyPlaybookInput,
  p: core.Principal,
): Promise<{ count: number; propertyId: string }> {
  if (p.kind !== "staff") throw new core.TaskRuleError("Only staff can apply a playbook.");
  const rows = input.rows.filter((r) => r.title.trim().length >= 2);
  if (rows.length === 0) throw new core.TaskRuleError("Keep at least one task.");

  const userIds = [...new Set(rows.flatMap((r) => (r.assignee && "userId" in r.assignee ? [r.assignee.userId] : [])))];
  const contactIds = [...new Set(rows.flatMap((r) => (r.assignee && "contactId" in r.assignee ? [r.assignee.contactId] : [])))];
  const [template, property, users, contacts] = await Promise.all([
    prisma.taskTemplate.findUnique({ where: { id: templateId }, select: { id: true } }),
    prisma.property.findUnique({ where: { id: input.propertyId }, select: { id: true, units: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } }),
    prisma.contact.findMany({ where: { id: { in: contactIds }, active: true }, select: { id: true } }),
  ]);
  if (!template) throw new core.TaskRuleError("That playbook no longer exists.");
  if (!property) throw new core.TaskRuleError("Choose a property.");
  // A unit is one of the building's own, as written; a stale pick (renamed since) is refused, not saved.
  const unitLabel = input.unitLabel?.trim() || null;
  if (unitLabel && !unitLabels(property.units).includes(unitLabel)) {
    throw new core.TaskRuleError("Choose a unit from this building.");
  }
  const liveUsers = new Set(users.map((u) => u.id));
  const liveContacts = new Set(contacts.map((c) => c.id));
  // Someone removed since the playbook was written: the task starts unassigned.
  const live = (a: core.Assignee): core.Assignee =>
    a && "userId" in a ? (liveUsers.has(a.userId) ? a : null) : a && "contactId" in a ? (liveContacts.has(a.contactId) ? a : null) : null;

  const count = await prisma.$transaction(
    async (tx) => {
      for (const r of rows) {
        const task = await core.createTask(
          tx,
          {
            title: r.title,
            description: r.notes ?? null,
            dueDate: r.dueDate,
            propertyId: property.id,
            unitLabel,
            assignee: live(r.assignee),
            taskTemplateId: template.id,
          },
          p,
        );
        for (const item of r.checklist ?? []) {
          if (item.trim()) await core.addChecklistItem(tx, task.id, item, p);
        }
      }
      return rows.length;
    },
    { timeout: APPLY_TIMEOUT_MS },
  );

  revalidatePath("/tasks", "layout");
  revalidatePath("/");
  revalidatePath(`/properties/${property.id}`);
  return { count, propertyId: property.id };
}
