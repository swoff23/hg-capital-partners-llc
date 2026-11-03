import { URL_MESSAGE } from "@/lib/inline-edit";
import { NUMBER_MESSAGE, parseAmount } from "@/lib/money";

/**
 * The limits and plain lines of a deal's fields (forms 4.3), without zod, so
 * the deal page's fields can say the server's rule before anything is sent.
 * The schemas both saves parse with are fields.ts. Pure; see fields.test.ts.
 */

/** The longest text each field keeps. */
export const DEAL_TEXT_LIMITS = {
  address: 300,
  price: 100,
  nextAction: 300,
  sourceUrl: 2000,
  priority: 60,
  passReason: 120,
} as const;

/** Most units a deal can have. */
export const MAX_DEAL_UNITS = 10_000;

/** The price columns are Decimal(12, 2), so an amount stays under 10^10 dollars. */
export const MAX_DEAL_AMOUNT = 10_000_000_000;

/** The longest note. A deal log holds sentences, not documents. */
export const NOTE_MAX = 5000;

export const DEAL_MESSAGES = {
  addressBlank: "Enter the address.",
  addressShort: "Enter the full address, like 123 Main St.",
  addressLink: "That's a link. Enter the street address.",
  amount: NUMBER_MESSAGE.money,
  amountTooBig: "Enter an amount under $10 billion.",
  wholeNumber: "Enter a whole number.",
  unitsMin: "Enter 1 or more.",
  unitsMax: "Enter a smaller number.",
  link: URL_MESSAGE,
  stage: "Pick a stage.",
  note: `Keep the note under ${NOTE_MAX.toLocaleString("en-US")} characters.`,
} as const;

/** "Use 300 characters or fewer." */
export const tooLongMessage = (max: number) => `Use ${max.toLocaleString("en-US")} characters or fewer.`;

/** Whether a price's amount, when it reads as one, fits: zero or more (`readNumber`'s rule) and under the column's top. Text prices pass. */
export function dealPriceProblem(raw: string): string | null {
  const n = parseAmount(raw);
  if (n === null) return null;
  if (n < 0) return DEAL_MESSAGES.amount;
  if (Number(n.toFixed(2)) >= MAX_DEAL_AMOUNT) return DEAL_MESSAGES.amountTooBig;
  return null;
}

/** Units as typed ("1,200"): 1 to 10,000. Blank clears; text that isn't a number is the field's own line. */
export function dealUnitsProblem(raw: string): string | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (n < 1) return DEAL_MESSAGES.unitsMin;
  if (n > MAX_DEAL_UNITS) return DEAL_MESSAGES.unitsMax;
  return null;
}
