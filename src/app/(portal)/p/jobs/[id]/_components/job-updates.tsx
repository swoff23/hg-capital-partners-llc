"use client";
import { Fragment, useState, type ReactNode } from "react";
import { ActivityDay, ActivityDivider, ActivityItem, ActivityTimeline } from "@/components/activity-timeline";
import { ActivityTime } from "@/components/activity-time";
import { CommentBody, CommentCard, DeliveryLine } from "@/components/comment-card";
import { FilesList, type FileLink } from "@/components/files-list";
import { MediaGrid } from "@/components/media-grid";
import { taskFileUrl } from "@/lib/attachments/media";
import { todayYmdEastern } from "@/lib/dates";
import type { BodyPart } from "@/lib/portal/access-code";
import type { JobDelivery, JobFile, JobUpdate } from "@/lib/portal/queries";
import { bodySegments } from "@/lib/tasks/body-links";
import { cn } from "@/lib/utils";

/**
 * The contractor's Updates on the shared timeline (docs/specs/activity-
 * comments.md 3.4 A): the rail with each person's avatar (the contractor's
 * square), comment cards, a quiet line with the new status's mark for a
 * status change or a file post, a heading per day, the New divider and the
 * delivery line under their own newest update. The same pieces as the staff
 * task page, so a fix lands for partners and contractors at once.
 *
 * A status change and the note written with it (a send back's reason, a Mark
 * done's note and photos) are one entry, paired by the note's
 * `statusEventId`, never by order (activity 2.2 d).
 *
 * The divider sits above the first entry after `newSince` written by someone
 * else. It keeps the first `newSince` the page gave this visit, so a refresh
 * (after sending, or coming back to the tab) doesn't move it; leaving and
 * coming back does. A removed comment's trace never counts as new.
 *
 * The data is already shaped for what a contractor may see (queries.ts):
 * names are first names, "You" for their own, lockbox codes in imported
 * comments are replaced, and no entry links to a staff page or another job:
 * bodies link https addresses only (body-links.ts, portal mode).
 */
