import { randomUUID } from "node:crypto";
import { Prisma, type Task, type TaskAttachment, type TaskChecklistItem, type TaskEvent, type TaskEventKind, type TaskStatus, type Visibility } from "@prisma/client";
import { fmtDay, todayYmdEastern, toYmd, ymdToDate, type Ymd } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { renamedLabel, type UnitRename } from "@/lib/property-types";
import { STATUS_LABEL, isActiveStatus } from "@/lib/task-scope";
import { hasPinnedDay, isUntouchedCopy, leapDayRule, nextRepeatDue, parseRepeatRule, repeatCreatedCopy, repeatDue, repeatFrom, ruleKey, type RepeatRule } from "./repeat";
import { copySlot } from "./repeat-slot";
import {
  APPROVAL_UNDO_MS,
  BUNDLE_MAX_MS,
  BUNDLE_QUIET_MS,
  canSetStatus,
  notifyAudience,
  statusEventVisibility,
  targetDate,
  targetIsVisit,
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

/**
 * Someone saved the notes since the caller's screen loaded them (another tab,
 * the other partner), so nothing was written: a stale screen never writes
 * over newer notes, as with the status and the assignee. `by` is who saved
 * them by first name (null when no line says), `mine` that it was the caller
 * in another tab, `at` when, and `current` the notes as they are now, for the
 * field's "Keep" and "Save mine".
 */
export class NotesChangedError extends TaskRuleError {
  constructor(
    readonly by: string | null,
    readonly mine: boolean,
    readonly at: Date,
    readonly current: string,
  ) {
    super(`${mine ? "You" : by || "Someone"} changed the notes.`);
    this.name = "NotesChangedError";
  }
}

const kindOf = (p: Principal): PrincipalKind => p.kind;

/**
 * Who made a change the caller's screen didn't see, for a refusal's words:
 * "You" when it was the caller (another tab of theirs, where two people
 * share a first name the name alone reads as someone else), otherwise the
 * first name on the line. Null when no line says.
 */
export function changedBy(p: Principal, line: { actorLabel: string; actorUserId?: string | null; actorContactId?: string | null } | null | undefined): string | null {
  if (!line) return null;
  if (isActor(p, line)) return "You";
  return firstName(line.actorLabel) || null;
}

function isActor(p: Principal, line: { actorUserId?: string | null; actorContactId?: string | null }): boolean {
  if (p.kind === "staff") return !!line.actorUserId && line.actorUserId === p.userId;
  if (p.kind === "contractor") return !!line.actorContactId && line.actorContactId === p.contactId;
  return false;
}

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
  /**
   * The event this line is about (a comment, a file post, a status change),
   * decided per item. The drain (notifications/outbox.ts) re-reads it when
   * the row is claimed, so an edit or a delete inside the bundle window
   * changes the email (activity 2.5), and a contractor's take-back
   * (takeBackContractorPost) finds exactly its own line in a row nobody has
   * claimed. Optional: rows queued before it send as stored, and a row can
   * mix both.
   */
  eventId?: string;
  /** A send-back's note: the note comment's id. Its text sits inside the STATUS summary, so the drain rebuilds or strips it. */
  noteEventId?: string;
  /** TARGET: the date that moved is the booked visit, not the due date ("moved the visit to Fri, Oct 30"). */
  visit?: boolean;
}

/** What a line carries beside its summary (OutboxItem's optional fields). */
type ItemRefs = Pick<OutboxItem, "eventId" | "noteEventId" | "visit">;

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

/**
 * Route one change to whoever should hear about it (rules.ts notifyAudience).
 * Says who it was queued for, so a caller can tell the person what happens
 * next ("Zack gets an email"): null when nobody hears.
 */
async function notify(
  tx: Tx,
  task: NotifyTask,
  p: Principal,
  change: NotifyChange,
  summary: string,
  now: Date,
  refs: ItemRefs = {},
): Promise<"contractor" | "staff" | null> {
  const hasLogin = await contractorHasLogin(tx, task.assigneeContactId);
  const audience = notifyAudience(kindOf(p), change, { contractorHasLogin: hasLogin });
  if (!audience) return null;
  const item: OutboxItem = { kind: change.kind, actorLabel: p.label, summary, at: now.toISOString(), ...refs };
  if (audience === "contractor" && task.assigneeContactId) {
    await enqueue(tx, { contactId: task.assigneeContactId }, task.id, item, now);
  } else if (audience === "staff") {
    // In id order, so two writes queueing for the partners take their rows the same way round.
    const staff = await tx.user.findMany({ where: { passwordHash: { not: null } }, select: { id: true }, orderBy: { id: "asc" } });
    for (const s of staff) await enqueue(tx, { userId: s.id }, task.id, item, now);
  }
  return audience;
}

// ---------------------------------------------------------------------------
// Deal timeline (tasks against a deal also log there)
// ---------------------------------------------------------------------------

/**
 * `taskEventId` ties the line to the event it reports (`data.taskEventId`), so
 * Approve's Undo can take its "Task completed" back (undoApproval). The deal
 * log reads only `field`, `from`, `to` and `clientId` from `data`.
 */
async function logDeal(tx: Tx, dealId: string | null, p: Principal, line: string, now: Date, taskEventId?: string): Promise<void> {
  if (!dealId) return;
  await tx.dealNote.create({
    data: { dealId, body: `${line}  ·  ${p.label}`, noteDate: now, source: "change", ...(taskEventId ? { data: { taskEventId } } : {}) },
  });
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
  /** A shared note to the contractor, e.g. why a job was sent back from Review; a contractor's Mark done note. */
  note?: string | null;
  /**
   * Files already recorded for the change's note: a contractor's Mark done
   * photos. They are linked to the note comment the way addComment links
   * them, and a note that is only photos is still written.
   */
  attachmentIds?: string[];
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
  /** The STATUS line this change wrote (Approve's Undo names it). */
  statusEventId: string;
  /** The note comment written with it, whose `data.statusEventId` names the status: Activity shows the two as one decision. Null with no note and no files. */
  noteEventId: string | null;
  /** The change queued an email to the assigned contractor, so the toast can say "Zack gets an email". */
  emailsContractor: boolean;
}

