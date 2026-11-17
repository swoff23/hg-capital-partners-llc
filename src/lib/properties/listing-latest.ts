import { stableJson } from "@/lib/drafts";

/**
 * What "Load the latest" does to a listing sheet after the save lost to a
 * newer property version. The listing's own fields and photos are what a
 * partner may have changed; the refusal is usually about something else on
 * the property (a value, a date), and the draft can hold a dozen photos just
 * uploaded. So the draft stays, and only the version it is saved against
 * moves on, unless the listing itself changed meanwhile: then the draft is
 * the latest listing, since saving it would write over that change.
 *
 * `opened` is the listing as the sheet last loaded it, `latest` as the page
 * holds it now, `draft` what is in the sheet.
 */
export function loadLatestListing<T>(opened: T, latest: T, draft: T): { base: T; draft: T; reset: boolean } {
  if (stableJson(opened) === stableJson(latest)) return { base: opened, draft, reset: false };
  return { base: latest, draft: structuredClone(latest), reset: true };
}
