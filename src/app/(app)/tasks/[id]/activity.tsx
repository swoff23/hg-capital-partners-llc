"use client";
import { Fragment, useState } from "react";
import type { TaskStatus } from "@prisma/client";
import { ActivityDay, ActivityItem, ActivityTimeline } from "@/components/activity-timeline";
import { ActivityTime } from "@/components/activity-time";
import { CommentCard } from "@/components/comment-card";
import { FilesList, type FileLink } from "@/components/files-list";
import { MediaGrid, type MediaItem } from "@/components/media-grid";
import { TextLink } from "@/components/ui";
import { groupByDay, splitEarlier } from "@/lib/tasks/activity";

/** One timeline entry, shaped on the server (src/lib/tasks/activity.ts buildActivity). */
export type ActivityRow =
  | {
      type: "comment";
      id: string;
      /** The Buffalo day it happened, for the day headings. */
      day: string;
      /** When it happened (ISO), for its time slot. */
      at: string;
      author: string;
      isContractor: boolean;
      internal: boolean;
      /** Imported from an Asana subtask: the checklist item it was on. */
      onItem: string | null;
      body: string | null;
      media: MediaItem[];
      files: FileLink[];
    }
  | {
      type: "line";
      id: string;
      day: string;
      at: string;
      text: string;
      href: string | null;
      /** A status change's new status, for its mark on the rail (choice 3.1 B). */
      status: TaskStatus | null;
      media: MediaItem[];
      files: FileLink[];
    }
  | { type: "due-run"; id: string; day: string; at: string; text: string };

const SHOWN = 15;

/**
 * Activity, oldest first, on the shared timeline (components/activity-timeline.tsx):
 * comments as cards with the author's avatar on the rail, a status change
 * with its StatusMark, every other change as one muted line with a dot, and
 * a heading per day. The latest 15 show; earlier ones fold behind "Show N
 * earlier updates". A shared comment is a flat --surface card on a hairline
 * edge; an internal one is a --fill-1 card, and its Lock says so, so it
 * never reads as Review's amber (docs/brand-guidelines.md, section 9).
 */
export function TaskActivity({ rows, now }: { rows: ActivityRow[]; now: string }) {
  const [all, setAll] = useState(false);
  const { earlier, latest } = splitEarlier(rows, SHOWN);
  const visible = all ? rows : latest;

  if (rows.length === 0) return <p className="text-body text-fg-3">No activity yet.</p>;

  return (
    <ActivityTimeline now={now}>
      {!all && earlier.length > 0 && (
        <ActivityItem marker="none" className="print:hidden">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="rounded-sm text-meta font-medium text-fg-1 underline-offset-3 hover:underline pointer-coarse:min-h-11"
          >
            Show {earlier.length} earlier {earlier.length === 1 ? "update" : "updates"}
          </button>
        </ActivityItem>
      )}
      {groupByDay(visible, (r) => r.day).map((g) => (
        <Fragment key={`${g.day}:${g.entries[0].id}`}>
          <ActivityDay day={g.day} />
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
      <CommentCard
        id={row.id}
        author={{ name: row.author, contractor: row.isContractor }}
        at={row.at}
        internal={row.internal}
        onItem={row.onItem}
        body={row.body}
        media={row.media.length > 0 ? <MediaGrid items={row.media} /> : null}
        files={row.files.length > 0 ? <FilesList files={row.files} onFill={row.internal} /> : null}
      />
    );
  }
  const text =
    row.type === "line" && row.href ? (
      <TextLink href={row.href}>{row.text}</TextLink>
    ) : (
      row.text
    );
  return (
    <ActivityItem id={`update-${row.id}`} marker={row.type === "line" && row.status ? { status: row.status } : "dot"}>
      <p className="text-meta text-fg-3">
        {text}
        <span aria-hidden="true">{" · "}</span>
        <ActivityTime at={row.at} />
      </p>
      {row.type === "line" && row.media.length > 0 && <MediaGrid items={row.media} className="mt-1.5" />}
      {row.type === "line" && <FilesList files={row.files} className="mt-1.5" />}
    </ActivityItem>
  );
}