/**
 * The refusal for a change from a stale screen: whoever moved the task to
 * where it is now, not a later change that didn't, and "You" when that was
 * the caller in another tab.
 */
async function taskChanged(tx: Tx, taskId: string, current: TaskStatus, p: Principal): Promise<TaskChangedError> {
  const last = await tx.taskEvent.findFirst({
    where: { taskId, kind: "STATUS", deletedAt: null, data: { path: ["to"], equals: current } },
    orderBy: { createdAt: "desc" },
    select: { actorLabel: true, actorUserId: true, actorContactId: true },
  });
  return new TaskChangedError(current, changedBy(p, last));
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
  if (opts.expected && before.status !== opts.expected) throw await taskChanged(tx, taskId, before.status, p);
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
  const statusEvent = await addEvent(tx, taskId, p, {
    kind: "STATUS",
    visibility,
    audienceContactId,
    data: { from: before.status, to, ...(waitingOn ? { waitingOn } : {}), ...(to === "SCHEDULED" ? { scheduledFor: toYmd(scheduledFor) } : {}) },
  });
  // The note (and any photos) is its own comment, tied to the status by id so Activity shows the two as one decision.
  const note = opts.note?.trim();
  const noteEvent =
    note || opts.attachmentIds?.length
      ? await writeComment(tx, taskId, p, {
          body: note ?? "",
          visibility: "SHARED",
          audienceContactId,
          attachmentIds: opts.attachmentIds,
          data: { statusEventId: statusEvent.id },
          // A contractor's Mark done note has always been written just before the move to Review, and the
          // "At finish" photo set finds it that way (tasks/media.ts latestMarkDone): a millisecond ahead keeps it.
          ...(p.kind === "contractor" ? { createdAt: new Date(statusEvent.createdAt.getTime() - 1) } : {}),
        })
      : null;

  const summary = statusSummary({ title: task.title, from: before.status, to, actor: p.kind, note, scheduledFor }, now);
  // A contractor's note is a line of its own in the partners' email, ahead of "marked it done". A partner's
  // send-back note is already inside the status line (statusSummary), so the status line names it and the
  // drain re-reads it; it is never listed twice.
  if (noteEvent && p.kind === "contractor") {
    await notify(tx, task, p, { kind: "COMMENT", visibility: "SHARED" }, commentSummary(note ?? "", noteEvent.linked), now, { eventId: noteEvent.event.id });
  }
  const audience = await notify(tx, task, p, { kind: "STATUS", visibility }, summary, now, {
    eventId: statusEvent.id,
    ...(noteEvent && p.kind !== "contractor" && note ? { noteEventId: noteEvent.event.id } : {}),
  });

  if (to === "DONE" || reopening) {
    await logDeal(tx, task.dealId, p, `Task ${to === "DONE" ? "completed" : "reopened"}: ${task.title}`, now, to === "DONE" ? statusEvent.id : undefined);
  }
  const nextTaskId = to === "DONE" && before.status !== "DONE" ? await createNextRepeat(tx, task, p, now) : null;
  const nextDue = nextTaskId ? toYmd((await tx.task.findUnique({ where: { id: nextTaskId }, select: { dueDate: true } }))?.dueDate) : null;
  // Done to Canceled isn't a reopen: the copy stays.
  if (before.status === "DONE" && isActiveStatus(to)) await takeBackRepeat(tx, taskId);
  return { task, nextTaskId, nextDue, statusEventId: statusEvent.id, noteEventId: noteEvent?.event.id ?? null, emailsContractor: audience === "contractor" };
}

type ApprovalEmail = { sentAt: Date | null; lastError: string | null; openKey: string | null; attempts: number };

/**
 * What an approval's email rows say about its Undo, as one toast line, or
 * null when nothing stops it. Sent (`sentAt` with no `lastError`): Zack has
 * it. On its way (`sentAt` null, claimed, a try spent): a send run has it,
 * or it failed and waits to try again, and either way it may reach him. A
 * row closed without sending (`sentAt` with a `lastError`: nothing left in
 * it, no login, given up) never reached him, so it doesn't stop the Undo.
 */
export function approvalEmailRefusal(rows: readonly ApprovalEmail[]): string | null {
  if (rows.some((e) => e.sentAt !== null && e.lastError === null)) return "Email already sent. Change the status.";
  if (rows.some((e) => e.sentAt === null && e.openKey === null && e.attempts > 0)) return "The email is on its way. Change the status.";
  return null;
}

/**
 * Approve's Undo (activity 2.8): the job goes back to Review as if it had not
 * been approved. A plain `setStatus(REVIEW)` would not do: it writes a Shared
 * status line, so Zack is emailed "moved it to Review" and the portal shows
 * "Connor marked it done", and it becomes the latest move to Review, so the
 * contractor loses the late-upload hour after his own Mark done. This writes
 * no status line of its own. It soft-deletes the Done line (the events stay
 * in the database; the timeline hides what was undone at once, and the drain
 * drops the approval from an email still waiting, since its item names that
 * event), reopens the task, and takes back the next repeat copy while nobody
 * has touched it. The deal's "Task completed" line goes too when it names the
 * approval, and then no "Task reopened" is written.
 *
 * Staff only, and only the partner who approved, within APPROVAL_UNDO_MS:
 * the toast stays up while hovered or focused, so the server keeps the
 * limit. Refused, with who moved it, when the task is no longer Done or the
 * approval is not the latest status line, and once the approval's email is
 * sent or on its way (approvalEmailRefusal): by then Zack has been told, or
 * may be, and the status menu is the honest way back. A row the drain closed
 * without sending doesn't stop it. A retry of an Undo that already went
 * through is a quiet success. Lock order: this task, then its email rows
 * naming the approval (id order), then takeBackRepeat's copy and the copy's
 * email rows (id order). The drain locks email rows only.
 */
