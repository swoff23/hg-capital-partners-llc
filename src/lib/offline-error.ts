/**
 * Whether a thrown call failed for want of a connection. Its own file, with no
 * imports, so the browser's error catcher (src/lib/client-errors.ts), which
 * loads on every page before hydration, can use it without pulling in the
 * rest of action-result.ts. action-result.ts re-exports it, so callers keep
 * importing it from there.
 */

// What fetch rejects with when the network is down or drops mid-request:
// Chrome, Firefox, Safari (old and new), and Node's undici.
const NETWORK_FAILURE =
  /^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|The Internet connection appears to be offline\.?|The network connection was lost\.?|The request timed out\.?|Network request failed|network error|fetch failed)$/i;

/** Whether a thrown call failed for want of a connection, as opposed to a bug or a refusal. */
export function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return err instanceof TypeError && NETWORK_FAILURE.test(err.message);
}
