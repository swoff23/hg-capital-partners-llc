"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withResult } from "@/lib/server-action";
import { staffPrincipal } from "@/lib/tasks/service";
import type { AppliedLease, HomeTenants } from "@/lib/tasks/template-items";
import { applyPlaybook as applyPlaybookService } from "@/lib/tasks/templates";
import { livingTenants } from "@/lib/tenants/living";

const id = z.string().min(1);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rowSchema = z
  .object({
    title: z.string().trim().min(2, "Enter at least 2 characters.").max(300, "Keep the title under 300 characters."),
    notes: z.string().max(20_000).nullish(),
    assignee: z.union([z.object({ userId: id }).strict(), z.object({ contactId: id }).strict(), z.null()]),
    dueDate: day.nullable(),
    checklist: z.array(z.string().trim().max(300)).max(100).default([]),
  })
  .strict();
// The lease box, ticked (docs/specs/tenants.md section 9). The tenants rules read the name and phone; these only bound them.
const leaseSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("move-in"),
      name: z.string().trim().min(1, "Enter the tenant.").max(300),
      phone: z.string().max(100).nullish(),
      on: day,
    })
    .strict(),
  z.object({ kind: z.literal("move-out"), on: day }).strict(),
]);
const applySchema = z
  .object({
    propertyId: id,
    unitLabel: z.string().trim().max(100).nullish(),
    rows: z.array(rowSchema).min(1, "Include a task first.").max(200, "That is more than 200 tasks. Untick some."),
    lease: leaseSchema.nullish(),
  })
  .strict();

/** What Apply says it did, for "39 tasks created for 767 Prospect Ave · Lease created for Dana Lee". */
export type AppliedPlaybook = { count: number; propertyId: string; lease: AppliedLease | null };

/**
 * Create the reviewed tasks on the property (D28), and with the lease box
 * ticked, the lease write in the same transaction. It answers with how many
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

/**
 * Who lives in the picked home today, for the playbook's fill-ins
 * (docs/specs/tenants.md section 9): their names and the primary's phone as
 * shown, or null when it's vacant or no unit names one. Staff only, and
 * nothing else about the lease or its rent reaches the page.
 */
export async function homeTenants(propertyId: string, unitLabel: string | null): Promise<HomeTenants | null> {
  await requireUser();
  const pid = z.string().min(1).max(64).parse(propertyId);
  const unit = unitLabel === null ? null : z.string().max(200).parse(unitLabel);
  return livingTenants(prisma, pid, unit);
}