export async function undoApproval(tx: Tx, taskId: string, approvedEventId: string, p: Principal, now = new Date()): Promise<{ task: Task }> {
  if (p.kind !== "staff") throw new TaskRuleError("Only staff can undo an approval.");
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${taskId} FOR NO KEY UPDATE`;
  const before = await tx.task.findUnique({ where: { id: taskId } });
  if (!before) throw new TaskRuleError("That task no longer exists.");
  // Only this function soft-deletes a STATUS line, and only for its approver: deleted and theirs means a retry of an Undo that went through.
  const undone = await tx.taskEvent.findFirst({
    where: { id: approvedEventId, taskId, kind: "STATUS", actorUserId: p.userId, deletedAt: { not: null } },
    select: { id: true },
  });
  if (undone) return { task: before };
  if (before.status !== "DONE") throw await taskChanged(tx, taskId, before.status, p);
  const latest = await tx.taskEvent.findFirst({
    where: { taskId, kind: "STATUS", deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, data: true, createdAt: true, actorUserId: true, actorLabel: true },
  });
  const fromReview = (latest?.data as { from?: unknown } | null)?.from === "REVIEW";
  if (!latest || latest.id !== approvedEventId || !fromReview) throw new TaskRuleError("This job changed after it was approved.");
  // Each refusal fits one toast line on a 375 phone, and names the way back: the status menu on the job page.
  if (latest.actorUserId !== p.userId) {
    const by = firstName(latest.actorLabel);
    throw new TaskRuleError(by ? `${by} approved this. Change the status.` : "Not yours to undo. Change the status.");
  }
  if (now.getTime() - latest.createdAt.getTime() > APPROVAL_UNDO_MS) throw new TaskRuleError("Too late to undo. Change the status.");
  // The approval's email rows, locked so a send run can't claim one between this check and the soft delete
  // below (approvalEmailRefusal says which rows stop the Undo).
  const emails = await tx.$queryRaw<ApprovalEmail[]>`
    SELECT "sentAt", "lastError", "openKey", "attempts" FROM "NotificationOutbox"
    WHERE "taskId" = ${taskId} AND "items" @> jsonb_build_array(jsonb_build_object('eventId', ${approvedEventId}::text))
    ORDER BY "id" FOR UPDATE`;
  const refusal = approvalEmailRefusal(emails);
  if (refusal) throw new TaskRuleError(refusal);
  const task = await tx.task.update({
    where: { id: taskId },
    data: { status: "REVIEW", completedAt: null, completedByUserId: null, completedByContactId: null, ...editStamp(p, now) },
  });
  await tx.taskEvent.update({ where: { id: approvedEventId }, data: { deletedAt: now } });
  const completedLine = task.dealId
    ? await tx.dealNote.updateMany({
        where: { dealId: task.dealId, source: "change", deletedAt: null, data: { path: ["taskEventId"], equals: approvedEventId } },
        data: { deletedAt: now },
      })
    : { count: 0 };
  // An approval whose line doesn't name it (written before lines did): the deal keeps it and hears of the reopen.
  if (completedLine.count === 0) await logDeal(tx, task.dealId, p, `Task reopened: ${task.title}`, now);
  await takeBackRepeat(tx, taskId);
  return { task };
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
 * A yearly rule finished on Feb 29 hands its copies the leap-day pin
 * (repeat.ts leapDayRule), so the series comes back to the 29th in the next
 * leap year instead of staying on Feb 28.
 * Exported for the Asana delta, which closes tasks completed in Asana
 * without going through setStatus.
 */
export async function createNextRepeat(tx: Tx, done: Task, p: Principal, now: Date): Promise<string | null> {
  const rule = leapDayRule(parseRepeatRule(done.repeatRule), toYmd(done.dueDate));
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
  // And its email rows, in id order as every outbox lock here, so a send run can't take one between this read and
  // the delete.
  const emails = await tx.$queryRaw<{ sentAt: Date | null; attempts: number }[]>`
    SELECT "sentAt", "attempts" FROM "NotificationOutbox" WHERE "taskId" = ${made.nextId} ORDER BY "id" FOR UPDATE`;
  const copy = await tx.task.findUnique({
    where: { id: made.nextId },
    select: {
      status: true,
      appEditedAt: true,
      asanaId: true,
      events: { select: { kind: true } },
      // Read states are the contractor's "opened in the portal"; a partner opening the copy (staff read state,
      // activity 2.6) doesn't touch it, or Undo on the Done toast would stop taking the copy back.
      _count: { select: { attachments: true, readStates: { where: { contactId: { not: null } } }, checklist: { where: { done: true } } } },
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
  /**
   * With `description`: the notes the caller's screen loaded (null or "" for
   * none). When someone saved other notes since, nothing changes and
   * NotesChangedError says who, when and what they hold now (unless they
   * already hold the words being saved). Compared as stored: trimmed.
   */
  expectedDescription?: string | null;
  waitingOn?: string | null;
  repeatRule?: RepeatRule | null;
}

/** Notes as patchTask stores and compares them: trimmed, with "" for none. */
const notesText = (v: string | null | undefined): string => v?.trim() || "";

/** The refusal for a notes save from a stale screen: who saved the notes last and when, and what they say now. */
async function notesChanged(tx: Tx, t: Task, p: Principal): Promise<NotesChangedError> {
  const last = await tx.taskEvent.findFirst({
    where: { taskId: t.id, kind: "NOTES", deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { actorLabel: true, actorUserId: true, actorContactId: true, createdAt: true },
  });
  const mine = !!last && isActor(p, last);
  return new NotesChangedError(mine ? null : changedBy(p, last), mine, last?.createdAt ?? t.updatedAt, notesText(t.description));
}

/** The refusal for a reassignment from a stale screen: who made the last assignment, and who has the task now. */
async function assigneeChanged(tx: Tx, t: Task, p: Principal): Promise<AssigneeChangedError> {
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
    select: { actorLabel: true, actorUserId: true, actorContactId: true },
  });
  const user = t.assigneeUserId ? await tx.user.findUnique({ where: { id: t.assigneeUserId }, select: { name: true, email: true } }) : null;
  const contact = t.assigneeContactId ? await tx.contact.findUnique({ where: { id: t.assigneeContactId }, select: { fullName: true } }) : null;
  // A name-only assignee (an Asana pick the load couldn't match) still has a name.
  const name = user ? user.name || user.email : (contact?.fullName ?? t.assigneeName ?? null);
  return new AssigneeChangedError(changedBy(p, last), name);
}

/**
 * Field edits. Only keys present are written; null clears. Each changed field
 * adds an internal timeline line; the contractor hears about assignment,
 * notes and a moved Target date. A reassignment can carry the assignee the
 * screen showed (`expectedAssignee`), and a notes save the notes it loaded
 * (`expectedDescription`); each is refused when that's out of date.
 */
export async function patchTask(tx: Tx, taskId: string, patch: TaskPatch, p: Principal, now = new Date()): Promise<Task> {
  if (p.kind === "contractor") throw new TaskRuleError("Contractors can't edit job details.");
  // A reassignment or a guarded notes save locks the row first, as setStatus does, so two at once (both
  // partners, two tabs) run one after the other and the second sees the first.
  const guarded = patch.assignee !== undefined || (patch.description !== undefined && patch.expectedDescription !== undefined);
  if (guarded) await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${taskId} FOR NO KEY UPDATE`;
  const before = await tx.task.findUnique({ where: { id: taskId } });
  if (!before) throw new TaskRuleError("That task no longer exists.");
  if (
    patch.assignee !== undefined &&
    patch.expectedAssignee !== undefined &&
    !isAssignee(before, patch.expectedAssignee) &&
    !isAssignee(before, patch.assignee)
  ) {
    throw await assigneeChanged(tx, before, p);
  }
  if (patch.description !== undefined && patch.expectedDescription !== undefined) {
    const stored = notesText(before.description);
    // Notes someone saved since the screen loaded them; already the words being saved is no conflict.
    if (stored !== notesText(patch.expectedDescription) && stored !== notesText(patch.description)) throw await notesChanged(tx, before, p);
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
      // The text before the save, so "View previous" can show it and Restore can put it back (activity 2.3 rule 6).
      // "" for notes that were empty, so a stored `from` always means the event can be undone.
      events.push({ kind: "NOTES", data: { from: before.description ?? "" } });
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
  if (patch.repeatRule !== undefined) {
    data.repeatRule = patch.repeatRule ?? Prisma.DbNull;
    // Turning repeats on, changing them or turning them off is a line of its own (activity 2.3 rule 9). Only a
    // rule that actually changes writes one: the editors send the rule on every save. Never from createTask,
    // createNextRepeat or the importer, which set a rule as the task is made.
    const was = parseRepeatRule(before.repeatRule);
    const rule = patch.repeatRule ? parseRepeatRule(patch.repeatRule) : null;
    if (ruleKey(was) !== ruleKey(rule)) events.push({ kind: "REPEAT", data: { from: was, to: rule } });
  }

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
      // Whether the date that moved is the booked visit, so the email says "visit" or "due date" the way the job
      // page labels it (a cleared date is the one the job had).
      const visit = targetIsVisit(targetAfter ? after : before);
      await notify(tx, after, p, { kind: "TARGET", visibility: "SHARED" }, `moved "${after.title}" to ${to}`, now, { visit });
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
    // One order for every save, so two saves on one property lock their tasks the same way round.
    orderBy: { id: "asc" },
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
  /**
   * Made in the browser for one send, stored on the event (`data.clientId`).
   * A second write with the same id by the same person on the same task
   * returns the first event and writes nothing, so a Retry after a timeout
   * that did post never posts, or emails, twice (activity 2.7).
   */
  clientId?: string;
  /**
   * A contractor's batch of files posting on its own, with no text (the
   * portal's "3 photos posted · Undo", uploads 2.7): the event carries
   * `data.batch`, and only a post marked so can be taken back
   * (takeBackContractorPost). Ignored on anything else, so a Mark done's
   * photos or a written update never are.
   */
  batch?: boolean;
}

/**
 * The email line for a comment; content.ts itemText reads it back: the text
 * (its first 140 characters) or "added files", then "(+3 files)" when it
 * linked any. takeBackContractorPost builds the same words to find a line
 * queued before items carried an eventId.
 */
export function commentSummary(body: string, files: number): string {
  const photos = files > 0 ? ` (+${files} file${files > 1 ? "s" : ""})` : "";
  return `${body ? `"${body.slice(0, 140)}"` : "added files"}${photos}`;
}

/**
 * One COMMENT and the files it carries. The files are linked only if they are
 * this task's and nobody has posted them yet; a post that was to be files only
 * and lost them to another post (two sends of the same held photos at once)
 * is refused, so the losing side leaves no empty update behind and the
 * transaction rolls back.
 */
async function writeComment(
  tx: Tx,
  taskId: string,
  p: Principal,
  c: {
    body: string;
    visibility: Visibility;
    audienceContactId: string | null;
    attachmentIds?: string[];
    data?: Prisma.InputJsonValue;
    createdAt?: Date;
  },
): Promise<{ event: TaskEvent; linked: number }> {
  const event = await addEvent(tx, taskId, p, {
    kind: "COMMENT",
    visibility: c.visibility,
    body: c.body || null,
    audienceContactId: c.audienceContactId,
    ...(c.data ? { data: c.data } : {}),
    ...(c.createdAt ? { createdAt: c.createdAt } : {}),
  });
  let linked = 0;
  if (c.attachmentIds?.length) {
    ({ count: linked } = await tx.taskAttachment.updateMany({
      where: { id: { in: c.attachmentIds }, taskId, eventId: null },
      data: { eventId: event.id, visibility: c.visibility, audienceContactId: c.audienceContactId },
    }));
  }
  if (!c.body && linked === 0) throw new TaskRuleError("Write something or add a photo.");
  return { event, linked };
}

/** A comment this person already posted with this `clientId` on this task, if any. */
async function priorSend(tx: Tx, taskId: string, p: Principal, clientId: string): Promise<TaskEvent | null> {
  return tx.taskEvent.findFirst({
    where: {
      taskId,
      kind: "COMMENT",
      ...(p.kind === "staff" ? { actorUserId: p.userId } : p.kind === "contractor" ? { actorContactId: p.contactId } : { actorLabel: p.label }),
      data: { path: ["clientId"], equals: clientId },
    },
  });
}

/**
 * Every send takes the task row first, before it reads the task or links a
 * file, as every other writer on a task does (setStatus, removeAttachment,
 * takeBackContractorPost, a comment's edit, delete and restore). A send that
 * linked its files first and stamped the task after (the portal's leave-page
 * flush and a batch post carry no clientId) would hold a file row a staff
 * Remove waits for while it waits for the task row the Remove holds, and
 * Postgres aborts one of them (40P01). Under the lock the task is read as it
 * is now, so a job approved a moment ago refuses a contractor's post, and a
 * reassignment that just landed decides who the comment is addressed to.
 * One send at a time per task also keeps a Retry in flight beside its
 * original from posting, and emailing, twice (`clientId`). NO KEY UPDATE,
 * never FOR UPDATE: the key-share locks a comment's own inserts take would
 * deadlock against it (40P01), as in setStatus.
 */
export async function addComment(tx: Tx, taskId: string, input: CommentInput, p: Principal, now = new Date()): Promise<TaskEvent> {
  const body = input.body.trim();
  // A Retry of photos alone that did post arrives with no files left to name (the portal passes only its
  // unposted ones), so with a clientId the empty check waits until the first send has been looked for.
  const empty = !body && !input.attachmentIds?.length;
  if (empty && !input.clientId) throw new TaskRuleError("Write something or add a photo.");
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${taskId} FOR NO KEY UPDATE`;
  const task = await tx.task.findUnique({ where: { id: taskId } });
  if (!task) throw new TaskRuleError("That task no longer exists.");
  if (p.kind === "contractor") await assertContractorAccess(tx, taskId, p.contactId);
  if (input.clientId) {
    // After the access check, so a contractor who lost the job never gets an earlier post back. Before the
    // closed-job check, so a Retry of an update that did post before the job closed gets that post back instead
    // of "This job is closed." and a send that never posted is still refused below.
    const prior = await priorSend(tx, taskId, p, input.clientId);
    if (prior) return prior;
  }
  if (p.kind === "contractor" && !isActiveStatus(task.status)) throw new TaskRuleError("This job is closed.");
  if (empty) throw new TaskRuleError("Write something or add a photo.");
  const visibility: Visibility = p.kind === "contractor" ? "SHARED" : (input.visibility ?? "INTERNAL");
  const audienceContactId = writeAudience(kindOf(p), task.assigneeContactId);
  // Only a contractor's files posting on their own are a batch, the one kind of post they can take back.
  const batch = input.batch === true && p.kind === "contractor" && !body;
  const { event, linked } = await writeComment(tx, taskId, p, {
    body,
    visibility,
    audienceContactId,
    attachmentIds: input.attachmentIds,
    ...(input.clientId || batch ? { data: { ...(input.clientId ? { clientId: input.clientId } : {}), ...(batch ? { batch: true } : {}) } } : {}),
  });
  await tx.task.update({ where: { id: taskId }, data: editStamp(p, now) });
  await notify(tx, task, p, { kind: "COMMENT", visibility }, commentSummary(body, linked), now, { eventId: event.id });
  return event;
}

// ---------------------------------------------------------------------------
// Edit, delete and restore a comment (activity 2.5)
// ---------------------------------------------------------------------------

/** The longest comment, matching the staff and portal actions. */
export const COMMENT_BODY_MAX = 20_000;

/**
 * Whether `p` wrote this event and may change it: staff by user, a contractor
 * by contact. Only rows written in the app or the portal count. Imported
 * Asana comments (a partner's carry `actorUserId` too) and system rows are
 * never anyone's to change, so the delta sync that mirrors them and the D25
 * re-check that keeps CSV rows stay true.
 */
function isCommentAuthor(e: Pick<TaskEvent, "actorUserId" | "actorContactId" | "source">, p: Principal): boolean {
  if (e.source !== "APP" && e.source !== "PORTAL") return false;
  if (p.kind === "staff") return e.actorUserId === p.userId;
  if (p.kind === "contractor") return e.actorContactId === p.contactId;
  return false;
}

/**
 * The comment `p` is changing, locked, after the checks every change makes:
 * it is a comment, it is theirs, and it is (`deleted: false`) or isn't
 * (`deleted: true`) deleted. A contractor must still have access to the job.
 * None of them recompute who sees it: visibility, audience, actor, source and
 * createdAt are fixed when the comment is written, so an edit or an Undo
 * can't show Zack's thread to whoever has the job now.
 *
 * The task row is locked before the comment's, as every writer on a task takes
 * it first (removeAttachment, takeBackContractorPost, addComment, setStatus).
 * A partner deleting a reply while another removes a photo on it would
 * otherwise each hold the row the other waits for (Postgres aborts one with
 * 40P01). The first read names the task and takes no lock; the second, once
 * both are held, is the one the checks use.
 */
async function ownComment(tx: Tx, eventId: string, p: Principal, { deleted }: { deleted: boolean | null }): Promise<TaskEvent> {
  const named = await tx.taskEvent.findUnique({ where: { id: eventId }, select: { taskId: true } });
  if (!named) throw new TaskRuleError("That comment no longer exists.");
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${named.taskId} FOR NO KEY UPDATE`;
  await tx.$executeRaw`SELECT 1 FROM "TaskEvent" WHERE "id" = ${eventId} FOR NO KEY UPDATE`;
  const ev = await tx.taskEvent.findUnique({ where: { id: eventId } });
  if (!ev || ev.kind !== "COMMENT") throw new TaskRuleError("That comment no longer exists.");
  if (!isCommentAuthor(ev, p)) throw new TaskRuleError("You can only change your own comments.");
  if (deleted === false && ev.deletedAt) throw new TaskRuleError("That comment was deleted.");
  if (p.kind === "contractor") await assertContractorAccess(tx, ev.taskId, p.contactId);
  return ev;
}

/**
 * Save new text on your own comment. The card shows "edited" (`editedAt`).
 * Nothing is emailed: the drain re-reads the comment when a row is claimed,
 * so an edit inside the bundle window is what Zack receives, and one after it
 * is the web page's version only. Files added with the edit take the
 * comment's own visibility and audience. Saving the same text writes
 * nothing; saving no text on a comment with no files is refused.
 */
export async function editComment(
  tx: Tx,
  eventId: string,
  input: { body: string; attachmentIds?: string[] },
  p: Principal,
  now = new Date(),
): Promise<TaskEvent> {
  const body = input.body.trim();
  if (body.length > COMMENT_BODY_MAX) throw new TaskRuleError(`Use ${COMMENT_BODY_MAX.toLocaleString("en-US")} characters or fewer.`);
  const ev = await ownComment(tx, eventId, p, { deleted: false });
  const kept = await tx.taskAttachment.count({ where: { eventId, deletedAt: null } });
  let added = 0;
  if (input.attachmentIds?.length) {
    ({ count: added } = await tx.taskAttachment.updateMany({
      where: { id: { in: input.attachmentIds }, taskId: ev.taskId, eventId: null },
      data: { eventId, visibility: ev.visibility, audienceContactId: ev.audienceContactId },
    }));
  }
  if (!body && kept + added === 0) throw new TaskRuleError("Add some text, or delete the comment.");
  if (body === (ev.body ?? "") && added === 0) return ev;
  const updated = await tx.taskEvent.update({ where: { id: eventId }, data: { body: body || null, editedAt: now } });
  await tx.task.update({ where: { id: ev.taskId }, data: editStamp(p, now) });
  return updated;
}

/**
 * Delete your own comment, softly: `deletedAt` is set, the card becomes a
 * staff-only line, and the files it carries go with it, stamped with the
 * event's exact `deletedAt` and still pointing at it, so Undo can bring back
 * those files and never one a person took off earlier. The portal's file
 * checks read only the file's own `deletedAt`, which is why they are marked
 * here and not hidden by the comment alone. Never a hard delete: an imported
 * comment would come back with the next Asana delta, and Undo needs the rows.
 * The drain drops the comment from any email still waiting.
 */
export async function deleteComment(
  tx: Tx,
  eventId: string,
  p: Principal,
  now = new Date(),
  seenBy?: readonly string[],
): Promise<{ taskId: string; deletedAt: Date }> {
  const ev = await ownComment(tx, eventId, p, { deleted: false });
  // `seenBy`: the contractors who could have read it, decided now while it is known (delivery.contactsWhoSaw).
  // The portal's "removed a comment" line reads only this, so the comment's text is never needed for it.
  const kept = ev.data && typeof ev.data === "object" && !Array.isArray(ev.data) ? (ev.data as Prisma.JsonObject) : {};
  await tx.taskEvent.update({ where: { id: eventId }, data: { deletedAt: now, ...(seenBy ? { data: { ...kept, seenBy: [...seenBy] } } : {}) } });
  // The files that are still up. A file a person took off earlier keeps its own stamp.
  await tx.taskAttachment.updateMany({ where: { eventId, deletedAt: null }, data: { deletedAt: now } });
  await tx.task.update({ where: { id: ev.taskId }, data: editStamp(p, now) });
  return { taskId: ev.taskId, deletedAt: now };
}

/**
 * Undo a delete: the comment comes back, with the files that went with it
 * (the ones stamped with its exact `deletedAt`). A comment that is back
 * already (a second Undo, another tab) is left as it is.
 */
export async function restoreComment(tx: Tx, eventId: string, p: Principal, now = new Date()): Promise<{ taskId: string }> {
  const ev = await ownComment(tx, eventId, p, { deleted: null });
  if (!ev.deletedAt) return { taskId: ev.taskId };
  await tx.taskAttachment.updateMany({ where: { eventId, deletedAt: ev.deletedAt }, data: { deletedAt: null } });
  await tx.taskEvent.update({ where: { id: eventId }, data: { deletedAt: null } });
  await tx.task.update({ where: { id: ev.taskId }, data: editStamp(p, now) });
  return { taskId: ev.taskId };
}

// ---------------------------------------------------------------------------
// A contractor's batch post, taken back (uploads 2.7, question 5)
// ---------------------------------------------------------------------------

/**
 * How far an older outbox item's time may sit from its post's and still be
 * that post's line (addComment stamps the two a moment apart). Only for items
 * queued before they carried an eventId.
 */
export const POST_ITEM_SLACK_MS = 5_000;

/** The line a post queued: its event, and the words and time to know an older line by. */
export interface PostLine {
  eventId: string;
  actorLabel: string;
  summary: string;
  at: Date;
}

const isItem = (i: unknown): i is Record<string, unknown> => !!i && typeof i === "object" && !Array.isArray(i);

/**
 * A bundle's items without the post's line, or null when it holds none. The
 * line is the COMMENT item carrying the post's eventId. A row can mix new and
 * old items (an insert appends to an open row), so when no item carries it,
 * an item with no eventId is matched the old way: a COMMENT by the same
 * person with the same words, stamped within POST_ITEM_SLACK_MS of the post,
 * the nearest one. An item that names another event is never taken, so a
 * second post of the same size moments later keeps its line.
 */
export function withoutPostLine(items: unknown, post: PostLine): unknown[] | null {
  if (!Array.isArray(items)) return null;
  const own = (i: unknown) => isItem(i) && i.kind === "COMMENT" && i.eventId === post.eventId;
  if (items.some(own)) return items.filter((i) => !own(i));
  let nearest = -1;
  let best = Infinity;
  items.forEach((i, n) => {
    if (!isItem(i) || i.eventId !== undefined) return;
    if (i.kind !== "COMMENT" || i.actorLabel !== post.actorLabel || i.summary !== post.summary) return;
    const gap = Math.abs((typeof i.at === "string" ? Date.parse(i.at) : NaN) - post.at.getTime());
    if (gap <= POST_ITEM_SLACK_MS && gap < best) {
      best = gap;
      nearest = n;
    }
  });
  return nearest < 0 ? null : items.filter((_, n) => n !== nearest);
}

/**
 * Takes the post's line out of the bundles still open for it, so the email
 * never says "Zack added files" for an update that is gone; a bundle left
 * empty is deleted. Only a row with its openKey set and never tried: a send
 * run clears openKey when it claims a row, so a row being sent, retried or
 * already sent is left exactly as it is (its email may be out, and the run
 * writes to it after). Each row is locked first, in id order, and a claim
 * waiting on that lock finds the row as this left it.
 */
async function dropPostLine(tx: Tx, taskId: string, post: PostLine): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string; items: unknown }[]>`
    SELECT "id", "items" FROM "NotificationOutbox"
    WHERE "taskId" = ${taskId} AND "sentAt" IS NULL AND "openKey" IS NOT NULL AND "attempts" = 0
    ORDER BY "id"
    FOR UPDATE`;
  for (const row of rows) {
    const kept = withoutPostLine(row.items, post);
    if (!kept) continue;
    const open = { id: row.id, sentAt: null, openKey: { not: null }, attempts: 0 } satisfies Prisma.NotificationOutboxWhereInput;
    if (kept.length === 0) await tx.notificationOutbox.deleteMany({ where: open });
    else await tx.notificationOutbox.updateMany({ where: open, data: { items: kept as Prisma.InputJsonArray } });
  }
}

