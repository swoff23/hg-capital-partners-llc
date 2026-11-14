/**
 * How long a toast stays (components/toast.tsx), and the one place every timer that has to agree with it reads
 * the number. A toast with a button (Undo, Retry, Reload, View, Open, Discard) stays TOAST_ACTION_MS: a pointer
 * or keyboard focus holds a toast open, a finger can't, so on a phone this is all the time there is to reach
 * the button. One with nothing to tap stays TOAST_MS.
 *
 * Three timers run beside the toast, because a toast can't tell its caller when it closes. Each is built from
 * TOAST_ACTION_MS, so Undo never shows after the thing it undoes is gone (toast-time.test.ts holds them to it):
 *  - a photo taken out of a reply is deleted just after its "Photo removed" toast ends (media-uploader.tsx);
 *  - a replaced or removed front photo is kept a beat longer than its toast (property-photo.tsx);
 *  - the server takes a contractor's "3 photos posted" Undo for the toast's time plus a grace (portal/job-view.ts).
 *
 * Pure, so the server reads the same number the browser does.
 */

/** A toast with nothing to tap. */
export const TOAST_MS = 5_000;

/** A toast with a button. */
export const TOAST_ACTION_MS = 8_000;

/** How long a toast stays: longer when it carries a button. */
export function toastMs(hasAction: boolean): number {
  return hasAction ? TOAST_ACTION_MS : TOAST_MS;
}
