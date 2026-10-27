import type { TaskStatus } from "@prisma/client";
import type { FileLink } from "@/components/files-list";
import type { MediaItem } from "@/components/media-grid";
import type { Ymd } from "@/lib/dates";
import { firstName } from "@/lib/names";
import {
  buildActivity,
  easternDay,
  entryIsFresh,
  isImported,
  type ActivityEntry,
  type ActivityEvent,
  type ActivityNames,
  type LineEntry,
} from "@/lib/tasks/activity";
import { bodySegments, type BodyLinkContext, type BodySegment } from "@/lib/tasks/body-links";
import { deliveryLine, type Delivery, type EmailState } from "@/lib/tasks/delivery";
import { fileLink, isMediaRow, mediaItem, type TaskMediaRow } from "@/lib/tasks/media";
import { contractorSeesRow } from "@/lib/tasks/rules";

/**
 * The task page's Activity, shaped for the browser (docs/specs/activity-
 * comments.md 2.2 and 2.6): lib/tasks/activity.ts decides what folds and
 * pairs; this adds what each row shows and what the viewer may do with it
 * (the segments of a body, its photos and files, whether it is theirs to
 * edit, the delivery line). Pure; see activity-rows.test.ts.
 */

/** A comment, as the card shows it. */
export interface CommentFields {
  id: string;
  author: string;
  isContractor: boolean;
  internal: boolean;
  /** Imported from an Asana subtask: the checklist item it was on. */
  onItem: string | null;
  /** The body as text and links; null when the comment is files alone. */
  segments: BodySegment[] | null;
  /** The plain text, for Copy text and the edit field. */
  text: string | null;
  media: MediaItem[];
  files: FileLink[];
  /** Files taken off after posting. */
  removedFiles: number;
  /** An ISO time it was edited, `true` for an imported comment Asana marked edited, null if never. */
  edited: string | true | null;
  /** The viewer wrote it in the app: they may edit and delete it. */
  mine: boolean;
  /** Made in the browser for this send: the pending card of the same message gives way to this one. */
  clientId: string | null;
  /** Under my own Shared comment: whether the email waits or went, for the edit field's one line. */
  email: EmailState | null;
  /** The contractor's first name the comment is addressed to, for that line. */
  to: string | null;
}

interface Base {
  id: string;
  /** Every event behind the row, so a link to any of them finds it. */
  ids: string[];
  /** The `clientId`s of the sends behind the row: a message in flight gives way to its row, and stays gone if the row is deleted. */
  clientIds: string[];
  /** The Buffalo day it happened, for the day headings. */
  day: Ymd;
  /** When it happened (ISO), for its time slot. */
  at: string;
  /** Anything in it is new to this viewer, whenever it was written (the New divider reads it against its baseline). */
  fresh: boolean;
  /** Brought in by the Asana import. */
  imported: boolean;
  /** The one line under it, when it is the newest entry the contractor can see (or your newest note). */
  delivery: Delivery | null;
}

export interface LineFields {
  text: string;
  href: string | null;
  /** A status change's new status, for its mark on the rail. */
  status: TaskStatus | null;
  /** Notes: the text before the save, for "View previous". */
  previous: string | null;
  /** Who did it, a first name: "Notes before Connor's edit". */
  by: string;
  viaAsana: boolean;
  media: MediaItem[];
  files: FileLink[];
}

export type ActivityRow =
  | (Base & { type: "comment"; comment: CommentFields })
  /** "Connor deleted a comment", staff only. */
  | (Base & { type: "deleted"; author: string })
  | (Base & { type: "line" } & LineFields)
  | (Base & { type: "run" } & LineFields & { members: (LineFields & { id: string; at: string })[] })
  | (Base & { type: "batch" } & LineFields)
  /** A status change and the note written with it: one entry, the note styled by its own visibility. */
  | (Base & { type: "decision"; status: TaskStatus | null; text: string; note: CommentFields | null })
  /** "Moved from Asana", once, between the imported history and the first entry written in HG. */
  | (Base & { type: "moved"; label: string });

