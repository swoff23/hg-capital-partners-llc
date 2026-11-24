"use server";
import { z } from "zod";
import { FieldError, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import type { Ymd } from "@/lib/dates";
import { readTotal } from "@/lib/invoices/fields";
import * as invoices from "@/lib/invoices/service";
import { withResult } from "@/lib/server-action";

/**
 * New invoice (docs/contractor-invoices-plan.md, M6 and 4.4): the To review invoice a partner's first file or first
 * saved field makes. Everything after is the invoice page's own (../[id]/actions.ts). It sends no staff email: the
 * partner is the one who made it.
 */

const id = z.string().min(1).max(64);

const inputSchema = z
  .object({
    contactId: id.nullable(),
    invoiceNumber: z.string().max(200).nullable(),
    total: z.string().max(40).nullable(),
    note: z.string().max(20_000).nullable(),
    taskIds: z.array(id).max(50),
  })
  .partial()
  .strict();

export async function createInvoiceAction(input: z.input<typeof inputSchema> = {}): Promise<ActionResult<{ id: string }>> {
  return withResult("createInvoice", async () => {
    const user = await requireUser();
    const p = inputSchema.parse(input);
    let totalCents: number | null | undefined;
    if (p.total !== undefined) {
      const read = readTotal(p.total);
      if (!read.ok) throw new FieldError({ total: read.message });
      totalCents = read.cents;
    }
    return invoices.createStaffInvoice(
      {
        contactId: p.contactId ?? null,
        invoiceNumber: p.invoiceNumber ?? null,
        invoiceDate: null as Ymd | null,
        totalCents: totalCents ?? null,
        note: p.note ?? null,
        taskIds: p.taskIds ?? [],
      },
      invoices.staffActor(user),
    );
  });
}