export function JobUpdates({
  updates,
  now,
  newSince,
  delivery,
  viewerName,
}: {
  updates: JobUpdate[];
  /** The page's render time (ISO), so every time label matches the server's. */
  now: string;
  /** Where they last looked (ISO). */
  newSince: string;
  delivery: JobDelivery | null;
  /** The contractor's own name, for their avatar. */
  viewerName: string;
}) {
  // The first reading wins for the whole visit.
  const [since] = useState(() => Date.parse(newSince));
  if (updates.length === 0) return <p className="text-body text-fg-3">No updates yet.</p>;

  const entries = pairDecisions(updates);
  const firstNew = entries.find(({ update: u }) => !u.you && u.kind !== "removed" && u.createdAt.getTime() > since)?.update.id;
  const groups: { day: string; entries: Entry[] }[] = [];
  for (const e of entries) {
    const day = todayYmdEastern(e.update.createdAt);
    const last = groups.at(-1);
    if (last?.day === day) last.entries.push(e);
    else groups.push({ day, entries: [e] });
  }

  return (
    <ActivityTimeline now={now}>
      {groups.map((g) => (
        <Fragment key={`${g.day}:${g.entries[0].update.id}`}>
          <ActivityDay day={g.day} />
          {g.entries.map((e) => (
            <Fragment key={e.update.id}>
              {e.update.id === firstNew && <ActivityDivider unread>New</ActivityDivider>}
              <EntryView entry={e} delivery={delivery} viewerName={viewerName} />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </ActivityTimeline>
  );
}

/** One row of Updates: an update, or a status change with the note written with it. */
type Entry = { update: JobUpdate; note: JobUpdate | null };

/**
 * Each note written with a status change joins that change's entry, when the
 * change is here too; a note whose change isn't (it never shows here) stays a
 * comment of its own. The entry sits where the change does.
 */
function pairDecisions(updates: readonly JobUpdate[]): Entry[] {
  const statuses = new Set(updates.filter((u) => u.kind === "status").map((u) => u.id));
  const notes = new Map<string, JobUpdate>();
  for (const u of updates) {
    if (u.kind === "comment" && u.statusEventId && statuses.has(u.statusEventId) && !notes.has(u.statusEventId)) notes.set(u.statusEventId, u);
  }
  const paired = new Set([...notes.values()].map((n) => n.id));
  return updates.filter((u) => !paired.has(u.id)).map((u) => ({ update: u, note: notes.get(u.id) ?? null }));
}

/** The strip: 48x36 thumbs in one line, then "+2" opening the viewer at that set (uploads 2.5, choice 3 A). */
function mediaOf(u: JobUpdate, inCard: boolean): ReactNode {
  return u.attachments.media.length > 0 ? <MediaGrid items={u.attachments.media} variant="strip" inCard={inCard} surface="portal" /> : null;
}

function filesOf(u: JobUpdate): ReactNode {
  return u.attachments.files.length > 0 ? <FilesList files={u.attachments.files.map(toFileLink)} /> : null;
}

function EntryView({ entry, delivery, viewerName }: { entry: Entry; delivery: JobDelivery | null; viewerName: string }) {
  const { update: u, note } = entry;
  const media = (inCard: boolean) => mediaOf(u, inCard);
  const files = filesOf(u);

  if (u.kind === "comment") {
    return (
      <CommentCard
        id={u.id}
        author={{ name: u.you ? viewerName : u.actorLabel, contractor: u.contractor, you: u.you }}
        at={u.createdAt}
        edited={u.edited}
        body={u.parts ? bodyOf(u.parts) : null}
        media={media(true)}
        files={files}
        footer={delivery?.eventId === u.id ? <DeliveryLine state={delivery.state} to={delivery.to} /> : undefined}
      />
    );
  }

  // A status change, a file post or the trace of a removed comment: one quiet line, then any files. A decision's
  // note sits under its line in a card with no header of its own, since the line names who and when.
  const delivered = delivery && (delivery.eventId === u.id || delivery.eventId === note?.id);
  return (
    <ActivityItem id={`update-${u.id}`} marker={u.statusTo ? { status: u.statusTo } : "dot"}>
      <p className="text-meta text-fg-3">
        <span className="font-medium text-fg-2">{u.actorLabel}</span> {u.body}
        <span aria-hidden="true">{" · "}</span>
        <ActivityTime at={u.createdAt} />
      </p>
      {u.attachments.media.length > 0 && <div className="mt-1.5">{media(false)}</div>}
      {files && <div className="mt-1.5">{files}</div>}
      {note && (
        // Anchored too, so a job email or the notice's "See the update" that opens at the note finds it.
        <div id={`update-${note.id}`} className="mt-1.5 scroll-mt-[calc(var(--app-bar-h)+1rem)] rounded-md border border-line bg-surface px-3 py-2.5">
          {note.parts && <p className="whitespace-pre-wrap break-words text-body text-fg-1">{bodyOf(note.parts)}</p>}
          {note.attachments.media.length > 0 && <div className={cn(note.parts && "mt-2")}>{mediaOf(note, true)}</div>}
          {note.attachments.files.length > 0 && <div className="mt-2">{filesOf(note)}</div>}
        </div>
      )}
      {delivered && <DeliveryLine state={delivery.state} to={delivery.to} className="mt-1" />}
    </ActivityItem>
  );
}

/** A document in an update, as FilesList draws it: the name, who added it is the card's header, so no byline. */
function toFileLink(f: JobFile): FileLink {
  return { id: f.id, kind: "FILE", filename: f.filename, href: taskFileUrl(f.id), size: f.size, internal: false, uploadedBy: f.uploadedBy, createdAt: f.createdAt };
}

/**
 * A comment's text: https addresses link out in a new tab and nothing else is
 * formatted (portal mode never links a task or names anyone). A hidden code
 * is a fixed "••••" in mono that reads "lockbox code hidden" to a screen
 * reader; the real code is in the Lockbox section for the contractor it is
 * assigned to.
 */
function bodyOf(parts: BodyPart[]): ReactNode {
  return parts.map((p, i) =>
    "masked" in p ? (
      <span key={i} className="font-mono text-code text-fg-2">
        {p.masked}
        <span className="sr-only"> (lockbox code hidden)</span>
      </span>
    ) : (
      <CommentBody key={i} segments={bodySegments(p.text, { mode: "portal" })} />
    ),
  );
}