/**
 * A contractor takes back the batch they just posted (the portal's "3 photos
 * posted · Undo"): the update and its files are soft-deleted, so they leave
 * the timeline, the grids and the "2 new" counts, and its line leaves the
 * unsent email (dropPostLine). Only their own post marked `batch` by
 * addComment (never a Mark done's photos or a written update), only on a job
 * still active, and only while `undoable` says the window is open
 * (portal/job-view.ts undoWindowOpen).
 *
 * The task row is locked first, as setStatus does: every write that queues an
 * email updates the task before it touches the outbox, so a post landing now
 * either finishes first or waits for this, and the two never hold each
 * other's email rows (a deadlock otherwise).
 */
export async function takeBackContractorPost(
  tx: Tx,
  taskId: string,
  eventId: string,
  p: Principal,
  opts: { undoable: (postedAt: Date) => boolean },
  now = new Date(),
): Promise<void> {
  if (p.kind !== "contractor") throw new TaskRuleError("Only the contractor who posted it can take it back.");
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${taskId} FOR NO KEY UPDATE`;
  const task = await tx.task.findUnique({ where: { id: taskId }, select: { status: true } });
  if (!task) throw new TaskRuleError("That task no longer exists.");
  await assertContractorAccess(tx, taskId, p.contactId);
  if (!isActiveStatus(task.status)) throw new TaskRuleError("This job is closed.");
  const event = await tx.taskEvent.findFirst({
    where: {
      id: eventId,
      taskId,
      kind: "COMMENT",
      actorContactId: p.contactId,
      deletedAt: null,
      body: null,
      data: { path: ["batch"], equals: true },
    },
    select: { createdAt: true },
  });
  if (!event) throw new TaskRuleError("That update is already gone.");
  if (!opts.undoable(event.createdAt)) throw new TaskRuleError("It's too late to take that back.");
  await tx.taskEvent.update({ where: { id: eventId }, data: { deletedAt: now } });
  const { count } = await tx.taskAttachment.updateMany({
    where: { eventId, taskId, uploadedByContactId: p.contactId, deletedAt: null },
    data: { deletedAt: now },
  });
  await dropPostLine(tx, taskId, { eventId, actorLabel: p.label, summary: commentSummary("", count), at: event.createdAt });
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

/**
 * Take the Task row (FOR NO KEY UPDATE, the lock a task write takes) and hold
 * it to the end of the transaction. For a caller that checks something about
 * the job before it writes (tasks/attachments.ts recordPortalAttachment: is
 * the job still open to a contractor's file) and must see what a concurrent
 * Approve, Cancel or reassignment left, not what was there before it. The
 * lock a function here takes again for itself is one the caller already
 * holds, so it doesn't wait. Nothing else is read or written.
 */
export async function lockTask(tx: Tx, taskId: string): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${taskId} FOR NO KEY UPDATE`;
}

