import { createHash, randomUUID } from "node:crypto";
import { Prisma, type EventSource, type Task, type TaskAttachment, type TaskChecklistItem, type TaskEvent, type TaskEventKind, type TaskStatus, type Visibility } from "@prisma/client";
import { fmtDay, todayYmdEastern, toYmd, ymdToDate, type Ymd } from "@/lib/dates";
import { stableJson } from "@/lib/drafts";
import { firstName } from "@/lib/names";
import { jobKey, notesFingerprint } from "@/lib/notifications/content";
import { unitDisplay, unitLabels } from "@/lib/picker-options-shape";
import { JOB_EMAIL_SELECT, jobEmailState } from "@/lib/portal/job-emails";
import { contractorMaySetDate } from "@/lib/portal/job-link-paths";
import type { ReminderKind } from "@/lib/notifications/reminder-rules";
import { renamedLabel, type UnitRename } from "@/lib/property-types";
import { ACTIVE_STATUSES, CLOSED_STATUSES, STATUS_LABEL, draftTask, isActiveStatus, isDiscarded } from "@/lib/task-scope";
import { homeOccupied, readTaskHome } from "@/lib/tenants/living";
import { listedContactsWhere, type PersonRef } from "./assignee-people";
import { DRAFT_BATCH_KEY_MAX, MAX_WAITING_DRAFTS, draftBatchPrefix, draftContractor, draftIndexOf, nameAmong, type DraftContractor } from "./drafts";
import { myDraftsWhere } from "./list-query";
import { hasPinnedDay, isUntouchedCopy, leapDayRule, nextRepeatDue, parseRepeatRule, repeatCreatedCopy, repeatDue, repeatFrom, ruleKey, type RepeatRule } from "./repeat";
import { copySlot } from "./repeat-slot";
import {
  APPROVAL_UNDO_MS,
  BUNDLE_MAX_MS,
  BUNDLE_QUIET_MS,
  DISCARD_KEEP_MS,
  canSetStatus,
  contractorStatusRefusal,
  notifyAudience,
  scheduledDay,
  statusEventVisibility,
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
 * A draft a partner's Claude saved (docs/specs/tasks-from-claude.md, section
 * 6) is the one task that does none of the last two: while it is a Draft no
 * contractor gets access and nothing is queued for anyone, whatever is edited
 * or posted on it (syncAssigneeAccess, notify, notifyOff and queueDueReminder
 * each stop at a draft). Add makes it a task and does both (addDraft).
 * Discard only marks it (`discardedAt`): it is gone to everyone at once, its
 * Undo clears the mark, and the every-minute run deletes the row and hands
 * back its files once the Undo has run out (sweepDiscardedDrafts).
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
  // onlyTaskId: a session an email's job link started reaches that one job (docs/specs/contractor-job-emails.md, 3).
  | { kind: "contractor"; contactId: string; label: string; onlyTaskId?: string | null }
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
 * Who a comment or a file is addressed to as it's written (rules.ts
 * writeAudience): the contractor assigned then. On a draft, nobody yet: no
 * contractor has the job and its assignee can still change, so what's posted
 * as Shared waits with the draft (D21). Add addresses it to the contractor
 * the draft is added for, as if it had been written on their job, so it
 * never reaches whoever gets the job after them (addLockedDraft).
 */
