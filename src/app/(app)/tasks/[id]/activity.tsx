"use client";
import { Fragment, useState } from "react";
import { Lock } from "lucide-react";
import { ActivityDay, ActivityItem, ActivityTimeline } from "@/components/activity-timeline";
import { Avatar } from "@/components/avatar";
import { MediaGrid, type MediaItem } from "@/components/media-grid";
import { TextLink } from "@/components/ui";
import { groupByDay, splitEarlier } from "@/lib/tasks/activity";
import { cn } from "@/lib/utils";
import { FilesList, type FileLink } from "./files-list";

/** One timeline entry, shaped on the server (src/lib/tasks/activity.ts buildActivity). */
export type ActivityRow =
  | {
      type: "comment";
      id: string;
      /** The Buffalo day it happened, for the day headings. */
      day: string;
      ago: string;
      author: string;
      isContractor: boolean;
      internal: boolean;
      /** Imported from an Asana subtask: the checklist item it was on. */
      onItem: string | null;
      body: string | null;
      media: MediaItem[];
      files: FileLink[];
    }
  | { type: "line"; id: string; day: string; ago: string; text: string; href: string | null; media: MediaItem[]; files: FileLink[] }
  | { type: "due-run"; id: string; day: string; ago: string; text: string };

const SHOWN = 15;
const DOT = "bg-zinc-300 dark:bg-zinc-600";
const RING = "border-zinc-300 dark:border-zinc-600";

/**
 * Activity, oldest first: comments as cards, everything else as one muted
 * line, a heading per day. The latest 15 show; earlier ones fold behind
 * "Show N earlier updates".
 */
export function TaskActivity({ rows, dayLabels }: { rows: ActivityRow[]; dayLabels: Record<string, string> }) {
  const [all, setAll] = useState(false);
  const { earlier, latest } = splitEarlier(rows, SHOWN);
  const visible = all ? rows : latest;

  if (rows.length === 0) return <p className="text-sm text-muted">No activity yet.</p>;

  return (
    // On the page background the hairline and dots need a step more contrast than inside a card.
    <ActivityTimeline className="space-y-3 border-zinc-300 dark:border-zinc-700">
      {!all && earlier.length > 0 && (
        <li>
          <button
            type="button"
            onClick={() => setAll(true)}
            className="rounded-md text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/30 pointer-coarse:min-h-11"
          >
            Show {earlier.length} earlier {earlier.length === 1 ? "update" : "updates"}
          </button>
        </li>
      )}
      {groupByDay(visible, (r) => r.day).map((g) => (
        <Fragment key={`${g.day}:${g.entries[0].id}`}>
          <ActivityDay markerClassName={RING}>{dayLabels[g.day] ?? g.day}</ActivityDay>
          {g.entries.map((r) => (
            <Row key={r.id} row={r} />
          ))}
        </Fragment>
      ))}
    </ActivityTimeline>
  );
}

function Row({ row }: { row: ActivityRow }) {
  if (row.type === "comment") {
    return (
      <ActivityItem marker="primary" markerClassName="top-[1.125rem]">
        <div
          className={cn(
            "rounded-lg border px-3 py-2.5",
            row.internal
              ? "border-amber-200 bg-amber-50 dark:border-amber-900/70 dark:bg-amber-950/40"
              : "border-border bg-surface shadow-sm",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={row.author} size={20} outline={row.isContractor} />
            <span className="min-w-0 truncate text-sm font-medium">{row.author}</span>
            <span className="shrink-0 text-xs text-muted">{row.ago}</span>
            {row.internal && (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                <Lock className="h-3 w-3" aria-hidden="true" />
                Internal
              </span>
            )}
          </div>
          {row.onItem && <p className="mt-1 truncate text-xs text-muted">On checklist item: {row.onItem}</p>}
          {row.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{row.body}</p>}
          {row.media.length > 0 && <MediaGrid items={row.media} className="mt-2" />}
          <FilesList files={row.files} className="mt-2" />
        </div>
      </ActivityItem>
    );
  }
  const text =
    row.type === "line" && row.href ? (
      <TextLink href={row.href}>{row.text}</TextLink>
    ) : (
      row.text
    );
  return (
    <ActivityItem markerClassName={DOT}>
      <p className="text-xs text-muted">
        {text}
        <span aria-hidden="true">{" · "}</span>
        <span className="whitespace-nowrap">{row.ago}</span>
      </p>
      {row.type === "line" && row.media.length > 0 && <MediaGrid items={row.media} className="mt-1.5" />}
      {row.type === "line" && <FilesList files={row.files} className="mt-1.5" />}
    </ActivityItem>
  );
}
