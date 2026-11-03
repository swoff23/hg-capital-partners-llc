import { z } from "zod";
import { DEAL_STATUSES, DEFAULT_DEAL_STATUS } from "@/lib/config";
import { looksLikeLink, tidyAddress, withScheme } from "@/lib/address-suggestions";
import type { DealPatch } from "./edits";
import { DEAL_MESSAGES, DEAL_TEXT_LIMITS, MAX_DEAL_UNITS, NOTE_MAX, dealPriceProblem, tooLongMessage } from "./field-rules";

export { DEAL_MESSAGES, DEAL_TEXT_LIMITS, MAX_DEAL_AMOUNT, MAX_DEAL_UNITS, NOTE_MAX, dealPriceProblem, dealUnitsProblem, tooLongMessage } from "./field-rules";

/**
 * One set of rules for a deal's fields (forms 4.3): what New deal accepts
 * (deals/new/actions.ts) is what the deal page and the list's stage pick
 * accept (deals/actions.ts), so a deal made in one can always be saved again
 * in the other. Before this New deal had no length caps, no top on units or
 * prices, saved -$5 and a punctuation-only address, and took a link the deal
 * page refused; a price over the column's size reached Postgres and came back
 * as "Something went wrong". The limits and lines are field-rules.ts, which
 * the deal page's fields also check before they send.
 *
 * Every message is the plain line the field shows (forms 2.0): it ends with a
 * period, so `zodFieldErrors` puts it on the field as written. Pure; see
 * fields.test.ts.
 */

const text = (max: number) => z.string().max(max, tooLongMessage(max));

/**
 * The address as typed: not a link, and still a full address once tidied the
 * way New deal saves it, so "....." (which tidies to nothing) is refused
 * instead of saving a blank deal. The text itself is kept as sent: the deal
 * page already sends it tidied, and Undo puts back exactly what was there.
 */
export const dealAddress = z
  .string({ error: DEAL_MESSAGES.addressBlank })
  .trim()
  .refine((a) => !looksLikeLink(a), DEAL_MESSAGES.addressLink)
  .refine((a) => tidyAddress(a).length >= 4, DEAL_MESSAGES.addressShort)
  .refine((a) => a.length <= DEAL_TEXT_LIMITS.address, tooLongMessage(DEAL_TEXT_LIMITS.address));

/** A price as typed: an amount ("425k") or text ("low 400s"), kept as typed. */
export const dealPrice = z
  .string()
  .trim()
  .max(DEAL_TEXT_LIMITS.price, tooLongMessage(DEAL_TEXT_LIMITS.price))
  .superRefine((s, ctx) => {
    const problem = dealPriceProblem(s);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

/** Units: a whole number from 1 to 10,000. */
export const dealUnits = z
  .number({ error: DEAL_MESSAGES.wholeNumber })
  .int(DEAL_MESSAGES.wholeNumber)
  .min(1, DEAL_MESSAGES.unitsMin)
  .max(MAX_DEAL_UNITS, DEAL_MESSAGES.unitsMax);

const isHttpUrl = (s: string) => {
  try {
    return /^https?:$/.test(new URL(s).protocol);
  } catch {
    return false;
  }
};

/**
 * The listing link: one that starts with https://, http:// or www. (the
 * shape `looksLikeLink` reads as a link), saved with https:// when it has no
 * scheme, so "www.zillow.com/..." opens. Empty clears it.
 */
export const dealListingLink = z
  .string()
  .trim()
  .max(DEAL_TEXT_LIMITS.sourceUrl, tooLongMessage(DEAL_TEXT_LIMITS.sourceUrl))
  .refine((s) => s === "" || (looksLikeLink(s) && isHttpUrl(withScheme(s))), DEAL_MESSAGES.link)
  .transform((s) => (s === "" ? s : withScheme(s)));

/**
 * What the deal page's rail and heading, and the list's stage pick, send: any
 * of the whitelisted fields, each by the rules above. A stage the list
 * doesn't know is ignored by the service (`dealPatchData`), as before.
 */
export const dealFieldsSchema = z
  .object({
    address: dealAddress,
    status: z.string().max(60, DEAL_MESSAGES.stage),
    priority: text(DEAL_TEXT_LIMITS.priority).nullish(),
    passReason: text(DEAL_TEXT_LIMITS.passReason).nullish(),
    theirPriceRaw: dealPrice.nullish(),
    ourPriceRaw: dealPrice.nullish(),
    units: dealUnits.nullish(),
    nextAction: text(DEAL_TEXT_LIMITS.nextAction).nullish(),
    sourceUrl: dealListingLink.nullish(),
  })
  .partial()
  .strict();

/** A deal edit as the service takes it, or the ZodError the field shows. */
export function parseDealPatch(patch: unknown): DealPatch {
  return dealFieldsSchema.parse(patch);
}

/**
 * New deal's fields as its form posts them (`formToObject` drops empty
 * fields): the same rules, with Units read from its text ("1,200" reads the
 * same as "1200") and the optional first note.
 */
export const newDealSchema = z.object({
  address: dealAddress,
  status: z.enum(DEAL_STATUSES, { error: DEAL_MESSAGES.stage }).default(DEFAULT_DEAL_STATUS),
  theirPriceRaw: dealPrice.optional(),
  ourPriceRaw: dealPrice.optional(),
  units: z
    .string()
    .transform((s) => Number(s.replace(/,/g, "")))
    .pipe(dealUnits)
    .optional(),
  sourceUrl: dealListingLink.optional(),
  note: z.string().max(NOTE_MAX, DEAL_MESSAGES.note).optional(),
});
