import { randomUUID } from "node:crypto";
import { Prisma, type Task, type TaskEvent, type TaskEventKind, type TaskStatus, type Visibility } from "@prisma/client";
import { todayYmdEastern, toYmd, ymdToDate, type Ymd } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { STATUS_LABEL, isActiveStatus } from "@/lib/task-scope";
import { nextOccurrence, parseRepeatRule, type RepeatRule } from "./repeat";
import {
  BUNDLE_MAX_MS,
  BUNDLE_QUIET_MS,
  canSetStatus,
  notifyAudience,
  statusEventVisibility,
  targetDate,
  type NotifyChange,
  type PrincipalKind,
} from "./rules";

/**
 * Every task write, in one place, for every kind of writer: staff in the app
 * (src/lib/tasks/service.ts), contractors in the portal (src/lib/portal/),
 * the system (reminders, the move-in form, repeats) and the Asana importer
 * (scripts/asana/). Each write records who did it (a Principal), adds its
 * timeline event, keeps contractor access in step with the assignee, creates
 * the next copy of a repeating task, and queues the email the change calls
 * for, all inside the caller's transaction.
 *
 * Deliberately no `server-only`, no revalidatePath, no network: the importer
 * runs this outside Next, and the service layer revalidates and talks to Blob
 * after the transaction commits. Rules that don't need the database live in
 * rules.ts and repeat.ts, which are unit-tested.
 */

export type Tx = Prisma.TransactionClient;

/** Who is acting. Labels are what the timeline and emails show. */
export type Principal =
  | { kind: "staff"; userId: string; label: string }
  | { kind: "contractor"; contactId: string; label: string }
  | { kind: "system"; label: string }
  | { kind: "asana"; label: string };

/** A write that the rules forbid: a contractor approving, Waiting without a reason, no access. */
export class TaskRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskRuleError";
  }
}

/**
 * The task moved on since the caller's screen showed it (another tab, the
 * other partner, the contractor), so nothing was written. `current` is where
 * it is now; the message says who moved it there.
 */
export class TaskChangedError extends TaskRuleError {
  constructor(
    readonly current: TaskStatus,
    by: string | null,
  ) {
    super(`${by || "Someone"} moved this to ${STATUS_LABEL[current]}.`);
    this.name = "TaskChangedError";
  }
}

const kindOf = (p: Principal): PrincipalKind => p.kind;

function actorFields(p: Principal) {
  return {
    actorUserId: p.kind === "staff" ? p.userId : null,
    actorContactId: p.kind === "contractor" ? p.contactId : null,
    actorLabel: p.label,
    source: p.kind === "staff" ? "APP" : p.kind === "contractor" ? "PORTAL" : p.kind === "asana" ? "ASANA" : "SYSTEM",
  } as const;
}

/** Staff and contractor writes mark the row as edited in the app, for the Asana delta merge. */
const editStamp = (p: Principal, now: Date) => (p.kind === "staff" || p.kind === "contractor" ? { appEditedAt: now } : {});

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface EventInput {
  kind: TaskEventKind;
  visibility?: Visibility;
  body?: string | null;
  data?: Prisma.InputJsonValue;
  createdAt?: Date;
  asanaStoryGid?: string | null;
}

