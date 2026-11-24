"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import * as invoices from "@/lib/invoices/service";
import { withResult } from "@/lib/server-action";

/**
 * Use as invoice (docs/contractor-invoices-plan.md 4.4) from a job's photo or document: authenticate, then hand the
 * file's id to the invoice service, which copies it into the invoice's own folder and makes a To review invoice.
 * Returns the new invoice's id for the page to open.
 */
export async function makeInvoiceFromFile(attachmentId: string): Promise<ActionResult<{ id: string }>> {
  return withResult("makeInvoiceFromFile", async () => {
    const user = await requireUser();
    return invoices.useAsInvoice(z.string().min(1).max(64).parse(attachmentId), invoices.staffActor(user));
  });
}
