"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { formToObject } from "@/lib/forms";
import { looksLikeLink, runAddresses, splitAddress, tidyAddress } from "@/lib/address-suggestions";
import { prisma } from "@/lib/db";
import { withResult } from "@/lib/server-action";
import * as properties from "@/lib/properties/service";

/**
 * Thin server action for New property (forms 2.12, 4.2): authenticate,
 * validate, call the property service, and answer with `{ id }` instead of
 * redirecting, so the sheet opens the new record with its toast. Status is
 * not asked here (a missing status shows as the rail's verb, PORTFOLIO-044).
 * An address that is already a property is the address field's refusal, with
 * the street as the record has it, and nothing is saved.
 */

const propertySchema = z.object({
  address: z
    .string({ error: "Enter the address." })
    .trim()
    .min(4, "Enter the full street address, like 123 Main St.")
    .refine((a) => !looksLikeLink(a), "That's a link. Enter the street address."),
  llcOwner: z.string().max(200, "Keep the entity under 200 characters.").optional(),
});

/** The property made, for "767 Prospect Ave added" and opening it. */
export type CreatedProperty = { id: string; address: string };

export async function createProperty(formData: FormData): Promise<ActionResult<CreatedProperty>> {
  return withResult("createProperty", async () => {
    const user = await requireUser();
    const p = propertySchema.parse(formToObject(formData));
    const taken = (street: string) =>
      new z.ZodError([{ code: "custom", path: ["address"], message: `${street} is already a property.`, input: p.address }]);
    // The same test the field's "is already a property" line runs, so what it warned about is what's refused.
    const { match } = await runAddresses(prisma, { q: p.address, kind: "property" });
    if (match) throw taken(match.street);
    // The creator is the record's first editor (updatedByUserId), so a later refusal can name them.
    const r = await properties.createProperty({ address: tidyAddress(p.address), llcOwner: p.llcOwner }, user);
    if (r.duplicateOf) throw taken(splitAddress(r.duplicateOf.address).street);
    return { id: r.property.id, address: r.property.address };
  });
}
