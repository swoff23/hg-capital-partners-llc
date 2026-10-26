"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { withResult } from "@/lib/server-action";
import { staffPrincipal } from "@/lib/tasks/service";
import { applyPlaybook as applyPlaybookService } from "@/lib/tasks/templates";

const id = z.string().min(1);
const rowSchema = z
  .object({
    title: z.string().trim().min(2, "Enter at least 2 characters.").max(300, "Keep the title under 300 characters."),
    notes: z.string().max(20_000).nullish(),
    assignee: z.union([z.object({ userId: id }).strict(), z.object({ contactId: id }).strict(), z.null()]),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    checklist: z.array(z.string().trim().max(300)).max(100).default([]),
  })
  .strict();
const applySchema = z
  .object({
    propertyId: id,
    unitLabel: z.string().trim().max(100).nullish(),
    rows: z.array(rowSchema).min(1, "Include a task first.").max(200, "That is more than 200 tasks. Untick some."),
  })
  .strict();

/** What Apply says it did, for "39 tasks created for 767 Prospect Ave". */
export type AppliedPlaybook = { count: number; propertyId: string };

/**
 * Create the reviewed tasks on the property (D28). It answers with how many
 * and where instead of redirecting (forms 2.12), so the page keeps what was
 * typed if a refusal comes back, and moves to the task list only on success.
 */
export async function applyPlaybook(templateId: string, input: z.input<typeof applySchema>): Promise<ActionResult<AppliedPlaybook>> {
  return withResult("applyPlaybook", async () => {
    const user = await requireUser();
    const data = applySchema.parse(input);
    return applyPlaybookService(id.parse(templateId), data, staffPrincipal(user));
  });
}
