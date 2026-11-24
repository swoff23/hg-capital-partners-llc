"use client";
import { Fragment } from "react";
import { ActivityFold, ActivityItem, ActivityTimeline } from "@/components/activity-timeline";
import { ActivityTime } from "@/components/activity-time";
import { Section } from "@/components/ui";
import type { Ymd } from "@/lib/dates";
import { collapseStretches, stretchSummary } from "@/lib/tasks/activity";
import { historyLine, type HistoryEvent, type HistoryLine } from "./history-lines";

/**
 * An invoice's History (docs/contractor-invoices-plan.md, section 6): the oldest line first, as the drawing has it,
 * each with its time. A run of edits folds to "Show 4 updates: total and jobs…" and the moves and the arrival stay
 * in view, so a long half-typed invoice reads in a line or two (collapseStretches, as the deal log does).
 */
export function InvoiceHistory({ events, today, now, fromName }: { events: HistoryEvent[]; today: Ymd; now: string; fromName: string | null }) {
  const lines = events.map((e) => historyLine(e, today, { fromName }));
  const items = collapseStretches(lines, { isAnchor: (l) => l.anchor, idOf: (l) => l.id });

  return (
    <Section title="History">
      <ActivityTimeline now={now}>
        {items.map((x) =>
          x.type === "row" ? (
            <Line key={x.row.id} line={x.row} />
          ) : (
            <ActivityFold key={x.id} summary={<Summary rows={x.rows} />} openSummary={stretchSummary(x.rows.length, []).hide}>
              {x.rows.map((l) => (
                <Fragment key={l.id}>
                  <Line line={l} />
                </Fragment>
              ))}
            </ActivityFold>
          ),
        )}
      </ActivityTimeline>
    </Section>
  );
}

/** "Show 4 updates: total and jobs…", the kinds dropping below 640px. */
function Summary({ rows }: { rows: HistoryLine[] }) {
  const w = stretchSummary(rows.length, rows.map((r) => r.kind).filter(Boolean));
  return (
    <>
      {w.show}
      {w.kinds && <span className="max-sm:hidden">: {w.kinds}</span>}
    </>
  );
}

function Line({ line }: { line: HistoryLine }) {
  return (
    <ActivityItem marker="dot">
      <p className="text-meta text-muted-foreground [overflow-wrap:anywhere]">
        {line.text}
        <span aria-hidden="true">{" · "}</span>
        <ActivityTime at={line.createdAt} />
      </p>
    </ActivityItem>
  );
}