const audienceOf = (p: Principal, task: Pick<Task, "status" | "assigneeContactId">): string | null =>
  task.status === "DRAFT" ? null : writeAudience(kindOf(p), task.assigneeContactId);

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
  /** Where it was written, when that isn't the writer's own place: CLAUDE on the lines a draft is saved with (createTask). */
  source?: EventSource;
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
      ...(e.source ? { source: e.source } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/** Who a contractor access check is for: the contact, and the one job a link session is held to, if it is. */
export type ContractorWho = { contactId: string; onlyTaskId?: string | null };

/**
 * A contractor may act on a task only through an unrevoked access row, with
 * an active contact and an active portal login. (The portal layer separately
 * checks the session itself.) A session an email's job link started reaches
 * only its own job, whatever else the contact has. Never a draft: no
 * contractor can read or write one, even if an access row somehow exists.
 */
export async function assertContractorAccess(tx: Tx, taskId: string, who: ContractorWho): Promise<void> {
  // A tab left on another job after a newer link (an email's or a crew text's) took over the session.
  if (who.onlyTaskId && who.onlyTaskId !== taskId) throw new TaskRuleError("Open this job from its link again.");
  const contactId = who.contactId;
  const access = await tx.taskAccess.findUnique({
    where: { taskId_contactId: { taskId, contactId } },
    select: { revokedAt: true, task: { select: { status: true } }, contact: { select: { active: true, portalAccount: { select: { status: true } } } } },
  });
  if (!access || access.revokedAt || access.task?.status === "DRAFT" || !access.contact.active || access.contact.portalAccount?.status !== "ACTIVE") {
    throw new TaskRuleError("You don't have access to this job.");
  }
}

/**
 * Keep the automatic access row in step with the assignee: grant it to the
 * contractor now assigned, revoke it from anyone who was. Rows shared by hand
 * (MANUAL) are left alone.
 *
 * Nothing for a draft: picking or changing a draft's contractor shows the job
 * to no one. The contractor gets access when a partner adds it (addDraft).
 */
async function syncAssigneeAccess(tx: Tx, task: Pick<Task, "id" | "status">, contactId: string | null, p: Principal, now: Date): Promise<void> {
  if (task.status === "DRAFT") return;
  await writeAssigneeAccess(tx, task.id, contactId, p, now);
}

async function writeAssigneeAccess(tx: Tx, taskId: string, contactId: string | null, p: Principal, now: Date): Promise<void> {
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
 * task rows itself so it can keep Asana's ids and timestamps. By id: its
 * tasks come from Asana and are never drafts.
 */
export { writeAssigneeAccess as grantAssigneeAccess };

/**
 * The refusal when a write would give an open job to an archived contractor:
 * a picker loaded before they were archived (createTask, patchTask). Archive
 * itself is refused while they have open jobs (archive.ts). A closed job (Done
 * or Canceled) can go back to them: it's their record, Archive counts only
 * open work, and a reopen starts it unassigned again (setStatus). The task
 * page's picker doesn't offer them, so here that is the Undo of a
 * reassignment on a closed job they still held, or a picker loaded before
 * they were archived. The Undo of a reopen that took it off them (back to
 * Done, or back to Canceled), or Approve again after Approve's Undo did,
 * gives it back without a pick (setStatus, archivedAssigneeToGiveBack).
 */
export const ARCHIVED_ASSIGNEE_LINE = "Archived. Pick someone else.";

/** The statuses that refuse an archived contractor: open work, and a draft, which is work about to open. */
const refusesArchived = (s: TaskStatus) => isActiveStatus(s) || s === "DRAFT";

/**
 * Whether a contractor is archived, read under a FOR SHARE lock on their
 * Contact row, so the answer holds until this transaction ends. Every path
 * that hands a job to a contractor asks it: after the Task row's lock (or,
 * for a new task, before its insert), ahead of the task's child rows and
 * email rows. Archive (archive.ts setContactArchived) locks the Contact FOR
 * UPDATE first and takes nothing after it, so it either commits first and
 * this reads archived, or waits for this transaction and then counts the
 * job. A contact that isn't there reads as not archived: the foreign key
 * refuses it, as before.
 */
async function contactArchivedLocked(tx: Tx, contactId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ archived: boolean }[]>`
    SELECT ("archivedAt" IS NOT NULL) AS "archived" FROM "Contact" WHERE "id" = ${contactId} FOR SHARE`;
  return rows[0]?.archived === true;
}

/**
 * The internal line when a job goes back to work without its archived
 * contractor (a reopen, Approve's Undo): an ASSIGNED line to nobody, marked
 * `archived`, which the timeline words as "Unassigned because Zack Outlaw is
 * archived" (activity.ts) and never folds or pairs with another assignment.
 */
function archivedAssigneeLine(contactId: string): EventInput {
  return { kind: "ASSIGNED", data: { from: { userId: null, contactId, name: null }, to: { userId: null, contactId: null }, archived: true } };
}

/**
 * The archived contractor a reopen or Approve's Undo took this job from (archivedAssigneeLine), when this close is
 * the way back, read from the job's latest live assignment and status lines (newest first). Two cases, nothing else:
 *  - Approve's Undo writes no status line, so the drop is the latest line and the job is in Review. Approve again
 *    (Review to Done) gives it back, however much later: Review is still his Mark done. A Cancel doesn't.
 *  - A reopen that took the job off him marks its own status line with him (`dropped`, setStatus), written right after
 *    the drop. Only its Undo gives it back: from where the reopen left the job (`from` is the reopen's `to`, so a
 *    move that wrote no line since, such as service.ts cancelOpenAutoTask's Cancel, rules it out), back to the status
 *    it left (`to` is the reopen's `from`), while the reopen line is at most APPROVAL_UNDO_MS old, the toast's Undo,
 *    timed as undoApproval times its own (the caller's `now` against the line's createdAt). That holds for a Canceled
 *    job too, whose way back is Cancel: its reopen's Undo inside the window gives it back. Later, from anywhere else,
 *    or to the other close (a Done job reopened, then Canceled; a Canceled job reopened, then Done or approved), it's
 *    new work on a job the reopen left unassigned. The contractor comes from that mark, and the line before it must
 *    be his drop as well. A reopen with no mark (it dropped nobody, or it was written before the mark) gives nothing
 *    back, whatever drop sits before it: Approve's Undo and then a Cancel that wrote no line (cancelOpenAutoTask)
 *    leave a drop that isn't the reopen's. Two moves that wrote no line and ended back where the reopen left the job
 *    can't be told from its Undo; no app path makes them.
 * Null when anything moved the job or assigned it since.
 */
function droppedArchivedAssignee(
  lines: readonly { kind: string; data: unknown; createdAt: Date }[],
  from: TaskStatus,
  to: TaskStatus,
  now: Date,
): string | null {
  const dataOf = (e: { data: unknown } | undefined) => (e?.data && typeof e.data === "object" ? (e.data as Record<string, unknown>) : {});
  const [latest, prior] = lines;
  const left = dataOf(latest).from;
  const reopen =
    latest?.kind === "STATUS" &&
    (CLOSED_STATUSES as readonly unknown[]).includes(left) &&
    (ACTIVE_STATUSES as readonly unknown[]).includes(dataOf(latest).to);
  const drop = reopen ? prior : latest;
  if (drop?.kind !== "ASSIGNED" || dataOf(drop).archived !== true) return null;
  const was = dataOf(drop).from;
  const dropped = was && typeof was === "object" ? (was as { contactId?: unknown }).contactId : null;
  const contactId = reopen ? dataOf(latest).dropped : dropped;
  if (typeof contactId !== "string" || contactId !== dropped) return null;
  const late = reopen && now.getTime() - latest.createdAt.getTime() > APPROVAL_UNDO_MS;
  const wayBack = reopen ? from === dataOf(latest).to && to === left && !late : from === "REVIEW" && to === "DONE";
  return wayBack ? contactId : null;
}

/**
 * Who gets an unassigned job back as it closes (setStatus): the archived contractor a reopen or Approve's Undo just
 * took it from, when this close is the way back (droppedArchivedAssignee: a reopen's Undo, back to Done or back to
 * Canceled, or Approve again after Approve's Undo), so the job is theirs as it was. Only while they're still archived:
 * one restored since is in the picker again. Their contact is locked FOR SHARE (contactArchivedLocked), after the task
 * and before any write, as every assigning path does.
 */
async function archivedAssigneeToGiveBack(tx: Tx, taskId: string, from: TaskStatus, to: TaskStatus, now: Date): Promise<string | null> {
  const lines = await tx.taskEvent.findMany({
    where: { taskId, kind: { in: ["ASSIGNED", "STATUS"] }, deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 2,
    select: { kind: true, data: true, createdAt: true },
  });
  const contactId = droppedArchivedAssignee(lines, from, to, now);
  return contactId && (await contactArchivedLocked(tx, contactId)) ? contactId : null;
}

// ---------------------------------------------------------------------------
// Notifications (sent later by src/lib/notifications/outbox.ts)
// ---------------------------------------------------------------------------

export interface OutboxItem {
  // OFF: taken off the job or canceled (notifyOff); DUE_TODAY and OVERDUE: the 8 am emails (notifications/reminders.ts).
  kind: NotifyChange["kind"] | "OFF" | ReminderKind;
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
  /** Legacy (rows queued before Nov 21): a TARGET line whose date was the scheduled day. DAY lines carry that now. */
  visit?: boolean;
  /** DUE_TODAY and OVERDUE (notifications/reminders.ts): the date the reminder is for, which keeps it to once per date. */
  due?: string;
  /**
   * TARGET, DAY, NOTES and STATUS: what the job had before this change, so the drain drops a change put back before
   * the email goes (notifications/content.ts undoneDropped). TARGET the due date and DAY the scheduled day ("" for
   * none), NOTES notesFingerprint, STATUS the status.
   */
  from?: string;
  /** STATUS out of Scheduled: the day it had ("" for none), for undoneDropped (notifications/content.ts). */
  fromDay?: string;
  /**
   * OFF ("took you off"): the job as the contractor knew it when they were taken off (notifications/content.ts
   * jobKey), so giving it straight back says nothing unless the job changed meanwhile (offItems).
   */
  job?: string;
}

/** What a line carries beside its summary (OutboxItem's optional fields). */
type ItemRefs = Pick<OutboxItem, "eventId" | "noteEventId" | "visit" | "from" | "fromDay">;

/** What a notification reads from the task. Its status says whether it is still a draft, which emails nobody. */
type NotifyTask = Pick<Task, "id" | "assigneeContactId" | "status">;

/**
 * A date as an email line says it: "Thu, Oct 29", with the year only when it
 * isn't this year in Buffalo. content.ts shows it as written.
 */
const emailDay = (d: Date | Ymd, now: Date) => fmtDay(d, { weekday: true, year: "auto", now: todayYmdEastern(now) });

/** The assignment line; a Scheduled job says its scheduled day. */
const assignedSummary = (t: Pick<Task, "title" | "status" | "scheduledFor">, now: Date) =>
  t.status === "SCHEDULED" && t.scheduledFor ? `assigned you "${t.title}" for ${emailDay(t.scheduledFor, now)}` : `assigned you "${t.title}"`;

/**
 * Whether a staff change to this contractor's job queues them an email: an
 * active login, a first sign-in behind them, and their "Job emails" switch on
 * (src/lib/portal/job-emails.ts). The send run checks the switch again, so a
 * line still waiting when it goes off is dropped.
 */
export async function contractorGetsEmail(tx: Tx, contactId: string | null): Promise<boolean> {
  if (!contactId) return false;
  const acct = await tx.portalAccount.findUnique({ where: { contactId }, select: JOB_EMAIL_SELECT });
  return jobEmailState(acct) === "on";
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
 * next ("Zack gets an email"): null when nobody hears. Nobody hears about a
 * draft: its edits, comments and files wait with it (D21).
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
  if (task.status === "DRAFT") return null;
  const getsEmail = await contractorGetsEmail(tx, task.assigneeContactId);
  const audience = notifyAudience(kindOf(p), change, { contractorGetsEmail: getsEmail });
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

/**
 * A resident's request, addition or cancel (docs/specs/maintenance-requests.md, section 4.3): one line in each
 * partner's task email bundle, as a contractor's update is. Residents aren't principals with an audience rule of
 * their own, so their writes queue here directly.
 */
export async function notifyPartners(tx: Tx, taskId: string, item: OutboxItem, now: Date): Promise<void> {
  const staff = await tx.user.findMany({ where: { passwordHash: { not: null } }, select: { id: true }, orderBy: { id: "asc" } });
  for (const s of staff) await enqueue(tx, { userId: s.id }, taskId, item, now);
}

/**
 * "You're off this job" (docs/specs/contractor-job-emails.md, section 6): a
 * partner took the contractor off an open job, or canceled it. Queued for
 * that contractor under the same email rules as any staff change (a login,
 * a first sign-in, their switch on). The send run delivers it though their
 * access is gone, and carries nothing else about the job. Never for a draft:
 * a contractor taken off one never knew of it.
 */
async function notifyOff(tx: Tx, task: NotifyTask, contactId: string, p: Principal, summary: string, now: Date, job?: string): Promise<void> {
  if (task.status === "DRAFT") return;
  if (p.kind !== "staff" || !(await contractorGetsEmail(tx, contactId))) return;
  await enqueue(tx, { contactId }, task.id, { kind: "OFF", actorLabel: p.label, summary, at: now.toISOString(), ...(job ? { job } : {}) }, now);
}

/** The stored words of each 8 am line (content.ts itemText writes what the email says). */
const REMINDER_SUMMARY: Record<ReminderKind, string> = {
  SCHEDULED_TODAY: "scheduled today",
  SCHEDULED_TOMORROW: "scheduled tomorrow",
  DUE_TODAY: "due today",
  DUE_TOMORROW: "due tomorrow",
  OVERDUE: "due yesterday",
};

/** Advisory-lock namespace for the 8 am reminders (portal uses 7301 to 7303). */
const REMINDER_LOCK = 7304;

/**
 * One 8 am line (docs/specs/contractor-job-emails.md, section 6;
 * docs/specs/contractor-scheduled-date.md): its kind and day, under the same
 * rules as any email to a contractor (a login, a first sign-in, their switch
 * on). Once per job, contractor, kind and day: one already queued or sent is
 * found in the outbox and not queued again, under a lock so two runs at once
 * queue one. A line the send run dropped as no longer true ("nothing to
 * send") doesn't count, so a day moved away and back gets its heads-up.
 *
 * `morningStart`: the 8 am run's own rule, one line per job per morning
 * (spec section 4): any reminder line queued for this job since that instant
 * holds this one back, so a job that changes during the 8 o'clock hour (a
 * Start, a moved day) doesn't get a second email. The right-away heads-up
 * (reminders.ts queueNoticeNow) passes none. Returns whether it queued.
 *
 * Never for a draft, read here again inside the transaction: the run's own
 * list of jobs can be a moment old, and an Add's Undo may have made the job a
 * draft since. A reminder closed unsent for that ("draft") or as no longer
 * true ("nothing to send") reached nobody, so it doesn't count as queued.
 */
export async function queueDueReminder(
  tx: Tx,
  task: { id: string; assigneeContactId: string },
  kind: ReminderKind,
  due: Ymd,
  now: Date,
  morningStart?: Date,
): Promise<boolean> {
  const contactId = task.assigneeContactId;
  const row = await tx.task.findUnique({ where: { id: task.id }, select: { status: true } });
  if (!row || row.status === "DRAFT") return false;
  if (!(await contractorGetsEmail(tx, contactId))) return false;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REMINDER_LOCK}::int, hashtext(${`${contactId}:${task.id}`}))`;
  const marker = JSON.stringify([{ kind, due }]);
  const seen = await tx.$queryRaw<{ one: number }[]>`
    SELECT 1 AS one FROM "NotificationOutbox"
    WHERE "recipientContactId" = ${contactId} AND "taskId" = ${task.id} AND "items" @> ${marker}::jsonb
      AND ("lastError" IS NULL OR "lastError" NOT IN ('nothing to send', 'draft'))
    LIMIT 1`;
  if (seen.length > 0) return false;
  if (morningStart) {
    const kinds = Object.keys(REMINDER_SUMMARY);
    const thisMorning = await tx.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM "NotificationOutbox" o, jsonb_array_elements(o."items") AS i
      WHERE o."recipientContactId" = ${contactId} AND o."taskId" = ${task.id}
        AND i->>'kind' = ANY(${kinds}::text[])
        AND ((i->>'at')::timestamptz AT TIME ZONE 'UTC') >= (${morningStart.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      LIMIT 1`;
    if (thisMorning.length > 0) return false;
  }
  const summary = REMINDER_SUMMARY[kind];
  await enqueue(tx, { contactId }, task.id, { kind, actorLabel: "HG", summary, at: now.toISOString(), due }, now);
  return true;
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
  /**
   * Checklist items to start with, in order. Missing info's Make task gives each
   * the row it stands for (`checkKey`, docs/specs/missing-info.md D9), so the
   * item ticks itself once that row is filled in.
   */
  checklist?: { title: string; checkKey?: string | null }[];
  /**
   * New task's Permission to enter (docs/specs/tenants.md section 8, T11). Saved only when somebody lives in the
   * task's home today, checked here again, since the form's answer can be a moment old.
   */
  entryPermitted?: boolean;
  /**
   * Saved by a partner's Claude (docs/specs/tasks-from-claude.md 6.1), so it starts as a Draft whatever `status`
   * says: no contractor gets access and nothing is emailed until a partner adds it (addDraft). `batchKey` names the
   * save and `index` this draft's place in it. Together with the partner they make its `autoKey` (drafts.ts
   * draftAutoKey), so the same save sent twice returns the draft already there and writes nothing. `sent` is the
   * save's fingerprint (saveDrafts), kept on the draft's "created" line. Staff only.
   */
  draft?: { batchKey: string; index: number; sent?: string };
}

/** Advisory-lock namespace for one save of drafts (the 8 am reminders take 7304, the portal 7301 to 7303). */
const DRAFT_SAVE_LOCK = 7305;

/** Advisory-lock namespace for one partner's saves, so the count of their waiting drafts holds while a save runs. */
const DRAFT_PARTNER_LOCK = 7306;

/**
 * One writer at a time per key, to the end of the transaction. The key is a save's prefix (a partner and a batch
 * key), so the same save sent twice at once writes its drafts once.
 */
async function lockDraftSave(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DRAFT_SAVE_LOCK}::int, hashtext(${key}))`;
}

/** One save at a time per partner, to the end of the transaction (saveDrafts takes it first). */
async function lockPartnerSaves(tx: Tx, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DRAFT_PARTNER_LOCK}::int, hashtext(${userId}))`;
}

/** The refusal for a save whose key can't be stored. The connector checks the key first, so no screen shows it. */
function draftKeyProblem(d: { batchKey: string; index: number }): string | null {
  if (!d.batchKey || d.batchKey.length > DRAFT_BATCH_KEY_MAX || !Number.isInteger(d.index) || d.index < 0) return "That save's key isn't valid.";
  return null;
}

/**
 * The tasks an earlier send of this save made, in the save's order: its
 * drafts, any a partner has added since (they keep their key), and any a
 * partner discarded that the sweep hasn't deleted yet (a discarded draft
 * still holds its key, so its save sent again is still a save already made).
 * Empty for a save that hasn't run. Takes the save's lock, so what it reads
 * holds until the transaction ends.
 */
export async function savedDraftBatch(tx: Tx, userId: string, batchKey: string): Promise<Task[]> {
  const prefix = draftBatchPrefix(userId, batchKey);
  await lockDraftSave(tx, prefix);
  const rows = await tx.task.findMany({ where: { autoKey: { startsWith: prefix } } });
  const at = (t: Task) => draftIndexOf(t.autoKey, prefix);
  return rows.filter((t) => at(t) !== null).sort((a, b) => (at(a) ?? 0) - (at(b) ?? 0));
}

