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

/**
 * The Deals list's stage pick. Only whitelisted fields. A refusal throws to
 * the caller, which the list row catches (`callAction`); the deal page saves
 * through `saveDealFields`, which answers with a result instead.
 */
export async function patchDeal(id: string, patch: deals.DealPatch) {
  return withLog("patchDeal", async () => {
    const user = await requireUser();
    await deals.patchDeal(id, patch, user);
  });
}

const optionalText = (max: number) => z.string().max(max).nullish();

/**
 * What the deal page's rail sends (forms 4.3). The messages are written for
 * people and reach the screen as written: they end with a period.
 */
const dealFieldsSchema = z
  .object({
    address: z.string().trim().min(4, "Enter the full street address, like 123 Main St.").max(300, "Use 300 characters or fewer."),
    status: z.string().max(60),
    priority: optionalText(60),
    passReason: optionalText(120),
    theirPriceRaw: optionalText(100),
    ourPriceRaw: optionalText(100),
    units: z.number().int("Enter a whole number.").min(1, "Enter 1 or more.").max(10_000, "Enter a smaller number.").nullish(),
    nextAction: optionalText(300),
    sourceUrl: z
      .string()
      .trim()
      .max(2000, "Use 2,000 characters or fewer.")
      .refine((s) => s === "" || /^https?:\/\/\S+$/i.test(s), "Enter a link that starts with https://.")
      .nullish(),
  })
  .partial()
  .strict();

/**
 * Save the deal page's edits: the heading, the rail's facts, the stage. Each
 * carries the text it loaded in `expected`, so a field someone else saved
 * meanwhile refuses the save and says who and when, instead of being written
 * over. A refusal comes back as a result: the field stays open with what was
 * typed.
 */
export async function saveDealFields(
  id: string,
  patch: z.input<typeof dealFieldsSchema>,
  expected: Record<string, string> = {},
): Promise<ActionResult> {
  return withResult("saveDealFields", async () => {
    const user = await requireUser();
    await deals.patchDeal(
      z.string().min(1).parse(id),
      dealFieldsSchema.parse(patch),
      user,
      z.record(z.string(), z.string().max(2000)).parse(expected),
    );
  });
}

export async function addDealNote(dealId: string, formData: FormData) {
  return withLog("addDealNote", async () => {
    const user = await requireUser();
    await deals.addDealNote(dealId, String(formData.get("body") ?? ""), user);
  });
}