export function addEvent(tx: Tx, taskId: string, p: Principal, e: EventInput): Promise<TaskEvent> {
  return tx.taskEvent.create({
    data: {
      taskId,
      kind: e.kind,
      visibility: e.visibility ?? "INTERNAL",
      body: e.body ?? null,
      data: e.data ?? {},
      asanaStoryGid: e.asanaStoryGid ?? null,
      ...(e.createdAt ? { createdAt: e.createdAt } : {}),
      ...actorFields(p),
    },
  });
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/**
 * A contractor may act on a task only through an unrevoked access row, with
 * an active contact and an active portal login. (The portal layer separately
 * checks the session itself.)
 */
export async function assertContractorAccess(tx: Tx, taskId: string, contactId: string): Promise<void> {
  const access = await tx.taskAccess.findUnique({
    where: { taskId_contactId: { taskId, contactId } },
    select: { revokedAt: true, contact: { select: { active: true, portalAccount: { select: { status: true } } } } },
  });
  if (!access || access.revokedAt || !access.contact.active || access.contact.portalAccount?.status !== "ACTIVE") {
    throw new TaskRuleError("You don't have access to this job.");
  }
}

/**
 * Keep the automatic access row in step with the assignee: grant it to the
 * contractor now assigned, revoke it from anyone who was. Rows shared by hand
 * (MANUAL) are left alone.
 */
async function syncAssigneeAccess(tx: Tx, taskId: string, contactId: string | null, p: Principal, now: Date): Promise<void> {
  await tx.taskAccess.updateMany({
    where: { taskId, source: "ASSIGNEE", revokedAt: null, ...(contactId ? { NOT: { contactId } } : {}) },
    data: { revokedAt: now },
  });
  if (!contactId) return;
  await tx.taskAccess.upsert({
    where: { taskId_contactId: { taskId, contactId } },
    create: { taskId, contactId, source: "ASSIGNEE", grantedByUserId: p.kind === "staff" ? p.userId : null },
    update: { revokedAt: null },
  });
}

/**
 * The same, for the Asana importer (src/lib/asana/import.ts), which writes
 * task rows itself so it can keep Asana's ids and timestamps.
 */
export { syncAssigneeAccess as grantAssigneeAccess };

// ---------------------------------------------------------------------------
// Notifications (sent later by src/lib/notifications/outbox.ts)
// ---------------------------------------------------------------------------

export interface OutboxItem {
  kind: NotifyChange["kind"];
  actorLabel: string;
  summary: string;
  at: string;
}

type NotifyTask = Pick<Task, "id" | "assigneeContactId">;

async function contractorHasLogin(tx: Tx, contactId: string | null): Promise<boolean> {
  if (!contactId) return false;
  const acct = await tx.portalAccount.findUnique({ where: { contactId }, select: { status: true } });
  return acct?.status === "ACTIVE";
}

/**
 * Queue one line of an email. Lines for the same recipient and task bundle
 * into one row while it's unsent (see rules.ts bundleSendAfter). The insert
 * is a single atomic statement so two writers can't create duplicate rows.
 */
async function enqueue(
  tx: Tx,
  recipient: { userId: string } | { contactId: string },
  taskId: string,
  item: OutboxItem,
  now: Date,
): Promise<void> {
  const isUser = "userId" in recipient;
  const recipientId = isUser ? recipient.userId : recipient.contactId;
  const openKey = `${isUser ? "u" : "c"}:${recipientId}:${taskId}`;
  // The columns are timestamp without time zone, holding UTC. Convert
  // explicitly, as outbox.ts does, so a Postgres session in local time
  // doesn't shift them.
  const at = Prisma.sql`(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const quietUntil = Prisma.sql`(${new Date(now.getTime() + BUNDLE_QUIET_MS).toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  await tx.$executeRaw`
    INSERT INTO "NotificationOutbox"
      ("id", "openKey", "recipientUserId", "recipientContactId", "taskId", "items", "firstAt", "sendAfter", "createdAt")
    VALUES (
      ${randomUUID()}, ${openKey}, ${isUser ? recipientId : null}, ${isUser ? null : recipientId}, ${taskId},
      jsonb_build_array(${JSON.stringify(item)}::jsonb), ${at}, ${quietUntil}, ${at}
    )
    ON CONFLICT ("openKey") DO UPDATE SET
      "items" = "NotificationOutbox"."items" || EXCLUDED."items",
      "sendAfter" = LEAST("NotificationOutbox"."firstAt" + ${BUNDLE_MAX_MS} * interval '1 millisecond', ${quietUntil})`;
}

/** Route one change to whoever should hear about it (rules.ts notifyAudience). */
async function notify(tx: Tx, task: NotifyTask, p: Principal, change: NotifyChange, summary: string, now: Date): Promise<void> {
  const hasLogin = await contractorHasLogin(tx, task.assigneeContactId);
  const audience = notifyAudience(kindOf(p), change, { contractorHasLogin: hasLogin });
  if (!audience) return;
  const item: OutboxItem = { kind: change.kind, actorLabel: p.label, summary, at: now.toISOString() };
  if (audience === "contractor" && task.assigneeContactId) {
    await enqueue(tx, { contactId: task.assigneeContactId }, task.id, item, now);
  } else if (audience === "staff") {
    const staff = await tx.user.findMany({ where: { passwordHash: { not: null } }, select: { id: true } });
    for (const s of staff) await enqueue(tx, { userId: s.id }, task.id, item, now);
  }
}

// ---------------------------------------------------------------------------
// Deal timeline (tasks against a deal also log there)
// ---------------------------------------------------------------------------

async function logDeal(tx: Tx, dealId: string | null, p: Principal, line: string, now: Date): Promise<void> {
  if (!dealId) return;
  await tx.dealNote.create({ data: { dealId, body: `${line}  ·  ${p.label}`, noteDate: now, source: "change" } });
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type Assignee = { userId: string } | { contactId: string } | null;

export function bucketFor(propertyId: string | null | undefined): string {
  return propertyId ? "Property" : "General";
}

export interface NewTaskInput {
  title: string;
  description?: string | null;
  dueDate?: Ymd | null;
  scheduledFor?: Ymd | null;
  propertyId?: string | null;
  dealId?: string | null;
  unitLabel?: string | null;
  assignee?: Assignee;
  /** Legacy free-text assignee (move-in form, old callers). Display only. */
  assigneeName?: string | null;
  status?: TaskStatus;
  waitingOn?: string | null;
  repeatRule?: RepeatRule | null;
  repeatSeriesId?: string | null;
  taskTemplateId?: string | null;
  autoKey?: string | null;
  priority?: string | null;
}

export async function createTask(tx: Tx, input: NewTaskInput, p: Principal, now = new Date()): Promise<Task> {
  if (p.kind === "contractor") throw new TaskRuleError("Contractors can't create tasks yet.");
  const title = input.title.trim();
  if (title.length < 2) throw new TaskRuleError("A task needs a title.");
  const status = input.status ?? "OPEN";
  if (status === "WAITING" && !input.waitingOn?.trim()) throw new TaskRuleError("Say what it's waiting on.");
  const propertyId = input.propertyId || null;
  const assigneeUserId = input.assignee && "userId" in input.assignee ? input.assignee.userId : null;
  const assigneeContactId = input.assignee && "contactId" in input.assignee ? input.assignee.contactId : null;

  const task = await tx.task.create({
    data: {
      title,
      description: input.description?.trim() || null,
      status,
      dueDate: ymdToDate(input.dueDate),
      scheduledFor: ymdToDate(input.scheduledFor),
      waitingOn: status === "WAITING" ? input.waitingOn!.trim() : null,
      propertyId,
      dealId: input.dealId || null,
      unitLabel: input.unitLabel?.trim() || null,
      assigneeUserId,
      assigneeContactId,
      assigneeName: assigneeUserId || assigneeContactId ? null : input.assigneeName?.trim() || null,
      bucket: bucketFor(propertyId),
      repeatRule: input.repeatRule ?? undefined,
      repeatSeriesId: input.repeatSeriesId ?? null,
      taskTemplateId: input.taskTemplateId ?? null,
      autoKey: input.autoKey ?? null,
      priority: input.priority ?? null,
      createdByUserId: p.kind === "staff" ? p.userId : null,
      ...editStamp(p, now),
    },
  });
  await addEvent(tx, task.id, p, { kind: "CREATED" });
  if (assigneeContactId) {
    await syncAssigneeAccess(tx, task.id, assigneeContactId, p, now);
    await notify(tx, task, p, { kind: "ASSIGNED", visibility: "SHARED" }, `assigned you "${task.title}"`, now);
  }
  await logDeal(tx, task.dealId, p, `Task added: ${task.title}`, now);
  return task;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface StatusOptions {
  /** Required for WAITING. */
  waitingOn?: string | null;
  /** The visit date for SCHEDULED; keeps the existing one when omitted. */
  scheduledFor?: Ymd | null;
  /** A shared note to the contractor, e.g. why a job was sent back from Review. */
  note?: string | null;
  /**
   * The status the caller's screen showed. When the task has moved on since,
   * nothing changes and TaskChangedError says who moved it.
   */
  expected?: TaskStatus;
}

export interface StatusResult {
  task: Task;
  /** The next copy, when finishing a repeating task created one. */
  nextTaskId: string | null;
}

export async function setStatus(tx: Tx, taskId: string, to: TaskStatus, p: Principal, opts: StatusOptions = {}, now = new Date()): Promise<StatusResult> {
  // Lock the row, so two changes at once (a double tap, both partners, the
  // contractor) run one after the other and the second sees the first. NO KEY
  // UPDATE is the lock the update below takes anyway: unlike FOR UPDATE it
  // doesn't wait on the key-share locks that inserting a comment, file or
  // email row takes, which could deadlock a Mark done that posts a note.
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${taskId} FOR NO KEY UPDATE`;
  const before = await tx.task.findUnique({ where: { id: taskId } });
  if (!before) throw new TaskRuleError("That task no longer exists.");
  if (p.kind === "contractor") await assertContractorAccess(tx, taskId, p.contactId);
  if (opts.expected && before.status !== opts.expected) {
    // Whoever moved it to where it is now, not a later change that didn't.
    const last = await tx.taskEvent.findFirst({
      where: { taskId, kind: "STATUS", data: { path: ["to"], equals: before.status } },
      orderBy: { createdAt: "desc" },
      select: { actorLabel: true },
    });
    throw new TaskChangedError(before.status, firstName(last?.actorLabel));
  }
  if (!canSetStatus(kindOf(p), before.status, to)) {
    throw new TaskRuleError(p.kind === "contractor" ? "You can start a job or mark it done." : "That status change isn't allowed.");
  }

  const waitingOn = opts.waitingOn?.trim() || null;
  if (to === "WAITING" && !waitingOn) throw new TaskRuleError("Say what it's waiting on.");
  const scheduledFor = opts.scheduledFor !== undefined ? ymdToDate(opts.scheduledFor) : before.scheduledFor;
  if (to === "SCHEDULED" && !scheduledFor) throw new TaskRuleError("Pick the visit date.");

  const closing = to === "DONE" || to === "CANCELED";
  const reopening = !isActiveStatus(before.status) && isActiveStatus(to);
  const task = await tx.task.update({
    where: { id: taskId },
    data: {
      status: to,
      waitingOn: to === "WAITING" ? waitingOn : null,
      scheduledFor,
      ...(closing
        ? {
            completedAt: now,
            completedByUserId: p.kind === "staff" ? p.userId : null,
            completedByContactId: p.kind === "contractor" ? p.contactId : null,
          }
        : reopening
          ? { completedAt: null, completedByUserId: null, completedByContactId: null }
          : {}),
      ...editStamp(p, now),
    },
  });

  const visibility = statusEventVisibility(to, !!task.assigneeContactId);
  await addEvent(tx, taskId, p, {
    kind: "STATUS",
    visibility,
    data: { from: before.status, to, ...(waitingOn ? { waitingOn } : {}), ...(to === "SCHEDULED" ? { scheduledFor: toYmd(scheduledFor) } : {}) },
  });
  const note = opts.note?.trim();
  if (note) await addEvent(tx, taskId, p, { kind: "COMMENT", visibility: "SHARED", body: note });

  const summary =
    to === "REVIEW" && p.kind === "contractor"
      ? `marked "${task.title}" done`
      : before.status === "REVIEW" && to === "IN_PROGRESS"
        ? `sent "${task.title}" back${note ? `: ${note}` : ""}`
        : `set "${task.title}" to ${to.replace("_", " ").toLowerCase()}`;
  await notify(tx, task, p, { kind: "STATUS", visibility }, summary, now);

  if (to === "DONE" || reopening) {
    await logDeal(tx, task.dealId, p, `Task ${to === "DONE" ? "completed" : "reopened"}: ${task.title}`, now);
  }
  const nextTaskId = to === "DONE" && before.status !== "DONE" ? await createNextRepeat(tx, task, p, now) : null;
  return { task, nextTaskId };
}

// ---------------------------------------------------------------------------
// Repeats
// ---------------------------------------------------------------------------

/**
 * Create the next copy of a finished repeating task. Returns its id, or null
 * when it doesn't repeat. Exported for the Asana delta, which closes tasks
 * completed in Asana without going through setStatus.
 */
export async function createNextRepeat(tx: Tx, done: Task, p: Principal, now: Date): Promise<string | null> {
  const rule = parseRepeatRule(done.repeatRule);
  if (!rule) return null;
  const from = toYmd(done.dueDate) ?? todayYmdEastern(now);
  const seriesId = done.repeatSeriesId ?? done.id;
  if (!done.repeatSeriesId) await tx.task.update({ where: { id: done.id }, data: { repeatSeriesId: seriesId } });

  const next = await tx.task.create({
    data: {
      title: done.title,
      description: done.description,
      status: "OPEN", // status-write: a fresh copy starts as To do
      dueDate: ymdToDate(nextOccurrence(rule, from)),
      propertyId: done.propertyId,
      unitLabel: done.unitLabel,
      assigneeUserId: done.assigneeUserId,
      assigneeContactId: done.assigneeContactId,
      assigneeName: done.assigneeName,
      bucket: done.bucket,
      repeatRule: rule,
      repeatSeriesId: seriesId,
      createdByUserId: done.createdByUserId,
    },
  });
  const items = await tx.taskChecklistItem.findMany({ where: { taskId: done.id }, orderBy: { position: "asc" } });
  if (items.length) {
    await tx.taskChecklistItem.createMany({ data: items.map((i) => ({ taskId: next.id, title: i.title, position: i.position })) });
  }
  await addEvent(tx, next.id, { kind: "system", label: "Repeats" }, { kind: "CREATED", data: { repeatOf: done.id } });
  await addEvent(tx, done.id, { kind: "system", label: "Repeats" }, { kind: "REPEAT_CREATED", data: { next: next.id, due: toYmd(next.dueDate) } });
  if (next.assigneeContactId) {
    await syncAssigneeAccess(tx, next.id, next.assigneeContactId, p, now);
    await notify(tx, next, p, { kind: "ASSIGNED", visibility: "SHARED" }, `assigned you "${next.title}"`, now);
  }
  return next.id;
}

// ---------------------------------------------------------------------------
// Edits (staff and system only)
// ---------------------------------------------------------------------------

export interface TaskPatch {
  title?: string;
  description?: string | null;
  dueDate?: Ymd | null;
  scheduledFor?: Ymd | null;
  propertyId?: string | null;
  unitLabel?: string | null;
  assignee?: Assignee;
  waitingOn?: string | null;
  repeatRule?: RepeatRule | null;
}

/**
 * Field edits. Only keys present are written; null clears. Each changed field
 * adds an internal timeline line; the contractor hears about assignment,
 * notes and a moved Target date.
 */
export async function patchTask(tx: Tx, taskId: string, patch: TaskPatch, p: Principal, now = new Date()): Promise<Task> {
  if (p.kind === "contractor") throw new TaskRuleError("Contractors can't edit job details.");
  const before = await tx.task.findUnique({ where: { id: taskId } });
  if (!before) throw new TaskRuleError("That task no longer exists.");

  const data: Prisma.TaskUncheckedUpdateInput = {};
  const events: EventInput[] = [];

  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t.length >= 2 && t !== before.title) {
      data.title = t;
      events.push({ kind: "TITLE", data: { from: before.title, to: t } });
    }
  }
  if (patch.description !== undefined) {
    const d = patch.description?.trim() || null;
    if (d !== before.description) {
      data.description = d;
      events.push({ kind: "NOTES" });
    }
  }
  if (patch.dueDate !== undefined) {
    const d = ymdToDate(patch.dueDate);
    if (toYmd(d) !== toYmd(before.dueDate)) {
      data.dueDate = d;
      events.push({ kind: "DUE", data: { from: toYmd(before.dueDate), to: toYmd(d) } });
    }
  }
  if (patch.scheduledFor !== undefined) {
    const d = ymdToDate(patch.scheduledFor);
    if (toYmd(d) !== toYmd(before.scheduledFor)) {
      data.scheduledFor = d;
      events.push({ kind: "SCHEDULED", data: { from: toYmd(before.scheduledFor), to: toYmd(d) } });
    }
  }
  if (patch.propertyId !== undefined) {
    const id = patch.propertyId || null;
    if (id !== before.propertyId) {
      data.propertyId = id;
      data.bucket = bucketFor(id);
      events.push({ kind: "PROPERTY", data: { from: before.propertyId, to: id } });
    }
  }
  if (patch.unitLabel !== undefined) {
    const u = patch.unitLabel?.trim() || null;
    if (u !== before.unitLabel) {
      data.unitLabel = u;
      events.push({ kind: "PROPERTY", data: { unitFrom: before.unitLabel, unitTo: u } });
    }
  }
  if (patch.waitingOn !== undefined && before.status === "WAITING") {
    const w = patch.waitingOn?.trim() || null;
    if (!w) throw new TaskRuleError("Say what it's waiting on.");
    if (w !== before.waitingOn) data.waitingOn = w;
  }
  if (patch.repeatRule !== undefined) data.repeatRule = patch.repeatRule ?? Prisma.DbNull;

  let newContactId: string | null | undefined;
  if (patch.assignee !== undefined) {
    const userId = patch.assignee && "userId" in patch.assignee ? patch.assignee.userId : null;
    const contactId = patch.assignee && "contactId" in patch.assignee ? patch.assignee.contactId : null;
    if (userId !== before.assigneeUserId || contactId !== before.assigneeContactId) {
      // Exactly one kind of assignee; the legacy free text goes once a real one is chosen.
      data.assigneeUserId = userId;
      data.assigneeContactId = contactId;
      data.assigneeName = null;
      data.assigneeEmail = null;
      newContactId = contactId;
      events.push({
        kind: "ASSIGNED",
        data: { from: { userId: before.assigneeUserId, contactId: before.assigneeContactId, name: before.assigneeName }, to: { userId, contactId } },
      });
    }
  }

  if (Object.keys(data).length === 0) return before;
  const after = await tx.task.update({ where: { id: taskId }, data: { ...data, ...editStamp(p, now) } });
  for (const e of events) await addEvent(tx, taskId, p, e);

  if (newContactId !== undefined) {
    await syncAssigneeAccess(tx, taskId, newContactId, p, now);
    if (newContactId) await notify(tx, after, p, { kind: "ASSIGNED", visibility: "SHARED" }, `assigned you "${after.title}"`, now);
  } else if (after.assigneeContactId) {
    // Same contractor: tell them about what they can see change.
    const targetBefore = toYmd(targetDate(before));
    const targetAfter = toYmd(targetDate(after));
    if (targetBefore !== targetAfter) {
      await notify(tx, after, p, { kind: "TARGET", visibility: "SHARED" }, `moved "${after.title}" to ${targetAfter ?? "no date"}`, now);
    }
    if (events.some((e) => e.kind === "NOTES")) {
      await notify(tx, after, p, { kind: "NOTES", visibility: "SHARED" }, `updated the notes on "${after.title}"`, now);
    }
  }
  return after;
}

// ---------------------------------------------------------------------------
// Comments, files, checklist
// ---------------------------------------------------------------------------

export interface CommentInput {
  body: string;
  /** Staff choose; contractors' comments are always SHARED. */
  visibility?: Visibility;
  /** Already-recorded attachments to show inside this comment. */
  attachmentIds?: string[];
}

export async function addComment(tx: Tx, taskId: string, input: CommentInput, p: Principal, now = new Date()): Promise<TaskEvent> {
  const body = input.body.trim();
  if (!body && !input.attachmentIds?.length) throw new TaskRuleError("Write something or add a photo.");
  const task = await tx.task.findUnique({ where: { id: taskId } });
  if (!task) throw new TaskRuleError("That task no longer exists.");
  if (p.kind === "contractor") {
    await assertContractorAccess(tx, taskId, p.contactId);
    if (!isActiveStatus(task.status)) throw new TaskRuleError("This job is closed.");
  }
  const visibility: Visibility = p.kind === "contractor" ? "SHARED" : (input.visibility ?? "INTERNAL");
  const event = await addEvent(tx, taskId, p, { kind: "COMMENT", visibility, body: body || null });
  if (input.attachmentIds?.length) {
    await tx.taskAttachment.updateMany({
      where: { id: { in: input.attachmentIds }, taskId, eventId: null },
      data: { eventId: event.id, visibility },
    });
  }
  await tx.task.update({ where: { id: taskId }, data: editStamp(p, now) });
  const photos = input.attachmentIds?.length ? ` (+${input.attachmentIds.length} file${input.attachmentIds.length > 1 ? "s" : ""})` : "";
  await notify(tx, task, p, { kind: "COMMENT", visibility }, `${body ? `"${body.slice(0, 140)}"` : "added files"}${photos}`, now);
  return event;
}

export interface AttachmentMeta {
  url: string;
  pathname: string;
  filename: string;
  size: number;
  contentType: string | null;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  thumbPathname?: string | null;
  posterPathname?: string | null;
}

const kindForType = (type: string | null) => (type?.startsWith("image/") ? "IMAGE" : type?.startsWith("video/") ? "VIDEO" : "FILE") as "IMAGE" | "VIDEO" | "FILE";

/**
 * Record a file that is already in Blob. The service verifies the blob's real
 * size and type with head() first and passes those values, never the
 * browser's. `standalone` adds a timeline line; files posted with a comment
 * show inside it instead (addComment links them).
 */
export async function recordAttachment(
  tx: Tx,
  taskId: string,
  meta: AttachmentMeta,
  p: Principal,
  opts: { visibility?: Visibility; standalone?: boolean } = {},
  now = new Date(),
) {
  const task = await tx.task.findUnique({ where: { id: taskId } });
  if (!task) throw new TaskRuleError("That task no longer exists.");
  if (p.kind === "contractor") await assertContractorAccess(tx, taskId, p.contactId);
  const visibility: Visibility = p.kind === "contractor" ? "SHARED" : (opts.visibility ?? "INTERNAL");
  const att = await tx.taskAttachment.create({
    data: {
      taskId,
      url: meta.url,
      pathname: meta.pathname,
      filename: meta.filename.slice(0, 255) || "file",
      size: Math.max(0, Math.trunc(meta.size)),
      contentType: meta.contentType,
      kind: kindForType(meta.contentType),
      visibility,
      uploadedByUserId: p.kind === "staff" ? p.userId : null,
      uploadedByContactId: p.kind === "contractor" ? p.contactId : null,
      width: meta.width ?? null,
      height: meta.height ?? null,
      durationSec: meta.durationSec ?? null,
      thumbPathname: meta.thumbPathname ?? null,
      posterPathname: meta.posterPathname ?? null,
    },
  });
  if (opts.standalone !== false) {
    const ev = await addEvent(tx, taskId, p, { kind: "ATTACHMENT", visibility, data: { attachmentId: att.id, filename: att.filename } });
    await tx.taskAttachment.update({ where: { id: att.id }, data: { eventId: ev.id } });
    await notify(tx, task, p, { kind: "ATTACHMENT", visibility }, `added ${att.filename}`, now);
  }
  await tx.task.update({ where: { id: taskId }, data: editStamp(p, now) });
  return att;
}

export async function setChecklistItem(tx: Tx, itemId: string, done: boolean, p: Principal, now = new Date()) {
  const item = await tx.taskChecklistItem.findUnique({ where: { id: itemId }, include: { task: { select: { id: true, status: true } } } });
  if (!item) throw new TaskRuleError("That checklist item no longer exists.");
  if (p.kind === "contractor") {
    await assertContractorAccess(tx, item.taskId, p.contactId);
    if (!isActiveStatus(item.task.status)) throw new TaskRuleError("This job is closed.");
  }
  if (item.done === done) return item;
  const updated = await tx.taskChecklistItem.update({
    where: { id: itemId },
    data: done
      ? {
          done: true,
          doneAt: now,
          doneByUserId: p.kind === "staff" ? p.userId : null,
          doneByContactId: p.kind === "contractor" ? p.contactId : null,
        }
      : { done: false, doneAt: null, doneByUserId: null, doneByContactId: null },
  });
  await addEvent(tx, item.taskId, p, { kind: "CHECKLIST", data: { itemId, title: item.title, done } });
  await tx.task.update({ where: { id: item.taskId }, data: editStamp(p, now) });
  return updated;
}

export async function addChecklistItem(tx: Tx, taskId: string, title: string, p: Principal) {
  if (p.kind === "contractor") throw new TaskRuleError("Contractors can't add checklist items yet.");
  const t = title.trim();
  if (!t) throw new TaskRuleError("The item needs a name.");
  const last = await tx.taskChecklistItem.findFirst({ where: { taskId }, orderBy: { position: "desc" }, select: { position: true } });
  return tx.taskChecklistItem.create({ data: { taskId, title: t, position: (last?.position ?? -1) + 1 } });
}
