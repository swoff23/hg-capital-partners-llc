import { requireUser } from "@/lib/auth";
import { todayYmdEastern } from "@/lib/dates";
import { contractorChoices, jobById, jobChoices } from "../[id]/load";
import { NewInvoice } from "./new-invoice";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "New invoice" };

/**
 * New invoice (docs/contractor-invoices-plan.md, M6): the invoice page with nothing on it. `?job=<taskId>` ticks that
 * job, as the task page's ⋯ menu does. Partners only: requireUser admits staff logins, never a contractor's account.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ job?: string | string[] }> }) {
  await requireUser();
  const { job } = await searchParams;
  const taskId = typeof job === "string" && job ? job : null;
  const [contractors, jobs, initialJob] = await Promise.all([contractorChoices(null), jobChoices(), taskId ? jobById(taskId) : Promise.resolve(null)]);
  return <NewInvoice contractors={contractors} jobChoices={jobs} initialJob={initialJob} today={todayYmdEastern()} />;
}
