import type { AttachmentKind, Prisma } from "@prisma/client";
import type { FileLink } from "@/components/files-list";
import type { MediaItem } from "@/components/lightbox";
import { taskFileUrl, uploadCountPhrase } from "@/lib/attachments/media";

/**
 * A task's photos, videos and files as the task page shows them
 * (docs/specs/uploads-photos.md 2.4, 2.5 and 2.7): what to select, how each
 * row becomes a grid tile or a file row, the order of the grid, the "At
 * finish" set, and which photos the Review card holds. The task page, the
 * contractor's job page (lib/portal/queries.ts) and the Review card read the
 * same rules from here. Pure; see media.test.ts.
 *
 * The rules (uploads 2.5 and 2.7): the grid is newest first with the "At
 * finish" set leading (G1D-012), the set being the photos sent with the
 * latest Mark done; the Review card holds this visit's photos by the
 * contractor who marked it done, that set first, and photos from earlier
 * visits don't count (G1A-007, G1D-034).
 */

/**
 * The attachments a task page selects: posted and drafted, never removed.
 * Read oldest first, so a comment's files keep the order they were picked in;
 * the grid orders its own (orderMedia).
 */
export const taskMediaInclude = {
  where: { deletedAt: null },
  orderBy: { createdAt: "asc" },
  select: {
    id: true,
    kind: true,
    filename: true,
    size: true,
    linkUrl: true,
    visibility: true,
    thumbPathname: true,
    posterPathname: true,
    durationSec: true,
    eventId: true,
    asanaGid: true,
    createdAt: true,
    uploadedByUserId: true,
    uploadedByContactId: true,
    uploadedByUser: { select: { name: true, email: true } },
    uploadedByContact: { select: { fullName: true } },
  },
} satisfies Prisma.Task$attachmentsArgs;

export type TaskMediaRow = Prisma.TaskAttachmentGetPayload<{ select: (typeof taskMediaInclude)["select"] }>;

/** What the grid's order reads from an item: a tile or a row. */
export type MediaOrderItem = { id: string; createdAt: Date | string };

/** What the finish set and "this visit" read from a task's events. */
export type MediaEvent = {
  id: string;
  kind: string;
  data: unknown;
  createdAt: Date;
  actorContactId: string | null;
};

/** The grid's tiles, the file rows, and which tiles are the "At finish" group. */
export type TaskMediaSet = {
  /** Posted photos and videos, in grid order. */
  media: MediaItem[];
  /** Posted documents and links. */
  files: FileLink[];
  /** Ids in `media` sent with the latest Mark done, which lead under "At finish". Empty with no Mark done set. */
  atFinish: string[];
};

/** Who added it: a staff member's name (their email when it has none), a contractor's full name, or null for an unmatched import. */
export function uploaderName(a: Pick<TaskMediaRow, "uploadedByUser" | "uploadedByContact">): string | null {
  if (a.uploadedByUser) return a.uploadedByUser.name || a.uploadedByUser.email;
  return a.uploadedByContact?.fullName ?? null;
}

/** A photo or a video: the grid's. Everything else is a file row. */
export function isMediaRow(a: { kind: AttachmentKind }): boolean {
  return a.kind === "IMAGE" || a.kind === "VIDEO";
}

/**
 * A staff upload still waiting in someone's composer: on no comment yet, not
 * imported, and Internal until Send. Only that person's composer shows it,
 * so a reload or another visit picks it back up instead of orphaning it.
 */
export function isDraftUpload(a: Pick<TaskMediaRow, "eventId" | "asanaGid" | "uploadedByUserId">): boolean {
  return a.eventId === null && a.asanaGid === null && a.uploadedByUserId !== null;
}

/** A photo or video row as a grid tile. */
export function mediaItem(a: TaskMediaRow): MediaItem {
  return {
    id: a.id,
    kind: a.kind === "VIDEO" ? "VIDEO" : "IMAGE",
    filename: a.filename,
    hasThumb: !!a.thumbPathname,
    hasPoster: !!a.posterPathname,
    durationSec: a.durationSec,
    uploadedBy: uploaderName(a),
    createdAt: a.createdAt,
    internal: a.visibility === "INTERNAL",
  };
}

/** A document or link row as a file row; null for a link with no URL to open. */
export function fileLink(a: TaskMediaRow): FileLink | null {
  const internal = a.visibility === "INTERNAL";
  const by = { uploadedBy: uploaderName(a), createdAt: a.createdAt };
  if (a.kind === "LINK") return a.linkUrl ? { id: a.id, kind: "LINK", filename: a.filename, href: a.linkUrl, size: null, internal, ...by } : null;
  return { id: a.id, kind: "FILE", filename: a.filename, href: taskFileUrl(a.id), size: a.size, internal, ...by };
}

