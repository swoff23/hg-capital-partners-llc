"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";
import { DEAL_STATUSES, DEFAULT_DEAL_STATUS } from "@/lib/config";
import { withLog } from "@/lib/server-action";
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

export async function createDeal(formData: FormData) {
  return withLog("createDeal", async () => {
    const user = await requireUser();
    const p = dealSchema.parse(formToObject(formData));
    const r = await deals.createDeal(p, user);
    if (r.duplicateOf) redirect(`/deals/${r.duplicateOf.id}?dup=1`);
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
