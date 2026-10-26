"use client";
import { Fragment, useState } from "react";
import { Lock } from "lucide-react";
import { ActivityDay, ActivityItem, ActivityTimeline } from "@/components/activity-timeline";
import { Avatar } from "@/components/avatar";
import { FilesList, type FileLink } from "@/components/files-list";
import { MediaGrid, type MediaItem } from "@/components/media-grid";
import { TextLink } from "@/components/ui";
import { groupByDay, splitEarlier } from "@/lib/tasks/activity";
import { cn } from "@/lib/utils";

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

/**
 * Activity, oldest first: comments as cards, everything else as one muted
 * line, a heading per day. The latest 15 show; earlier ones fold behind
 * "Show N earlier updates". A shared comment is a flat --surface card on a
 * hairline edge; an internal one is a --fill-1 card, and its Lock says so,
 * so it never reads as Review's amber (docs/brand-guidelines.md, section 9).
 */
export function TaskActivity({ rows, dayLabels }: { rows: ActivityRow[]; dayLabels: Record<string, string> }) {
  const [all, setAll] = useState(false);
  const { earlier, latest } = splitEarlier(rows, SHOWN);
  const visible = all ? rows : latest;

  if (rows.length === 0) return <p className="text-body text-fg-3">No activity yet.</p>;

  return (
    <ActivityTimeline className="space-y-3">
      {!all && earlier.length > 0 && (
        <li>
          <button
            type="button"
            onClick={() => setAll(true)}
            className="rounded-sm text-meta font-medium text-fg-1 underline-offset-3 hover:underline pointer-coarse:min-h-11"
          >
            Show {earlier.length} earlier {earlier.length === 1 ? "update" : "updates"}
          </button>
        </li>
      )}
      {groupByDay(visible, (r) => r.day).map((g) => (
        <Fragment key={`${g.day}:${g.entries[0].id}`}>
          <ActivityDay>{dayLabels[g.day] ?? g.day}</ActivityDay>
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
      <ActivityItem marker="primary" markerClassName="top-4.5">
        <div className={cn("rounded-md border px-3 py-2.5", row.internal ? "border-transparent bg-fill-1" : "border-line bg-surface")}>
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={row.author} size={20} outline={row.isContractor} />
            <span className="min-w-0 truncate text-body font-medium text-fg-1">{row.author}</span>
            <span className="shrink-0 text-meta text-fg-3">{row.ago}</span>
            {row.internal && (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-meta font-medium text-fg-2">
                <Lock className="size-3.5" aria-hidden="true" />
                Internal
              </span>
            )}
          </div>
          {row.onItem && <p className="mt-1 truncate text-meta text-fg-3">On checklist item: {row.onItem}</p>}
          {row.body && <p className="mt-1 whitespace-pre-wrap break-words text-body text-fg-1">{row.body}</p>}
          {row.media.length > 0 && <MediaGrid items={row.media} className="mt-2" />}
          <FilesList files={row.files} onFill={row.internal} className="mt-2" />
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
    <ActivityItem>
      <p className="text-meta text-fg-3">
        {text}
        <span aria-hidden="true">{" · "}</span>
        <span className="whitespace-nowrap">{row.ago}</span>
      </p>
      {row.type === "line" && row.media.length > 0 && <MediaGrid items={row.media} className="mt-1.5" />}
      {row.type === "line" && <FilesList files={row.files} className="mt-1.5" />}
    </ActivityItem>
  );
}
