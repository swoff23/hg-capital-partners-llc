import "server-only";
import { Prisma, type AttachmentKind, type TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { todayYmdEastern, toYmd, type Ymd } from "@/lib/dates";
import { ACTIVE_STATUSES, CLOSED_STATUSES, contractorCanOpen, isActiveStatus } from "@/lib/task-scope";
import { MARK_DONE_WINDOW_MS, finishPhotoIds, orderMedia } from "@/lib/tasks/media";
import { changeKind } from "@/lib/tasks/activity";
import { scheduledDay } from "@/lib/tasks/rules";
import { lockboxMasker, NO_ACCESS, readJobAccess, type BodyPart, type JobTenant, type LockboxAccess } from "./access-code";
import { storyEvents } from "./story-events";
import { NO_NOTICE, dateChange, dateChangeText, noticeCount, sendBackStands, type DateChange, type DateEvent, type JobNotice } from "./job-notice";
import { PORTAL_STATUS_UPDATES, addedText, firstName, portalActorLabel, statusUpdateText, storyLine, type JobCard, type JobsTab } from "./job-view";
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
 * Whose activity (tasks/rules.ts contractorSeesRow): their own; history
 * imported from Asana (D17: they could already see it there); and staff and
 * system rows addressed to them or to nobody in particular. Never another
 * contractor's, such as the previous assignee or someone else shared on the
 * job ("other contractors are never shown"), and never the staff side of that
 * conversation: a reply written while Zack had the job stays Zack's
 * (`audienceContactId`). visibleFile is the same rule for files. Used by both
 * the job page and the "2 new" counts, so they always agree.
 */
const portalEvents = (contactId: string) => Prisma.sql`(
  e."visibility" = 'SHARED'
  AND e."deletedAt" IS NULL
  AND (
    e."source" = 'ASANA'
    OR e."actorContactId" = ${contactId}
    OR (e."actorContactId" IS NULL AND (e."audienceContactId" IS NULL OR e."audienceContactId" = ${contactId}))
  )
  AND (
    e."kind" = 'COMMENT'
    OR (e."kind" = 'STATUS' AND e."data"->>'to' IN (${Prisma.join([...PORTAL_STATUS_UPDATES])}))
    OR (e."kind" = 'ATTACHMENT' AND EXISTS (
      SELECT 1 FROM "TaskAttachment" t
      WHERE t."eventId" = e."id" AND t."visibility" = 'SHARED' AND t."deletedAt" IS NULL
        AND t."kind"::text IN (${Prisma.join([...PORTAL_FILE_KINDS])})
        AND (
          t."asanaGid" IS NOT NULL
          OR t."uploadedByContactId" = ${contactId}
          OR (t."uploadedByContactId" IS NULL AND (t."audienceContactId" IS NULL OR t."audienceContactId" = ${contactId}))
        )
    ))
  )
)`;

/**
 * A comment with nothing left to show: no words, and no file this contractor may
 * see (staff took off every photo of a batch, a photo-only reply or a Mark done
 * note). The Updates skip it (jobUpdates) and so do the "2 new" counts, which
 * would otherwise count a card the page never draws. The file test is
 * portalEvents' own for a file post, written out again here so portalEvents
 * stays as it is (queries.test pins the two to the same lines).
 */
const emptyComment = (contactId: string) => Prisma.sql`(
  e."kind" = 'COMMENT'
  AND btrim(COALESCE(e."body", '')) = ''
  AND NOT EXISTS (
    SELECT 1 FROM "TaskAttachment" t
    WHERE t."eventId" = e."id" AND t."visibility" = 'SHARED' AND t."deletedAt" IS NULL
      AND t."kind"::text IN (${Prisma.join([...PORTAL_FILE_KINDS])})
      AND (
        t."asanaGid" IS NOT NULL
        OR t."uploadedByContactId" = ${contactId}
        OR (t."uploadedByContactId" IS NULL AND (t."audienceContactId" IS NULL OR t."audienceContactId" = ${contactId}))
      )
  )
)`;

/**
 * A file this contractor may see: Shared, not removed, with bytes in our
 * store (attachments/access.ts contractorMaySee), and by the same rule as
 * portalEvents: imported, their own, or a staff upload addressed to them or
 * to nobody in particular.
 */
const visibleFile = (contactId: string, kinds: readonly AttachmentKind[]) =>
  ({
    visibility: "SHARED",
    deletedAt: null,
    kind: { in: [...kinds] },
    OR: [
      { asanaGid: { not: null } },
      { uploadedByContactId: contactId },
      { uploadedByContactId: null, OR: [{ audienceContactId: null }, { audienceContactId: contactId }] },
    ],
  }) satisfies Prisma.TaskAttachmentWhereInput;

/**
 * Jobs this contact can open: an unrevoked access row, and never a playbook template or a draft Claude saved that no
 * partner has added (task-scope.ts contractorCanOpen). My jobs and the job page both start here, and every other read
 * below is of a job one of them returned, so a draft stays out of the portal even if an access row somehow exists.
 */
const accessibleTo = contractorCanOpen;

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
  const ids = rows.map((r) => r.id);
  const [counts, notices] = await Promise.all([
    newUpdateCounts(p.contactId, ids),
    noticeCounts(
      p.contactId,
      rows.map((r) => ({ id: r.id, status: r.status, due: toYmd(r.dueDate), scheduled: toYmd(r.scheduledFor) })),
    ),
  ]);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    address: r.property?.address ?? null,
    unitLabel: r.unitLabel,
    due: toYmd(r.dueDate),
    scheduled: toYmd(scheduledDay(r)),
    finishedOn: tab === "done" && r.completedAt ? todayYmdEastern(r.completedAt) : null,
    newCount: (counts.get(r.id) ?? 0) + (notices.get(r.id) ?? 0),
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
      AND NOT ${emptyComment(contactId)}
      AND e."actorContactId" IS DISTINCT FROM ${contactId}
      AND e."createdAt" > COALESCE(r."lastSeenAt", a."createdAt")
    GROUP BY e."taskId"`;
  return new Map(rows.map((r) => [r.taskId, r.n]));
}

/** Parameters for a Date against the timestamp-without-time-zone columns, which hold UTC (as core.ts and outbox.ts convert them). */
const utc = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

/**
 * What the job page's notice would show, counted for My jobs: one for a date
 * that moved to a different day, one for updated notes, since the contractor
 * last opened each job (the baseline is newUpdateCounts', so the dot and the
 * notice agree). The Updates rule above never sees these events, which are
 * internal, so they get their own query, and only their kind, day and who
 * are read: never a NOTES event's text.
 */
async function noticeCounts(
  contactId: string,
  jobs: { id: string; status: TaskStatus; due: Ymd | null; scheduled: Ymd | null }[],
): Promise<Map<string, number>> {
  if (jobs.length === 0) return new Map();
  const rows = await prisma.$queryRaw<(NoticeEventRow & { taskId: string })[]>`
    SELECT e."taskId", e."kind"::text AS "kind", e."actorUserId", e."actorLabel",
           CASE WHEN e."kind" <> 'NOTES' THEN e."data"->>'from' END AS "from",
           CASE WHEN e."kind" <> 'NOTES' THEN e."data"->>'to' END AS "to"
    FROM "TaskEvent" e
    JOIN "TaskAccess" a ON a."taskId" = e."taskId" AND a."contactId" = ${contactId} AND a."revokedAt" IS NULL
    LEFT JOIN "TaskReadState" r ON r."taskId" = e."taskId" AND r."contactId" = ${contactId}
    WHERE e."taskId" IN (${Prisma.join(jobs.map((j) => j.id))})
      AND e."kind" IN ('DUE', 'SCHEDULED', 'STATUS', 'NOTES')
      AND e."deletedAt" IS NULL
      AND e."createdAt" > COALESCE(r."lastSeenAt", a."createdAt")
    ORDER BY e."createdAt" ASC, e."id" ASC`;
  const byTask = new Map<string, NoticeEventRow[]>();
  for (const row of rows) byTask.set(row.taskId, [...(byTask.get(row.taskId) ?? []), row]);
  const out = new Map<string, number>();
  for (const j of jobs) {
    const events = byTask.get(j.id);
    if (!events) continue;
    const n = noticeCount(
      dateChange(j, dateEvents(events)),
      events.some((e) => e.kind === "NOTES"),
    );
    if (n > 0) out.set(j.id, n);
  }
  return out;
}

/** One DUE, SCHEDULED, STATUS or NOTES event, as much of it as the notice may read. */
interface NoticeEventRow {
  kind: string;
  actorUserId: string | null;
  actorLabel: string;
  from: string | null;
  to: string | null;
}

/** A partner's first name from the event's actor; null for a contractor, the system or the importer. */
const partner = (e: Pick<NoticeEventRow, "actorUserId" | "actorLabel">) => (e.actorUserId ? firstName(e.actorLabel) : null);

function dateEvents(rows: readonly NoticeEventRow[]): DateEvent[] {
  return rows
    .filter((e) => e.kind === "DUE" || e.kind === "SCHEDULED" || e.kind === "STATUS")
    .map((e) => ({ kind: e.kind as DateEvent["kind"], from: e.from, to: e.to, by: partner(e) }));
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

/** A document on the job, shaped for FilesList (components/files-list.tsx FileLink). */
export interface JobFile {
  id: string;
  filename: string;
  size: number | null;
  uploadedBy: string | null;
  createdAt: Date;
}

/**
 * One entry in Updates (§5.1): never the event's raw data. The page draws it
 * on the shared timeline (components/activity-timeline.tsx), so it carries what
 * the rail and the card need: who, whether they are a contractor, whether it
 * is the viewer's own, the status a change moved to, and the edited mark.
 */
export interface JobUpdate {
  id: string;
  /**
   * "removed" is the trace of a comment HG took back after the contractor could have seen it: who and when, never its
   * text. "event" is a line of the job's story (docs/specs/contractor-timeline.md), whose whole sentence is `body`.
   */
  kind: "comment" | "status" | "attachment" | "removed" | "event";
  /** An event's word for a folded run ("due date", "checklist": activity.ts changeKind); null for the rest. */
  change: string | null;
  /**
   * A line that never folds into "Show 4 updates", by the task page's own rule (activity.ts anchorsStretch): a
   * decision (Sent for review, Approve, Sent back), the contractor's Start, and the job being added. Comments and
   * their traces stay by kind. Everything else folds in a long enough run (Connor, Nov 22).
   */
  stays: boolean;
  /** "You" for the contractor's own, otherwise a first name ("Connor"). */
  actorLabel: string;
  /** The author is a contractor (the square avatar and "contractor" for screen readers). */
  contractor: boolean;
  /** The viewer wrote it. */
  you: boolean;
  /** What happened for a status change or file post ("started the job"), an event's whole line; null for a comment, whose text is `parts`. */
  body: string | null;
  /** A comment's text, with this property's lockbox codes in imported comments already replaced. */
  parts: BodyPart[] | null;
  createdAt: Date;
  /** When it was edited; `true` for an imported comment Asana marked edited, with no time. */
  edited: Date | true | null;
  /** The status a status change moved to, for its mark on the rail. */
  statusTo: TaskStatus | null;
  attachments: { media: JobMedia[]; files: JobFile[] };
  /** The id the browser made for this send, on the viewer's own rows only: a pending message already here is dropped. */
  clientId: string | null;
  /**
   * A comment written with a status change (a send back's note, a Mark done's
   * note and photos): that status line's id, so Updates draws the two as one
   * decision (activity 2.2 d). Null otherwise.
   */
  statusEventId: string | null;
}

/**
 * The job's Lockbox section (D21, docs/specs/lockbox-location.md): the code,
 * where the box is, and whether there is a photo, which the page loads from
 * /api/files/lockbox/<job id>. The photo's files stay on the server.
 */
export type JobLockbox = { code: string; location: string | null; photo: { hasThumb: boolean } | null };

/**
 * The job's Tenants section (docs/specs/tenant-contact.md section 3): the
 * household living there today, names and numbers only. Empty at a vacant
 * home. `permitted` is their Permission to enter, which is also why the
 * Lockbox section shows at an occupied home.
 */
export type JobTenants = { people: JobTenant[]; permitted: boolean };

function jobLockbox(access: LockboxAccess | null): JobLockbox | null {
  if (!access) return null;
  return { code: access.code, location: access.location, photo: access.photo ? { hasThumb: !!access.photo.thumbPathname } : null };
}

export interface JobDetail {
  id: string;
  title: string;
  status: TaskStatus;
  /** Always shown to the assigned contractor (D16). */
  notes: string | null;
  address: string | null;
  /** The property's front photo (public Blob), or null: the fallback tile. */
  photoUrl: string | null;
  unitLabel: string | null;
  /** HG Capital's due date: the contractor sees it and never changes it. */
  due: Ymd | null;
  /** Their scheduled day while the job is Scheduled (rules.ts scheduledDay), else null. */
  scheduled: Ymd | null;
  /**
   * The day they had planned, once started (In progress, Review, Done): the column keeps its last value after Start
   * (rules.ts scheduledDay), so the card still shows it and the Schedule step stays done (Connor, Nov 22). Only when
   * the job's last move out of Scheduled was its start or a straight finish. Null before Start.
   */
  plannedDay: Ymd | null;
  /** Someone lives there and Permission to enter is off: picking today or tomorrow gets the notice toast (Q7). */
  needsNotice: boolean;
  /** The job's unit is known and nobody lives there: Getting in may say "No one lives here" (access-code.ts JobAccess). */
  vacant: boolean;
  checklist: { id: string; title: string; done: boolean }[];
  media: JobMedia[];
  /** The ids in `media` sent with the latest Mark done, which lead under "At finish" (uploads 2.5). Empty with no Mark done set. */
  atFinish: string[];
  updates: JobUpdate[];
  /**
   * Where the viewer last looked (ISO), for the New divider: their last open
   * of the job, or when they got access before the first. The divider sits
   * above the first entry after it written by someone else.
   */
  newSince: string;
  /** The send back, date and notes changes since the viewer last looked, for the top of the page. */
  notice: JobNotice;
  /** D21: only for the assigned contractor while the job is active, and at an occupied home only with permission; else null. */
  lockbox: JobLockbox | null;
  /** Who lives there, under the lockbox's rule (assigned contractor, active job); no people when vacant. */
  tenants: JobTenants;
  /** First names of the partners a Mark done goes to, for the payoff line. */
  staffNames: string[];
  /** Photos Mark done asks for, from the job's playbook (TaskTemplate.finishPhotosRequired); null or 0 means optional. */
  finishPhotosRequired: number | null;
  /** When this contractor last sent the job to Review (ISO), while it is in Review: "Add photo/video" hides an hour later. Else null. */
  markedDoneAt: string | null;
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

/** Who added a file, as the contractor sees names: "You", a first name, or nothing. */
function uploaderLabel(p: PortalPrincipal, a: MediaRow): string | null {
  return portalActorLabel(p.contactId, {
    userId: a.uploadedByUserId,
    contactId: a.uploadedByContactId,
    label: a.uploadedByUser?.name || a.uploadedByUser?.email.split("@")[0] || a.uploadedByContact?.fullName || null,
  });
}

function toMedia(p: PortalPrincipal, a: MediaRow): JobMedia {
  return {
    id: a.id,
    kind: a.kind === "VIDEO" ? "VIDEO" : "IMAGE",
    filename: a.filename,
    hasThumb: !!a.thumbPathname,
    hasPoster: !!a.posterPathname,
    durationSec: a.durationSec,
    uploadedBy: uploaderLabel(p, a),
    createdAt: a.createdAt,
  };
}

const markDoneEventSelect = { id: true, kind: true, data: true, createdAt: true, actorContactId: true } satisfies Prisma.TaskEventSelect;

/**
 * The ids among `media` that were sent with the latest Mark done (the "At
 * finish" set, uploads 2.5): the photos posted on the comment the contractor
 * wrote as they tapped Mark done, from the same rule the task page uses
 * (lib/tasks/media.ts finishPhotoIds). It reads the latest move to Review by a
 * contractor and that person's comments in the seconds before it, and nothing
 * else of the job's events; only ids leave here, and only of files the page
 * already shows this contractor. Empty with no Mark done, or one with no photos.
 */
async function finishSet(taskId: string, media: readonly { id: string; createdAt: Date; eventId: string | null }[]): Promise<string[]> {
  if (media.length === 0) return [];
  const review = await prisma.taskEvent.findFirst({
    where: { taskId, kind: "STATUS", data: { path: ["to"], equals: "REVIEW" }, actorContactId: { not: null } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: markDoneEventSelect,
  });
  if (!review) return [];
  const comments = await prisma.taskEvent.findMany({
    where: {
      taskId,
      kind: "COMMENT",
      actorContactId: review.actorContactId,
      createdAt: { gte: new Date(review.createdAt.getTime() - MARK_DONE_WINDOW_MS), lte: review.createdAt },
    },
    select: markDoneEventSelect,
  });
  return finishPhotoIds(media, [review, ...comments]);
}

/** The job, or null when this contact can't open it (no access, revoked, or closed before PORTAL_HISTORY_FROM). */
export async function getJob(p: PortalPrincipal, taskId: string): Promise<JobDetail | null> {
  // A link session opens its one job (session.ts onlyTaskId).
  if (p.onlyTaskId && p.onlyTaskId !== taskId) return null;
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
      entryPermittedAt: true,
      property: { select: { address: true, photoUrl: true } },
      taskTemplate: { select: { finishPhotosRequired: true } },
      checklist: { select: { id: true, title: true, done: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!task) return null;
  const active = isActiveStatus(task.status);
  if (!active && (!task.completedAt || task.completedAt < PORTAL_HISTORY_FROM)) return null;

  // Where they last looked (the New divider and the notice) and the filter for codes in imported comments.
  const [since, mask] = await Promise.all([lastLooked(p, taskId), lockboxMasker(prisma, task.propertyId)]);

  const started = task.status === "IN_PROGRESS" || task.status === "REVIEW" || task.status === "DONE";
  const [media, updates, access, staffNames, marked, notice, leftScheduled] = await Promise.all([
    prisma.taskAttachment.findMany({
      where: { taskId, ...visibleFile(p.contactId, ["IMAGE", "VIDEO"]) },
      select: { ...mediaSelect, eventId: true },
      orderBy: { createdAt: "asc" },
    }),
    jobUpdates(p, taskId, mask),
    // Tenants and the lockbox: the assigned contractor's, while the job is open (D21, tenant-contact.md Q2).
    active && task.assigneeContactId === p.contactId ? readJobAccess(prisma, task) : NO_ACCESS,
    staffFirstNames(),
    // The hour after Mark done runs from the job's newest move to Review, and only when this contractor made it
    // (acceptsContractorUpload reads the same event).
    task.status === "REVIEW"
      ? prisma.taskEvent.findFirst({
          where: { taskId, kind: "STATUS", data: { path: ["to"], equals: "REVIEW" } },
          orderBy: { createdAt: "desc" },
          select: { actorContactId: true, createdAt: true },
        })
      : null,
    // Only an open job has anything to tell: a closed one is read-only history.
    active ? jobNotice(p, task, since) : NO_NOTICE,
    // The last move out of Scheduled, so a started job keeps the day only when it was started from that day (plannedDay).
    started && task.scheduledFor
      ? prisma.taskEvent.findFirst({
          where: { taskId, kind: "STATUS", deletedAt: null, data: { path: ["from"], equals: "SCHEDULED" } },
          orderBy: { createdAt: "desc" },
          select: { data: true },
        })
      : null,
  ]);
  const leftTo = leftScheduled?.data && typeof leftScheduled.data === "object" ? (leftScheduled.data as { to?: unknown }).to : null;
  const atFinish = await finishSet(taskId, media);

  return {
    id: task.id,
    title: task.title,
    status: task.status,
    notes: task.description,
    address: task.property?.address ?? null,
    photoUrl: task.property?.photoUrl ?? null,
    unitLabel: task.unitLabel,
    due: toYmd(task.dueDate),
    scheduled: toYmd(scheduledDay(task)),
    // Only when it left Scheduled to be started or finished: a day given up (to To do or Waiting) and a later start doesn't count.
    plannedDay: leftTo === "IN_PROGRESS" || leftTo === "REVIEW" ? toYmd(task.scheduledFor) : null,
    needsNotice: access.needsNotice,
    vacant: access.vacant,
    checklist: task.checklist,
    // The grid's order, as on the task page (lib/tasks/media.ts): the Mark done set under "At finish" first, then newest first.
    media: orderMedia(media, { atFinish }).map((a) => toMedia(p, a)),
    atFinish,
    updates,
    newSince: since.toISOString(),
    notice,
    lockbox: jobLockbox(access.lockbox),
    tenants: { people: access.tenants, permitted: access.permitted },
    staffNames,
    finishPhotosRequired: task.taskTemplate?.finishPhotosRequired ?? null,
    markedDoneAt: marked && marked.actorContactId === p.contactId ? marked.createdAt.toISOString() : null,
  };
}

/**
 * First names of the partners: the staff users who can sign in, the ones a
 * contractor's updates email (tasks/core.ts notify). The Mark done payoff
 * and the reply line in job emails name them.
 */
export async function staffFirstNames(): Promise<string[]> {
  const staff = await prisma.user.findMany({
    where: { passwordHash: { not: null } },
    select: { name: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  return staff.map((u) => firstName(u.name || u.email.split("@")[0]));
}

/**
 * When the contractor last opened this job; before the first open, when they
 * got access, so a job assigned with imported history doesn't arrive full of
 * "new" (newUpdateCounts reads the same baseline, so the dot on My jobs and
 * the New divider here agree). Read before the page records this visit.
 */
async function lastLooked(p: PortalPrincipal, taskId: string): Promise<Date> {
  const [read, access] = await Promise.all([
    prisma.taskReadState.findUnique({ where: { taskId_contactId: { taskId, contactId: p.contactId } }, select: { lastSeenAt: true } }),
    prisma.taskAccess.findFirst({ where: { taskId, contactId: p.contactId, revokedAt: null }, select: { createdAt: true } }),
  ]);
  return read?.lastSeenAt ?? access?.createdAt ?? new Date();
}

/**
 * The notice at the top of the job (activity question 2 A): the open send
 * back with its note, the date if the contractor's Target moved, and updated
 * notes, all since they last looked. The send back and its note go through
 * portalEvents, so the audience rule is the Updates' own. The date and notes
 * events are internal and carry no audience, so they are read here for their
 * kind, day and who only (job-notice.ts), never a NOTES event's text.
 */
async function jobNotice(
  p: PortalPrincipal,
  task: { id: string; status: TaskStatus; dueDate: Date | null; scheduledFor: Date | null },
  since: Date,
): Promise<JobNotice> {
  const [sentBack, events] = await Promise.all([
    task.status === "IN_PROGRESS" ? openSendBack(p, task.id) : null,
    prisma.$queryRaw<NoticeEventRow[]>`
      SELECT e."kind"::text AS "kind", e."actorUserId", e."actorLabel",
             CASE WHEN e."kind" <> 'NOTES' THEN e."data"->>'from' END AS "from",
             CASE WHEN e."kind" <> 'NOTES' THEN e."data"->>'to' END AS "to"
      FROM "TaskEvent" e
      WHERE e."taskId" = ${task.id} AND e."deletedAt" IS NULL
        AND e."kind" IN ('DUE', 'SCHEDULED', 'STATUS', 'NOTES')
        AND e."createdAt" > ${utc(since)}
        -- What others changed: a date the contractor set themselves (Change date) isn't news to them.
        AND e."actorContactId" IS DISTINCT FROM ${p.contactId}
      ORDER BY e."createdAt" ASC, e."id" ASC`,
  ]);
  const change: DateChange | null = dateChange(
    { status: task.status, due: toYmd(task.dueDate), scheduled: toYmd(task.scheduledFor) },
    dateEvents(events),
  );
  const lastNotes = events.findLast((e) => e.kind === "NOTES");
  return {
    sentBack,
    date: change ? { text: dateChangeText(change, todayYmdEastern()), by: change.by } : null,
    notes: lastNotes ? { by: partner(lastNotes) } : null,
  };
}

/** The newest send back this contractor can see, with the note written with it, while it stands (job-notice.ts sendBackStands). */
async function openSendBack(p: PortalPrincipal, taskId: string): Promise<JobNotice["sentBack"]> {
  const [row] = await prisma.$queryRaw<{ id: string; createdAt: Date; actorUserId: string | null; actorLabel: string }[]>`
    SELECT e."id", e."createdAt", e."actorUserId", e."actorLabel"
    FROM "TaskEvent" e
    WHERE e."taskId" = ${taskId} AND ${portalEvents(p.contactId)}
      AND e."kind" = 'STATUS' AND e."actorContactId" IS NULL
      AND e."data"->>'from' = 'REVIEW' AND e."data"->>'to' = 'IN_PROGRESS'
    ORDER BY e."createdAt" DESC, e."id" DESC
    LIMIT 1`;
  if (!row) return null;
  const [[marked], [note]] = await Promise.all([
    prisma.$queryRaw<{ at: Date | null }[]>`
      SELECT max(e."createdAt") AS "at"
      FROM "TaskEvent" e
      WHERE e."taskId" = ${taskId} AND ${portalEvents(p.contactId)} AND e."kind" = 'STATUS' AND e."data"->>'to' = 'REVIEW'`,
    // The note written with the send back says so in its data; the audience rule is the Updates' own.
    prisma.$queryRaw<{ id: string; body: string | null }[]>`
      SELECT e."id", e."body"
      FROM "TaskEvent" e
      WHERE e."taskId" = ${taskId} AND ${portalEvents(p.contactId)}
        AND e."kind" = 'COMMENT' AND e."data"->>'statusEventId' = ${row.id}
      ORDER BY e."createdAt" ASC, e."id" ASC
      LIMIT 1`,
  ]);
  if (!sendBackStands("IN_PROGRESS", row.createdAt, marked?.at ?? null)) return null;
  return {
    statusEventId: row.id,
    noteEventId: note?.id ?? null,
    by: partner(row),
    at: row.createdAt.toISOString(),
    note: note?.body?.trim() || null,
  };
}

/**
 * Comments HG took back after the contractor could have read them (activity
 * question 3: leave "Connor removed a comment"). Their text is never read:
 * the rows carry who and when only. Whether this contractor could have read
 * one was settled when it came off and stored on the event as `seenBy` (the
 * contactIds that had opened the job since it was written, or had its email
 * go to them: delivery.contactsWhoSaw), so a visit after the delete shows
 * nothing. Only a comment written by a partner to this contractor or to
 * nobody in particular counts (portalEvents' audience rule, with `deletedAt`
 * the other way round). Anything they never saw leaves no trace.
 */
async function removedComments(p: PortalPrincipal, taskId: string): Promise<JobUpdate[]> {
  const rows = await prisma.$queryRaw<{ id: string; actorLabel: string; deletedAt: Date }[]>`
    SELECT e."id", e."actorLabel", e."deletedAt"
    FROM "TaskEvent" e
    JOIN "TaskAccess" a ON a."taskId" = e."taskId" AND a."contactId" = ${p.contactId} AND a."revokedAt" IS NULL
    WHERE e."taskId" = ${taskId}
      AND e."kind" = 'COMMENT' AND e."visibility" = 'SHARED' AND e."deletedAt" IS NOT NULL
      AND e."source" = 'APP' AND e."actorUserId" IS NOT NULL
      AND (e."audienceContactId" IS NULL OR e."audienceContactId" = ${p.contactId})
      AND e."createdAt" > a."createdAt"
      AND e."data"->'seenBy' @> ${JSON.stringify([p.contactId])}::jsonb
    ORDER BY e."deletedAt" ASC, e."id" ASC
    LIMIT 50`;
  return rows.map((r) => ({
    id: r.id,
    kind: "removed" as const,
    change: null,
    stays: false,
    actorLabel: firstName(r.actorLabel),
    contractor: false,
    you: false,
    body: "removed a comment",
    parts: null,
    // The line sits where it happened: when the comment came off.
    createdAt: r.deletedAt,
    edited: null,
    statusTo: null,
    attachments: { media: [], files: [] },
    clientId: null,
    statusEventId: null,
  }));
}

interface UpdateRow {
  id: string;
  kind: "COMMENT" | "ATTACHMENT" | "STATUS" | "CREATED" | "ASSIGNED" | "DUE" | "SCHEDULED" | "NOTES" | "CHECKLIST";
  source: string;
  actorLabel: string;
  actorUserId: string | null;
  actorContactId: string | null;
  body: string | null;
  createdAt: Date;
  editedAt: Date | null;
  importedEdited: string | null;
  statusFrom: string | null;
  statusTo: string | null;
  clientId: string | null;
  statusEventId: string | null;
  itemTitle: string | null;
  itemAction: string | null;
  itemDone: string | null;
  request: string | null;
  statusDay: string | null;
}

/** The latest updates, oldest first, with the files posted in each, and the job's story among them. */
async function jobUpdates(p: PortalPrincipal, taskId: string, mask: (body: string) => BodyPart[]): Promise<JobUpdate[]> {
  // Newest first, so a long history keeps its latest 500; then back to reading order.
  // Only whitelisted keys of `data` are selected, one by one (from, to, edited, clientId, statusEventId, a checklist
  // item's title, action and tick, a request's flag, the day a move to Scheduled set), never the whole of it. From and to
  // only where the line uses them: an assignment's or a creation's are people, and a notes edit's is the old text.
  const latest = await prisma.$queryRaw<UpdateRow[]>`
    SELECT e."id", e."kind"::text AS "kind", e."source"::text AS "source", e."actorLabel", e."actorUserId", e."actorContactId",
           e."body", e."createdAt", e."editedAt", e."data"->>'edited' AS "importedEdited",
           CASE WHEN e."kind" IN ('STATUS', 'DUE', 'SCHEDULED', 'CHECKLIST') THEN e."data"->>'from' END AS "statusFrom",
           CASE WHEN e."kind" IN ('STATUS', 'DUE', 'SCHEDULED', 'CHECKLIST') THEN e."data"->>'to' END AS "statusTo",
           CASE WHEN e."actorContactId" = ${p.contactId} THEN e."data"->>'clientId' END AS "clientId",
           CASE WHEN e."kind" = 'COMMENT' THEN e."data"->>'statusEventId' END AS "statusEventId",
           CASE WHEN e."kind" = 'CHECKLIST' THEN e."data"->>'title' END AS "itemTitle",
           CASE WHEN e."kind" = 'CHECKLIST' THEN e."data"->>'action' END AS "itemAction",
           CASE WHEN e."kind" = 'CHECKLIST' THEN e."data"->>'done' END AS "itemDone",
           CASE WHEN e."kind" = 'CREATED' THEN e."data"->>'request' END AS "request",
           CASE WHEN e."kind" = 'STATUS' THEN e."data"->>'scheduledFor' END AS "statusDay"
    FROM "TaskEvent" e
    WHERE e."taskId" = ${taskId} AND (${portalEvents(p.contactId)} OR ${storyEvents(p.contactId)})
    ORDER BY e."createdAt" DESC, e."id" DESC
    LIMIT 500`;
  const rows = latest.reverse();
  const removed = await removedComments(p, taskId);
  if (rows.length === 0) return removed;

  const files = await prisma.taskAttachment.findMany({
    where: { taskId, eventId: { in: rows.map((r) => r.id) }, ...visibleFile(p.contactId, PORTAL_FILE_KINDS) },
    select: { ...mediaSelect, size: true, eventId: true },
    orderBy: { createdAt: "asc" },
  });
  const byEvent = new Map<string, typeof files>();
  for (const f of files) {
    if (!f.eventId) continue;
    byEvent.set(f.eventId, [...(byEvent.get(f.eventId) ?? []), f]);
  }

  const out: JobUpdate[] = [];
  const today = todayYmdEastern();
  for (const r of rows) {
    const actorLabel = portalActorLabel(p.contactId, { userId: r.actorUserId, contactId: r.actorContactId, label: r.actorLabel }) ?? r.actorLabel;
    // The job's story: one line each, from the contractor's own words (job-view.ts storyLine).
    const story = r.kind !== "COMMENT" && r.kind !== "ATTACHMENT" && !(r.kind === "STATUS" && (PORTAL_STATUS_UPDATES as readonly string[]).includes(r.statusTo ?? ""));
    if (story) {
      const line = storyLine(
        {
          kind: r.kind,
          actor: r.actorUserId || r.actorContactId ? actorLabel : null,
          from: r.statusFrom,
          to: r.statusTo,
          itemTitle: r.itemTitle,
          itemAction: r.itemAction,
          itemDone: r.itemDone,
          request: r.request === "true",
          // A resident's own change (residents/requests.ts): a system line labeled "Dana Lee (resident)".
          resident: !r.actorUserId && !r.actorContactId && r.actorLabel.endsWith(" (resident)"),
        },
        today,
      );
      if (!line) continue;
      out.push({
        id: r.id,
        kind: "event",
        change: changeKind({ kind: r.kind, data: null }),
        stays: r.kind === "CREATED",
        // Only a person's first name reaches the page: a system line (or a resident's) goes as HG Capital.
        actorLabel: r.actorUserId || r.actorContactId ? actorLabel : "HG Capital",
        contractor: !!r.actorContactId,
        you: r.actorContactId === p.contactId,
        body: line,
        parts: null,
        createdAt: r.createdAt,
        edited: null,
        statusTo: null,
        attachments: { media: [], files: [] },
        clientId: null,
        statusEventId: null,
      });
      continue;
    }
    const own = byEvent.get(r.id) ?? [];
    const attachments = {
      media: own.filter((f) => f.kind === "IMAGE" || f.kind === "VIDEO").map((f) => toMedia(p, f)),
      files: own
        .filter((f) => f.kind === "FILE")
        .map((f) => ({ id: f.id, filename: f.filename, size: f.size, uploadedBy: uploaderLabel(p, f), createdAt: f.createdAt })),
    };
    // A file post whose files were all removed has nothing left to show (portalEvents drops these too), and neither
    // does a comment of photos alone that lost them all (the same test as the counts': emptyComment).
    if (r.kind === "ATTACHMENT" && own.length === 0) continue;
    const comment = r.kind === "COMMENT";
    if (comment && !r.body?.trim() && own.length === 0) continue;
    // Codes in imported comments are hidden here, on the server; a comment HG wrote to this contractor shows as written.
    const parts = comment && r.body ? (r.source === "ASANA" ? mask(r.body) : [{ text: r.body }]) : null;
    out.push({
      id: r.id,
      kind: r.kind === "STATUS" ? "status" : r.kind === "ATTACHMENT" ? "attachment" : "comment",
      change: null,
      // activity.ts isDecisionStatus: into or out of Review, or the contractor's own Start.
      stays:
        r.kind === "STATUS" &&
        (r.statusTo === "REVIEW" || r.statusFrom === "REVIEW" || (!!r.actorContactId && r.statusTo === "IN_PROGRESS")),
      actorLabel,
      contractor: !!r.actorContactId,
      you: r.actorContactId === p.contactId,
      body:
        r.kind === "STATUS"
          ? statusUpdateText(r.statusFrom, r.statusTo, { contractor: !!r.actorContactId }, { day: r.statusDay, today })
          : r.kind === "ATTACHMENT"
            ? addedText(own.map((f) => f.kind))
            : null,
      parts,
      createdAt: r.createdAt,
      edited: r.editedAt ?? (r.importedEdited === "true" ? true : null),
      statusTo: r.kind === "STATUS" && (PORTAL_STATUS_UPDATES as readonly string[]).includes(r.statusTo ?? "") ? (r.statusTo as TaskStatus) : null,
      attachments,
      clientId: r.clientId,
      statusEventId: r.statusEventId,
    });
  }
  // Traces of removed comments sit where they happened, among the rest.
  return removed.length > 0 ? [...out, ...removed].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) : out;
}
