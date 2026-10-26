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

/**
 * The set with the photo at `from` taking the place of the one at `to`, the
 * others shifting over by one: what a drop onto a tile does. Dropping onto
 * the first tile makes it the cover. Out-of-range places leave the set as it
 * was.
 */
export function movedPhotoTo(set: readonly ListingPhotoDraft[], from: number, to: number): ListingPhotoDraft[] {
  if (from < 0 || from >= set.length || to < 0 || to >= set.length || from === to) return [...set];
  const next = [...set];
  const [photo] = next.splice(from, 1);
  next.splice(to, 0, photo);
  return next;
}

/** The set with the photo at `index` made the cover, the others keeping their order. */
export function coverPhoto(set: readonly ListingPhotoDraft[], index: number): ListingPhotoDraft[] {
  return movedPhotoTo(set, index, 0);
}

/**
 * A removed photo back where it was (the "Photo removed · Undo" toast), or at
 * the end when the set is shorter now. A full set, or one that already holds
 * the blob, is left as it was.
 */
export function restoredPhoto(
  set: readonly ListingPhotoDraft[],
  photo: ListingPhotoDraft,
  index: number,
  max = LISTING_PHOTO_MAX,
): ListingPhotoDraft[] {
  if (set.length >= max || set.some((p) => p.pathname === photo.pathname)) return [...set];
  const next = [...set];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, photo);
  return next;
}

/** How many more photos the listing takes. */
export function photoRoom(count: number, max = LISTING_PHOTO_MAX): number {
  return Math.max(0, max - count);
}

/** Photos a listing needs before it goes public (docs/brand-guidelines.md, section 6, Listing set). The gate itself is the listing's own. */
export const LISTING_PHOTO_MIN = 5;

/** "Listings need 5 photos · 2 to go" while the set is short of the minimum; null once it's met. */
export function photosNeededLine(count: number, min = LISTING_PHOTO_MIN): string | null {
  const missing = min - count;
  return missing > 0 ? `Listings need ${min} photos · ${missing} to go` : null;
}

/** What each photo is called, so every tile, viewer and announcement names a different one: "Unit 2 photo 3". */
export function photoName(unit: string, number: number): string {
  return `${unit.trim() || "Listing"} photo ${number}`;
}

/**
 * What the live region says after a photo moved ("Photo 3 moved to position
 * 1, now the cover"). Places are counted from 1.
 */
export function movedAnnouncement(from: number, to: number): string {
  const moved = `Photo ${from + 1} moved to position ${to + 1}`;
  return to === 0 ? `${moved}, now the cover` : moved;
}
