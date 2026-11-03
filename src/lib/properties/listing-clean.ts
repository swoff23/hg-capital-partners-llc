import type { ListingStatus } from "@prisma/client";
import { FieldError } from "@/lib/action-result";
import { ymdToDate } from "@/lib/dates";
import { NUMBER_MESSAGE } from "@/lib/money";
import { listingLinkProblem } from "@/lib/properties/listing-checks";
import { RENT_LIMIT, RENT_MESSAGE, readAmount, readWholeNumber, tooLargeMessage } from "@/lib/properties/numbers";

/**
 * What a listing write reads from the sheet, and what it keeps. Pure, so
 * listing-clean.test.ts runs it; the writes that use it are in service.ts.
 */

export interface ListingInput {
  id: string | null;
  unitLabel: string;
  zillowUrl: string;
  rent: string;
  beds: string;
  baths: string;
  sqft: string;
  availableDate: string;
  status: ListingStatus;
  photos: { url: string; pathname: string }[];
}

/**
 * What a listing writes, read from what the sheet sent: a blank unit is
 * "Unit", rent and square feet must read as numbers (a blank clears), the
 * Zillow link must be an http(s) link (the public Rentals page links to it),
 * and the photo set keeps its order. A value that doesn't read is a refusal
 * on that field, in the words of the field kit and the sheet.
 */
export function cleanListing(l: ListingInput) {
  const rent = readAmount(l.rent, RENT_LIMIT);
  const sqft = readWholeNumber(l.sqft);
  const problems: Record<string, string> = {};
  const link = listingLinkProblem(l.zillowUrl);
  if (link) problems.zillowUrl = link;
  if (!rent.ok) problems.rent = rent.tooLarge ? tooLargeMessage("rent") : RENT_MESSAGE;
  if (!sqft.ok) problems.sqft = sqft.tooLarge ? tooLargeMessage("sqft") : NUMBER_MESSAGE.integer;
  if (Object.keys(problems).length > 0) throw new FieldError(problems);
  return {
    id: l.id ?? null,
    unitLabel: l.unitLabel.trim() || "Unit",
    zillowUrl: l.zillowUrl.trim() || null,
    rent: rent.ok ? rent.value : null,
    beds: l.beds.trim() || null,
    baths: l.baths.trim() || null,
    sqft: sqft.ok ? sqft.value : null,
    availableDate: ymdToDate(l.availableDate.trim() || null),
    status: l.status,
    photos: l.photos
      .filter((p) => p.url.trim() && p.pathname.trim())
      .map((p, sortOrder) => ({ url: p.url.trim(), pathname: p.pathname.trim(), sortOrder })),
  };
}
