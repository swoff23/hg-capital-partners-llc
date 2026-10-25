"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui";

/**
 * Asks before an in-app link leaves a page that would lose work, such as
 * photos still uploading (decision 24). Wrap the page in <LeaveGuard>. The
 * part that knows calls useHoldLeave({ title, stay }) while it matters and
 * null when it doesn't; a BackLink inside (or any link that leaves through
 * useLeaveGuard) then asks first in a Sheet, with "Leave anyway" and the
 * hold's `stay` as the main button. Esc, the backdrop and the close button
 * all stay. If the hold lifts while the sheet is open (the uploads
 * finished), the sheet closes and the person stays put.
 *
 *   <LeaveGuard>…<BackLink …/>…<Composer /></LeaveGuard>
 *   // in Composer:
 *   useHoldLeave(pending > 0 ? { title: "2 photos are still uploading", stay: "Keep uploading" } : null);
 *
 * In-app links never fire beforeunload, so a reload or a closed tab is
 * useLeaveWarning's job (media-uploader.tsx). The browser's own Back isn't
 * caught here.
 */

export type LeaveHold = {
  /** The sheet's title, and all it says: what's at stake ("2 photos are still uploading"). */
  title: string;
  /** The main button, which stays ("Keep uploading"). */
  stay: string;
};

type Guard = {
  hold: (hold: LeaveHold | null) => void;
  ask: (leave: () => void) => void;
};

const LeaveGuardContext = createContext<Guard | null>(null);

export function LeaveGuard({ children }: { children: ReactNode }) {
  // The latest words, kept after the hold lifts so a closing sheet doesn't go blank.
  const [words, setWords] = useState<LeaveHold | null>(null);
  const [holding, setHolding] = useState(false);
  const [asking, setAsking] = useState(false);
  const leaveTo = useRef<(() => void) | null>(null);

  const hold = useCallback((h: LeaveHold | null) => {
    if (h) setWords(h);
    setHolding(h !== null);
    // Nothing left to lose: the question goes away and the person stays.
    if (!h) setAsking(false);
  }, []);

  function ask(leave: () => void) {
    if (!holding) return leave();
    leaveTo.current = leave;
    setAsking(true);
  }

  function leaveAnyway() {
    setAsking(false);
    leaveTo.current?.();
  }

  return (
    <LeaveGuardContext value={{ hold, ask }}>
      {children}
      <Sheet isOpen={asking} onOpenChange={setAsking} title={words?.title ?? ""} className="md:w-[28rem]">
        <div className="p-4">
          {/* Same row as the Mark done sheet: the way out on the left, the main button on the right. */}
          <div className="flex items-center gap-3">
            <Button variant="secondary" className="h-12 min-w-0 flex-1 whitespace-nowrap max-[360px]:px-2" onClick={leaveAnyway}>
              Leave anyway
            </Button>
            <Button className="h-12 min-w-0 flex-1 whitespace-nowrap max-[360px]:px-2" onClick={() => setAsking(false)}>
              <span className="truncate">{words?.stay}</span>
            </Button>
          </div>
        </div>
      </Sheet>
    </LeaveGuardContext>
  );
}

/**
 * Holds the nearest LeaveGuard while `hold` is set; null lets go. Unmounting
 * lets go too. Outside a LeaveGuard it does nothing.
 */
export function useHoldLeave(hold: LeaveHold | null) {
  const set = useContext(LeaveGuardContext)?.hold;
  const title = hold?.title;
  const stay = hold?.stay;
  useEffect(() => {
    if (!set) return;
    set(title !== undefined && stay !== undefined ? { title, stay } : null);
  }, [set, title, stay]);
  useEffect(() => (set ? () => set(null) : undefined), [set]);
}

const leaveNow = (leave: () => void) => leave();

/**
 * For anything that navigates within the app (BackLink, the payoff's "Back to
 * my jobs"): `guard(leave)` runs `leave` now, or asks first while something
 * holds the page.
 */
export function useLeaveGuard(): (leave: () => void) => void {
  return useContext(LeaveGuardContext)?.ask ?? leaveNow;
}
