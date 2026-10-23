"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";
import { DEAL_STATUSES, DEFAULT_DEAL_STATUS } from "@/lib/config";
import type { ActionResult } from "@/lib/action-result";
import { withLog, withResult } from "@/lib/server-action";
import * as deals from "@/lib/deals/service";

/**
 * Thin server actions: authenticate, validate, call the deal service,
 * redirect. Everything that touches the database lives in
 * src/lib/deals/service.ts.
 */

const dealSchema = z.object({
  address: z.string().min(4),
  status: z.enum(DEAL_STATUSES).default(DEFAULT_DEAL_STATUS),
  priority: z.string().optional(),
  theirPriceRaw: z.string().optional(),
  ourPriceRaw: z.string().optional(),
  units: z.coerce.number().int().positive().optional(),
  sourceUrl: z.string().url().optional(),
  nextAction: z.string().optional(),
  passReason: z.string().optional(),
});

/** The deal an address already belongs to, for the New deal form to point at. */
export type ExistingDeal = { id: string; address: string; status: string };

/**
 * Creates the deal and opens it. When the address is already a deal, nothing
 * is saved and that deal comes back, so the form keeps what was typed.
 */
export async function createDeal(formData: FormData): Promise<ActionResult<{ duplicateOf: ExistingDeal }>> {
  return withResult("createDeal", async () => {
    const user = await requireUser();
    const p = dealSchema.parse(formToObject(formData));
    const r = await deals.createDeal(p, user);
    if (r.duplicateOf) {
      const { id, address, status } = r.duplicateOf;
      return { duplicateOf: { id, address, status } };
    }
    redirect(`/deals/${r.deal.id}`);
  });
}

/** Inline edits from the Deals list and detail page. Only whitelisted fields. */
export async function patchDeal(id: string, patch: deals.DealPatch) {
  return withLog("patchDeal", async () => {
    const user = await requireUser();
    await deals.patchDeal(id, patch, user);
  });
}

export async function addDealNote(dealId: string, formData: FormData) {
  return withLog("addDealNote", async () => {
    const user = await requireUser();
    await deals.addDealNote(dealId, String(formData.get("body") ?? ""), user);
  });
}
