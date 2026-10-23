import "server-only";
import { Prisma, type AttachmentKind, type TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { todayYmdEastern, toYmd, type Ymd } from "@/lib/dates";
import { ACTIVE_STATUSES, CLOSED_STATUSES, excludeTemplateTasks, isActiveStatus } from "@/lib/task-scope";
import { targetDate } from "@/lib/tasks/rules";
import { readLockboxCode } from "./access-code";
import { PORTAL_STATUS_UPDATES, addedText, firstName, portalActorLabel, statusUpdateText, type JobCard, type JobsTab } from "./job-view";
import type { PortalPrincipal } from "./session";

/**
 * What a signed-in contractor can read (docs/asana-migration-plan.md §5.1).
 * Every query names its fields; nothing here returns a whole row, a
 * TaskEvent's `data`, or anything from a job they can't open. Access is an
 * unrevoked TaskAccess row for this contact; the principal itself already
 * proves a live session, an active login and an active contact
 * (session.ts). Writes are in jobs.ts.
 */

/**
 * Finished jobs show from here on (D18: past jobs, read-only, starting from
 * cutover). Midnight Eastern on Tue Oct 27, 2026, the day the production load
 * lands and work moves into the app; anything closed earlier is Asana history.
 */
export const PORTAL_HISTORY_FROM = new Date("2026-10-27T04:00:00Z");

/** The kinds of file a contractor sees: never a LINK. */
const PORTAL_FILE_KINDS = ["IMAGE", "VIDEO", "FILE"] as const satisfies readonly AttachmentKind[];

/**
 * The Updates allowlist, in SQL, for one contractor (§5.1): Shared comments
 * and file posts, plus the status changes in PORTAL_STATUS_UPDATES. Never due
 * dates, assignment, access, property, conflicts, internal notes or anything
 * system-only. A file post counts only while one of its files is still there
 * to show.
 *
 * Whose activity: staff and the system (no contact on the row), their own,
 * and history imported from Asana (D17: they could already see it there).
 * Never another contractor's, such as the previous assignee or someone else
 * shared on the job ("other contractors are never shown"); visibleFile is the
 * same rule for files. Used by both the job page and the "2 new" counts, so
 * they always agree.
 */
const portalEvents = (contactId: string) => Prisma.sql`(
  e."visibility" = 'SHARED'
  AND e."deletedAt" IS NULL
  AND (e."actorContactId" IS NULL OR e."actorContactId" = ${contactId} OR e."source" = 'ASANA')
  AND (
    e."kind" = 'COMMENT'
    OR (e."kind" = 'STATUS' AND e."data"->>'to' IN (${Prisma.join([...PORTAL_STATUS_UPDATES])}))
    OR (e."kind" = 'ATTACHMENT' AND EXISTS (
      SELECT 1 FROM "TaskAttachment" t
      WHERE t."eventId" = e."id" AND t."visibility" = 'SHARED' AND t."deletedAt" IS NULL
        AND t."kind"::text IN (${Prisma.join([...PORTAL_FILE_KINDS])})
        AND (t."uploadedByContactId" IS NULL OR t."uploadedByContactId" = ${contactId} OR t."asanaGid" IS NOT NULL)
    ))
  )
)`;

/**
 * A file this contractor may see: Shared, not removed, with bytes in our
 * store (attachments/access.ts contractorMaySee), and not another
 * contractor's upload unless it was imported (see portalEvents).
 */
const visibleFile = (contactId: string, kinds: readonly AttachmentKind[]) =>
  ({
    visibility: "SHARED",
    deletedAt: null,
    kind: { in: [...kinds] },
    OR: [{ uploadedByContactId: null }, { uploadedByContactId: contactId }, { asanaGid: { not: null } }],
  }) satisfies Prisma.TaskAttachmentWhereInput;

/** Jobs this contact can open: an unrevoked access row, and not a playbook template. */
const accessibleTo = (contactId: string) =>
  ({ ...excludeTemplateTasks, access: { some: { contactId, revokedAt: null } } }) satisfies Prisma.TaskWhereInput;

// ---------------------------------------------------------------------------
// My jobs
// ---------------------------------------------------------------------------

/** Open: every active job. Done: finished or canceled since PORTAL_HISTORY_FROM. */
export async function listMyJobs(p: PortalPrincipal, tab: JobsTab): Promise<JobCard[]> {
  const rows = await prisma.task.findMany({
    where: {
      ...accessibleTo(p.contactId),
      ...(tab === "open"
        ? { status: { in: [...ACTIVE_STATUSES] } }
        : { status: { in: [...CLOSED_STATUSES] }, completedAt: { gte: PORTAL_HISTORY_FROM } }),
    },
    select: {
      id: true,
      title: true,
      status: true,
      unitLabel: true,
      dueDate: true,
      scheduledFor: true,
      completedAt: true,
      property: { select: { address: true } },
    },
    // A long history keeps its most recent 500.
    ...(tab === "done" ? { orderBy: { completedAt: "desc" as const } } : {}),
    take: 500,
  });
  const counts = await newUpdateCounts(
    p.contactId,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    address: r.property?.address ?? null,
    unitLabel: r.unitLabel,
    target: toYmd(targetDate(r)),
    finishedOn: tab === "done" && r.completedAt ? todayYmdEastern(r.completedAt) : null,
    newCount: counts.get(r.id) ?? 0,
  }));
}

