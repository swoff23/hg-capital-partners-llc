"use client";
import { useState, type ReactNode } from "react";
import { Money } from "@/components/money";
import { Section } from "@/components/ui";
import type { Ymd } from "@/lib/dates";
import type { DrawIn, LineIn } from "@/lib/draws/figures";
import { NextStep } from "../next-step";
import { DrawSheet } from "./draw-sheet";

/** A draw as its row reads it: the figures module's draw, the words for its stage and what it is worth. */
export type DrawRow = { draw: DrawIn; stage: string; amount: number };

/**
 * The Draws section (docs/specs/rehab-draws.md, L2): draws with the lender first, then the funded ones, newest
 * first. The draft is the Budget's Draw column, so it isn't listed. A row opens its Draw sheet; draws with the lender carry the next-step button under the row.
 */
export function DrawsSection({ rows, lines, today, done }: { rows: DrawRow[]; lines: LineIn[]; today: Ymd; done: boolean }) {
  const [open, setOpen] = useState<DrawRow | null>(null);
  return (
    <Section title="Draws">
      {rows.length === 0 ? (
        <p className="text-meta text-muted-foreground">No draws sent yet.</p>
      ) : (
        <ul className="-mt-1">
          {rows.map((r) => (
            <li key={r.draw.id} className="border-b border-border last:border-0">
              <DrawRowBox done={done} onOpen={() => setOpen(r)}>
                <span className="min-w-0">
                  <span className="block truncate text-body text-foreground">Draw {r.draw.number}</span>
                  <span className="block truncate text-meta text-muted-foreground">
                    {r.stage}
                  </span>
                </span>
                <Money value={r.amount} className="shrink-0" />
              </DrawRowBox>
              {/* A sibling of the row's button, never inside it. */}
              {!done && r.draw.stage !== "FUNDED" && r.draw.stage !== "DRAFT" && (
                <div className="pb-2.5">
                  <NextStep
                    draw={{ id: r.draw.id, number: r.draw.number, stage: r.draw.stage, sentAmount: r.draw.sentAmount, approvedAmount: r.draw.approvedAmount }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && <DrawSheet key={open.draw.id} draw={open.draw} lines={lines} today={today} isOpen onOpenChange={(o) => !o && setOpen(null)} />}
    </Section>
  );
}

/** A draw's row: a button that opens its sheet, or plain text once the rehab is marked done. */
function DrawRowBox({ done, onOpen, children }: { done: boolean; onOpen: () => void; children: ReactNode }) {
  const row = "flex min-h-12 min-w-0 items-center justify-between gap-3 py-1.5 text-left";
  if (done) return <div className={row}>{children}</div>;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className={`${row} -mx-2 my-0.5 w-[calc(100%+1rem)] rounded-md px-2 transition-colors pointer-fine:hover:bg-muted`}
    >
      {children}
    </button>
  );
}