const kindForType = (type: string | null) => (type?.startsWith("image/") ? "IMAGE" : type?.startsWith("video/") ? "VIDEO" : "FILE") as "IMAGE" | "VIDEO" | "FILE";

/**
 * Record a file that is already in Blob. The service verifies the blob's real
 * size and type with head() first and passes those values, never the
 * browser's. `standalone` adds a timeline line; files posted with a comment
 * show inside it instead (addComment links them).
 *
 * The task row is locked before the task is read, as addComment locks it:
 * a reassignment (patchTask locks the row first) that lands while this
 * waits is the one it sees, so a staff file is addressed and emailed to
 * whoever has the job now, never the contractor who just lost it, and a
 * contractor who lost the job is refused by the access check under the
 * lock instead of recording after it.
 */
export async function recordAttachment(
  tx: Tx,
  taskId: string,
  meta: AttachmentMeta,
  p: Principal,
  opts: { visibility?: Visibility; standalone?: boolean } = {},
  now = new Date(),
) {
  await lockTask(tx, taskId);
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
  // The task row is held from the top, before any email row, as every other
  // write here takes it: a take-back holding the task (takeBackContractorPost)
  // then never waits on an email row this holds while this waits on the task.
  await tx.task.update({ where: { id: taskId }, data: editStamp(p, now) });
  if (opts.standalone !== false) {
    const ev = await addEvent(tx, taskId, p, {
      kind: "ATTACHMENT",
      visibility,
      audienceContactId,
      data: { attachmentId: att.id, filename: att.filename },
    });
    await tx.taskAttachment.update({ where: { id: att.id }, data: { eventId: ev.id } });
    await notify(tx, task, p, { kind: "ATTACHMENT", visibility }, `added ${att.filename}`, now, { eventId: ev.id });
  }
  return att;
}

