import { daysUntil, fmtDay, relativeDays, todayYmdEastern } from "@/lib/dates";

/**
 * What the Portal access card on a contractor's page says about a login
 * (cutover decision 22; review BCONTRACT-004, BCONTRACT-027). It reports
 * what sign-in will do, not one of its inputs:
 *  - "off": access removed, or the contact is inactive. Sign-in refuses both
 *    (accounts.ts authenticatePortalAccount).
 *  - "invited": hasn't signed in and picked a password of their own yet. A
 *    staff Reset password puts a login back here until they pick a new one,
 *    so the line reads "Not signed in yet" only when the login was never
 *    used, and "Last seen" once it has been.
 *  - "active": signed in on their own password; the line says when they were
 *    last seen.
 * Pure, clock passed in; see access-state.test.ts.
 */

export type PortalAccessState = "invited" | "active" | "off";

export interface PortalAccessFacts {
  status: "ACTIVE" | "DISABLED";
  mustChangePassword: boolean;
  lastSignInAt: Date | null;
  lastSeenAt: Date | null;
}

export function portalAccess(
  account: PortalAccessFacts,
  contactActive: boolean,
  now: Date = new Date(),
): { state: PortalAccessState; line: string | null } {
  if (!contactActive || account.status !== "ACTIVE") return { state: "off", line: null };
  const seen = latest(account.lastSeenAt, account.lastSignInAt);
  if (account.mustChangePassword || !seen) {
    return { state: "invited", line: seen ? `Last seen ${seenLabel(seen, now)}` : "Not signed in yet" };
  }
  return { state: "active", line: `Last seen ${seenLabel(seen, now)}` };
}

function latest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/**
 * Buffalo days, since lastSeenAt is written at most once a day
 * (limits.ts SESSION_TOUCH_INTERVAL_MS): relativeDays ("today", "yesterday",
 * "2d ago") up to a week, then the date, so a login unused for a month
 * doesn't read "34d ago".
 */
function seenLabel(at: Date, now: Date): string {
  const today = todayYmdEastern(now);
  const day = todayYmdEastern(at);
  const ago = -(daysUntil(day, today) ?? 0);
  if (ago >= 7) return fmtDay(day, { year: "auto", now: today });
  // A clock a little ahead reads "today", never "tomorrow".
  return ago <= 0 ? "today" : relativeDays(day, today);
}

/**
 * Whether the Portal access card offers Create login (no login yet) and
 * Restore access (a login whose access was removed). Neither shows for an
 * archived contractor: both are refused on the server until the contractor
 * is restored (accounts-core.ts ARCHIVED_CONTRACTOR_LINE), and a button that
 * can only refuse is a dead control. Restore on the page's Archived line is
 * the way back, and the card offers them again after it.
 */
export function loginOffers(account: { restorable: boolean } | null, archived: boolean): { create: boolean; restore: boolean } {
  if (archived) return { create: false, restore: false };
  return { create: !account, restore: !!account?.restorable };
}
