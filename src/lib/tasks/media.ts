import type { AttachmentKind, Prisma } from "@prisma/client";
import type { FileLink } from "@/components/files-list";
import type { MediaItem } from "@/components/lightbox";
import { taskFileUrl } from "@/lib/attachments/media";

/**
 * A task's photos, videos and files as the task page shows them
 * (docs/specs/uploads-photos.md 2.4, 2.5 and 2.7): what to select, how each
 * row becomes a grid tile or a file row, the order of the grid, the "At
 * finish" set, and which photos the Review card holds. The task page, the
 * contractor's job page (lib/portal/queries.ts) and the Review card read the
 * same rules from here. Pure; see media.test.ts.
 *
 * Contract (build plan 1.5): the names and signatures are final, and UP1
 * fills in the rules. Until then the grid keeps today's order (oldest
 * first, as the query reads them), there's no "At finish" set, and the
 * Review card counts every photo and video the contractor added, as before.
 */

/** The attachments a task page selects: posted and drafted, never removed, oldest first. */
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
 * The grid's order. The uploads spec's is newest first with the `atFinish`
 * set leading (2.5, G1D-012); until UP1 builds it, oldest first, as today,
 * keeping the order given for items added in the same instant.
 */
export function orderMedia<T extends MediaOrderItem>(items: readonly T[], options: { atFinish?: readonly string[] } = {}): T[] {
  void options;
  return [...items].sort((a, b) => at(a.createdAt) - at(b.createdAt));
}

/**
 * The photos and videos sent with the latest Mark done (the "At finish"
 * set, uploads 2.5 and 2.8), among `rows`, from the task's events. None
 * until UP1 builds the rule.
 */
export function finishPhotoIds(rows: readonly (MediaOrderItem & { eventId: string | null })[], events: readonly MediaEvent[]): string[] {
  void rows;
  void events;
  return [];
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
 * first. Until UP1 builds the visit rule, every photo and video that
 * contractor added, oldest first, so the banner's count reads as before.
 * None when a staff member marked it done (`contactId` null).
 */
export function reviewPhotos<T extends MediaOrderItem & { kind: AttachmentKind; uploadedByContactId: string | null }>(
  rows: readonly T[],
  { contactId, events }: { contactId: string | null; events?: readonly MediaEvent[] },
): T[] {
  void events;
  if (!contactId) return [];
  return orderMedia(rows.filter((a) => isMediaRow(a) && a.uploadedByContactId === contactId));
}
