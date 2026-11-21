import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { leaseChanged } from "@/lib/tenants/service";
import type * as core from "./core";
import { applyPlaybookWith, type AppliedPlaybook, type ApplyPlaybookInput } from "./templates-core";

/**
 * Apply a playbook (docs/asana-migration-plan.md D28), for the app: the rules
 * are templates-core.ts, which takes its client so a database test runs it;
 * this calls it on the app's and refreshes what changed once it commits. The
 * template editor comes later; templates are imported from Asana for now
 * (src/lib/asana/import.ts writeTemplate).
 */

export type { ApplyPlaybookInput, PlaybookLease, PlaybookRow } from "./templates-core";

export async function applyPlaybook(templateId: string, input: ApplyPlaybookInput, p: core.Principal): Promise<Omit<AppliedPlaybook, "leaseId">> {
  const { leaseId, ...done } = await applyPlaybookWith(prisma, templateId, input, p);
  revalidatePath("/tasks", "layout");
  revalidatePath("/");
  revalidatePath(`/properties/${done.propertyId}`);
  // The Tenants list, the lease page and the property's Tenants section.
  if (leaseId) leaseChanged(leaseId);
  return done;
}
