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
 * Never while the device is offline: in Next 16 a refresh whose fetch fails
 * falls back to a full browser navigation, which swaps the tab for the
 * browser's offline page. The "online" trigger catches up once it's back.
 *
 * Pure; see refresh-on-return.test.ts.
 */
import type { Ymd } from "./dates";

/** Hidden longer than this, a tab refreshes when it's shown again. */
export const STALE_AFTER_MS = 60_000;

/** One restore can fire pageshow and visibilitychange together; it refreshes once. */
export const MIN_GAP_MS = 5_000;

/** Wait this long after "online" before refreshing; the interface can come up before requests get through. */
export const ONLINE_SETTLE_MS = 2_000;

/**
 * Pages that don't refresh by themselves yet. A refresh can turn into a full
 * reload (a deploy since the tab loaded, a failed or non-OK response), and
 * these pages hold controlled drafts that a reload wipes and holdsTyping
 * can't see.
 *
 *  - The property page: a refresh under its open editors would drop what's
 *    typed in Details, Loan, Insurance and Notes (their forms are keyed by
 *    version) and would let a stale Units, Rentals or Building CapEx draft
 *    past the conflict check (it saves with the version prop, which the
 *    refresh moves on). Drop the entry once those editors hold the
 *    LeaveGuard while dirty, as every sheet and draft below does.
 *
 * The move-in form editor, the CapEx rules and Apply playbook used to be on
 * this list. Their drafts now hold the LeaveGuard while dirty, and that is
 * the signal every page shares (`ReturnState.unsaved`, forms 2.11).
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
  /** navigator.onLine at the moment of the trigger. */
  online: boolean;
  /**
   * Unsaved work is on the page: a dirty sheet, editor or draft holds the
   * LeaveGuard (components/leave-guard.tsx `useUnsavedWork`). A refresh
   * waits for it to be saved or discarded, whatever the page.
   */
  unsaved?: boolean;
};

export function refreshHeld(pathname: string): boolean {
  return HELD.some((re) => re.test(pathname));
}

export function shouldRefresh(trigger: ReturnTrigger, s: ReturnState): boolean {
  if (!s.online) return false;
  if (s.unsaved) return false;
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