/**
 * The row an earlier record step made for this same upload, when that step
 * committed but its answer never reached the browser: this task, this path,
 * uploaded by this same person, not removed. Blob's random suffix means only
 * the uploader can name the path, so a Retry gets the row back instead of
 * "That file is already attached." (and a second Retry, a second copy).
 * Null for a writer that never uploads (system, Asana).
 */
export async function findOwnUpload(tx: Tx, taskId: string, pathname: string, p: Principal): Promise<{ id: string } | null> {
  const by = p.kind === "staff" ? { uploadedByUserId: p.userId } : p.kind === "contractor" ? { uploadedByContactId: p.contactId } : null;
  if (!by) return null;
  return tx.taskAttachment.findFirst({ where: { taskId, pathname, deletedAt: null, ...by }, select: { id: true } });
}

/** What removing a file needs to know about it. Which post it is on, and its name, are read under the lock. */
export type RemovedFile = Pick<TaskAttachment, "id" | "taskId" | "asanaGid">;

/**
 * Staff take a file off a task (tasks/attachments.ts deleteTaskAttachment,
 * which deletes its blobs after). A file imported from Asana is only marked
 * removed (deletedAt): the delta sync dedupes files by asanaGid, so a row
 * deleted for good would be imported again, and every contractor on the job
 * would see it back under its "removed" line. Every other row is deleted.
 *
 * A file that was posted leaves "Connor removed quote.pdf" when `p` says who
 * removed it. The line is Internal, with no email: written Shared it would
 * reach the contractor's job page, and a Shared staff file line emails them
 * "added quote.pdf". It names the post the file was on (`data.eventId`), so
 * that comment says "1 file removed". A draft nobody saw leaves no line, and
 * neither does a call without `p` (the composer unreadying its own draft).
 * It's an edit made in the app, so the task is stamped as edited, as a rename
 * is (renameAttachment): a task left untouched since an import is cleaned up
 * with its row (D25).
 *
 * The task row is locked first, as takeBackContractorPost and a comment's
 * edit, delete and restore lock it before they touch a post's files, so none
 * of them waits on another's rows. Both branches act only on a file that is
 * still up (`deletedAt` null): the caller read the row before this
 * transaction, so a comment deleted or a post taken back in between has
 * already stamped it, and it must stay for that comment's Undo. False when
 * the file is already gone or off, and then nothing is written. Which post
 * the file is on, and its name, are read under the lock too: a draft the
 * caller read that a send posted in between is a posted file now, and leaves
 * its line, and a rename that landed in between (renameAttachment takes the
 * task first too) is the name the line gives.
 */
