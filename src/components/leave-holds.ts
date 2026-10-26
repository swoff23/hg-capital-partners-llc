/**
 * Which hold speaks when someone tries to leave (components/leave-guard.tsx).
 * Pure, so leave-holds.test.ts runs it without React.
 *
 * Two kinds of hold can be on at once (build plan conflict 33): a dirty
 * sheet, editor or draft holds every exit (scope "all", forms 2.11), and the
 * upload queue holds only Sign out (scope "sign-out", uploads 2.1), since
 * the queue outlives the page. An in-app link asks only for "all" holds;
 * Sign out asks for either.
 */

/** "all": every exit asks. "sign-out": only Sign out asks. */
export type LeaveScope = "all" | "sign-out";

/** What a hold says when it asks. */
export type LeaveWords = {
  /** The sheet's title, and all it says: what's at stake ("Leave Unit 2?"; short enough to keep one line on a phone). */
  title: string;
  /** The main button, which stays ("Keep editing", "Keep uploading"). */
  stay: string;
};

/** One hold on the guard, in the order holds were placed. */
export type HoldEntry = LeaveWords & { id: string; scope: LeaveScope };

/** Whether a hold asks before this kind of exit. */
export function holdApplies(hold: Pick<HoldEntry, "scope">, signOut: boolean): boolean {
  return signOut || hold.scope === "all";
}

/**
 * Whether unsaved work is on the page: any hold that asks before every exit
 * (a dirty sheet, editor or draft). The upload queue's "sign-out" hold is
 * work in flight, not a draft, so it doesn't count. A page that would
 * refresh itself reads this and waits (RefreshOnReturn).
 */
export function hasUnsavedWork(holds: readonly Pick<HoldEntry, "scope">[]): boolean {
  return holds.some((h) => h.scope === "all");
}

/**
 * The hold that asks before an exit, or null when nothing holds it: the most
 * recently placed one that applies, since it's the work the person touched
 * last.
 */
export function holdFor(holds: readonly HoldEntry[], signOut: boolean): HoldEntry | null {
  for (let i = holds.length - 1; i >= 0; i--) {
    if (holdApplies(holds[i], signOut)) return holds[i];
  }
  return null;
}

/**
 * Places, updates or lifts one hold (null lifts it). An update keeps the
 * hold's place, so changing words doesn't make it the latest. Returns the
 * same array when nothing changed.
 */
export function setHold(holds: readonly HoldEntry[], id: string, hold: (LeaveWords & { scope: LeaveScope }) | null): HoldEntry[] {
  const at = holds.findIndex((h) => h.id === id);
  if (!hold) return at === -1 ? (holds as HoldEntry[]) : holds.filter((h) => h.id !== id);
  const entry: HoldEntry = { id, title: hold.title, stay: hold.stay, scope: hold.scope };
  if (at === -1) return [...holds, entry];
  const old = holds[at];
  if (old.title === entry.title && old.stay === entry.stay && old.scope === entry.scope) return holds as HoldEntry[];
  return holds.map((h, i) => (i === at ? entry : h));
}
