"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { RailList } from "@/components/rail";
import { addRowClass } from "@/components/ui";
import { foldedKeys, moreFieldsLabel, type FoldRow } from "@/lib/rail-fold";

/** One row of a folding rail: its `RailFact`, and what decides whether it folds. */
export type RailFoldRow = FoldRow & { node: ReactNode };

/**
 * A facts rail whose empty rows fold behind one "7 more fields" row
 * (docs/specs/property-page.md 2.2; Attio's "Show all values", Lightfield's
 * "See more"). Folded, the list shows the filled rows and the kept ones
 * (`keep`: a reminder date, a switch); the foot row opens the rest in place,
 * in their usual order, and turns into "Fewer fields". It has the look of
 * the list's `AddRow`: 40px, 48 on touch, the same at every width, nothing
 * on hover alone. It starts closed on every visit.
 *
 * A row filled on this visit stays out of the fold after it's cleared, so a
 * cleared field doesn't vanish under the finger. A verb elsewhere that asks
 * for a folded row (the fact strip's "Add value") opens the fold through
 * `listen`, and `reopen` asks again once the row is in, so its field opens.
 */
export function RailFold({
  rows,
  listen,
  reopen,
}: {
  rows: RailFoldRow[];
  /** Subscribes to requests for any of `keys` from elsewhere on the page; returns the unsubscribe. */
  listen?: (keys: readonly string[], open: (key: string) => void) => () => void;
  /** Asks for `key` again once the fold has opened, so the row's own field takes the request. */
  reopen?: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // The row a verb elsewhere asked for while it was folded, asked for again once the fold is open.
  const asked = useRef<string | null>(null);
  // The rows seen filled on this visit; a filled row joins as it renders (state adjusted during render, as React allows).
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set(rows.filter((r) => !r.empty).map((r) => r.key)));
  const newlyFilled = rows.filter((r) => !r.empty && !seen.has(r.key));
  if (newlyFilled.length > 0) setSeen(new Set([...seen, ...newlyFilled.map((r) => r.key)]));

  const folded = foldedKeys(rows, seen);
  const hidden = open ? [] : folded;
  const hiddenKey = hidden.join(",");

  useEffect(() => {
    if (!listen || !hiddenKey) return;
    return listen(hiddenKey.split(","), (key) => {
      asked.current = key;
      setOpen(true);
    });
  }, [listen, hiddenKey]);

  // The asked-for row is in now: ask again, and its field (subscribed as it mounted) opens.
  useEffect(() => {
    const key = asked.current;
    if (!open || !key) return;
    asked.current = null;
    reopen?.(key);
  }, [open, reopen]);

  return (
    <>
      <RailList>
        {rows.filter((r) => !hidden.includes(r.key)).map((r) => (
          <Fragment key={r.key}>{r.node}</Fragment>
        ))}
      </RailList>
      {folded.length > 0 && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={addRowClass}>
          {open ? (
            <ChevronUp aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0 text-fg-3" />
          ) : (
            <ChevronDown aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0 text-fg-3" />
          )}
          {open ? "Fewer fields" : moreFieldsLabel(folded.length)}
        </button>
      )}
    </>
  );
}
