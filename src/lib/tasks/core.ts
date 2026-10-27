import { randomUUID } from "node:crypto";
import { Prisma, type Task, type TaskChecklistItem, type TaskEvent, type TaskEventKind, type TaskStatus, type Visibility } from "@prisma/client";
import { fmtDay, todayYmdEastern, toYmd, ymdToDate, type Ymd } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { renamedLabel, type UnitRename } from "@/lib/property-types";
import { STATUS_LABEL, isActiveStatus } from "@/lib/task-scope";
import { hasPinnedDay, isUntouchedCopy, nextRepeatDue, parseRepeatRule, repeatCreatedCopy, repeatDue, repeatFrom, type RepeatRule } from "./repeat";
import { copySlot } from "./repeat-slot";
import {
  BUNDLE_MAX_MS,
  BUNDLE_QUIET_MS,
  canSetStatus,
  notifyAudience,
  statusEventVisibility,
  targetDate,
  writeAudience,
  type NotifyChange,
  type PrincipalKind,
} from "./rules";

/**
 * Every task write, in one place, for every kind of writer: staff in the app
 * (src/lib/tasks/service.ts), contractors in the portal (src/lib/portal/),
 * the system (reminders, the move-in form, repeats) and the Asana importer
 * (scripts/asana/). Each write records who did it (a Principal), adds its
 * timeline event, keeps contractor access in step with the assignee, creates
 * the next copy of a repeating task (one per finish, taken back by a reopen
 * while untouched), and queues the email the change calls for, all inside
 * the caller's transaction.
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

/**
 * Someone else changed the assignee since the caller's screen showed it (an
 * old tab, the other partner), so nothing was written: a stale screen never
 * takes a job off a contractor. `name` is who has it now, null for nobody.
 */
