"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui";
import { holdFor, setHold, type HoldEntry, type LeaveScope, type LeaveWords } from "@/components/leave-holds";

/**
 * Asks before an in-app link leaves work behind: photos still uploading
 * (decision 24), a dirty form sheet, editor or draft (forms 2.11). Wrap the
 * pages in <LeaveGuard> (the app layout does, and the contractor job page).
 * Whatever knows calls useHoldLeave({ title, stay }) while it matters and
 * null when it doesn't; a BackLink inside (or any link that leaves through
 * useLeaveGuard) then asks first in a Sheet with just the title, "Leave
 * anyway" and the hold's `stay` as the main button. Esc, the backdrop and
 * the close button all stay. If the hold lifts while the sheet is open (the
 * uploads finished, the form was saved), the sheet closes and the person
 * stays put.
 *
 *   <LeaveGuard>…<BackLink …/>…<Composer /></LeaveGuard>
 *   // in Composer:
 *   useHoldLeave(pending > 0 ? { title: "2 photos are still uploading", stay: "Keep uploading" } : null);
 *
 * Several holds can be on at once, each from its own useHoldLeave. A hold's
 * `scope` says which exits it stops: "all" (the default) asks before every
 * exit; "sign-out" asks only before Sign out, for the upload queue, which
 * outlives the page (build plan conflict 33). When several apply, the one
 * placed last speaks.
 *
 * In-app links never fire beforeunload, so a reload or a closed tab is
 * useLeaveWarning's job (media-uploader.tsx), and useDraft's. The browser's
 * own Back isn't caught here.
 */

export type { LeaveScope } from "@/components/leave-holds";

export type LeaveHold = LeaveWords & {
  /** Which exits ask: "all" (the default) or only "sign-out". */
  scope?: LeaveScope;
};

type Guard = {
  hold: (id: string, hold: (LeaveWords & { scope: LeaveScope }) | null) => void;
  ask: (leave: () => void, signOut: boolean) => void;
};

const LeaveGuardContext = createContext<Guard | null>(null);

export function LeaveGuard({ children }: { children: ReactNode }) {
  const [holds, setHolds] = useState<HoldEntry[]>([]);
  // The exit being asked about, or null when no question is open.
  const [asking, setAsking] = useState<{ signOut: boolean } | null>(null);
  // The latest words, kept after the question closes so a closing sheet doesn't go blank.
  const [words, setWords] = useState<LeaveWords | null>(null);
  const leaveTo = useRef<(() => void) | null>(null);
  const holdsRef = useRef(holds);
  useLayoutEffect(() => {
    holdsRef.current = holds;
  });

  const current = asking ? holdFor(holds, asking.signOut) : null;
  // Nothing left to lose for this exit: the question goes away and the person stays.
  if (asking && !current) setAsking(null);
  if (current && (current.title !== words?.title || current.stay !== words?.stay)) {
    setWords({ title: current.title, stay: current.stay });
  }

  const hold = useCallback<Guard["hold"]>((id, h) => setHolds((hs) => setHold(hs, id, h)), []);
  const ask = useCallback<Guard["ask"]>((leave, signOut) => {
    if (!holdFor(holdsRef.current, signOut)) return leave();
    leaveTo.current = leave;
    setAsking({ signOut });
  }, []);
  const guard = useMemo(() => ({ hold, ask }), [hold, ask]);

  function leaveAnyway() {
    setAsking(null);
    leaveTo.current?.();
  }

  return (
    <LeaveGuardContext value={guard}>
      {children}
      <Sheet
        isOpen={current !== null}
        onOpenChange={(open) => {
          if (!open) setAsking(null);
        }}
        title={words?.title ?? ""}
        className="md:w-[28rem]"
      >
        <div className="p-4">
          {/* Same row as the Mark done sheet: the way out on the left, the main button on the right. */}
          <div className="flex items-center gap-3">
            <Button variant="secondary" className="h-12 min-w-0 flex-1 whitespace-nowrap max-[360px]:px-2" onClick={leaveAnyway}>
              Leave anyway
            </Button>
            <Button className="h-12 min-w-0 flex-1 whitespace-nowrap max-[360px]:px-2" onClick={() => setAsking(null)}>
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
 * lets go too. Each call is its own hold, so a form and an upload can hold at
 * once. Outside a LeaveGuard it does nothing.
 */
export function useHoldLeave(hold: LeaveHold | null) {
  const set = useContext(LeaveGuardContext)?.hold;
  const id = useId();
  const title = hold?.title;
  const stay = hold?.stay;
  const scope: LeaveScope = hold?.scope ?? "all";
  useEffect(() => {
    if (!set) return;
    set(id, title !== undefined && stay !== undefined ? { title, stay, scope } : null);
  }, [set, id, title, stay, scope]);
  useEffect(() => (set ? () => set(id, null) : undefined), [set, id]);
}

const leaveNow = (leave: () => void) => leave();

/**
 * For anything that navigates within the app (BackLink, TopTabs, the
 * sidebar, the payoff's "Back to my jobs"): `guard(leave)` runs `leave` now,
 * or asks first while a hold covers it. A Sign out button passes
 * `{ signOut: true }`: signing out is the one exit an upload in flight must
 * stop, so it also asks for "sign-out" holds, which every other exit lets
 * pass.
 */
export function useLeaveGuard(options: { signOut?: boolean } = {}): (leave: () => void) => void {
  const ask = useContext(LeaveGuardContext)?.ask;
  const signOut = options.signOut === true;
  return useMemo(() => (ask ? (leave: () => void) => ask(leave, signOut) : leaveNow), [ask, signOut]);
}