export interface ShapeInput {
  events: readonly ActivityEvent[];
  /** The task's posted files, drafts included (they are left out by `eventId`). */
  attachments: readonly TaskMediaRow[];
  names: ActivityNames;
  today: Ymd;
  viewerId: string;
  /** What the viewer sees; names for the second line of the edit field. */
  contractor: {
    id: string;
    first: string;
    hasLogin: boolean;
    /** Their access to the job is unrevoked. */
    accessActive: boolean;
    /** When they last opened the job, from their own read state. */
    seenAt: Date | null;
  } | null;
  /** The email state of events this contractor was sent (OutboxItem.eventId), by event id. */
  emailStates: ReadonlyMap<string, EmailState>;
  /** The other partners who have opened the task, with when, for "Seen by Pieter". */
  partnersSeen: readonly { first: string; at: Date }[];
  links?: BodyLinkContext;
  /** The day the task stopped syncing with Asana, for "Moved from Asana · Oct 29". */
  movedOn?: Ymd | null;
}

const KIND_OF = (k: TaskMediaRow["kind"]) => (k === "IMAGE" ? "image" : k === "VIDEO" ? "video" : "file");

const byOf = (e: ActivityEvent) => firstName(e.actorLabel) || e.actorLabel;

/** The newest entry the contractor can see and staff wrote, and the event whose email says what happened to it. */
export function deliveryTarget<E extends ActivityEvent & { audienceContactId?: string | null }>(
  entries: readonly ActivityEntry<E>[],
  contactId: string,
): { index: number; eventId: string; at: Date } | null {
  const visible = (e: E) =>
    e.visibility === "SHARED" &&
    e.actorContactId === null &&
    (e.source === "APP" || e.source === undefined) &&
    contractorSeesRow({ imported: isImported(e), actorContactId: e.actorContactId, audienceContactId: e.audienceContactId ?? null }, contactId);
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    switch (entry.type) {
      case "comment":
        if (visible(entry.event)) return { index: i, eventId: entry.event.id, at: entry.event.createdAt };
        break;
      case "decision":
        // The status line carries the email; its note rides inside it.
        if (visible(entry.line.event)) return { index: i, eventId: entry.line.event.id, at: entry.line.event.createdAt };
        break;
      case "line":
        if ((entry.event.kind === "STATUS" || entry.event.kind === "ATTACHMENT") && visible(entry.event)) {
          return { index: i, eventId: entry.event.id, at: entry.event.createdAt };
        }
        break;
      case "batch": {
        const last = entry.events[entry.events.length - 1];
        if (entry.events.every(visible)) return { index: i, eventId: last.id, at: last.createdAt };
        break;
      }
      default:
        break;
    }
  }
  return null;
}

