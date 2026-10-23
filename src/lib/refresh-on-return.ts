/**
 * When a signed-in page re-fetches its server data by itself
 * (components/refresh-on-return.tsx). Nothing polls: a page refreshes when
 * someone comes back to it, so a tab opened in the morning isn't still
 * showing the morning at night.
 *
 *  - the tab is shown again after more than a minute hidden;
 *  - the connection comes back;
 *  - Safari restores the page from its back-forward cache;
 *  - the Buffalo calendar day has changed since the page loaded, so "Today"
 *    and "3d ago" are right again.
 *
 * Pure; see refresh-on-return.test.ts.
 */
import type { Ymd } from "./dates";

/** Hidden longer than this, a tab refreshes when it's shown again. */
export const STALE_AFTER_MS = 60_000;

/** One restore can fire pageshow and visibilitychange together; it refreshes once. */
export const MIN_GAP_MS = 5_000;

/**
 * Pages that don't refresh by themselves yet. A refresh under the property
 * page's open editors would drop what's typed in Details, Loan, Insurance and
 * Notes (their forms are keyed by version) and would let a stale Units,
 * Rentals or Building CapEx draft past the conflict check (it saves with the
 * version prop, which the refresh moves on). Drop the entry once those
 * editors keep their draft and the version they opened with.
 */
const HELD: readonly RegExp[] = [/^\/properties\/[^/]+\/?$/];

export type ReturnTrigger =
  | { kind: "visible"; hiddenMs: number }
  | { kind: "online" }
  | { kind: "pageshow"; persisted: boolean }
  /** The once-a-minute check, for a tab left showing across midnight. */
  | { kind: "clock" };

export type ReturnState = {
  pathname: string;
  /** The Eastern day the page's data was rendered on. */
  loadedDay: Ymd;
  today: Ymd;
  /** Since the page loaded or last refreshed. */
  sinceLastMs: number;
};

export function refreshHeld(pathname: string): boolean {
  return HELD.some((re) => re.test(pathname));
}

export function shouldRefresh(trigger: ReturnTrigger, s: ReturnState): boolean {
  if (refreshHeld(s.pathname)) return false;
  if (s.sinceLastMs < MIN_GAP_MS) return false;
  if (s.today !== s.loadedDay) return true;
  switch (trigger.kind) {
    case "visible":
      return trigger.hiddenMs > STALE_AFTER_MS;
    case "online":
      return true;
    case "pageshow":
      return trigger.persisted;
    case "clock":
      return false;
  }
}