export async function removeAttachment(tx: Tx, att: RemovedFile, p?: Principal, now = new Date()): Promise<boolean> {
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${att.taskId} FOR NO KEY UPDATE`;
  const posted = await tx.taskAttachment.findUnique({ where: { id: att.id }, select: { eventId: true, filename: true } });
  if (!posted) return false;
  const { count } = att.asanaGid
    ? await tx.taskAttachment.updateMany({ where: { id: att.id, deletedAt: null }, data: { deletedAt: now } })
    : await tx.taskAttachment.deleteMany({ where: { id: att.id, deletedAt: null } });
  if (count === 0) return false;
  const eventId = posted.eventId;
  if (p && eventId !== null) {
    await addEvent(tx, att.taskId, p, {
      kind: "ATTACHMENT",
      visibility: "INTERNAL",
      data: { attachmentId: att.id, filename: posted.filename, removed: true, eventId },
    });
  }
  if (p) await tx.task.update({ where: { id: att.taskId }, data: editStamp(p, now) });
  return true;
}

/**
 * Staff give a file a new name (tasks/attachments.ts renameTaskAttachment,
 * which settles what the name should be). It's an edit made in the app, so
 * the task is stamped as edited (`appEditedAt`): a task left untouched since
 * an import is cleaned up with its row (D25), and a renamed file on one must
 * keep the task. Returns the file's task, to refresh its page.
 *
 * The task row is locked before the file's, as Remove, a comment's delete
 * and a take-back lock it before they touch a post's files: the first read
 * only names the task and takes no lock, and the check that the file is
 * still up is made again once the task is held, so a rename that waited on
 * a delete finds the file gone and says so.
 */
export async function renameAttachment(tx: Tx, attachmentId: string, filename: string, p: Principal, now = new Date()): Promise<{ taskId: string }> {
  const named = await tx.taskAttachment.findUnique({ where: { id: attachmentId }, select: { taskId: true } });
  if (!named) throw new TaskRuleError("That file no longer exists.");
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${named.taskId} FOR NO KEY UPDATE`;
  const att = await tx.taskAttachment.findUnique({ where: { id: attachmentId }, select: { taskId: true, deletedAt: true } });
  if (!att || att.deletedAt) throw new TaskRuleError("That file no longer exists.");
  await tx.taskAttachment.update({ where: { id: attachmentId }, data: { filename } });
  await tx.task.update({ where: { id: att.taskId }, data: editStamp(p, now) });
  return { taskId: att.taskId };
}