/** A draft's fields as a save sends them, without what the save sets itself (saveDrafts). */
export type DraftInput = Omit<NewTaskInput, "draft" | "status" | "autoKey"> & {
  /**
   * The draft as its sender sent it, when the fields here were worked out from that against today's records: the
   * connector matches a property, a unit's label and a person to the directory (claude/tools.ts checkDrafts). A
   * save sent twice is told by this and not by those fields (draftsFingerprint), so a record that changed between
   * the two sends never makes the same send read as another. Never saved.
   */
  asSent?: unknown;
};

/** What a save did (saveDrafts). Nothing is written for any outcome but `saved`. */
export type SaveDraftsResult =
  /** Written now, in the order sent. */
  | { kind: "saved"; tasks: Task[] }
  /** This batchKey already saved these same drafts: the tasks it made, as they are now. */
  | { kind: "replay"; tasks: Task[] }
  /** This batchKey already saved different drafts. */
  | { kind: "key-reused" }
  /** The partner already has `waiting` drafts, and these would pass MAX_WAITING_DRAFTS. */
  | { kind: "too-many"; waiting: number };

/**
 * A save's fingerprint: SHA-256 over its drafts as they were sent, with every
 * object's keys sorted, so the same drafts always make the same one however
 * they were built. Each draft's "created" line keeps it (`data.sent`), and a
 * second send under the same batchKey is told apart by it: the same drafts
 * again, or other drafts under a key that was already used.
 *
 * A draft that carries what its sender sent (`asSent`) is read by that alone:
 * its other fields follow the records as they stand today, and a unit
 * relabeled or a contractor archived since the first send would turn a plain
 * retry into "other drafts", which the connector answers by asking for the
 * save again under a new key, a second copy of every draft.
 */
export function draftsFingerprint(drafts: readonly DraftInput[]): string {
  const sent = drafts.map((d) => (d.asSent === undefined ? d : { asSent: d.asSent }));
  return createHash("sha256").update(stableJson(sent)).digest("hex");
}

/**
 * Whether the drafts a key already saved are the ones sent now: every one of
 * their "created" lines carries this fingerprint. A line with none (saved
 * before fingerprints were kept) counts as the same save.
 */
async function sameSave(tx: Tx, saved: readonly Task[], sent: string): Promise<boolean> {
  const lines = await tx.taskEvent.findMany({ where: { taskId: { in: saved.map((t) => t.id) }, kind: "CREATED" }, select: { data: true } });
  return lines.every((line) => {
    const was = line.data && typeof line.data === "object" && !Array.isArray(line.data) ? (line.data as Prisma.JsonObject).sent : undefined;
    return typeof was !== "string" || was === sent;
  });
}

/**
 * One save from a partner's Claude (docs/specs/tasks-from-claude.md, section
 * 5): every draft, or none. No contractor gets access and nothing is emailed
 * until a partner adds a draft.
 *
 *  - The same `batchKey` from the same partner again writes nothing. With the
 *    same drafts it answers `replay` and the tasks the first send made (Claude
 *    sent it twice). With other drafts it answers `key-reused`: a key holds
 *    one save, and saying "saved" for drafts that weren't would lose them.
 *  - A partner's waiting drafts are capped (MAX_WAITING_DRAFTS), counted here,
 *    in the database, so the cap holds across server instances. A save that
 *    would pass it answers `too-many` with how many wait.
 *  - `check` runs only for a save that is new and fits, and throws to refuse
 *    it: the connector's own checks (the unit is the building's, the due date
 *    isn't past, Permission to enter was answered) and its save budget go
 *    there, so a send that changes nothing is never judged by today's date
 *    and never spends the budget.
 *
 * The drafts are made last first, so within one save the first thing said is
 * the newest row and lists first under the groups' newest-first order
 * (list-query.ts DRAFTS_ORDER_BY); `tasks` comes back in the order sent.
 *
 * Lock order, for every write that takes more than one of these: the
 * partner's saves (lockPartnerSaves), then the save's key (lockDraftSave),
 * then each draft's contractor (contactArchivedLocked, in createTask). The
 * partner's lock makes the count and the inserts one step, so two saves at
 * once can't both fit under the cap.
 */
export async function saveDrafts(
  tx: Tx,
  batchKey: string,
  drafts: readonly DraftInput[],
  p: Principal,
  check?: (tx: Tx) => Promise<void>,
  now = new Date(),
): Promise<SaveDraftsResult> {
  if (p.kind !== "staff") throw new TaskRuleError("Only a partner can save a draft.");
  await lockPartnerSaves(tx, p.userId);
  const before = await savedDraftBatch(tx, p.userId, batchKey);
  const sent = draftsFingerprint(drafts);
  if (before.length > 0) return (await sameSave(tx, before, sent)) ? { kind: "replay", tasks: before } : { kind: "key-reused" };
  const waiting = await tx.task.count({ where: myDraftsWhere(p.userId) });
  if (waiting + drafts.length > MAX_WAITING_DRAFTS) return { kind: "too-many", waiting };
  await check?.(tx);
  const tasks = new Array<Task>(drafts.length);
  for (let index = drafts.length - 1; index >= 0; index--) {
    // `asSent` goes no further than the fingerprint: createTask saves the fields it names, and that isn't one.
    tasks[index] = await createTask(tx, { ...drafts[index], draft: { batchKey, index, sent } }, p, now);
  }
  return { kind: "saved", tasks };
}

export async function createTask(tx: Tx, input: NewTaskInput, p: Principal, now = new Date()): Promise<Task> {
  if (p.kind === "contractor") throw new TaskRuleError("Contractors can't create tasks yet.");
  const draft = !!input.draft;
  if (draft && p.kind !== "staff") throw new TaskRuleError("Only a partner can save a draft.");
  const title = input.title.trim();
  if (title.length < 2) throw new TaskRuleError("A task needs a title.");
  // Draft is never asked for as a status: only the draft flag makes one.
  if (!draft && input.status === "DRAFT") throw new TaskRuleError("That status change isn't allowed.");
  const status: TaskStatus = draft ? "DRAFT" : (input.status ?? "OPEN");
  if (status === "WAITING" && !input.waitingOn?.trim()) throw new TaskRuleError("Say what it's waiting on.");
  let autoKey = input.autoKey ?? null;
  if (input.draft && p.kind === "staff") {
    const problem = draftKeyProblem(input.draft);
    if (problem) throw new TaskRuleError(problem);
    const prefix = draftBatchPrefix(p.userId, input.draft.batchKey);
    await lockDraftSave(tx, prefix);
    autoKey = `${prefix}${input.draft.index}`;
    // Sent twice (Claude retried the save): the task this key already made comes back, and nothing is written.
    const saved = await tx.task.findUnique({ where: { autoKey } });
    if (saved) return saved;
  }
  const propertyId = input.propertyId || null;
  const assigneeUserId = input.assignee && "userId" in input.assignee ? input.assignee.userId : null;
  const assigneeContactId = input.assignee && "contactId" in input.assignee ? input.assignee.contactId : null;
  // A picker loaded before the contractor was archived still offers them. Only open work, and a draft of it, is
  // refused (ARCHIVED_ASSIGNEE_LINE); the lock is taken either way, so every assign keeps one order.
  if (assigneeContactId && (await contactArchivedLocked(tx, assigneeContactId)) && refusesArchived(status)) {
    throw new TaskRuleError(ARCHIVED_ASSIGNEE_LINE);
  }
  const unitLabel = input.unitLabel?.trim() || null;
  const entryPermitted = !!input.entryPermitted && (await homeOccupied(tx, propertyId, unitLabel, now));

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
      unitLabel,
      entryPermittedAt: entryPermitted ? now : null,
      assigneeUserId,
      assigneeContactId,
      assigneeName: assigneeUserId || assigneeContactId ? null : input.assigneeName?.trim() || null,
      bucket: bucketFor(propertyId),
      repeatRule: input.repeatRule ?? undefined,
      repeatSeriesId: input.repeatSeriesId ?? null,
      taskTemplateId: input.taskTemplateId ?? null,
      autoKey,
      priority: input.priority ?? null,
      // Whose draft it is: the Tasks list files it under My drafts for them (list-query.ts myDraftsWhere).
      createdByUserId: p.kind === "staff" ? p.userId : null,
      ...editStamp(p, now),
    },
  });
  // The lines a draft is saved with say they came through Claude, in the partner's own name: Activity reads "Pieter
  // created this task", "via Claude" (D14), and the same beside Permission to enter, so the record never reads as a
  // partner turning it on by hand.
  const through = draft ? { source: "CLAUDE" as const } : {};
  // Assigning at creation is an assignment: the line carries `to` as ASSIGNED does, so the picker's Recent
  // rows see it (list-query.ts recentAssignmentsWhere). It has no `repeatOf`, so it is no copy's slot (copyOrigin).
  // A draft's line also keeps its save's fingerprint (saveDrafts).
  const created = {
    ...(assigneeUserId || assigneeContactId ? { to: { userId: assigneeUserId, contactId: assigneeContactId } } : {}),
    ...(input.draft?.sent ? { sent: input.draft.sent } : {}),
  };
  await addEvent(tx, task.id, p, { kind: "CREATED", ...through, ...(Object.keys(created).length ? { data: created } : {}) });
  // The same line the task page writes, so the record shows who gave Permission to enter and when.
  if (entryPermitted) await addEvent(tx, task.id, p, { kind: "ACCESS", ...through, data: { entry: { from: false, to: true } } });
  // A draft is nobody's job yet: its contractor gets access, the email and the deal its line when a partner adds
  // it (addDraft does these three, as written here).
  if (!draft) {
    if (assigneeContactId) {
      await syncAssigneeAccess(tx, task, assigneeContactId, p, now);
      await notify(tx, task, p, { kind: "ASSIGNED", visibility: "SHARED" }, assignedSummary(task, now), now);
    }
    await logDeal(tx, task.dealId, p, `Task added: ${task.title}`, now);
  }
  // The checklist in one statement. Nothing else can hold a row this transaction made a moment ago, so the items
  // take the places addChecklistItem would give them one at a time (0, 1, 2, in order), with the words it would keep
  // (trimmed, a blank one left out). The row's own edit stamp above covers them.
  const items = (input.checklist ?? []).flatMap((item) => (item.title.trim() ? [{ title: item.title.trim(), checkKey: item.checkKey ?? null }] : []));
  if (items.length > 0) await tx.taskChecklistItem.createMany({ data: items.map((item, position) => ({ taskId: task.id, ...item, position })) });
  return task;
}

// ---------------------------------------------------------------------------
// Drafts from Claude: Add, its Undo, Discard, its Undo and the sweep (docs/specs/tasks-from-claude.md 6.3)
// ---------------------------------------------------------------------------

/** A partner as the one acting on a draft. */
type Partner = Extract<Principal, { kind: "staff" }>;

function partnerOnly(p: Principal): asserts p is Partner {
  if (p.kind !== "staff") throw new TaskRuleError("Only a partner can do that with a draft.");
}

/** Whether a draft sits in this partner's My drafts: their Claude saved it, or its partner is gone (list-query.ts myDraftsWhere). */
const isOwnDraft = (t: Pick<Task, "createdByUserId">, p: Partner) => t.createdByUserId === p.userId || t.createdByUserId === null;

/** The refusal for a draft that isn't there: deleted, or discarded, which is gone to everyone at once. */
const DRAFT_GONE_LINE = "That draft no longer exists.";