const at = (d: Date | string) => (typeof d === "string" ? Date.parse(d) : d.getTime());

/**
 * The grid's order: newest first, with the `atFinish` set leading (the photos
 * sent with the latest Mark done, uploads 2.5), each run newest first. Items
 * added in the same instant keep the order given. Doesn't touch its input.
 */
export function orderMedia<T extends MediaOrderItem>(items: readonly T[], options: { atFinish?: readonly string[] } = {}): T[] {
  const finish = new Set(options.atFinish ?? []);
  return [...items].sort((a, b) => Number(finish.has(b.id)) - Number(finish.has(a.id)) || at(b.createdAt) - at(a.createdAt));
}

/** A Mark done is a comment and a move to Review written in one transaction; their times differ by milliseconds, so this is generous. */
export const MARK_DONE_WINDOW_MS = 30_000;

const toReview = (e: MediaEvent) => e.kind === "STATUS" && (e.data as { to?: string } | null)?.to === "REVIEW";

/** The latest move to Review by a contractor, and the comment written with it (the Mark done sheet's note and photos), if it had one. */
function latestMarkDone(events: readonly MediaEvent[]): { review: MediaEvent; comment: MediaEvent | null } | null {
  const review = events.filter((e) => toReview(e) && e.actorContactId !== null).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!review) return null;
  const comment =
    events
      .filter(
        (e) =>
          e.kind === "COMMENT" &&
          e.actorContactId === review.actorContactId &&
          e.createdAt.getTime() <= review.createdAt.getTime() &&
          review.createdAt.getTime() - e.createdAt.getTime() <= MARK_DONE_WINDOW_MS,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  return { review, comment };
}

/**
 * The photos and videos sent with the latest Mark done (the "At finish"
 * set, uploads 2.5 and 2.8), among `rows`, from the task's events: the ones
 * posted on the comment the contractor wrote as they tapped Mark done. Empty
 * with no Mark done, a Mark done with no photos, or a job a staff member
 * moved to Review.
 */
export function finishPhotoIds(rows: readonly (MediaOrderItem & { eventId: string | null })[], events: readonly MediaEvent[]): string[] {
  const done = latestMarkDone(events);
  if (!done?.comment) return [];
  return rows.filter((r) => r.eventId === done.comment!.id).map((r) => r.id);
}

/**
 * The task page's photos and files: drafts left out, photos and videos in
 * grid order with the "At finish" set, then documents and links.
 */
export function taskMedia(rows: readonly TaskMediaRow[], options: { events?: readonly MediaEvent[] } = {}): TaskMediaSet {
  const posted = rows.filter((a) => !isDraftUpload(a));
  const shown = posted.filter(isMediaRow);
  const atFinish = finishPhotoIds(shown, options.events ?? []);
  return {
    media: orderMedia(shown, { atFinish }).map(mediaItem),
    files: posted.filter((a) => !isMediaRow(a)).map(fileLink).filter((f): f is FileLink => f !== null),
    atFinish,
  };
}

/**
 * The photos and videos the Review card holds for the person who marked the
 * job done (uploads 2.7): this visit's, by that contractor, the Mark done set
 * first. A visit starts when the job last went to In progress before the
 * latest Mark done; with no such move (an older job) every one of theirs
 * counts. Photos from earlier visits don't. None when a staff member marked
 * it done (`contactId` null).
 */
export function reviewPhotos<T extends MediaOrderItem & { kind: AttachmentKind; uploadedByContactId: string | null; eventId?: string | null }>(
  rows: readonly T[],
  { contactId, events = [] }: { contactId: string | null; events?: readonly MediaEvent[] },
): T[] {
  if (!contactId) return [];
  const mine = rows.filter((a) => isMediaRow(a) && a.uploadedByContactId === contactId);
  const done = latestMarkDone(events);
  const before = done ? done.review.createdAt.getTime() : Infinity;
  const started = events
    .filter((e) => e.kind === "STATUS" && (e.data as { to?: string } | null)?.to === "IN_PROGRESS" && e.createdAt.getTime() < before)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const visit = started ? mine.filter((a) => at(a.createdAt) >= started.createdAt.getTime()) : mine;
  const finish = finishPhotoIds(
    visit.map((a) => ({ id: a.id, createdAt: a.createdAt, eventId: a.eventId ?? null })),
    events,
  );
  return orderMedia(visit, { atFinish: finish });
}

/** "3 photos and 1 video": what the Review card says it holds, videos named as videos (uploads 2.7). */
export function reviewPhotoSummary(rows: readonly { kind: AttachmentKind }[]): string {
  return uploadCountPhrase(rows.map((r) => (r.kind === "VIDEO" ? "video" : r.kind === "IMAGE" ? "image" : "file")));
}
