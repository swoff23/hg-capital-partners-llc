import { inlineProblem } from "@/lib/inline-edit";
import { NUMBER_MESSAGE, readNumber, type NumberKind } from "@/lib/money";
import { RENT_LIMIT, RENT_MESSAGE, SQFT_LIMIT, tooLargeMessage } from "@/lib/properties/numbers";

/** What a listing's sheet checks, as typed. */
export type ListingFields = { unitLabel: string; zillowUrl: string; rent: string; sqft: string; beds: string; baths: string };

/** The kit's line for text that doesn't read, or null. Blank is fine. */
function problem(kind: NumberKind, text: string): string | null {
  const r = readNumber(kind, text);
  return r.ok ? null : r.message;
}

/**
 * The listing sheet's field lines, by field name (forms 2.0), the same the
 * server's `cleanListing` gives: Rent says a monthly example ("like 1,500",
 * where the money kit's "like 425,000" reads as a price), and Rent and Sq ft
 * say their limit when the number is too large for the column. A bed or
 * bath count already stored ("Studio") is left as it is until someone types
 * over it. Pure; see listing-checks.test.ts.
 */
export function listingProblems(l: ListingFields, original: ListingFields): Record<string, string> {
  const found: Record<string, string> = {};
  if (!l.unitLabel.trim()) found.unitLabel = "Choose a unit.";
  const url = inlineProblem("url", l.zillowUrl);
  if (url) found.zillowUrl = url;
  const rent = readNumber("money", l.rent);
  if (!rent.ok) found.rent = RENT_MESSAGE;
  else if (rent.value != null && Math.round(rent.value * 100) / 100 >= RENT_LIMIT) found.rent = tooLargeMessage("rent");
  const sqft = readNumber("integer", l.sqft);
  if (!sqft.ok) found.sqft = NUMBER_MESSAGE.integer;
  else if (sqft.value != null && sqft.value >= SQFT_LIMIT) found.sqft = tooLargeMessage("sqft");
  const beds = l.beds !== original.beds ? problem("integer", l.beds) : null;
  if (beds) found.beds = beds;
  const baths = l.baths !== original.baths ? problem("decimal", l.baths) : null;
  if (baths) found.baths = baths;
  return found;
}