export function shapeActivity(input: ShapeInput): ActivityRow[] {
  const { names, today, viewerId } = input;
  const events = input.events as readonly (ActivityEvent & { audienceContactId?: string | null })[];

  const byEvent = new Map<string, TaskMediaRow[]>();
  for (const a of input.attachments) if (a.eventId) byEvent.set(a.eventId, [...(byEvent.get(a.eventId) ?? []), a]);
  const fileKinds = new Map([...byEvent].map(([id, rows]) => [id, rows.map((r) => KIND_OF(r.kind))] as const));
  // A file taken off after posting names the comment it was on (`data.eventId` on its "removed" line), so the card can say "1 file removed".
  const removedFrom = new Map<string, number>();
  for (const e of events) {
    const d = e.data && typeof e.data === "object" ? (e.data as { removed?: unknown; eventId?: unknown }) : {};
    if (e.kind === "ATTACHMENT" && !e.deletedAt && d.removed === true && typeof d.eventId === "string") {
      removedFrom.set(d.eventId, (removedFrom.get(d.eventId) ?? 0) + 1);
    }
  }
  const entries = buildActivity(events, names, today, { fileKinds });

  const filesOf = (ids: readonly string[]) => {
    const rows = ids.flatMap((id) => byEvent.get(id) ?? []);
    return {
      media: rows.filter(isMediaRow).map(mediaItem),
      files: rows.filter((r) => !isMediaRow(r)).map(fileLink).filter((f): f is FileLink => !!f),
    };
  };

  // Who the delivery line goes under, and what it says.
  const contractor = input.contractor;
  const deliveries = new Map<number, Delivery>();
  const target = contractor?.accessActive ? deliveryTarget(entries, contractor.id) : null;
  if (contractor && target) {
    const line = deliveryLine({
      to: contractor.first,
      hasLogin: contractor.hasLogin,
      email: input.emailStates.get(target.eventId) ?? null,
      seenAt: contractor.seenAt,
      eventAt: target.at,
    });
    if (line) deliveries.set(target.index, line);
  }
  // Under your own newest Internal note: which partners opened the task after it. Partners don't email each other.
  const note = (() => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.type === "comment" && e.event.actorUserId === viewerId && e.event.visibility === "INTERNAL" && e.event.source !== "ASANA") return { i, at: e.event.createdAt };
    }
    return null;
  })();
  if (note && !deliveries.has(note.i)) {
    const seen = input.partnersSeen.filter((p) => p.at.getTime() > note.at.getTime());
    if (seen.length) deliveries.set(note.i, { state: "seen", to: seen.map((p) => p.first) });
  }

  const comment = (e: ActivityEvent & { audienceContactId?: string | null }): CommentFields => {
    const d = (e.data && typeof e.data === "object" ? e.data : {}) as { fromChecklistItem?: { title?: string }; clientId?: unknown; edited?: unknown };
    const own = filesOf([e.id]);
    const text = e.body && e.body.trim() ? e.body : null;
    const mine = e.source === "APP" && e.actorUserId === viewerId;
    return {
      id: e.id,
      author: e.actorLabel,
      isContractor: !!e.actorContactId,
      internal: e.visibility === "INTERNAL",
      onItem: d.fromChecklistItem?.title ?? null,
      segments: text ? bodySegments(text, input.links) : null,
      text,
      media: own.media,
      files: own.files,
      removedFiles: removedFrom.get(e.id) ?? 0,
      edited: e.editedAt ? e.editedAt.toISOString() : d.edited === true ? true : null,
      mine,
      clientId: typeof d.clientId === "string" ? d.clientId : null,
      email: mine && e.visibility === "SHARED" && contractor && e.audienceContactId === contractor.id ? (input.emailStates.get(e.id) ?? null) : null,
      to: mine && e.visibility === "SHARED" && contractor && e.audienceContactId === contractor.id ? contractor.first : null,
    };
  };

  const lineFields = (l: LineEntry<ActivityEvent>): LineFields => {
    const own = filesOf(l.events.map((e) => e.id));
    return { text: l.text, href: l.href ?? null, status: l.status ?? null, previous: l.previousNotes ?? null, by: byOf(l.event), viaAsana: l.viaAsana === true, ...own };
  };

  const rows: ActivityRow[] = entries.map((entry, i): ActivityRow => {
    const base: Base = {
      id: entry.id,
      ids: entry.events.map((e) => e.id),
      clientIds: entry.events.flatMap((e) => {
        const id = e.data && typeof e.data === "object" ? (e.data as { clientId?: unknown }).clientId : null;
        return typeof id === "string" ? [id] : [];
      }),
      day: easternDay(entry.at),
      at: entry.at.toISOString(),
      fresh: entryIsFresh(entry, viewerId),
      imported: entry.imported,
      delivery: deliveries.get(i) ?? null,
    };
    switch (entry.type) {
      case "comment":
        return { ...base, type: "comment", comment: comment(entry.event) };
      case "deleted":
        return { ...base, type: "deleted", author: firstName(entry.event.actorLabel) || entry.event.actorLabel };
      case "line":
        return { ...base, type: "line", ...lineFields(entry) };
      case "run":
        return {
          ...base,
          type: "run",
          text: entry.text,
          href: null,
          status: entry.status ?? null,
          previous: entry.previousNotes ?? null,
          by: byOf(entry.events[0]),
          viaAsana: false,
          media: [],
          files: [],
          members: entry.lines.map((l) => ({ ...lineFields(l), id: l.id, at: l.at.toISOString() })),
        };
      case "batch": {
        const own = filesOf(entry.events.map((e) => e.id));
        return { ...base, type: "batch", text: entry.text, href: null, status: null, previous: null, by: byOf(entry.events[0]), viaAsana: false, ...own };
      }
      case "decision":
        return { ...base, type: "decision", status: entry.line.status ?? null, text: entry.line.text, note: entry.note ? comment(entry.note) : null };
    }
  });

  // "Moved from Asana": once, between the imported history and the first entry written in HG.
  const firstImported = rows.findIndex((r) => r.imported);
  const firstHg = firstImported < 0 ? -1 : rows.findIndex((r, i) => i > firstImported && !r.imported);
  if (firstHg > 0) {
    const next = rows[firstHg];
    const label = input.movedOn ? `Moved from Asana · ${movedLabel(input.movedOn, today)}` : "Moved from Asana";
    rows.splice(firstHg, 0, { id: `moved-${next.id}`, ids: [], clientIds: [], day: next.day, at: next.at, fresh: false, imported: false, delivery: null, type: "moved", label });
  }
  return rows;
}

/** "Oct 29", with the year when it isn't this one. */
function movedLabel(day: Ymd, today: Ymd): string {
  const [y, m, d] = day.split("-").map(Number);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}
