"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { withResult } from "@/lib/server-action";
import { staffPrincipal } from "@/lib/tasks/service";
import { applyPlaybook as applyPlaybookService } from "@/lib/tasks/templates";

const id = z.string().min(1);
const rowSchema = z
  .object({
    title: z.string().trim().min(2).max(300),
    notes: z.string().max(20_000).nullish(),
    assignee: z.union([z.object({ userId: id }).strict(), z.object({ contactId: id }).strict(), z.null()]),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    checklist: z.array(z.string().trim().max(300)).max(100).default([]),
  })
  .strict();
const applySchema = z.object({ propertyId: id, rows: z.array(rowSchema).min(1).max(200) }).strict();

/** Create the reviewed tasks on the property (D28), then show them in the task list. */
export async function applyPlaybook(templateId: string, input: z.input<typeof applySchema>): Promise<ActionResult> {
  return withResult("applyPlaybook", async () => {
    const user = await requireUser();
    const data = applySchema.parse(input);
    await applyPlaybookService(id.parse(templateId), data, staffPrincipal(user));
    redirect(`/tasks/all?property=${encodeURIComponent(data.propertyId)}`);
  });
}