/**
 * A write that reaches a task by its id stops here when the task is a draft a
 * partner discarded. Discard only marks the row (discardDrafts), so the
 * draft's page left open in another tab can still send an edit, a comment, a
 * file, a checklist item or a tick. Each would land on a row nobody can see,
 * which the sweep deletes ten minutes later without a word to whoever wrote
 * it. To everyone the draft is gone, so each is refused in the line a missing
 * draft gets.
 *
 * Every write that names one task, or a comment, file or checklist item of
 * one, calls this on the row it reads before it writes: setStatus, patchTask,
 * addComment, a comment's edit, delete and restore (ownComment),
 * recordAttachment, removeAttachment, renameAttachment, setChecklistItem,
 * addChecklistItem and a checklist item's rename, removal and restore
 * (drafts-core.test.ts holds the list to this file). A contractor's own
 * writes are refused first by their access check, which no draft passes.
 *
 * The draft's own moves decide for themselves: Add and Discard refuse a
 * discarded one in this same line, Discard's Undo and the sweep exist for
 * them, its save sent again reads it as saved, and a unit renamed on its
 * building still carries it along (renameTaskUnits), so its Undo brings back
 * a draft that Add takes. A row that isn't there is the caller's to refuse,
 * in its own words.
 */
function refuseDiscarded(task: Pick<Task, "discardedAt"> | null | undefined): void {
  if (task && isDiscarded(task)) throw new TaskRuleError(DRAFT_GONE_LINE);
}

/**
 * Add was refused for one draft. `taskId` and `title` say which, so Add all's
 * toast can open the draft to fix; the message is the line to show.
 */
export class DraftRefusedError extends TaskRuleError {
  constructor(
    message: string,
    readonly taskId: string,
    readonly title: string,
  ) {
    super(message);
    this.name = "DraftRefusedError";
  }
}

export interface AddedDraft {
  task: Task;
  /** The line this Add wrote; its Undo names it (undoAddDraft). */
  addEventId: string;
  /**
   * The contractor the job went to and whether they get its email, for the toast's "Emails Zack" or "No email to
   * Rob" (drafts.ts draftsAddedNames). Null for a partner's own task or nobody's.
   */
  contractor: DraftContractor | null;
}

/**
 * Everyone a name in a refusal's line could be read as (drafts.ts nameAmong):
 * the team and the contractors the pickers list, by their picker keys. Read
 * only once a refusal is certain, so no write that goes through pays for it.
 */
async function knownPeople(tx: Tx): Promise<PersonRef[]> {
  const users = await tx.user.findMany({ select: { id: true, name: true, email: true } });
  const contacts = await tx.contact.findMany({ where: { ...listedContactsWhere, archivedAt: null }, select: { id: true, fullName: true } });
  return [...users.map((u) => ({ key: `u:${u.id}`, name: u.name ?? u.email })), ...contacts.map((c) => ({ key: `c:${c.id}`, name: c.fullName }))];
}

/** What a draft's unit line says once its unit is no longer on its building, or null while it still is (or it names none). */
async function goneUnitLine(tx: Tx, draft: Pick<Task, "propertyId" | "unitLabel">): Promise<string | null> {
  const label = draft.unitLabel?.trim();
  if (!draft.propertyId || !label) return null;
  // A plain read: locking the property here would cross a units save, which holds the property and then takes the
  // tasks that name a renamed unit (properties/service.ts, renameTaskUnits).
  const property = await tx.property.findUnique({ where: { id: draft.propertyId }, select: { units: true } });
  // Matched as the lockbox code and the tenants are (tasks/lockbox.ts): trimmed, whatever the case.
  const there = unitLabels(property?.units).some((unit) => unit.toLowerCase() === label.toLowerCase());
  return there ? null : `${unitDisplay(label)} is gone. Pick the unit.`;
}

/** The rows an Add addressed to its contractor, kept on the Add's line so only its Undo puts them back (addLockedDraft). */
type Addressed = { to: string; events: string[]; files: string[] };

function addressedOf(data: unknown): Addressed | null {
  const kept = data && typeof data === "object" && !Array.isArray(data) ? (data as { addressed?: unknown }).addressed : null;
  if (!kept || typeof kept !== "object") return null;
  const { to, events, files } = kept as { to?: unknown; events?: unknown; files?: unknown };
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return typeof to === "string" ? { to, events: ids(events), files: ids(files) } : null;
}

/**
 * What was posted as Shared while the job was a draft, addressed now to the
 * contractor it is added for, as a Shared line written on their job is
 * (rules.ts writeAudience). Until now it was addressed to nobody, which the
 * portal shows to whoever holds the job, so the next contractor on it would
 * have read what was written for this one. Staff rows only (a draft holds no
 * others), a deleted comment's included: its Undo brings it back as it was
 * addressed. Returns what it changed, for the Add's line; null when there was
 * nothing.
 */
async function addressDraftPosts(tx: Tx, taskId: string, contactId: string): Promise<Addressed | null> {
  const events = await tx.taskEvent.findMany({
    where: { taskId, visibility: "SHARED", audienceContactId: null, actorContactId: null, source: { not: "ASANA" } },
    select: { id: true },
  });
  const files = await tx.taskAttachment.findMany({
    where: { taskId, visibility: "SHARED", audienceContactId: null, uploadedByContactId: null, asanaGid: null },
    select: { id: true },
  });
  if (events.length === 0 && files.length === 0) return null;
  const addressed: Addressed = { to: contactId, events: events.map((e) => e.id), files: files.map((f) => f.id) };
  if (addressed.events.length) await tx.taskEvent.updateMany({ where: { id: { in: addressed.events } }, data: { audienceContactId: contactId } });
  if (addressed.files.length) await tx.taskAttachment.updateMany({ where: { id: { in: addressed.files } }, data: { audienceContactId: contactId } });
  return addressed;
}

/**
 * One draft becomes a To do task, its row already locked by the caller: what
 * createTask does for a new task, a moment later. The contractor's contact
 * is locked right after the task and before any child or email row, as every
 * assigning path does, and one archived since the draft was saved is refused
 * (6.4), in the house's own line for it: the row and the page already say
 * who the draft is for. A unit removed from the building since is refused
 * too, so no job names a unit that isn't there. Then the status, the line
 * Activity reads as "Pieter added this draft", the contractor's access, what
 * was posted on the draft addressed to them, their "assigned you" email and
 * the deal's line. The email waits BUNDLE_QUIET_MS, longer than the Undo
 * lasts.
 */
async function addLockedDraft(tx: Tx, before: Task, p: Partner, now: Date): Promise<AddedDraft> {
  const contactId = before.assigneeContactId;
  let contractor: DraftContractor | null = null;
  if (contactId) {
    const archived = await contactArchivedLocked(tx, contactId);
    const contact = await tx.contact.findUnique({ where: { id: contactId }, select: { id: true, fullName: true, active: true, portalAccount: { select: JOB_EMAIL_SELECT } } });
    contractor = draftContractor(contact);
    if (archived) throw new DraftRefusedError(ARCHIVED_ASSIGNEE_LINE, before.id, before.title);
  }
  const noUnit = await goneUnitLine(tx, before);
  if (noUnit) throw new DraftRefusedError(noUnit, before.id, before.title);
  const task = await tx.task.update({ where: { id: before.id }, data: { status: "OPEN", ...editStamp(p, now) } }); // status-write: an added draft starts as To do
  const addressed = contactId ? await addressDraftPosts(tx, task.id, contactId) : null;
  // Internal, as any move to To do is: the contractor's job page never shows it.
  const added = await addEvent(tx, task.id, p, { kind: "STATUS", visibility: "INTERNAL", data: { from: "DRAFT", to: "OPEN", ...(addressed ? { addressed } : {}) } });
  if (contactId) {
    await syncAssigneeAccess(tx, task, contactId, p, now);
    await notify(tx, task, p, { kind: "ASSIGNED", visibility: "SHARED" }, assignedSummary(task, now), now);
  }
  await logDeal(tx, task.dealId, p, `Task added: ${task.title}`, now, added.id);
  return { task, addEventId: added.id, contractor };
}

/**
 * Add (D12): the draft becomes a To do task, its contractor can open the job
 * and their email is queued, exactly as New task would have done. Refused
 * when it is gone (deleted, or discarded: a discarded draft is gone to
 * everyone until its Undo), with who moved it when it is no longer a draft
 * (the other partner added it), and with DraftRefusedError when its
 * contractor was archived or its unit removed since.
 */
export async function addDraft(tx: Tx, taskId: string, p: Principal, now = new Date()): Promise<AddedDraft> {
  partnerOnly(p);
  await lockTask(tx, taskId);
  const before = await tx.task.findUnique({ where: { id: taskId } });
  if (!before || isDiscarded(before)) throw new TaskRuleError(DRAFT_GONE_LINE);
  if (before.status !== "DRAFT") throw await taskChanged(tx, taskId, before.status, p);
  return addLockedDraft(tx, before, p, now);
}

/**
 * Add all: every one of these drafts, or none. A refusal (DraftRefusedError
 * names the draft) throws, and the caller's transaction rolls every add back.
 * A draft added or discarded since the list was drawn is passed over: it is
 * already where it was headed. With `mine`, so is one that isn't the
 * partner's own, so Add all never touches the other partner's group.
 *
 * The rows are locked as they are read, in the database's id order, as every
 * write that holds more than one task takes them (bulk.ts), so both partners'
 * Add all at once run one after the other.
 */
export async function addDrafts(tx: Tx, taskIds: readonly string[], p: Principal, now = new Date(), opts: { mine?: boolean } = {}): Promise<AddedDraft[]> {
  partnerOnly(p);
  const ids = [...new Set(taskIds)];
  if (ids.length === 0) return [];
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Task" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR NO KEY UPDATE`;
  const added: AddedDraft[] = [];
  for (const { id } of rows) {
    const before = await tx.task.findUnique({ where: { id } });
    if (!before || before.status !== "DRAFT" || isDiscarded(before)) continue;
    if (opts.mine && !isOwnDraft(before, p)) continue;
    added.push(await addLockedDraft(tx, before, p, now));
  }
  return added;
}

/**
 * The contractor who has opened or written on this job, if any: a line or a
 * file of theirs on it, or their read mark, which opening the job in the
 * portal writes (portal/jobs.ts markJobSeen), the rule takeBackRepeat uses for
 * a copy somebody has seen. A draft has none of these (no contractor can open
 * or write one), and an Add is never undone once one exists, so anything
 * found here is from the Add being undone. Null when nobody has.
 */