/**
 * Updates from anyone else since this contact last opened each job. Before
 * the first open, counting starts when they got access, so a job assigned
 * with imported history doesn't arrive as "14 new".
 */
async function newUpdateCounts(contactId: string, taskIds: string[]): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ taskId: string; n: number }[]>`
    SELECT e."taskId", count(*)::int AS n
    FROM "TaskEvent" e
    JOIN "TaskAccess" a ON a."taskId" = e."taskId" AND a."contactId" = ${contactId} AND a."revokedAt" IS NULL
    LEFT JOIN "TaskReadState" r ON r."taskId" = e."taskId" AND r."contactId" = ${contactId}
    WHERE e."taskId" IN (${Prisma.join(taskIds)})
      AND ${portalEvents(contactId)}
      AND e."actorContactId" IS DISTINCT FROM ${contactId}
      AND e."createdAt" > COALESCE(r."lastSeenAt", a."createdAt")
    GROUP BY e."taskId"`;
  return new Map(rows.map((r) => [r.taskId, r.n]));
}

// ---------------------------------------------------------------------------
// Job page
// ---------------------------------------------------------------------------

/** A photo or video, shaped for MediaGrid and Lightbox (components/lightbox.tsx MediaItem). */
export interface JobMedia {
  id: string;
  kind: "IMAGE" | "VIDEO";
  filename: string;
  hasThumb: boolean;
  hasPoster: boolean;
  durationSec: number | null;
  uploadedBy: string | null;
  createdAt: Date;
}

export interface JobFile {
  id: string;
  filename: string;
}

/** One line in Updates (§5.1): never the event's raw data. */
export interface JobUpdate {
  id: string;
  kind: "comment" | "status" | "attachment";
  /** "You" for the contractor's own, otherwise a first name ("Connor"). */
  actorLabel: string;
  /** The comment, or what happened for a status change or file post ("started the job"). */
  body: string | null;
  createdAt: Date;
  attachments: { media: JobMedia[]; files: JobFile[] };
}

export interface JobDetail {
  id: string;
  title: string;
  status: TaskStatus;
  /** Always shown to the assigned contractor (D16). */
  notes: string | null;
  address: string | null;
  unitLabel: string | null;
  target: Ymd | null;
  checklist: { id: string; title: string; done: boolean }[];
  media: JobMedia[];
  updates: JobUpdate[];
  /** D21: only for the assigned contractor while the job is active, else null. */
  lockbox: string | null;
  /** First names of the partners a Mark done goes to, for the payoff line. */
  staffNames: string[];
}

const uploaderSelect = {
  uploadedByUserId: true,
  uploadedByContactId: true,
  uploadedByUser: { select: { name: true, email: true } },
  uploadedByContact: { select: { fullName: true } },
} satisfies Prisma.TaskAttachmentSelect;

const mediaSelect = {
  id: true,
  kind: true,
  filename: true,
  thumbPathname: true,
  posterPathname: true,
  durationSec: true,
  createdAt: true,
  ...uploaderSelect,
} satisfies Prisma.TaskAttachmentSelect;

type MediaRow = Prisma.TaskAttachmentGetPayload<{ select: typeof mediaSelect }>;

function toMedia(p: PortalPrincipal, a: MediaRow): JobMedia {
  return {
    id: a.id,
    kind: a.kind === "VIDEO" ? "VIDEO" : "IMAGE",
    filename: a.filename,
    hasThumb: !!a.thumbPathname,
    hasPoster: !!a.posterPathname,
    durationSec: a.durationSec,
    uploadedBy: portalActorLabel(p.contactId, {
      userId: a.uploadedByUserId,
      contactId: a.uploadedByContactId,
      label: a.uploadedByUser?.name || a.uploadedByUser?.email.split("@")[0] || a.uploadedByContact?.fullName || null,
    }),
    createdAt: a.createdAt,
  };
}

