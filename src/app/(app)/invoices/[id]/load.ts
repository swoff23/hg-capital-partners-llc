import "server-only";
import type { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shortAddress } from "@/lib/normalize";
import { excludeTemplateTasks } from "@/lib/task-scope";

/**
 * What the invoice page's two pickers list, read once on the server (docs/contractor-invoices-plan.md, M11 and M7).
 * The picker searches what's here, so the job list is the most recently touched few hundred, which covers every
 * job that is likely to get a bill.
 */

export interface ContractorChoice {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  /** An inactive contractor still lists, ranked after the active ones, with a Tag. */
  active: boolean;
}

/** Every unarchived contact, active ones first, plus the invoice's current one even if archived (M11). */
export async function contractorChoices(currentId: string | null): Promise<ContractorChoice[]> {
  const rows = await prisma.contact.findMany({
    where: { OR: [{ archivedAt: null }, ...(currentId ? [{ id: currentId }] : [])] },
    select: { id: true, fullName: true, company: true, email: true, active: true },
    orderBy: [{ active: "desc" }, { fullName: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, name: r.fullName, company: r.company, email: r.email, active: r.active }));
}

export interface JobChoice {
  id: string;
  title: string;
  /** The building's short address, for the row's second line. */
  address: string | null;
  status: TaskStatus;
}

const JOB_PICKER_MAX = 600;

/** Any job that isn't canceled (M7), whoever it's assigned to. */
export async function jobChoices(): Promise<JobChoice[]> {
  const rows = await prisma.task.findMany({
    where: { ...excludeTemplateTasks, status: { not: "CANCELED" } },
    select: { id: true, title: true, status: true, property: { select: { address: true } } },
    orderBy: { updatedAt: "desc" },
    take: JOB_PICKER_MAX,
  });
  return rows.map((r) => ({ id: r.id, title: r.title, address: r.property ? shortAddress(r.property.address) : null, status: r.status }));
}

/** The short address of each job, for the jobs on an invoice that read "Fix leak, Unit 2 · 15 Oxford Ave". */
export async function jobAddresses(taskIds: readonly string[]): Promise<Record<string, string | null>> {
  if (taskIds.length === 0) return {};
  const rows = await prisma.task.findMany({ where: { id: { in: [...taskIds] } }, select: { id: true, property: { select: { address: true } } } });
  return Object.fromEntries(rows.map((r) => [r.id, r.property ? shortAddress(r.property.address) : null]));
}

/** One job, for New invoice's `?job=`: null when it's gone, canceled or a playbook row. */
export async function jobById(id: string): Promise<JobChoice | null> {
  const r = await prisma.task.findFirst({
    where: { id, ...excludeTemplateTasks, status: { not: "CANCELED" } },
    select: { id: true, title: true, status: true, property: { select: { address: true } } },
  });
  return r ? { id: r.id, title: r.title, address: r.property ? shortAddress(r.property.address) : null, status: r.status } : null;
}
