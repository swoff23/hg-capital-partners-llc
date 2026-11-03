"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";
import { splitAddress, tidyAddress } from "@/lib/address-suggestions";
import { withResult } from "@/lib/server-action";
import { newDealSchema } from "@/lib/deals/fields";
import { addDealNote } from "@/lib/deals/notes";
import * as deals from "@/lib/deals/service";

/**
 * Thin server action for New deal (forms 2.12, 4.3): authenticate, validate,
 * call the deal service, and answer with `{ id }` instead of redirecting, so
 * the sheet decides whether to stay on the list or open the deal. Next action
 * is not here (it's set on the deal page, DEALS-041). The optional note is
 * saved as the deal's first timeline note through `addDealNote`.
 *
 * The fields are checked by the deal page's rules (lib/deals/fields.ts), so
 * what New deal saves the deal page can save again. Every message is the
 * plain line the field shows (forms 2.0). An address that is already a deal
 * is the address field's refusal, and nothing is saved.
 */

/** The deal made, for "767 Prospect Ave added to TBD · Open". */
export type CreatedDeal = { id: string; address: string; status: string };

/** Creates the deal, with its note as the first line of its timeline. */
export async function createDeal(formData: FormData): Promise<ActionResult<CreatedDeal>> {
  return withResult("createDeal", async () => {
    const user = await requireUser();
    const p = newDealSchema.parse(formToObject(formData));
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
