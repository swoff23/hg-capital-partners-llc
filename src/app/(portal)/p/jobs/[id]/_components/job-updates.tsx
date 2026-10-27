"use client";
import { Fragment, useState, type ReactNode } from "react";
import { ActivityDay, ActivityDivider, ActivityItem, ActivityTimeline } from "@/components/activity-timeline";
import { ActivityTime } from "@/components/activity-time";
import { CommentCard, DeliveryLine } from "@/components/comment-card";
import { FilesList, type FileLink } from "@/components/files-list";
import { MediaGrid } from "@/components/media-grid";
import { taskFileUrl } from "@/lib/attachments/media";
import { todayYmdEastern } from "@/lib/dates";
import type { BodyPart } from "@/lib/portal/access-code";
import type { JobDelivery, JobFile, JobUpdate } from "@/lib/portal/queries";

/**
 * The contractor's Updates on the shared timeline (docs/specs/activity-
 * comments.md 3.4 A): the rail with each person's avatar (the contractor's
 * square), comment cards, a quiet line with the new status's mark for a
 * status change or a file post, a heading per day, the New divider and the
 * delivery line under their own newest update. The same pieces as the staff
 * task page, so a fix lands for partners and contractors at once.
 *
 * The divider sits above the first entry after `newSince` written by someone
 * else. It keeps the first `newSince` the page gave this visit, so a refresh
 * (after sending, or coming back to the tab) doesn't move it; leaving and
 * coming back does. A removed comment's trace never counts as new.
 *
 * The data is already shaped for what a contractor may see (queries.ts):
 * names are first names, "You" for their own, lockbox codes in imported
 * comments are replaced, and no entry links to a staff page or another job.
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

  const firstNew = updates.find((u) => !u.you && u.kind !== "removed" && u.createdAt.getTime() > since)?.id;
  const groups: { day: string; entries: JobUpdate[] }[] = [];
  for (const u of updates) {
    const day = todayYmdEastern(u.createdAt);
    const last = groups.at(-1);
    if (last?.day === day) last.entries.push(u);
    else groups.push({ day, entries: [u] });
  }

  return (
    <ActivityTimeline now={now}>
      {groups.map((g) => (
        <Fragment key={`${g.day}:${g.entries[0].id}`}>
          <ActivityDay day={g.day} />
          {g.entries.map((u) => (
            <Fragment key={u.id}>
              {u.id === firstNew && <ActivityDivider unread>New</ActivityDivider>}
              <Entry update={u} delivery={delivery} viewerName={viewerName} />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </ActivityTimeline>
  );
}

function Entry({ update: u, delivery, viewerName }: { update: JobUpdate; delivery: JobDelivery | null; viewerName: string }) {
  // The strip: 48x36 thumbs in one line, then "+2" opening the viewer at that set (uploads 2.5, choice 3 A).
  const media = (inCard: boolean) =>
    u.attachments.media.length > 0 ? <MediaGrid items={u.attachments.media} variant="strip" inCard={inCard} surface="portal" /> : null;
  const files = u.attachments.files.length > 0 ? <FilesList files={u.attachments.files.map(toFileLink)} /> : null;

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

  // A status change, a file post or the trace of a removed comment: one quiet line, then any files.
  return (
    <ActivityItem id={`update-${u.id}`} marker={u.statusTo ? { status: u.statusTo } : "dot"}>
      <p className="text-meta text-fg-3">
        <span className="font-medium text-fg-2">{u.actorLabel}</span> {u.body}
        <span aria-hidden="true">{" · "}</span>
        <ActivityTime at={u.createdAt} />
      </p>
      {u.attachments.media.length > 0 && <div className="mt-1.5">{media(false)}</div>}
      {files && <div className="mt-1.5">{files}</div>}
      {delivery?.eventId === u.id && <DeliveryLine state={delivery.state} to={delivery.to} className="mt-1" />}
    </ActivityItem>
  );
}

/** A document in an update, as FilesList draws it: the name, who added it is the card's header, so no byline. */
function toFileLink(f: JobFile): FileLink {
  return { id: f.id, kind: "FILE", filename: f.filename, href: taskFileUrl(f.id), size: f.size, internal: false, uploadedBy: f.uploadedBy, createdAt: f.createdAt };
}

/**
 * A comment's text. Plain text goes to the card as a string, so the card
 * draws it as it draws every comment; one with a hidden code becomes pieces,
 * the code a fixed "••••" in mono that reads "lockbox code hidden" to a
 * screen reader. The real code is in the Lockbox section for the contractor
 * it is assigned to.
 */
function bodyOf(parts: BodyPart[]): ReactNode {
  if (parts.every((p) => "text" in p)) return parts.map((p) => ("text" in p ? p.text : "")).join("");
  return parts.map((p, i) =>
    "masked" in p ? (
      <span key={i} className="font-mono text-code text-fg-2">
        {p.masked}
        <span className="sr-only"> (lockbox code hidden)</span>
      </span>
    ) : (
      <Fragment key={i}>{p.text}</Fragment>
    ),
  );
}
