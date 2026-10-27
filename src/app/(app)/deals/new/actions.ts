"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";
import { DEAL_STATUSES, DEFAULT_DEAL_STATUS } from "@/lib/config";
import { looksLikeLink, splitAddress, tidyAddress, withScheme } from "@/lib/address-suggestions";
import { withResult } from "@/lib/server-action";
import { addDealNote } from "@/lib/deals/notes";
import * as deals from "@/lib/deals/service";

/**
 * Thin server action for New deal (forms 2.12, 4.3): authenticate, validate,
 * call the deal service, and answer with `{ id }` instead of redirecting, so
 * the sheet decides whether to stay on the list or open the deal. Next action
 * is not here (it's set on the deal page, DEALS-041). The optional note is
 * saved as the deal's first timeline note through `addDealNote`.
 *
 * Every message is the plain line the field shows (forms 2.0). An address
 * that is already a deal is the address field's refusal, and nothing is saved.
 */

const isHttpUrl = (s: string) => {
  try {
    return /^https?:$/.test(new URL(s).protocol);
  } catch {
    return false;
  }
};

const dealSchema = z.object({
  address: z
    .string({ error: "Enter the address." })
    .trim()
    .min(4, "Enter the full address, like 123 Main St.")
    .refine((a) => !looksLikeLink(a), "That's a link. Enter the street address."),
  status: z.enum(DEAL_STATUSES, { error: "Pick a stage." }).default(DEFAULT_DEAL_STATUS),
  theirPriceRaw: z.string().optional(),
  ourPriceRaw: z.string().optional(),
  // "1,200" as the field tidies it reads the same as "1200".
  units: z
    .string()
    .transform((s) => Number(s.replace(/,/g, "")))
    .pipe(z.number({ error: "Enter a whole number." }).int("Enter a whole number.").min(1, "Enter 1 or more."))
    .optional(),
  sourceUrl: z
    .string()
    .refine((s) => isHttpUrl(withScheme(s)), "Enter a link that starts with https://.")
    .transform(withScheme)
    .optional(),
  note: z.string().max(5000, "Keep the note under 5,000 characters.").optional(),
});

/** The deal made, for "767 Prospect Ave added to TBD · Open". */
export type CreatedDeal = { id: string; address: string; status: string };

/** Creates the deal, with its note as the first line of its timeline. */
export async function createDeal(formData: FormData): Promise<ActionResult<CreatedDeal>> {
  return withResult("createDeal", async () => {
    const user = await requireUser();
    const p = dealSchema.parse(formToObject(formData));
    const { note, ...fields } = p;
    const r = await deals.createDeal({ ...fields, address: tidyAddress(p.address) }, user);
    if (r.duplicateOf) {
      // The address field's refusal, with the street as the record has it.
      const street = splitAddress(r.duplicateOf.address).street;
      throw new z.ZodError([{ code: "custom", path: ["address"], message: `${street} is already a deal.`, input: p.address }]);
    }
    if (note) await addDealNote(r.deal.id, note, user);
    return { id: r.deal.id, address: r.deal.address, status: r.deal.status };
  });
}
