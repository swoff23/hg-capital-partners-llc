"use client";
import { useState, type ReactNode } from "react";
import { Money } from "@/components/money";
import { StatusMark, type StageFill } from "@/components/status-badge";
import { Section } from "@/components/ui";
import type { Ymd } from "@/lib/dates";
import type { DrawIn, DrawStage, LineIn } from "@/lib/draws/figures";
import { NextStep } from "../next-step";
import { DrawSheet } from "./draw-sheet";

/** A draw as its row reads it: the figures module's draw, the words for its stage and what it is worth. */
export type DrawRow = { draw: DrawIn; stage: string; amount: number };

/**
 * The Draws section (docs/specs/rehab-draws.md, L2): draws with the lender first, then the funded ones, newest
 * first. The draft is the Budget's Draw column, so it isn't listed. Each row is the stage mark, "Draw 3 · $12,000"
 * over its stage, and the next-step button at the right (Connor, Nov 20: option A, "action on the row"; Deel's
 * Action required rows carry approve the same way). The row opens its Draw sheet; the button is its sibling, never
 * inside it.
 */
export function DrawsSection({ rows, lines, today, done }: { rows: DrawRow[]; lines: LineIn[]; today: Ymd; done: boolean }) {
  const [open, setOpen] = useState<DrawRow | null>(null);
  return (
    <Section title="Draws">
      {rows.length === 0 ? (
        <p className="text-meta text-muted-foreground">No draws sent yet.</p>
      ) : (
        <ul className="-mt-1">
          {rows.map((r) => {
            const step = !done && r.draw.stage !== "FUNDED" && r.draw.stage !== "DRAFT";
            return (
              <li key={r.draw.id} className="@container border-b border-border last:border-0">
                {/* The hover fills the whole row while the pointer is on the row's own button. */}
                <div className="-mx-2 my-0.5 flex min-w-0 items-center gap-3 rounded-md px-2 transition-colors pointer-fine:has-[[data-row]:hover]:bg-muted">
                  <DrawRowBox done={done} onOpen={() => setOpen(r)}>
                    <DrawStageMark stage={r.draw.stage} />
                    <span className="min-w-0">
                      <span className="block truncate text-body text-foreground">
                        Draw {r.draw.number} · <Money value={r.amount} />
                      </span>
                      <span className="block truncate text-meta text-muted-foreground">{r.stage}</span>
                    </span>
                  </DrawRowBox>
                  {step && (
                    <NextStep
                      short
                      className="shrink-0"
                      draw={{ id: r.draw.id, number: r.draw.number, stage: r.draw.stage, sentAmount: r.draw.sentAmount, approvedAmount: r.draw.approvedAmount }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {open && <DrawSheet key={open.draw.id} draw={open.draw} lines={lines} today={today} isOpen onOpenChange={(o) => !o && setOpen(null)} />}
    </Section>
  );
}

/* A draw's stage on the status ring, as deal stages and the property lifecycle do it: the pie fills as the draw
   moves (Sent a quarter, Inspection half, Approved three-quarters) and Funded is the Done check in --ok. */
const STAGE_FILL: Partial<Record<DrawStage, StageFill>> = { SENT: "quarter", INSPECTION: "half", APPROVED: "three-quarter" };

function DrawStageMark({ stage }: { stage: DrawStage }) {
  if (stage === "FUNDED") return <StatusMark status="DONE" />;
  return <StatusMark stage={STAGE_FILL[stage] ?? "empty"} />;
}

/** A draw's row: a button that opens its sheet, or plain text once the rehab is marked done. */
function DrawRowBox({ done, onOpen, children }: { done: boolean; onOpen: () => void; children: ReactNode }) {
  const row = "flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-md py-1.5 text-left";
  if (done) return <div className={row}>{children}</div>;
  return (
    <button type="button" data-row aria-haspopup="dialog" onClick={onOpen} className={row}>
      {children}
    </button>
  );
}
