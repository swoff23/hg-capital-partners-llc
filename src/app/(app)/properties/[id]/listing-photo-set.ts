/**
 * A rental listing's photo set while its sheet is open: the order is the
 * carousel's order and the first photo is the cover on the public site
 * (docs/specs/uploads-photos.md 2.9, choice 4 A). Every change returns a new
 * array and leaves a set it can't change as it was. Pure; see
 * listing-photo-set.test.ts.
 */

/** One photo in a listing's set: public Blob, where it is and how to delete it. */
export type ListingPhotoDraft = { url: string; pathname: string };

/** The most photos a listing holds (the server's cap). */
export const LISTING_PHOTO_MAX = 20;

/** The set with `photo` added last, unless it's full or already holds that blob. */
export function withPhoto(set: readonly ListingPhotoDraft[], photo: ListingPhotoDraft, max = LISTING_PHOTO_MAX): ListingPhotoDraft[] {
  if (set.length >= max || set.some((p) => p.pathname === photo.pathname)) return [...set];
  return [...set, photo];
}

/** The set without the photo at `index`. */
export function withoutPhoto(set: readonly ListingPhotoDraft[], index: number): ListingPhotoDraft[] {
  return set.filter((_, i) => i !== index);
}

/** The set with the photo at `index` one place earlier (-1) or later (1); the ends stay put. */
export function movedPhoto(set: readonly ListingPhotoDraft[], index: number, direction: -1 | 1): ListingPhotoDraft[] {
  const to = index + direction;
  if (index < 0 || index >= set.length || to < 0 || to >= set.length) return [...set];
  const next = [...set];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
