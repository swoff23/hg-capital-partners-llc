"use client";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityDivider, ActivityFold, ActivityItem, ActivityTimeline } from "@/components/activity-timeline";
import { ActivityTime } from "@/components/activity-time";
import { CommentBody, CommentCard } from "@/components/comment-card";
import { FilesList, type FileLink } from "@/components/files-list";
import { MediaGrid } from "@/components/media-grid";
import { taskFileUrl } from "@/lib/attachments/media";
import type { BodyPart } from "@/lib/portal/access-code";
import type { JobFile, JobUpdate } from "@/lib/portal/queries";
import { collapseStretches, linkedUpdateId, stretchSummary } from "@/lib/tasks/activity";
import { bodySegments } from "@/lib/tasks/body-links";
import { cn } from "@/lib/utils";

/**
 * The contractor's Updates on the shared timeline (docs/specs/activity-
 * comments.md 3.4 A): the rail with each person's avatar (the contractor's
 * square), comment cards, a quiet line with the new status's mark for a
 * status change or a file post, and the New divider. No line on who got an
 * email (Connor, Nov 22: it added nothing). No day headings: each time slot carries its day.
 * Between two comments, a stretch of 4 or more status lines and file posts
 * keeps its newest 2 in view and collapses the rest into "Show 4 updates:
 * status and files" (docs/specs/activity-collapse.md); a decision, Mark
 * done, Approve and their own Start never collapse, and neither does anything from the New divider on. The same pieces as the staff
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
  viewerName,
}: {
  updates: JobUpdate[];
  /** The page's render time (ISO), so every time label matches the server's. */
  now: string;
  /** Where they last looked (ISO). */
  newSince: string;
  /** The contractor's own name, for their avatar. */
  viewerName: string;
}) {
  // The first reading wins for the whole visit.
  const [since] = useState(() => Date.parse(newSince));
  const [anchor, setAnchor] = useState<string | null>(null);
  // A job email's `#update-<id>` into a collapsed stretch opens it, then takes the row into view.
  useEffect(() => {
    const read = () => setAnchor(linkedUpdateId(window.location.hash));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const entries = useMemo(() => pairDecisions(updates), [updates]);
  // The job's story never counts as new, as in the "2 new" counts (docs/specs/contractor-timeline.md, call 3).
  const firstNewIndex = entries.findIndex(({ update: u }) => !u.you && u.kind !== "removed" && u.kind !== "event" && u.createdAt.getTime() > since);
  const firstNew = firstNewIndex >= 0 ? entries[firstNewIndex].update.id : null;
  const items = useMemo(
    () => collapseStretches(entries, { isAnchor: staysInView, idOf: (e) => e.update.id, keepFrom: firstNewIndex }),
    [entries, firstNewIndex],
  );
  const holds = (e: Entry, id: string) => e.update.id === id || e.note?.id === id;
  useEffect(() => {
    if (anchor && items.some((x) => x.type === "collapsed" && x.rows.some((e) => holds(e, anchor)))) {
      document.getElementById(`update-${anchor}`)?.scrollIntoView({ block: "start" });
    }
  }, [anchor, items]);

  // No empty line: the composer under it is the next step (Connor, Nov 21).
  if (updates.length === 0) return null;

  return (
    <ActivityTimeline now={now}>
      {items.map((x) => {
        if (x.type === "row") {
          return (
            <Fragment key={x.row.update.id}>
              {x.row.update.id === firstNew && <ActivityDivider unread>New</ActivityDivider>}
              <EntryView entry={x.row} viewerName={viewerName} />
            </Fragment>
          );
        }
        const open = anchor !== null && x.rows.some((e) => holds(e, anchor));
        const words = stretchSummary(x.rows.length, x.rows.map(kindOf));
        return (
          <ActivityFold
            key={`${x.id}:${open ? "open" : "closed"}`}
            defaultOpen={open}
            summary={
              <>
                {words.show}
                {words.kinds && <span className="max-sm:hidden">: {words.kinds}</span>}
              </>
            }
            openSummary={words.hide}
          >
            {x.rows.map((e) => (
              <EntryView key={e.update.id} entry={e} viewerName={viewerName} />
            ))}
          </ActivityFold>
        );
      })}
    </ActivityTimeline>
  );
}

/**
 * Whether an entry stays in view and ends a stretch, by the task page's rule (activity-collapse 3.1, activity.ts
 * anchorsStretch; Connor, Nov 22): a comment or its trace, a decision with its note, Sent for review, Approve and
 * Sent back, the contractor's Start, and the job being added (`stays`, set by queries.ts). Their scheduling, a
 * status shuffle, a checklist tick or a date move folds in a run of 4 or more.
 */
function staysInView({ update: u, note }: Entry): boolean {
  if (u.kind === "comment" || u.kind === "removed" || note) return true;
  return u.stays;
}

/** A collapsed line's word for an entry. */
const kindOf = ({ update: u }: Entry) => (u.kind === "attachment" ? "files" : u.kind === "event" ? (u.change ?? "updates") : "status");

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

function EntryView({ entry, viewerName }: { entry: Entry; viewerName: string }) {
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
      />
    );
  }

  // A status change, a file post, a line of the job's story or the trace of a removed comment: one quiet line, then any files. A decision's
  // note sits under its line in a card with no header of its own, since the line names who and when.
  return (
    <ActivityItem id={`update-${u.id}`} marker={u.statusTo ? { status: u.statusTo } : "dot"}>
      <p className="text-meta text-muted-foreground">
        {/* A line of the job's story is a whole sentence ("A resident sent this request"); the rest lead with who. */}
        {u.kind === "event" ? u.body : `${u.actorLabel} ${u.body}`}
        <span aria-hidden="true">{" · "}</span>
        <ActivityTime at={u.createdAt} />
      </p>
      {u.attachments.media.length > 0 && <div className="mt-1.5">{media(false)}</div>}
      {files && <div className="mt-1.5">{files}</div>}
      {note && (
        // Anchored too, so a job email or the notice's "See the update" that opens at the note finds it.
        <div id={`update-${note.id}`} className="mt-1.5 scroll-mt-[calc(var(--app-bar-h)+1rem)] rounded-md border border-border bg-background px-3 py-2.5">
          {note.parts && <p className="whitespace-pre-wrap break-words text-body text-foreground">{bodyOf(note.parts)}</p>}
          {note.attachments.media.length > 0 && <div className={cn(note.parts && "mt-2")}>{mediaOf(note, true)}</div>}
          {note.attachments.files.length > 0 && <div className="mt-2">{filesOf(note)}</div>}
        </div>
      )}
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