export async function setChecklistItem(tx: Tx, itemId: string, done: boolean, p: Principal, now = new Date()) {
  // Its task and then the item, locked before the item is read, as rename and remove lock them: a tick that lands
  // beside a Remove or a task delete waits, then finds the item gone and says so, instead of failing on a row that
  // vanished between the read and the write (P2025).
  await lockChecklistItem(tx, itemId);
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
  // The task row first, as every writer on a task takes it: two adds at once take the next place one after the
  // other, and an add beside a task delete waits and then finds the task gone.
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${taskId} FOR NO KEY UPDATE`;
  if (!(await tx.task.findUnique({ where: { id: taskId }, select: { id: true } }))) throw new TaskRuleError("That task no longer exists.");
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
 * Lock the item's task and then the item's row before reading it, as
 * setStatus locks a task: a tick, a rename or a second Remove landing at the
 * same moment waits its turn and then sees the result. Without it a Remove
 * could snapshot an item a tick had just changed (Undo would bring it back
 * unticked), and two Removes would both read the row and the second delete
 * would fail on a row already gone.
 *
 * The task row comes first, as every writer on a task takes it: each edit
 * ends by stamping the task, and a task delete holds the task while its
 * cascade takes the items, so an item locked first would deadlock against
 * either (40P01). The first read only names the task and takes no lock; the
 * read after both locks is the one the edit uses. An item that is already
 * gone locks nothing, and that read says so.
 */
async function lockChecklistItem(tx: Tx, itemId: string): Promise<void> {
  const named = await tx.taskChecklistItem.findUnique({ where: { id: itemId }, select: { taskId: true } });
  if (!named) return;
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${named.taskId} FOR NO KEY UPDATE`;
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
  // The task row first, as every writer on a task takes it: an Undo beside a task delete waits, then finds the task gone.
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${snapshot.taskId} FOR NO KEY UPDATE`;
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