export class AssigneeChangedError extends TaskRuleError {
  constructor(by: string | null, name: string | null) {
    super(name ? `${by || "Someone"} assigned this to ${name}.` : `${by || "Someone"} unassigned this.`);
    this.name = "AssigneeChangedError";
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
  /** The contractor a staff or system line is addressed to (rules.ts writeAudience). */
  audienceContactId?: string | null;
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
      audienceContactId: e.audienceContactId ?? null,
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

/**
 * A date as an email line says it: "Thu, Oct 29", with the year only when it
 * isn't this year in Buffalo. content.ts shows it as written.
 */
const emailDay = (d: Date | Ymd, now: Date) => fmtDay(d, { weekday: true, year: "auto", now: todayYmdEastern(now) });

/** The assignment line; a Scheduled job says its visit date. */
const assignedSummary = (t: Pick<Task, "title" | "status" | "scheduledFor">, now: Date) =>
  t.status === "SCHEDULED" && t.scheduledFor ? `assigned you "${t.title}" for ${emailDay(t.scheduledFor, now)}` : `assigned you "${t.title}"`;

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

/**
 * Whether the row is assigned to exactly this person. null means nobody: a
 * legacy free-text name alone counts as nobody, as the task page shows it.
 */
export function isAssignee(row: Pick<Task, "assigneeUserId" | "assigneeContactId">, a: Assignee): boolean {
  const userId = a && "userId" in a ? a.userId : null;
  const contactId = a && "contactId" in a ? a.contactId : null;
  return row.assigneeUserId === userId && row.assigneeContactId === contactId;
}

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
      // A repeating task never starts undated: no due date means its first occurrence.
      dueDate: ymdToDate(repeatDue(input.repeatRule, input.dueDate, todayYmdEastern(now))),
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
  // Assigning at creation is an assignment: the line carries `to` as ASSIGNED does, so the picker's Recent
  // rows see it (assignee-options.ts). It has no `repeatOf`, so it is no copy's slot (copyOrigin).
  await addEvent(tx, task.id, p, {
    kind: "CREATED",
    ...(assigneeUserId || assigneeContactId ? { data: { to: { userId: assigneeUserId, contactId: assigneeContactId } } } : {}),
  });
  if (assigneeContactId) {
    await syncAssigneeAccess(tx, task.id, assigneeContactId, p, now);
    await notify(tx, task, p, { kind: "ASSIGNED", visibility: "SHARED" }, assignedSummary(task, now), now);
  }
  await logDeal(tx, task.dealId, p, `Task added: ${task.title}`, now);
  return task;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * The email line for a status change; content.ts itemText reads it back.
 * Approve (D6b) and the contractor's own Start get their own words. Staff
 * moving a job to In progress is a plain status change, not "started the
 * job", which would put the contractor's work in a partner's name.
 */
export function statusSummary(
  c: { title: string; from: TaskStatus; to: TaskStatus; actor: PrincipalKind; note?: string | null; scheduledFor: Date | null },
  now: Date,
): string {
  const t = `"${c.title}"`;
  if (c.to === "REVIEW" && c.actor === "contractor") return `marked ${t} done`;
  if (c.from === "REVIEW" && c.to === "IN_PROGRESS") return `sent ${t} back${c.note ? `: ${c.note}` : ""}`;
  if (c.from === "REVIEW" && c.to === "DONE") return `approved ${t}`;
  if (c.to === "IN_PROGRESS" && c.actor === "contractor") return `started ${t}`;
  if (c.to === "SCHEDULED" && c.scheduledFor) return `scheduled ${t} for ${emailDay(c.scheduledFor, now)}`;
  return `set ${t} to ${c.to.replace("_", " ").toLowerCase()}`;
}

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
  /** That copy's due date, for "Done. Next due Nov 5". */
  nextDue: Ymd | null;
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
  const audienceContactId = writeAudience(kindOf(p), task.assigneeContactId);
  await addEvent(tx, taskId, p, {
    kind: "STATUS",
    visibility,
    audienceContactId,
    data: { from: before.status, to, ...(waitingOn ? { waitingOn } : {}), ...(to === "SCHEDULED" ? { scheduledFor: toYmd(scheduledFor) } : {}) },
  });
  const note = opts.note?.trim();
  if (note) await addEvent(tx, taskId, p, { kind: "COMMENT", visibility: "SHARED", body: note, audienceContactId });

  const summary = statusSummary({ title: task.title, from: before.status, to, actor: p.kind, note, scheduledFor }, now);
  await notify(tx, task, p, { kind: "STATUS", visibility }, summary, now);

  if (to === "DONE" || reopening) {
    await logDeal(tx, task.dealId, p, `Task ${to === "DONE" ? "completed" : "reopened"}: ${task.title}`, now);
  }
  const nextTaskId = to === "DONE" && before.status !== "DONE" ? await createNextRepeat(tx, task, p, now) : null;
  const nextDue = nextTaskId ? toYmd((await tx.task.findUnique({ where: { id: nextTaskId }, select: { dueDate: true } }))?.dueDate) : null;
  // Done to Canceled isn't a reopen: the copy stays.
  if (before.status === "DONE" && isActiveStatus(to)) await takeBackRepeat(tx, taskId);
  return { task, nextTaskId, nextDue };
}

// ---------------------------------------------------------------------------
// Repeats
// ---------------------------------------------------------------------------

/**
 * The copy the task's latest REPEAT_CREATED line names, when that copy still
 * exists. Ties on createdAt (one transaction) fall back to the cuid, which
 * grows with time.
 */
async function latestRepeatCopy(tx: Tx, taskId: string): Promise<{ eventId: string; nextId: string; madeInAsana: boolean } | null> {
  const ev = await tx.taskEvent.findFirst({
    where: { taskId, kind: "REPEAT_CREATED" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, data: true },
  });
  const copy = repeatCreatedCopy(ev?.data);
  if (!ev || !copy) return null;
  const next = await tx.task.findUnique({ where: { id: copy.next }, select: { id: true } });
  return next ? { eventId: ev.id, nextId: next.id, madeInAsana: copy.madeInAsana } : null;
}

/**
 * The date the series gave a copy when it was made, however it was moved
 * since (repeat.ts repeatFrom), read from its CREATED line (repeat-slot.ts
 * copySlot, which the task page's repeat menu asks too). Null for a series'
 * first task.
 */
async function repeatSlot(tx: Tx, taskId: string): Promise<Ymd | null> {
  const created = await tx.taskEvent.findFirst({
    where: { taskId, kind: "CREATED" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { data: true },
  });
  return copySlot(tx, taskId, created?.data);
}

/**
 * Create the next copy of a finished repeating task. Returns its id, or null
 * when it doesn't repeat. One copy per finish: when an earlier finish already
 * made one that still exists (the task was reopened and the copy kept), that
 * copy's id comes back and nothing is written, so no second copy and no
 * second "assigned you" email. A new copy is due on the rule's first date on
 * or after today in Buffalo (repeat.ts nextRepeatDue), so finishing a late
 * repeat never makes one that's already overdue. A rule with a pinned day
 * steps from the date the series gave the finished copy, not the date it was
 * moved to (repeatSlot), and every copy's CREATED line keeps the date it was given.
 * Exported for the Asana delta, which closes tasks completed in Asana
 * without going through setStatus.
 */
export async function createNextRepeat(tx: Tx, done: Task, p: Principal, now: Date): Promise<string | null> {
  const rule = parseRepeatRule(done.repeatRule);
  if (!rule) return null;
  const existing = await latestRepeatCopy(tx, done.id);
  if (existing) return existing.nextId;
  const today = todayYmdEastern(now);
  const slot = hasPinnedDay(rule) ? await repeatSlot(tx, done.id) : null;
  const due = nextRepeatDue(rule, repeatFrom(rule, slot, toYmd(done.dueDate), today), today);
  const seriesId = done.repeatSeriesId ?? done.id;
  if (!done.repeatSeriesId) await tx.task.update({ where: { id: done.id }, data: { repeatSeriesId: seriesId } });

  const next = await tx.task.create({
    data: {
      title: done.title,
      description: done.description,
      status: "OPEN", // status-write: a fresh copy starts as To do
      dueDate: ymdToDate(due),
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
  await addEvent(tx, next.id, { kind: "system", label: "Repeats" }, { kind: "CREATED", data: { repeatOf: done.id, due } });
  await addEvent(tx, done.id, { kind: "system", label: "Repeats" }, { kind: "REPEAT_CREATED", data: { next: next.id, due } });
  if (next.assigneeContactId) {
    await syncAssigneeAccess(tx, next.id, next.assigneeContactId, p, now);
    await notify(tx, next, p, { kind: "ASSIGNED", visibility: "SHARED" }, assignedSummary(next, now), now);
  }
  return next.id;
}

/**
 * Reopening a finished task takes back the copy its finish made, while nobody
 * has touched that copy (repeat.ts isUntouchedCopy): the copy goes, with its
 * checklist, access rows and unsent email (all cascade), and so does the
 * REPEAT_CREATED line, so a tick by mistake and an untick leave only the two
 * STATUS lines. A touched copy stays, and finishing again reuses it.
 * Asana's own copy stays too: the delta mirrors it. Returns whether it went.
 */
async function takeBackRepeat(tx: Tx, doneId: string): Promise<boolean> {
  const made = await latestRepeatCopy(tx, doneId);
  if (!made || made.madeInAsana) return false;
  // Lock the copy, so a comment, file or edit landing now either commits
  // first and is seen below, or waits and then finds the copy gone.
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Task" WHERE "id" = ${made.nextId} FOR UPDATE`;
  if (locked.length === 0) return false;
  // And its email rows, so a send run can't take one between this read and the delete.
  const emails = await tx.$queryRaw<{ sentAt: Date | null; attempts: number }[]>`
    SELECT "sentAt", "attempts" FROM "NotificationOutbox" WHERE "taskId" = ${made.nextId} FOR UPDATE`;
  const copy = await tx.task.findUnique({
    where: { id: made.nextId },
    select: {
      status: true,
      appEditedAt: true,
      asanaId: true,
      events: { select: { kind: true } },
      _count: { select: { attachments: true, readStates: true, checklist: { where: { done: true } } } },
    },
  });
  if (!copy) return false;
  const untouched = isUntouchedCopy({
    status: copy.status,
    appEditedAt: copy.appEditedAt,
    asanaId: copy.asanaId,
    eventKinds: copy.events.map((e) => e.kind),
    attachments: copy._count.attachments,
    checkedItems: copy._count.checklist,
    readStates: copy._count.readStates,
    emails,
  });
  if (!untouched) return false;
  await tx.task.delete({ where: { id: made.nextId } });
  await tx.taskEvent.delete({ where: { id: made.eventId } });
  return true;
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
  /**
   * With `assignee`: the assignee the caller's screen showed. When someone
   * else has reassigned the task since, nothing changes and
   * AssigneeChangedError says who has it now (unless it already has the one
   * asked for).
   */
  expectedAssignee?: Assignee;
  waitingOn?: string | null;
  repeatRule?: RepeatRule | null;
}

/** The refusal for a reassignment from a stale screen: who made the last assignment, and who has the task now. */
async function assigneeChanged(tx: Tx, t: Task): Promise<AssigneeChangedError> {
  // Whoever gave it to the person who has it now, not a later line that didn't
  // (an Asana story kept as a conflict, say), as setStatus filters on `to`.
  const to = t.assigneeUserId
    ? { data: { path: ["to", "userId"], equals: t.assigneeUserId } }
    : t.assigneeContactId
      ? { data: { path: ["to", "contactId"], equals: t.assigneeContactId } }
      : {};
  const last = await tx.taskEvent.findFirst({
    where: { taskId: t.id, kind: "ASSIGNED", ...to },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { actorLabel: true },
  });
  const user = t.assigneeUserId ? await tx.user.findUnique({ where: { id: t.assigneeUserId }, select: { name: true, email: true } }) : null;
  const contact = t.assigneeContactId ? await tx.contact.findUnique({ where: { id: t.assigneeContactId }, select: { fullName: true } }) : null;
  // A name-only assignee (an Asana pick the load couldn't match) still has a name.
  const name = user ? user.name || user.email : (contact?.fullName ?? t.assigneeName ?? null);
  return new AssigneeChangedError(firstName(last?.actorLabel), name);
}

/**
 * Field edits. Only keys present are written; null clears. Each changed field
 * adds an internal timeline line; the contractor hears about assignment,
 * notes and a moved Target date. A reassignment can carry the assignee the
 * screen showed (`expectedAssignee`), and is refused when that's out of date.
 */
export async function patchTask(tx: Tx, taskId: string, patch: TaskPatch, p: Principal, now = new Date()): Promise<Task> {
  if (p.kind === "contractor") throw new TaskRuleError("Contractors can't edit job details.");
  // A reassignment locks the row first, as setStatus does, so two at once (both
  // partners, two tabs) run one after the other and the second sees the first.
  if (patch.assignee !== undefined) await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${taskId} FOR NO KEY UPDATE`;
  const before = await tx.task.findUnique({ where: { id: taskId } });
  if (!before) throw new TaskRuleError("That task no longer exists.");
  if (
    patch.assignee !== undefined &&
    patch.expectedAssignee !== undefined &&
    !isAssignee(before, patch.expectedAssignee) &&
    !isAssignee(before, patch.assignee)
  ) {
    throw await assigneeChanged(tx, before);
  }

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
  // Setting a repeat on an undated task dates it to the first occurrence, logged like any due change.
  const dueDate = patch.repeatRule
    ? repeatDue(patch.repeatRule, patch.dueDate !== undefined ? patch.dueDate : toYmd(before.dueDate), todayYmdEastern(now))
    : patch.dueDate;
  if (dueDate !== undefined) {
    const d = ymdToDate(dueDate);
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
    if (newContactId) await notify(tx, after, p, { kind: "ASSIGNED", visibility: "SHARED" }, assignedSummary(after, now), now);
  } else if (after.assigneeContactId) {
    // Same contractor: tell them about what they can see change.
    const targetBefore = toYmd(targetDate(before));
    const targetAfter = toYmd(targetDate(after));
    if (targetBefore !== targetAfter) {
      const to = targetAfter ? emailDay(targetAfter, now) : "no date";
      await notify(tx, after, p, { kind: "TARGET", visibility: "SHARED" }, `moved "${after.title}" to ${to}`, now);
    }
    if (events.some((e) => e.kind === "NOTES")) {
      await notify(tx, after, p, { kind: "NOTES", visibility: "SHARED" }, `updated the notes on "${after.title}"`, now);
    }
  }
  return after;
}

/**
 * A unit renamed on its property (properties/service.ts replaceUnits): every
 * task there that names it by its old label (case-insensitive, as the
 * lockbox lookup matches) moves to the new one, so a job keeps its lockbox
 * code (D21) and its unit reads the same everywhere. Each goes through
 * patchTask, so it gets the usual internal unit line. Rows are matched
 * against the labels as they were, so two units swapping names swap their
 * tasks. Returns the ids of the tasks it changed.
 */
export async function renameTaskUnits(
  tx: Tx,
  propertyId: string,
  renames: readonly UnitRename[],
  p: Principal,
  now = new Date(),
): Promise<string[]> {
  if (renames.length === 0) return [];
  const tasks = await tx.task.findMany({
    where: { propertyId, OR: renames.map((r) => ({ unitLabel: { equals: r.from, mode: "insensitive" as const } })) },
    select: { id: true, unitLabel: true },
  });
  const changed: string[] = [];
  for (const t of tasks) {
    const to = renamedLabel(renames, t.unitLabel);
    if (!to) continue;
    await patchTask(tx, t.id, { unitLabel: to }, p, now);
    changed.push(t.id);
  }
  return changed;
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
  const audienceContactId = writeAudience(kindOf(p), task.assigneeContactId);
  const event = await addEvent(tx, taskId, p, { kind: "COMMENT", visibility, body: body || null, audienceContactId });
  let linked = 0;
  if (input.attachmentIds?.length) {
    ({ count: linked } = await tx.taskAttachment.updateMany({
      where: { id: { in: input.attachmentIds }, taskId, eventId: null },
      data: { eventId: event.id, visibility, audienceContactId },
    }));
  }
  // Files only, and another post took them first (two sends of the same held
  // photos at once): refuse, so the losing side leaves no empty update behind.
  if (!body && linked === 0) throw new TaskRuleError("Write something or add a photo.");
  await tx.task.update({ where: { id: taskId }, data: editStamp(p, now) });
  const photos = linked ? ` (+${linked} file${linked > 1 ? "s" : ""})` : "";
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
  const audienceContactId = writeAudience(kindOf(p), task.assigneeContactId);
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
      audienceContactId,
      width: meta.width ?? null,
      height: meta.height ?? null,
      durationSec: meta.durationSec ?? null,
      thumbPathname: meta.thumbPathname ?? null,
      posterPathname: meta.posterPathname ?? null,
    },
  });
  if (opts.standalone !== false) {
    const ev = await addEvent(tx, taskId, p, {
      kind: "ATTACHMENT",
      visibility,
      audienceContactId,
      data: { attachmentId: att.id, filename: att.filename },
    });
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

export async function addChecklistItem(tx: Tx, taskId: string, title: string, p: Principal, now = new Date()) {
  if (p.kind === "contractor") throw new TaskRuleError("Contractors can't add checklist items yet.");
  const t = title.trim();
  if (!t) throw new TaskRuleError("The item needs a name.");
  const last = await tx.taskChecklistItem.findFirst({ where: { taskId }, orderBy: { position: "desc" }, select: { position: true } });
  const item = await tx.taskChecklistItem.create({ data: { taskId, title: t, position: (last?.position ?? -1) + 1 } });
  // Stamped like every other edit, so a repeat copy someone added to counts
  // as touched and isn't taken back when the finished task reopens.
  await tx.task.update({ where: { id: taskId }, data: editStamp(p, now) });
  return item;
}

// ---------------------------------------------------------------------------
// Checklist edits: rename, remove, and take a removal back
// ---------------------------------------------------------------------------

const CHECKLIST_TITLE_MAX = 300;

/** What a removal hands back, as plain JSON, so Undo can put the row back exactly. */
export type ChecklistSnapshot = {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  /** An ISO instant, or null while it isn't ticked. */
  doneAt: string | null;
  doneByUserId: string | null;
  doneByContactId: string | null;
  assigneeLabel: string | null;
  /** An ISO instant, from an imported Asana subtask; display only. */
  dueDate: string | null;
  position: number;
  /** An imported item's Asana subtask, so the next Asana import updates it instead of adding it again. */
  asanaGid: string | null;
  /** An ISO instant. The page orders by position, then this. */
  createdAt: string;
};

/** The edits below that write an event name what they did; the Activity line reads `action`. */
export type ChecklistAction = "renamed" | "removed" | "restored";

/** Contractors tick items off; changing the list itself is staff only, like Add item. */
function checklistStaffOnly(p: Principal): void {
  if (p.kind === "contractor") throw new TaskRuleError("Contractors can't change checklist items yet.");
}

/**
 * One CHECKLIST event saying what happened, `{ action, itemId, title, from, to }`,
 * and the task's edit stamp, like every other edit, so a repeat copy someone
 * changed counts as touched. No email goes out for these.
 */
async function recordChecklistEdit(
  tx: Tx,
  taskId: string,
  p: Principal,
  action: ChecklistAction,
  item: { id: string; title: string },
  change: { from: string | null; to: string | null },
  now: Date,
): Promise<void> {
  await addEvent(tx, taskId, p, {
    kind: "CHECKLIST",
    data: { action, itemId: item.id, title: item.title, from: change.from, to: change.to },
  });
  await tx.task.update({ where: { id: taskId }, data: editStamp(p, now) });
}

/**
 * Lock the item's row before reading it, as setStatus locks a task: a tick, a
 * rename or a second Remove landing at the same moment waits its turn and
 * then sees the result. Without it a Remove could snapshot an item a tick had
 * just changed (Undo would bring it back unticked), and two Removes would
 * both read the row and the second delete would fail on a row already gone.
 * An item that is already gone locks nothing, and the read after it says so.
 */
async function lockChecklistItem(tx: Tx, itemId: string): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM "TaskChecklistItem" WHERE "id" = ${itemId} FOR NO KEY UPDATE`;
}

/** The title an edit saves: trimmed to one line of text, never empty, no longer than Add item allows. */
export function checklistTitle(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) throw new TaskRuleError("Enter a name for the item.");
  if (t.length > CHECKLIST_TITLE_MAX) throw new TaskRuleError(`Use ${CHECKLIST_TITLE_MAX} characters or fewer.`);
  return t;
}

/** Rename an item. The same title (once tidied) writes nothing and adds no line to Activity. */
export async function renameChecklistItem(tx: Tx, itemId: string, title: string, p: Principal, now = new Date()): Promise<TaskChecklistItem> {
  checklistStaffOnly(p);
  const next = checklistTitle(title);
  await lockChecklistItem(tx, itemId);
  const item = await tx.taskChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw new TaskRuleError("That checklist item no longer exists.");
  if (item.title === next) return item;
  const updated = await tx.taskChecklistItem.update({ where: { id: itemId }, data: { title: next } });
  await recordChecklistEdit(tx, item.taskId, p, "renamed", { id: itemId, title: next }, { from: item.title, to: next }, now);
  return updated;
}

/**
 * Remove an item. Returns the snapshot Undo needs (the row is deleted, so
 * `restoreChecklistItem` re-creates it with the same id and place). An item
 * already gone is a rule error: the checklist moved on.
 */
export async function removeChecklistItem(tx: Tx, itemId: string, p: Principal, now = new Date()): Promise<ChecklistSnapshot> {
  checklistStaffOnly(p);
  await lockChecklistItem(tx, itemId);
  const item = await tx.taskChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw new TaskRuleError("That checklist item no longer exists.");
  await tx.taskChecklistItem.delete({ where: { id: itemId } });
  await recordChecklistEdit(tx, item.taskId, p, "removed", { id: itemId, title: item.title }, { from: item.title, to: null }, now);
  return {
    id: item.id,
    taskId: item.taskId,
    title: item.title,
    done: item.done,
    doneAt: item.doneAt ? item.doneAt.toISOString() : null,
    doneByUserId: item.doneByUserId,
    doneByContactId: item.doneByContactId,
    assigneeLabel: item.assigneeLabel,
    dueDate: item.dueDate ? item.dueDate.toISOString() : null,
    position: item.position,
    asanaGid: item.asanaGid,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * Undo a removal: the item comes back with its id, place, tick and Asana
 * link. An item that is already back (a second Undo, another tab, or an
 * Asana import that brought its subtask in again) is left as it is; a task
 * that is gone can't take it.
 */
export async function restoreChecklistItem(tx: Tx, snapshot: ChecklistSnapshot, p: Principal, now = new Date()): Promise<void> {
  checklistStaffOnly(p);
  const existing = await tx.taskChecklistItem.findUnique({ where: { id: snapshot.id } });
  if (existing) return;
  if (snapshot.asanaGid && (await tx.taskChecklistItem.findUnique({ where: { asanaGid: snapshot.asanaGid } }))) return;
  const task = await tx.task.findUnique({ where: { id: snapshot.taskId }, select: { id: true } });
  if (!task) throw new TaskRuleError("This task is gone, so the item can't come back.");
  await tx.taskChecklistItem.create({
    data: {
      id: snapshot.id,
      taskId: snapshot.taskId,
      title: snapshot.title,
      done: snapshot.done,
      doneAt: snapshot.doneAt ? new Date(snapshot.doneAt) : null,
      doneByUserId: snapshot.doneByUserId,
      doneByContactId: snapshot.doneByContactId,
      assigneeLabel: snapshot.assigneeLabel,
      dueDate: snapshot.dueDate ? new Date(snapshot.dueDate) : null,
      position: snapshot.position,
      asanaGid: snapshot.asanaGid,
      createdAt: new Date(snapshot.createdAt),
    },
  });
  await recordChecklistEdit(tx, snapshot.taskId, p, "restored", { id: snapshot.id, title: snapshot.title }, { from: null, to: snapshot.title }, now);
}