async function contractorOnJob(tx: Tx, taskId: string): Promise<string | null> {
  const line = await tx.taskEvent.findFirst({ where: { taskId, actorContactId: { not: null } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { actorContactId: true } });
  if (line?.actorContactId) return line.actorContactId;
  const file = await tx.taskAttachment.findFirst({ where: { taskId, uploadedByContactId: { not: null } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { uploadedByContactId: true } });
  if (file?.uploadedByContactId) return file.uploadedByContactId;
  const seen = await tx.taskReadState.findFirst({ where: { taskId, contactId: { not: null } }, select: { contactId: true } });
  return seen?.contactId ?? null;
}

/**
 * Add's Undo: the task is a draft again, as if it had not been added. Like
 * Approve's Undo it writes no line of its own: the Add's line is soft-deleted
 * (the timeline hides what was undone), the deal's "Task added" goes with it,
 * the access row the Add made is removed, so the contractor can't open the
 * job and adding it again starts their "new since" from then, and what the
 * Add addressed to them is addressed to nobody again, as it was on the draft.
 *
 * What a partner posted as Shared after the Add, while the job was a task,
 * is addressed to nobody again too, so it waits with the draft.
 *
 * The emails the Add's time as a task queued for a contractor go too: every
 * one still waiting, unsent and held by no send run, is deleted (their
 * "assigned you", a "took you off" from a reassignment in between, a "Due
 * today" the 8 am run added). So nothing about a job that is a draft again
 * can follow, and a second Add starts clean: its email is a new row, and its
 * 8 am reminder queues as for a first Add (queueDueReminder looks for one
 * already queued).
 * Only the access row an assignment made is removed (source ASSIGNEE): one
 * someone shared by hand is not the Undo's to take, and the send run closes
 * any row for a draft unsent itself (notifications/content.ts dueRowVerdict).
 *
 * Staff only, only the partner who added it, within APPROVAL_UNDO_MS, and
 * only while the job is still To do with the Add as its latest status line.
 * Refused once its contractor has opened or written on the job
 * (contractorOnJob): the job would vanish under them, and their words would
 * be left on a draft. Refused once a job email for it is sent or on its way
 * (approvalEmailState, as Approve's Undo): that can't happen inside the window
 * on a first Add, but a draft added, undone and added again for ten minutes
 * reaches the bundle's limit, and by then the contractor has been told. Each
 * refusal is one toast line that fits a phone (lib/toast-line.ts), and none
 * points to the status menu: no status makes a task a draft again. A retry
 * of an Undo that went through is a quiet success. Lock order: this task,
 * then its email rows (id order); the send run locks email rows only.
 */
export async function undoAddDraft(tx: Tx, taskId: string, addEventId: string, p: Principal, now = new Date()): Promise<{ task: Task }> {
  partnerOnly(p);
  await lockTask(tx, taskId);
  const before = await tx.task.findUnique({ where: { id: taskId } });
  if (!before) throw new TaskRuleError("That task no longer exists.");
  // Only this function soft-deletes an Add's line, and only for the partner who added: deleted and theirs, on a task
  // that is still the draft it made, is a retry. Added again since, it is another Add's task, and this Undo is late.
  if (before.status === "DRAFT") {
    const undone = await tx.taskEvent.findFirst({
      where: { id: addEventId, taskId, kind: "STATUS", actorUserId: p.userId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (undone) return { task: before };
  }
  if (before.status !== "OPEN") throw await taskChanged(tx, taskId, before.status, p);
  const latest = await tx.taskEvent.findFirst({
    where: { taskId, kind: "STATUS", deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, data: true, createdAt: true, actorUserId: true, actorLabel: true },
  });
  const fromDraft = (latest?.data as { from?: unknown } | null)?.from === "DRAFT";
  if (!latest || latest.id !== addEventId || !fromDraft) throw new TaskRuleError("This task changed since.");
  if (latest.actorUserId !== p.userId) {
    const by = latest.actorUserId ? nameAmong({ key: `u:${latest.actorUserId}`, name: latest.actorLabel }, await knownPeople(tx)) : firstName(latest.actorLabel);
    throw new TaskRuleError(by ? `Only ${by} can undo this.` : "Not yours to undo.");
  }
  if (now.getTime() - latest.createdAt.getTime() > APPROVAL_UNDO_MS) throw new TaskRuleError("Too late to undo.");
  const onJob = await contractorOnJob(tx, taskId);
  if (onJob) {
    const who = await tx.contact.findUnique({ where: { id: onJob }, select: { fullName: true } });
    const name = who ? nameAmong({ key: `c:${onJob}`, name: who.fullName }, await knownPeople(tx)) : "";
    throw new TaskRuleError(`${name || "Someone"} already opened it.`);
  }
  // Every email row to a contractor on this job, locked so a send run can't claim one between this check and the
  // delete below.
  const emails = await tx.$queryRaw<ApprovalEmail[]>`
    SELECT "sentAt", "lastError", "openKey", "attempts" FROM "NotificationOutbox"
    WHERE "taskId" = ${taskId} AND "recipientContactId" IS NOT NULL
    ORDER BY "id" FOR UPDATE`;
  const emailed = approvalEmailState(emails);
  if (emailed === "sent") throw new TaskRuleError("Email already sent.");
  if (emailed === "sending") throw new TaskRuleError("The email is on its way.");
  const task = await tx.task.update({ where: { id: taskId }, data: { status: "DRAFT", ...editStamp(p, now) } });
  await tx.taskEvent.update({ where: { id: addEventId }, data: { deletedAt: now } });
  await tx.taskAccess.deleteMany({ where: { taskId, source: "ASSIGNEE" } });
  // Unsent and held by no send run: the rows still waiting, and one a run claimed and handed back untried (the
  // mail provider turned the run away, so its try was given back with `openKey` already cleared). Left behind, that
  // one would send beside the next Add's own row. A row a run holds or is retrying has a try against it and was
  // refused above as on its way; one a run closed unsent has `sentAt` set and stays as its record.
  await tx.notificationOutbox.deleteMany({ where: { taskId, recipientContactId: { not: null }, sentAt: null, attempts: 0 } });
  const addressed = addressedOf(latest.data);
  if (addressed) {
    if (addressed.events.length) await tx.taskEvent.updateMany({ where: { id: { in: addressed.events }, taskId, audienceContactId: addressed.to }, data: { audienceContactId: null } });
    if (addressed.files.length) await tx.taskAttachment.updateMany({ where: { id: { in: addressed.files }, taskId, audienceContactId: addressed.to }, data: { audienceContactId: null } });
  }
  // What a partner posted as Shared between the Add and this Undo stays addressed to the contractor the job had
  // then (rules.ts writeAudience). If the draft is added again for someone else, they never see a note written for
  // the first contractor.
  if (task.dealId) {
    await tx.dealNote.updateMany({
      where: { dealId: task.dealId, source: "change", deletedAt: null, data: { path: ["taskEventId"], equals: addEventId } },
      data: { deletedAt: now },
    });
  }
  return { task };
}

/** What Add all's Undo did, task by task. */
export interface UndoneAdds {
  /** The tasks that are drafts again. */
  undone: Task[];
  /** The ones that stayed tasks, each with its title and the line why ("Zack already opened it."). `title` is "" for one that is gone. */
  kept: { taskId: string; title: string; message: string }[];
}

/**
 * Add all's Undo, and one Add's: each task is taken back or kept on its own.
 * One that can't go back (its contractor opened it, someone moved it, its
 * email went) stays a task and is listed in `kept` with its title and the
 * rule's own line; the rest are drafts again. Each runs inside its own
 * savepoint, as a bulk edit's tasks do (bulk-core.ts eachTask), so a refusal
 * rolls back only that task's reads and locks. Anything that isn't a rule's
 * refusal fails the whole Undo. The tasks are locked first, in the database's
 * id order, as addDrafts took them.
 */
export async function undoAddDrafts(tx: Tx, adds: readonly { taskId: string; addEventId: string }[], p: Principal, now = new Date()): Promise<UndoneAdds> {
  partnerOnly(p);
  const out: UndoneAdds = { undone: [], kept: [] };
  if (adds.length === 0) return out;
  const rows = await tx.$queryRaw<{ id: string; title: string }[]>`
    SELECT "id", "title" FROM "Task" WHERE "id" IN (${Prisma.join([...new Set(adds.map((a) => a.taskId))])}) ORDER BY "id" FOR NO KEY UPDATE`;
  const titles = new Map(rows.map((r) => [r.id, r.title]));
  // The tasks that are there, in the order they were locked, then any that are gone.
  const order = [...rows.map((r) => r.id), ...new Set(adds.map((a) => a.taskId).filter((id) => !titles.has(id)))];
  for (const id of order) {
    for (const add of adds) {
      if (add.taskId !== id) continue;
      await tx.$executeRaw`SAVEPOINT undo_add`;
      try {
        const { task } = await undoAddDraft(tx, id, add.addEventId, p, now);
        await tx.$executeRaw`RELEASE SAVEPOINT undo_add`;
        out.undone.push(task);
      } catch (err) {
        if (!(err instanceof TaskRuleError)) throw err;
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT undo_add`;
        out.kept.push({ taskId: id, title: titles.get(id) ?? "", message: err.message });
      }
    }
  }
  return out;
}

/** What Discard marked, for the caller's refresh of the pages that showed them. */
export interface DiscardedDrafts {
  /** The drafts discarded, in the order asked for. Undo sends these back (restoreDrafts). */
  ids: string[];
  /** Their properties, whose pages are refreshed with everything else. */
  propertyIds: string[];
}

/**
 * Discard all, and Discard on one row (D19): each draft is marked discarded
 * (`discardedAt`) and nothing is deleted. To everyone it is gone at once
 * (task-scope.ts draftTask is what every draft read filters by), and its Undo
 * brings it back whole by clearing the mark (restoreDrafts). The row and its
 * files go when the sweep finds the mark older than DISCARD_KEEP_MS
 * (sweepDiscardedDrafts). Only a waiting draft is ever marked: one a partner
 * added since the list was drawn is a task now and is passed over, as is one
 * already discarded or gone. With `mine`, so is a draft that isn't the
 * partner's own, so Discard all never touches the other partner's group.
 * Locked in the database's id order, as every write that holds more than one
 * task takes them.
 */
export async function discardDrafts(tx: Tx, taskIds: readonly string[], p: Principal, now = new Date(), opts: { mine?: boolean } = {}): Promise<DiscardedDrafts> {
  partnerOnly(p);
  const ids = [...new Set(taskIds)];
  const out: DiscardedDrafts = { ids: [], propertyIds: [] };
  if (ids.length === 0) return out;
  await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Task" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR NO KEY UPDATE`;
  const rows = await tx.task.findMany({ where: { id: { in: ids }, ...draftTask }, select: { id: true, propertyId: true, createdByUserId: true } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const draft = byId.get(id);
    if (!draft || (opts.mine && !isOwnDraft(draft, p))) continue;
    out.ids.push(id);
    if (draft.propertyId && !out.propertyIds.includes(draft.propertyId)) out.propertyIds.push(draft.propertyId);
  }
  if (out.ids.length > 0) await tx.task.updateMany({ where: { id: { in: out.ids } }, data: { discardedAt: now } });
  return out;
}

/**
 * Discard on one draft, from its row or its page. Refused, with who moved
 * it, when a partner has added it since: a task is never discarded. One
 * already discarded is gone, as a deleted one is.
 */
export async function discardDraft(tx: Tx, taskId: string, p: Principal, now = new Date()): Promise<DiscardedDrafts> {
  partnerOnly(p);
  await lockTask(tx, taskId);
  const before = await tx.task.findUnique({ where: { id: taskId }, select: { status: true, discardedAt: true } });
  if (!before || isDiscarded(before)) throw new TaskRuleError(DRAFT_GONE_LINE);
  if (before.status !== "DRAFT") throw await taskChanged(tx, taskId, before.status, p);
  return discardDrafts(tx, [taskId], p, now);
}

export interface RestoredDrafts {
  /** The drafts that wait again, in the order given: the ones this brought back, and any already back (a second Undo, another tab). */
  restored: Task[];
  /** The ids that can't come back as drafts: the sweep has deleted them, or a partner added one after an earlier Undo. */
  gone: string[];
}

/**
 * Discard's Undo: the mark is cleared, by id, and the draft is back whole
 * (its fields, its checklist with its ticks, its comments, photos and
 * timeline, its id and its place in its group), because nothing was deleted.
 * Nothing but the ids comes from the browser, and they only ever clear a
 * discard: a row that isn't a discarded draft is not written. Nothing about
 * the draft is checked again here: its contractor may have been archived
 * since, and Add refuses that in its own words.
 */
export async function restoreDrafts(tx: Tx, taskIds: readonly string[], p: Principal): Promise<RestoredDrafts> {
  partnerOnly(p);
  const ids = [...new Set(taskIds)];
  const out: RestoredDrafts = { restored: [], gone: [] };
  if (ids.length === 0) return out;
  await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Task" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR NO KEY UPDATE`;
  await tx.task.updateMany({ where: { id: { in: ids }, status: "DRAFT", discardedAt: { not: null } }, data: { discardedAt: null } });
  const rows = await tx.task.findMany({ where: { id: { in: ids }, ...draftTask } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const draft = byId.get(id);
    if (draft) out.restored.push(draft);
    else out.gone.push(id);
  }
  return out;
}

/** What the sweep deleted, and what the caller clears up once that commits. */
export interface SweptDrafts {
  ids: string[];
  /** The Blob paths of the files posted on them, to remove after the commit. */
  blobs: string[];
}

/** The most drafts one sweep deletes; the next minute's run takes the rest. */
const SWEEP_BATCH = 200;

/** A LINK has no blob; an older row may still point at a public one, which the delete takes by URL. */
export const blobsOf = (files: readonly Pick<TaskAttachment, "url" | "thumbPathname" | "posterPathname">[]): string[] =>
  files.flatMap((a) => [a.url, a.thumbPathname, a.posterPathname]).filter((x): x is string => !!x);

/**
 * The every-minute run's sweep: every draft discarded more than
 * DISCARD_KEEP_MS before `now` is deleted, with its timeline, checklist and
 * files (all cascade), as a deleted task loses them. Its Undo has long run
 * out by then. Returns the files' Blob paths, which the caller removes once
 * the delete has committed.
 *
 * Each row is locked as it is read, FOR UPDATE (the lock its delete takes),
 * in id order, and one somebody holds right now is passed over until the next
 * run (SKIP LOCKED), so the sweep never waits on a late Undo or a write on a
 * tab left open. The mark is read under that lock: an Undo that cleared it a
 * moment ago is not deleted. A write that waited on the sweep finds the task
 * gone and says so.
 */
export async function sweepDiscardedDrafts(tx: Tx, now = new Date()): Promise<SweptDrafts> {
  // The column is a timestamp without time zone, holding UTC: convert explicitly, as enqueue does.
  const before = Prisma.sql`(${new Date(now.getTime() - DISCARD_KEEP_MS).toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Task" WHERE "status" = 'DRAFT' AND "discardedAt" < ${before}
    ORDER BY "id" LIMIT ${SWEEP_BATCH} FOR UPDATE SKIP LOCKED`;
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { ids, blobs: [] };
  const files = await tx.taskAttachment.findMany({ where: { taskId: { in: ids } }, select: { url: true, thumbPathname: true, posterPathname: true } });
  await tx.task.deleteMany({ where: { id: { in: ids } } });
  return { ids, blobs: blobsOf(files) };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** The refusal for Delete on a draft: a draft goes by Discard, which has an Undo. */
export const DRAFT_DELETE_LINE = "This is a draft. Discard it.";

/** What a delete removed, for the caller's refresh and its files' cleanup. */
export interface DeletedTask {
  id: string;
  propertyId: string | null;
  dealId: string | null;
  /** The Blob paths of its files, to remove after the commit. */
  blobs: string[];
}

/**
 * Staff only: removes the task for good, with its timeline, checklist, files,
 * access rows and queued emails (all cascade). A task on a deal leaves a line
 * on the deal's timeline. Null, and nothing written, when the task doesn't
 * exist.
 *
 * Never a draft (DRAFT_DELETE_LINE): a draft goes by Discard, which keeps it
 * for its Undo. The row is locked first, FOR UPDATE (the lock the delete
 * takes), so the status read here is the one the row has when it is deleted:
 * a task an Add's Undo turns back into a draft at that moment waits its turn
 * and is then refused, from its own page and from bulk delete alike. A
 * discarded draft is gone already, so it answers as a missing task does.
 */
export async function deleteTask(tx: Tx, id: string, p: Principal, now = new Date()): Promise<DeletedTask | null> {
  if (p.kind !== "staff") throw new TaskRuleError("Only staff can delete a task.");
  await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Task" WHERE "id" = ${id} FOR UPDATE`;
  const task = await tx.task.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      discardedAt: true,
      propertyId: true,
      dealId: true,
      attachments: { select: { url: true, thumbPathname: true, posterPathname: true } },
    },
  });
  if (!task || isDiscarded(task)) return null;
  if (task.status === "DRAFT") throw new TaskRuleError(DRAFT_DELETE_LINE);
  await tx.task.delete({ where: { id } });
  if (task.dealId) {
    await tx.dealNote.create({ data: { dealId: task.dealId, body: `Task deleted: ${task.title}  ·  ${p.label}`, noteDate: now, source: "change" } });
  }
  return { id: task.id, propertyId: task.propertyId, dealId: task.dealId, blobs: blobsOf(task.attachments) };
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
  if (c.to === "REVIEW" && c.actor === "contractor") return `sent ${t} for review`;
  if (c.from === "REVIEW" && c.to === "IN_PROGRESS") return `sent ${t} back${c.note ? `: ${c.note}` : ""}`;
  if (c.from === "REVIEW" && c.to === "DONE") return `approved ${t}`;
  if (c.to === "IN_PROGRESS" && c.actor === "contractor") return `started ${t}`;
  if (c.to === "SCHEDULED" && c.scheduledFor) return `scheduled ${t} for ${emailDay(c.scheduledFor, now)}`;
  if (c.from === "SCHEDULED" && c.to === "OPEN" && c.actor === "contractor") return `unscheduled ${t}`;
  return `set ${t} to ${c.to.replace("_", " ").toLowerCase()}`;
}

export interface StatusOptions {
  /** Required for WAITING. */
  waitingOn?: string | null;
  /** The scheduled day for SCHEDULED; keeps the existing one when omitted. */
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
  /**
   * A contractor's Mark done: the photos a batch post had already told HG of
   * that it counted toward the playbook's (portal/jobs.ts), kept on the move to
   * Review so they show under "At finish" (lib/tasks/media.ts finishPhotoIds).
   */
  finishIds?: string[];
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
  if (p.kind === "contractor") await assertContractorAccess(tx, taskId, p);
  refuseDiscarded(before);
  if (opts.expected && before.status !== opts.expected) throw await taskChanged(tx, taskId, before.status, p);
  if (!canSetStatus(kindOf(p), before.status, to)) {
    // A contractor's refusal says where the job is now: their tab is usually stale (approved, or done in another tab).
    throw new TaskRuleError(p.kind === "contractor" ? contractorStatusRefusal(before.status, to) : "That status change isn't allowed.");
  }

  const waitingOn = opts.waitingOn?.trim() || null;
  if (to === "WAITING" && !waitingOn) throw new TaskRuleError("Say what it's waiting on.");
  const scheduledFor = opts.scheduledFor !== undefined ? ymdToDate(opts.scheduledFor) : before.scheduledFor;
  if (to === "SCHEDULED" && !scheduledFor) throw new TaskRuleError("Pick the scheduled day.");

  const closing = to === "DONE" || to === "CANCELED";
  const reopening = !isActiveStatus(before.status) && isActiveStatus(to);
  // A reopened job never goes back to an archived contractor: it starts unassigned, with a line saying why, and
  // neither does the next repeat a finish makes (createNextRepeat reads it under this lock). The contact is locked
  // right after this task, before any child or email row, and holds off an Archive until the job is there to count.
  const finishing = to === "DONE" && before.status !== "DONE";
  const archivedNow = before.assigneeContactId && (reopening || finishing) ? await contactArchivedLocked(tx, before.assigneeContactId) : false;
  const dropArchived = reopening && archivedNow;
  // And the way back: a reopen's Undo (back to Done, or back to Canceled), or Approve again after Approve's Undo, gives
  // it back to the archived contractor, whose closed job it was (archivedAssigneeToGiveBack). Any other close leaves it
  // unassigned.
  const giveBack = closing && !before.assigneeContactId && !before.assigneeUserId ? await archivedAssigneeToGiveBack(tx, taskId, before.status, to, now) : null;
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
      ...(dropArchived ? { assigneeContactId: null } : {}),
      ...(giveBack ? { assigneeContactId: giveBack } : {}),
      ...editStamp(p, now),
    },
  });
  if (dropArchived && before.assigneeContactId) {
    await addEvent(tx, taskId, p, archivedAssigneeLine(before.assigneeContactId));
    await syncAssigneeAccess(tx, task, null, p, now);
  }
  if (giveBack) {
    // Marked `givenBack`: nobody picked him, so the timeline words it as his job again and never pairs it (activity.ts).
    await addEvent(tx, taskId, p, {
      kind: "ASSIGNED",
      data: { from: { userId: null, contactId: null, name: before.assigneeName }, to: { userId: null, contactId: giveBack }, givenBack: true },
    });
    await syncAssigneeAccess(tx, task, giveBack, p, now);
  }

  const visibility = statusEventVisibility(to, !!task.assigneeContactId);
  const audienceContactId = writeAudience(kindOf(p), task.assigneeContactId);
  const statusEvent = await addEvent(tx, taskId, p, {
    kind: "STATUS",
    visibility,
    audienceContactId,
    data: {
      from: before.status,
      to,
      ...(waitingOn ? { waitingOn } : {}),
      ...(to === "SCHEDULED" ? { scheduledFor: toYmd(scheduledFor) } : {}),
      ...(to === "REVIEW" && opts.finishIds?.length ? { finishIds: opts.finishIds } : {}),
      // A reopen that took the job off an archived contractor names him, so only its own Undo gives it back
      // (droppedArchivedAssignee). The line is Internal (the job has no contractor now), the portal reads only the keys
      // it names (never this one), and the importer reads none of the app's own lines.
      ...(dropArchived && before.assigneeContactId ? { dropped: before.assigneeContactId } : {}),
    },
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
          // A contractor's Mark done note is written a millisecond before the move to Review, as it always was, so
          // Activity keeps that order. The "At finish" set finds it by its statusEventId; only a Mark done from
          // before MARK_DONE_TIED_SINCE is found by that timing (tasks/media.ts markDoneComment).
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
  const audience = await notify(tx, task, p, { kind: "STATUS", visibility, to }, summary, now, {
    eventId: statusEvent.id,
    from: before.status,
    ...(before.status === "SCHEDULED" ? { fromDay: toYmd(before.scheduledFor) ?? "" } : {}),
    ...(noteEvent && p.kind !== "contractor" && note ? { noteEventId: noteEvent.event.id } : {}),
  });
  // A canceled open job tells its contractor there's no need to go (the Canceled line itself stays Internal).
  if (to === "CANCELED" && isActiveStatus(before.status) && task.assigneeContactId) {
    await notifyOff(tx, task, task.assigneeContactId, p, `canceled "${task.title}"`, now);
  }

  if (to === "DONE" || reopening) {
    await logDeal(tx, task.dealId, p, `Task ${to === "DONE" ? "completed" : "reopened"}: ${task.title}`, now, to === "DONE" ? statusEvent.id : undefined);
  }
  const nextTaskId = finishing ? await createNextRepeat(tx, task, p, now) : null;
  const nextDue = nextTaskId ? toYmd((await tx.task.findUnique({ where: { id: nextTaskId }, select: { dueDate: true } }))?.dueDate) : null;
  // Done to Canceled isn't a reopen: the copy stays.
  if (before.status === "DONE" && isActiveStatus(to)) await takeBackRepeat(tx, taskId);
  return { task, nextTaskId, nextDue, statusEventId: statusEvent.id, noteEventId: noteEvent?.event.id ?? null, emailsContractor: audience === "contractor" };
}

type ApprovalEmail = { sentAt: Date | null; lastError: string | null; openKey: string | null; attempts: number };

/**
 * What an approval's email rows say about its Undo, as one toast line, or
 * null when nothing stops it. Since Nov 15 an approval emails nobody
 * (rules.ts notifyAudience), so only an approval queued before then has rows. Sent (`sentAt` with no `lastError`): Zack has
 * it. On its way (`sentAt` null, claimed, a try spent): a send run has it,
 * or it failed and waits to try again, and either way it may reach him. A
 * row closed without sending (`sentAt` with a `lastError`: nothing left in
 * it, no login, given up) never reached him, so it doesn't stop the Undo.
 */
export function approvalEmailRefusal(rows: readonly ApprovalEmail[]): string | null {
  const emailed = approvalEmailState(rows);
  if (emailed === "sent") return "Email already sent. Change the status.";
  if (emailed === "sending") return "The email is on its way. Change the status.";
  return null;
}

/**
 * The same read of a job's email rows, without Approve's words: "sent",
 * "sending" (on its way), or null when nothing stops an Undo. Add's Undo
 * says it in lines of its own (undoAddDraft), since the status menu is no way
 * back to a draft.
 */
export function approvalEmailState(rows: readonly ApprovalEmail[]): "sent" | "sending" | null {
  if (rows.some((e) => e.sentAt !== null && e.lastError === null)) return "sent";
  if (rows.some((e) => e.sentAt === null && e.openKey === null && e.attempts > 0)) return "sending";
  return null;
}

/**
 * Approve's Undo (activity 2.8): the job goes back to Review as if it had not
 * been approved. A plain `setStatus(REVIEW)` would not do: it writes a Shared
 * status line, so Zack is emailed "moved it to Review" and the portal shows
 * "Connor moved it to Review", and it becomes the latest move to Review, so
 * the contractor loses the late-upload hour after his own Send for review. This writes
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
 * approval is not the latest status line, and, for an approval from before
 * approvals stopped emailing, once its email is sent or on its way
 * (approvalEmailRefusal): by then Zack has been told, or may be, and the
 * status menu is the honest way back. A row the drain closed
 * without sending doesn't stop it. A retry of an Undo that already went
 * through is a quiet success. Lock order: this task, then its contractor's
 * Contact (FOR SHARE: one archived since the approval doesn't get the job
 * back, and the line says so), then its email rows naming the approval (id
 * order), then takeBackRepeat's copy and the copy's email rows (id order).
 * The drain locks email rows only.
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
  // Back in Review is open work: a contractor archived since the approval doesn't get it back (as setStatus's
  // reopen). Their contact is locked after this task and before the email rows, the order every assigning path keeps.
  const dropArchived = before.assigneeContactId ? await contactArchivedLocked(tx, before.assigneeContactId) : false;
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
    data: {
      status: "REVIEW",
      completedAt: null,
      completedByUserId: null,
      completedByContactId: null,
      ...(dropArchived ? { assigneeContactId: null } : {}),
      ...editStamp(p, now),
    },
  });
  if (dropArchived && before.assigneeContactId) {
    await addEvent(tx, taskId, p, archivedAssigneeLine(before.assigneeContactId));
    await syncAssigneeAccess(tx, task, null, p, now);
  }
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
 * A copy never goes to an archived contractor: it starts unassigned, and
 * its CREATED line names them (`archivedAssignee`, worded by activity.ts).
 * Everything else it answers is as before. It reads `archivedAt` with a
 * plain read and runs no raw SQL, as the importer requires of core
 * (asana/import.test.ts); setStatus has locked the contact (FOR SHARE) right
 * after the task before calling it, so in the app that read holds until the
 * finish commits. The importer's close takes no lock and needs none: its task
 * stays the contractor's open job in every other transaction's view until it
 * commits with the copy (and an assignment it makes holds the contact's row
 * through the foreign key), so an Archive beside it either counts that job
 * and refuses, or waits and counts the copy.
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
  const contact = done.assigneeContactId ? await tx.contact.findUnique({ where: { id: done.assigneeContactId }, select: { archivedAt: true } }) : null;
  const archivedAssignee = contact?.archivedAt ? done.assigneeContactId : null;

  const next = await tx.task.create({
    data: {
      title: done.title,
      description: done.description,
      status: "OPEN", // status-write: a fresh copy starts as To do
      dueDate: ymdToDate(due),
      propertyId: done.propertyId,
      unitLabel: done.unitLabel,
      assigneeUserId: done.assigneeUserId,
      assigneeContactId: archivedAssignee ? null : done.assigneeContactId,
      assigneeName: done.assigneeName,
      bucket: done.bucket,
      repeatRule: rule,
      repeatSeriesId: seriesId,
      createdByUserId: done.createdByUserId,
      // No entryPermittedAt: each visit needs the tenants' own yes (docs/specs/tenants.md T8).
    },
  });
  const items = await tx.taskChecklistItem.findMany({ where: { taskId: done.id }, orderBy: { position: "asc" } });
  if (items.length) {
    await tx.taskChecklistItem.createMany({ data: items.map((i) => ({ taskId: next.id, title: i.title, position: i.position })) });
  }
  await addEvent(
    tx,
    next.id,
    { kind: "system", label: "Repeats" },
    { kind: "CREATED", data: { repeatOf: done.id, due, ...(archivedAssignee ? { archivedAssignee } : {}) } },
  );
  await addEvent(tx, done.id, { kind: "system", label: "Repeats" }, { kind: "REPEAT_CREATED", data: { next: next.id, due } });
  if (next.assigneeContactId) {
    await syncAssigneeAccess(tx, next, next.assigneeContactId, p, now);
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
  const emails = await tx.$queryRaw<{ sentAt: Date | null; lastError: string | null; attempts: number }[]>`
    SELECT "sentAt", "lastError", "attempts" FROM "NotificationOutbox" WHERE "taskId" = ${made.nextId} ORDER BY "id" FOR UPDATE`;
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
  /**
   * Permission to enter (docs/specs/tenants.md section 8): on stamps the server's clock, off clears it. Compared with
   * whether it holds for the household there now, so turning it on again after a new household moved in writes a new
   * stamp, and a pick that changes nothing writes no line.
   */
  entryPermitted?: boolean;
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
  return writePatch(tx, taskId, patch, p, now, "refuse");
}

/**
 * patchTask's write. `discarded` says what a discarded draft gets: every edit sent by id is refused, as any write
 * to one is (refuseDiscarded). Only a unit renamed on its building is carried onto it (renameTaskUnits).
 */
async function writePatch(tx: Tx, taskId: string, patch: TaskPatch, p: Principal, now: Date, discarded: "refuse" | "carry"): Promise<Task> {
  if (p.kind === "contractor") throw new TaskRuleError("Contractors can't edit job details.");
  // A reassignment or a guarded notes save locks the row first, as setStatus does, so two at once (both
  // partners, two tabs) run one after the other and the second sees the first.
  const guarded = patch.assignee !== undefined || (patch.description !== undefined && patch.expectedDescription !== undefined);
  if (guarded) await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${taskId} FOR NO KEY UPDATE`;
  const before = await tx.task.findUnique({ where: { id: taskId } });
  if (!before) throw new TaskRuleError("That task no longer exists.");
  if (discarded === "refuse") refuseDiscarded(before);
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
  // Permission to enter belongs to the home, so a new unit or property clears it with a line of its own (T8); a new
  // assignee keeps it. Only a permission that still held gets the line.
  const homeMoved = data.propertyId !== undefined || data.unitLabel !== undefined;
  if (before.entryPermittedAt && (homeMoved || patch.entryPermitted !== undefined)) {
    const held = !!(await readTaskHome(tx, before, now))?.access.permitted;
    if (homeMoved) {
      data.entryPermittedAt = null;
      if (held) events.push({ kind: "ACCESS", data: { entry: { from: true, to: false }, cleared: "unit" } });
    } else if (patch.entryPermitted !== held) {
      data.entryPermittedAt = patch.entryPermitted ? now : null;
      events.push({ kind: "ACCESS", data: { entry: { from: held, to: !!patch.entryPermitted } } });
    }
  } else if (patch.entryPermitted && !homeMoved) {
    data.entryPermittedAt = now;
    events.push({ kind: "ACCESS", data: { entry: { from: false, to: true } } });
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
      // A picker loaded before the contractor was archived still offers them. One who already has the job keeps it,
      // and a closed job can go back to them: only open work is refused (ARCHIVED_ASSIGNEE_LINE). The row lock above
      // holds the status read here until this commits, so a reopen runs after it and starts the job unassigned.
      // A draft is work about to open, so it refuses them as open work does.
      if (contactId && contactId !== before.assigneeContactId && (await contactArchivedLocked(tx, contactId)) && refusesArchived(before.status)) {
        throw new TaskRuleError(ARCHIVED_ASSIGNEE_LINE);
      }
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
    await syncAssigneeAccess(tx, after, newContactId, p, now);
    if (newContactId) await notify(tx, after, p, { kind: "ASSIGNED", visibility: "SHARED" }, assignedSummary(after, now), now);
    // The contractor taken off an open job hears so, so nobody makes the trip (docs/specs/contractor-job-emails.md 6).
    if (before.assigneeContactId && isActiveStatus(before.status)) {
      // The job as they knew it, so giving it straight back says nothing unless it changed meanwhile (content.ts offItems).
      const job = jobKey({ status: before.status, due: toYmd(before.dueDate), scheduled: toYmd(scheduledDay(before)), notes: before.description });
      await notifyOff(tx, after, before.assigneeContactId, p, `took you off "${after.title}"`, now, job);
    }
  } else if (after.assigneeContactId) {
    // Same contractor: tell them about what they can see change. Due (TARGET) and their scheduled day (DAY) are
    // separate lines (docs/specs/contractor-scheduled-date.md), so the email names which one moved.
    const dueBefore = toYmd(before.dueDate);
    const dueAfter = toYmd(after.dueDate);
    if (dueBefore !== dueAfter) {
      const to = dueAfter ? emailDay(dueAfter, now) : "no date";
      await notify(tx, after, p, { kind: "TARGET", visibility: "SHARED" }, `moved "${after.title}" to ${to}`, now, { from: dueBefore ?? "" });
    }
    const dayBefore = toYmd(scheduledDay(before));
    const dayAfter = toYmd(scheduledDay(after));
    if (dayBefore !== dayAfter) {
      const to = dayAfter ? emailDay(dayAfter, now) : "no date";
      await notify(tx, after, p, { kind: "DAY", visibility: "SHARED" }, `moved "${after.title}" to ${to}`, now, { from: dayBefore ?? "" });
    }
    if (events.some((e) => e.kind === "NOTES")) {
      await notify(tx, after, p, { kind: "NOTES", visibility: "SHARED" }, `updated the notes on "${after.title}"`, now, { from: notesFingerprint(before.description) });
    }
  }
  return after;
}

/**
 * A contractor sets or moves their scheduled day: the day they plan to go,
 * usually agreed with the tenant (docs/specs/contractor-scheduled-date.md,
 * Q1 and Q2). It never touches the due date, which is HG Capital's alone. On
 * a To do or Waiting job it is a move to Scheduled through setStatus, whose
 * line reads "scheduled "Fix the sink" for Tue, Nov 17" to both partners; a
 * Waiting reason clears. On a Scheduled job it moves the day, earlier or
 * later, no approval, and both partners get "moved "Fix the sink" to Mon,
 * Nov 23 (was Tue, Nov 17)". Never on an In progress, Review or closed job.
 * Marks the task edited in the app, so the Asana sync holds it back.
 */
export async function scheduleByContractor(tx: Tx, taskId: string, date: Ymd, p: Extract<Principal, { kind: "contractor" }>, now = new Date()): Promise<Task> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !ymdToDate(date)) throw new TaskRuleError("Pick a day.");
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${taskId} FOR NO KEY UPDATE`;
  await assertContractorAccess(tx, taskId, p);
  const before = await tx.task.findUnique({ where: { id: taskId } });
  if (!before) throw new TaskRuleError("That job no longer exists.");
  if (!contractorMaySetDate(before.status)) throw new TaskRuleError("This job's day can't change now.");
  if (before.status !== "SCHEDULED") return (await setStatus(tx, taskId, "SCHEDULED", p, { scheduledFor: date }, now)).task;
  const from = toYmd(before.scheduledFor);
  if (from === date) return before;
  const after = await tx.task.update({ where: { id: taskId }, data: { scheduledFor: ymdToDate(date), ...editStamp(p, now) } });
  await addEvent(tx, taskId, p, { kind: "SCHEDULED", data: { from, to: date } });
  const was = from ? ` (was ${emailDay(from, now)})` : "";
  await notify(tx, after, p, { kind: "DAY", visibility: "SHARED" }, `moved "${after.title}" to ${emailDay(date, now)}${was}`, now, { from: from ?? "" });
  return after;
}


/**
 * A contractor takes their scheduled day off (Connor, Nov 22: Reschedule offers Remove day), so the job asks for a day
 * again. On a Scheduled job it is a move back to To do through setStatus with the day cleared, and both partners get
 * "unscheduled "Fix the sink""; on a To do or Waiting job that still carries a day, the day alone clears and they get
 * "unscheduled "Fix the sink" (was Tue, Nov 17)". Never on an In progress, Review or closed job, and never touches
 * Due. Marks the task edited in the app, as scheduleByContractor does.
 */
export async function unscheduleByContractor(tx: Tx, taskId: string, p: Extract<Principal, { kind: "contractor" }>, now = new Date()): Promise<Task> {
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${taskId} FOR NO KEY UPDATE`;
  await assertContractorAccess(tx, taskId, p);
  const before = await tx.task.findUnique({ where: { id: taskId } });
  if (!before) throw new TaskRuleError("That job no longer exists.");
  if (!contractorMaySetDate(before.status)) throw new TaskRuleError("This job's day can't change now.");
  if (before.status === "SCHEDULED") return (await setStatus(tx, taskId, "OPEN", p, { scheduledFor: null }, now)).task;
  const from = toYmd(before.scheduledFor);
  if (!from) return before;
  const after = await tx.task.update({ where: { id: taskId }, data: { scheduledFor: null, ...editStamp(p, now) } });
  await addEvent(tx, taskId, p, { kind: "SCHEDULED", data: { from, to: null } });
  await notify(tx, after, p, { kind: "DAY", visibility: "SHARED" }, `unscheduled "${after.title}" (was ${emailDay(from, now)})`, now, { from });
  return after;
}

/**
 * A unit renamed on its property (properties/service.ts replaceUnits): every
 * task there that names it by its old label (case-insensitive, as the
 * lockbox lookup matches) moves to the new one, so a job keeps its lockbox
 * code (D21) and its unit reads the same everywhere. Each goes through
 * patchTask, so it gets the usual internal unit line. Rows are matched
 * against the labels as they were, so two units swapping names swap their
 * tasks. A draft is carried too, and so is one a partner discarded: its Undo
 * brings it back within ten minutes, and Add refuses a draft whose unit is no
 * longer on its building. Returns the ids of the tasks it changed.
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
    await writePatch(tx, t.id, { unitLabel: to }, p, now, "carry");
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
  if (p.kind === "contractor") await assertContractorAccess(tx, taskId, p);
  refuseDiscarded(task);
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
  const audienceContactId = audienceOf(p, task);
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

/**
 * addLateContractorBatch's refusal for a job HG reopened while it waited for
 * the task row. The batch step (portal/job-batch.ts postOwn) takes it as the
 * cue to post the same files the active way, so no screen shows it there.
 */
export const JOB_OPEN_AGAIN = "This job is open again. Try again.";

/**
 * A contractor's photos that are posted after HG approved or canceled the job
 * (uploads question 4: recorded inside the hour after Mark done, or before
 * the cancel, or a phone's outbox catching up), told to HG once per batch:
 * one update with no text ("Zack added 3 photos", the line a batch post
 * makes) and one line in each partner's email bundle, through notify like
 * any comment. The job's status doesn't change.
 * It is never an update Undo takes back: it isn't marked `batch`, and
 * takeBackContractorPost refuses a job that isn't active. It is written after
 * the Mark done, so it is never the At finish set and never counts toward
 * one. Only the contractor's own unposted files on this job are linked; with
 * none left (another send took them) it is refused as addComment refuses, so
 * the losing side leaves no empty update.
 *
 * The portal's batch step (portal/job-batch.ts postBatchIn) sends a job here
 * once it is no longer active, and when an approve landed before addComment
 * took the task row (addComment then refuses under its lock, before writing
 * anything).
 * It takes the task row first, as addComment does, then reads the task and
 * checks access under that lock, so it runs in every writer's order: the task
 * row, then the update and its files, then the email rows. A late send and an
 * active send of the same files wait on each other at the task row, never
 * crosswise, and the one that waited finds the files taken and links none
 * (job-batch.pg.test.ts runs both races on Postgres).
 * Under that lock it checks the job is still closed: one HG reopened while
 * this waited is refused with JOB_OPEN_AGAIN before anything is written, as
 * addComment refuses a job that closed with "This job is closed.", and the
 * batch step posts the same files the active way in the same transaction.
 */
export async function addLateContractorBatch(tx: Tx, taskId: string, attachmentIds: string[], p: Principal, now = new Date()): Promise<TaskEvent> {
  if (p.kind !== "contractor") throw new TaskRuleError("Only a contractor's late photos post this way.");
  if (attachmentIds.length === 0) throw new TaskRuleError("Write something or add a photo.");
  await lockTask(tx, taskId);
  const task = await tx.task.findUnique({ where: { id: taskId } });
  if (!task) throw new TaskRuleError("That task no longer exists.");
  await assertContractorAccess(tx, taskId, p);
  if (isActiveStatus(task.status)) throw new TaskRuleError(JOB_OPEN_AGAIN);
  const visibility: Visibility = "SHARED";
  const audienceContactId = writeAudience(kindOf(p), task.assigneeContactId);
  const event = await addEvent(tx, taskId, p, { kind: "COMMENT", visibility, body: null, audienceContactId, data: { late: true } });
  const { count: linked } = await tx.taskAttachment.updateMany({
    where: { id: { in: attachmentIds }, taskId, eventId: null, deletedAt: null, uploadedByContactId: p.contactId, asanaGid: null },
    data: { eventId: event.id, visibility, audienceContactId },
  });
  if (linked === 0) throw new TaskRuleError("Write something or add a photo.");
  await tx.task.update({ where: { id: taskId }, data: editStamp(p, now) });
  await notify(tx, task, p, { kind: "COMMENT", visibility }, commentSummary("", linked), now, { eventId: event.id });
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
 * both are held, is the one the checks use. It also says whether the task is
 * a draft a partner discarded, where a comment's edit, delete and restore are
 * refused like any other write (refuseDiscarded).
 */
async function ownComment(tx: Tx, eventId: string, p: Principal, { deleted }: { deleted: boolean | null }): Promise<TaskEvent> {
  const named = await tx.taskEvent.findUnique({ where: { id: eventId }, select: { taskId: true } });
  if (!named) throw new TaskRuleError("That comment no longer exists.");
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${named.taskId} FOR NO KEY UPDATE`;
  await tx.$executeRaw`SELECT 1 FROM "TaskEvent" WHERE "id" = ${eventId} FOR NO KEY UPDATE`;
  const ev = await tx.taskEvent.findUnique({ where: { id: eventId }, include: { task: { select: { discardedAt: true } } } });
  if (!ev || ev.kind !== "COMMENT") throw new TaskRuleError("That comment no longer exists.");
  if (!isCommentAuthor(ev, p)) throw new TaskRuleError("You can only change your own comments.");
  if (deleted === false && ev.deletedAt) throw new TaskRuleError("That comment was deleted.");
  if (p.kind === "contractor") await assertContractorAccess(tx, ev.taskId, p);
  refuseDiscarded(ev.task);
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
 * still active, only while `undoable` says the window is open
 * (portal/job-view.ts undoWindowOpen), and only while the job hasn't gone to
 * Review since: a Mark done can have counted the post's photos. A batch posted
 * in the hour after Mark done can still be taken back.
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
  await assertContractorAccess(tx, taskId, p);
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
  const review = await tx.taskEvent.findFirst({
    where: { taskId, kind: "STATUS", data: { path: ["to"], equals: "REVIEW" } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (review && review.createdAt.getTime() >= event.createdAt.getTime()) throw new TaskRuleError("It's too late to take that back.");
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
  if (p.kind === "contractor") await assertContractorAccess(tx, taskId, p);
  refuseDiscarded(task);
  const visibility: Visibility = p.kind === "contractor" ? "SHARED" : (opts.visibility ?? "INTERNAL");
  const audienceContactId = audienceOf(p, task);
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
  const posted = await tx.taskAttachment.findUnique({ where: { id: att.id }, select: { eventId: true, filename: true, task: { select: { discardedAt: true } } } });
  if (!posted) return false;
  refuseDiscarded(posted.task);
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
  const att = await tx.taskAttachment.findUnique({ where: { id: attachmentId }, select: { taskId: true, deletedAt: true, task: { select: { discardedAt: true } } } });
  if (!att || att.deletedAt) throw new TaskRuleError("That file no longer exists.");
  refuseDiscarded(att.task);
  await tx.taskAttachment.update({ where: { id: attachmentId }, data: { filename } });
  await tx.task.update({ where: { id: att.taskId }, data: editStamp(p, now) });
  return { taskId: att.taskId };
}

export async function setChecklistItem(tx: Tx, itemId: string, done: boolean, p: Principal, now = new Date()) {
  // Its task and then the item, locked before the item is read, as rename and remove lock them: a tick that lands
  // beside a Remove or a task delete waits, then finds the item gone and says so, instead of failing on a row that
  // vanished between the read and the write (P2025).
  await lockChecklistItem(tx, itemId);
  const item = await tx.taskChecklistItem.findUnique({ where: { id: itemId }, include: { task: { select: { id: true, status: true, discardedAt: true } } } });
  if (!item) throw new TaskRuleError("That checklist item no longer exists.");
  if (p.kind === "contractor") {
    await assertContractorAccess(tx, item.taskId, p);
    if (!isActiveStatus(item.task.status)) throw new TaskRuleError("This job is closed.");
  }
  refuseDiscarded(item.task);
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

export async function addChecklistItem(tx: Tx, taskId: string, title: string, p: Principal, now = new Date(), checkKey: string | null = null) {
  if (p.kind === "contractor") throw new TaskRuleError("Contractors can't add checklist items yet.");
  const t = title.trim();
  if (!t) throw new TaskRuleError("The item needs a name.");
  // The task row first, as every writer on a task takes it: two adds at once take the next place one after the
  // other, and an add beside a task delete waits and then finds the task gone.
  await tx.$executeRaw`SELECT 1 FROM "Task" WHERE "id" = ${taskId} FOR NO KEY UPDATE`;
  const task = await tx.task.findUnique({ where: { id: taskId }, select: { id: true, discardedAt: true } });
  if (!task) throw new TaskRuleError("That task no longer exists.");
  refuseDiscarded(task);
  const last = await tx.taskChecklistItem.findFirst({ where: { taskId }, orderBy: { position: "desc" }, select: { position: true } });
  const item = await tx.taskChecklistItem.create({ data: { taskId, title: t, position: (last?.position ?? -1) + 1, checkKey } });
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
  const item = await tx.taskChecklistItem.findUnique({ where: { id: itemId }, include: { task: { select: { discardedAt: true } } } });
  if (!item) throw new TaskRuleError("That checklist item no longer exists.");
  refuseDiscarded(item.task);
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
  const item = await tx.taskChecklistItem.findUnique({ where: { id: itemId }, include: { task: { select: { discardedAt: true } } } });
  if (!item) throw new TaskRuleError("That checklist item no longer exists.");
  refuseDiscarded(item.task);
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
  const task = await tx.task.findUnique({ where: { id: snapshot.taskId }, select: { id: true, discardedAt: true } });
  if (!task) throw new TaskRuleError("This task is gone, so the item can't come back.");
  refuseDiscarded(task);
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