/** The job, or null when this contact can't open it (no access, revoked, or closed before PORTAL_HISTORY_FROM). */
export async function getJob(p: PortalPrincipal, taskId: string): Promise<JobDetail | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...accessibleTo(p.contactId) },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      unitLabel: true,
      dueDate: true,
      scheduledFor: true,
      completedAt: true,
      propertyId: true,
      assigneeContactId: true,
      property: { select: { address: true } },
      checklist: { select: { id: true, title: true, done: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!task) return null;
  const active = isActiveStatus(task.status);
  if (!active && (!task.completedAt || task.completedAt < PORTAL_HISTORY_FROM)) return null;

  const [media, updates, lockbox, staff] = await Promise.all([
    prisma.taskAttachment.findMany({
      where: { taskId, ...visibleFile(p.contactId, ["IMAGE", "VIDEO"]) },
      select: mediaSelect,
      orderBy: { createdAt: "asc" },
    }),
    jobUpdates(p, taskId),
    active && task.assigneeContactId === p.contactId ? readLockboxCode(prisma, task.propertyId, task.unitLabel) : null,
    prisma.user.findMany({ where: { passwordHash: { not: null } }, select: { name: true, email: true }, orderBy: { createdAt: "asc" } }),
  ]);

  return {
    id: task.id,
    title: task.title,
    status: task.status,
    notes: task.description,
    address: task.property?.address ?? null,
    unitLabel: task.unitLabel,
    target: toYmd(targetDate(task)),
    checklist: task.checklist,
    media: media.map((a) => toMedia(p, a)),
    updates,
    lockbox,
    staffNames: staff.map((u) => firstName(u.name || u.email.split("@")[0])),
  };
}

interface UpdateRow {
  id: string;
  kind: "COMMENT" | "ATTACHMENT" | "STATUS";
  actorLabel: string;
  actorUserId: string | null;
  actorContactId: string | null;
  body: string | null;
  createdAt: Date;
  statusFrom: string | null;
  statusTo: string | null;
}

/** The latest updates, oldest first, with the files posted in each. */
async function jobUpdates(p: PortalPrincipal, taskId: string): Promise<JobUpdate[]> {
  // Newest first, so a long history keeps its latest 500; then back to reading order.
  const latest = await prisma.$queryRaw<UpdateRow[]>`
    SELECT e."id", e."kind"::text AS "kind", e."actorLabel", e."actorUserId", e."actorContactId", e."body", e."createdAt",
           e."data"->>'from' AS "statusFrom", e."data"->>'to' AS "statusTo"
    FROM "TaskEvent" e
    WHERE e."taskId" = ${taskId} AND ${portalEvents(p.contactId)}
    ORDER BY e."createdAt" DESC, e."id" DESC
    LIMIT 500`;
  const rows = latest.reverse();
  if (rows.length === 0) return [];

  const files = await prisma.taskAttachment.findMany({
    where: { taskId, eventId: { in: rows.map((r) => r.id) }, ...visibleFile(p.contactId, PORTAL_FILE_KINDS) },
    select: { ...mediaSelect, eventId: true },
    orderBy: { createdAt: "asc" },
  });
  const byEvent = new Map<string, typeof files>();
  for (const f of files) {
    if (!f.eventId) continue;
    byEvent.set(f.eventId, [...(byEvent.get(f.eventId) ?? []), f]);
  }

  const out: JobUpdate[] = [];
  for (const r of rows) {
    const own = byEvent.get(r.id) ?? [];
    const attachments = {
      media: own.filter((f) => f.kind === "IMAGE" || f.kind === "VIDEO").map((f) => toMedia(p, f)),
      files: own.filter((f) => f.kind === "FILE").map((f) => ({ id: f.id, filename: f.filename })),
    };
    // A file post whose files were all removed has nothing left to show (portalEvents drops these too).
    if (r.kind === "ATTACHMENT" && own.length === 0) continue;
    out.push({
      id: r.id,
      kind: r.kind === "STATUS" ? "status" : r.kind === "ATTACHMENT" ? "attachment" : "comment",
      actorLabel: portalActorLabel(p.contactId, { userId: r.actorUserId, contactId: r.actorContactId, label: r.actorLabel }) ?? r.actorLabel,
      body:
        r.kind === "STATUS"
          ? statusUpdateText(r.statusFrom, r.statusTo)
          : r.kind === "ATTACHMENT"
            ? addedText(own.map((f) => f.kind))
            : r.body,
      createdAt: r.createdAt,
      attachments,
    });
  }
  return out;
}
