import type { Prisma } from "@prisma/client";
import { ymdToDate } from "@/lib/dates";
import { addEvent, createNextRepeat, grantAssigneeAccess, type Principal, type Tx } from "@/lib/tasks/core";
import { describeConflict, type AttachmentPlan, type ChecklistPlan, type EventPlan, type Person, type TaskPlan, type TaskWrite, type TemplatePlan } from "./map";

/**
 * Writes an ImportPlan (./map.ts) inside the caller's transaction: the
 * importer's service layer. scripts/asana/20-load.ts and 30-delta.ts call
 * these and nothing else, so every importer write is in this file.
 *
 * It never emails anyone. Each write is a direct insert or update (keeping
 * Asana's ids and timestamps) or a core function called as the "asana"
 * principal, which rules.ts notifyAudience never routes to anyone. Nothing
 * here touches the email outbox; import.test.ts runs these writers on a fake
 * transaction that fails if anything does, and fails if this file names it.
 */

export const ASANA_PRINCIPAL: Principal = { kind: "asana", label: "Asana sync" };

/** The app edited the row between planning and writing. The task is skipped; the next run picks it up. */
export class StalePlanError extends Error {
  constructor(readonly taskId: string) {
    super(`task ${taskId} was edited in the app after the plan was made`);
    this.name = "StalePlanError";
  }
}

const instant = (iso: string | null | undefined) => (iso ? new Date(iso) : null);
const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

const DAY_FIELDS = new Set(["dueDate", "startDate"]);
const INSTANT_FIELDS = new Set(["completedAt", "createdAt"]);

function taskData(w: TaskWrite): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(w)) {
    if (v === undefined) continue;
    d[k] = DAY_FIELDS.has(k) ? ymdToDate(v as string | null) : INSTANT_FIELDS.has(k) ? instant(v as string | null) : v;
  }
  return d;
}

function eventData(taskId: string, e: EventPlan): Prisma.TaskEventCreateManyInput {
  return {
    taskId,
    kind: e.kind,
    visibility: e.visibility,
    actorUserId: e.actorUserId,
    actorContactId: e.actorContactId,
    actorLabel: e.actorLabel,
    body: e.body,
    data: json(e.data),
    source: "ASANA",
    asanaStoryGid: e.asanaStoryGid,
    createdAt: new Date(e.createdAt),
  };
}

function checklistData(w: ChecklistPlan["write"]): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(w)) {
    if (v === undefined) continue;
    d[k] = k === "dueDate" ? ymdToDate(v as string | null) : k === "doneAt" || k === "createdAt" ? instant(v as string | null) : v;
  }
  return d;
}

export interface TaskWriteResult {
  created: boolean;
  eventsAdded: number;
  checklistWritten: number;
  conflicts: number;
  nextRepeatId: string | null;
  /** This new task was Asana's copy of a repeating task and joined that task's series. */
  joinedSeriesOf: string | null;
}

/**
 * Put a new task, Asana's next copy of the repeating task `plan.seriesFrom`,
 * in that task's series with its repeat rule: what createNextRepeat would
 * have made, but keeping Asana's task, its due date and its history.
 */
async function joinSeries(tx: Tx, plan: TaskPlan): Promise<string | null> {
  if (!plan.seriesFrom) return null;
  const src = await tx.task.findUnique({ where: { id: plan.seriesFrom }, select: { id: true, repeatRule: true, repeatSeriesId: true } });
  if (!src || src.repeatRule == null) return null;
  const seriesId = src.repeatSeriesId ?? src.id;
  if (!src.repeatSeriesId) await tx.task.update({ where: { id: src.id }, data: { repeatSeriesId: seriesId } });
  await tx.task.update({ where: { id: plan.taskId }, data: { repeatRule: json(src.repeatRule), repeatSeriesId: seriesId } });
  await addEvent(tx, src.id, ASANA_PRINCIPAL, { kind: "REPEAT_CREATED", data: json({ next: plan.taskId, due: plan.write.dueDate ?? null, madeInAsana: true }) });
  return src.id;
}

/**
 * One task: its row, its timeline (append-only by story gid), its checklist,
 * contractor access for its assignee, and the next copy when Asana completed
 * a repeating task (or, when Asana made that copy itself, its place in the
 * series). Safe to re-run: nothing is added twice.
 */
export async function writeTask(tx: Tx, plan: TaskPlan, now = new Date()): Promise<TaskWriteResult> {
  const sync = { asanaLastSynced: json(plan.baseline), asanaSyncedAt: now };
  if (plan.op === "create") {
    await tx.task.create({
      data: { ...(taskData(plan.write) as Prisma.TaskUncheckedCreateInput), id: plan.taskId, asanaId: plan.asanaGid, ...sync },
    });
  } else {
    // Compare-and-set: the row is written only if the app hasn't edited it since the plan was made.
    // One statement, so an app edit committing in between makes it match nothing instead of being overwritten.
    const r = await tx.task.updateMany({
      where: { id: plan.taskId, appEditedAt: plan.rowAppEditedAt ? new Date(plan.rowAppEditedAt) : null },
      data: { ...(taskData(plan.write) as Prisma.TaskUncheckedUpdateManyInput), ...sync },
    });
    if (r.count !== 1) throw new StalePlanError(plan.taskId);
  }

  // CREATED, once: the CSV rows had no timeline at all.
  const hasCreated = await tx.taskEvent.findFirst({ where: { taskId: plan.taskId, kind: "CREATED" }, select: { id: true } });
  let eventsAdded = 0;
  if (!hasCreated) {
    await tx.taskEvent.create({
      data: {
        taskId: plan.taskId,
        kind: "CREATED",
        visibility: "INTERNAL",
        source: "ASANA",
        actorUserId: plan.created.actor.userId,
        actorContactId: plan.created.actor.contactId,
        actorLabel: plan.created.actor.label,
        data: json({
          asanaGid: plan.asanaGid,
          ...(plan.created.htmlNotes ? { htmlNotes: plan.created.htmlNotes } : {}),
          ...(plan.seriesFrom ? { repeatOf: plan.seriesFrom } : {}),
        }),
        ...(plan.created.createdAt ? { createdAt: new Date(plan.created.createdAt) } : {}),
      },
    });
    eventsAdded++;
  }

  const gids = plan.events.map((e) => e.asanaStoryGid);
  const have = new Set(
    gids.length
      ? (await tx.taskEvent.findMany({ where: { asanaStoryGid: { in: gids } }, select: { asanaStoryGid: true } })).map((e) => e.asanaStoryGid)
      : [],
  );
  const add = plan.events.filter((e) => !have.has(e.asanaStoryGid));
  if (add.length) {
    const r = await tx.taskEvent.createMany({ data: add.map((e) => eventData(plan.taskId, e)), skipDuplicates: true });
    eventsAdded += r.count;
  }
  for (const c of plan.conflicts) {
    await addEvent(tx, plan.taskId, ASANA_PRINCIPAL, {
      kind: "CONFLICT",
      visibility: "INTERNAL",
      body: describeConflict(c),
      data: json({ field: c.field, app: c.app, asana: c.asana, base: c.base }),
    });
  }

  let checklistWritten = 0;
  for (const c of plan.checklist) {
    if (c.op === "create") {
      await tx.taskChecklistItem.upsert({
        where: { asanaGid: c.asanaGid },
        create: { ...(checklistData(c.write) as Prisma.TaskChecklistItemUncheckedCreateInput), taskId: plan.taskId, asanaGid: c.asanaGid },
        update: {},
      });
      checklistWritten++;
    } else if (c.op === "update" && Object.keys(c.write).length) {
      await tx.taskChecklistItem.update({ where: { asanaGid: c.asanaGid }, data: checklistData(c.write) });
      if (c.write.title !== undefined || c.write.done !== undefined) checklistWritten++;
    }
  }

  // Only a confirmed contractor match is ever assigned, so access follows the assignee (D12, D17).
  await grantAssigneeAccess(tx, plan.taskId, plan.contactId, ASANA_PRINCIPAL, now);

  let nextRepeatId: string | null = null;
  if (plan.repeatOnClose) {
    const done = await tx.task.findUnique({ where: { id: plan.taskId } });
    if (done) nextRepeatId = await createNextRepeat(tx, done, ASANA_PRINCIPAL, now);
  }
  const joinedSeriesOf = plan.op === "create" ? await joinSeries(tx, plan) : null;
  return { created: plan.op === "create", eventsAdded, checklistWritten, conflicts: plan.conflicts.length, nextRepeatId, joinedSeriesOf };
}

/** What the file phase stored in Blob for one attachment. */
export interface StoredFile {
  url: string;
  pathname: string;
  size: number;
  thumbPathname: string | null;
  posterPathname: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
}

/**
 * One file row, hung on its timeline event. Shared (D17). Idempotent by
 * Asana gid; the script checks the same before uploading, so a file is
 * never stored twice.
 */
export async function writeAttachment(tx: Tx, a: AttachmentPlan, stored: StoredFile | null): Promise<"created" | "exists"> {
  if (await tx.taskAttachment.findUnique({ where: { asanaGid: a.asanaGid }, select: { id: true } })) return "exists";
  if (a.source.type === "missing") throw new Error(`no bytes and no link for attachment ${a.asanaGid}`);
  if (a.source.type === "file" && !stored) throw new Error(`attachment ${a.asanaGid} wasn't uploaded`);
  const event = await tx.taskEvent.findUnique({ where: { asanaStoryGid: a.eventStoryGid }, select: { id: true, kind: true, data: true, taskId: true } });
  const onThisTask = event && event.taskId === a.taskId ? event : null;
  const att = await tx.taskAttachment.create({
    data: {
      taskId: a.taskId,
      eventId: onThisTask?.id ?? null,
      url: stored?.url ?? null,
      pathname: stored?.pathname ?? null,
      linkUrl: a.source.type === "link" ? a.source.url : null,
      filename: a.filename.slice(0, 255) || "file",
      size: stored ? Math.max(0, Math.trunc(stored.size)) : null,
      contentType: a.contentType,
      kind: a.kind,
      visibility: "SHARED",
      uploadedByUserId: a.uploadedByUserId,
      uploadedByContactId: a.uploadedByUserId ? null : a.uploadedByContactId,
      thumbPathname: stored?.thumbPathname ?? null,
      posterPathname: stored?.posterPathname ?? null,
      width: stored?.width ?? null,
      height: stored?.height ?? null,
      durationSec: stored?.durationSec ?? null,
      asanaGid: a.asanaGid,
      ...(a.createdAt ? { createdAt: new Date(a.createdAt) } : {}),
    },
  });
  if (onThisTask?.kind === "ATTACHMENT") {
    const data = onThisTask.data && typeof onThisTask.data === "object" && !Array.isArray(onThisTask.data) ? onThisTask.data : {};
    await tx.taskEvent.update({ where: { id: onThisTask.id }, data: { data: json({ ...data, attachmentId: att.id }) } });
  }
  return "created";
}

/**
 * Save each confirmed match's Asana gid on the User or Contact, so later runs
 * (and the delta) match by gid. A row already linked to someone else is left
 * alone and reported.
 */
export async function writeIdentity(tx: Tx, people: readonly Person[]): Promise<{ linked: number; skipped: string[] }> {
  let linked = 0;
  const skipped: string[] = [];
  for (const p of people) {
    const m = p.match;
    const target =
      m.kind === "user" ? { kind: "user" as const, id: m.userId } : m.kind === "contact" && m.confirmed ? { kind: "contact" as const, id: m.contactId } : null;
    if (!target) continue;
    const row =
      target.kind === "user"
        ? await tx.user.findUnique({ where: { id: target.id }, select: { asanaGid: true } })
        : await tx.contact.findUnique({ where: { id: target.id }, select: { asanaGid: true } });
    if (!row || row.asanaGid === p.gid) continue;
    if (row.asanaGid) {
      // One person, two Asana accounts: both still match by email; only the first is saved.
      skipped.push(`${p.name} (Asana ${p.gid}) is a second Asana account for ${target.kind} ${target.id}, which keeps Asana ${row.asanaGid}`);
      continue;
    }
    const taken =
      target.kind === "user"
        ? await tx.user.findUnique({ where: { asanaGid: p.gid }, select: { id: true } })
        : await tx.contact.findUnique({ where: { asanaGid: p.gid }, select: { id: true } });
    if (taken) {
      skipped.push(`${p.name} (Asana ${p.gid}) is already linked to ${target.kind} ${taken.id}, not ${target.id}`);
      continue;
    }
    if (target.kind === "user") await tx.user.update({ where: { id: target.id }, data: { asanaGid: p.gid } });
    else await tx.contact.update({ where: { id: target.id }, data: { asanaGid: p.gid } });
    linked++;
  }
  return { linked, skipped };
}

/** A playbook as a template, keyed by its Asana section (D28). An existing one is kept unless `refresh`. */
export async function writeTemplate(tx: Tx, t: TemplatePlan, opts: { refresh?: boolean } = {}): Promise<"created" | "updated" | "kept"> {
  const existing = await tx.taskTemplate.findUnique({ where: { sourceAsanaSectionGid: t.sectionGid }, select: { id: true } });
  const fields = { name: t.name, anchorLabel: t.anchorLabel, items: json(t.items) };
  if (!existing) {
    await tx.taskTemplate.create({ data: { ...fields, sourceAsanaSectionGid: t.sectionGid, description: `Imported from the Asana section "${t.name} [Address]".` } });
    return "created";
  }
  if (!opts.refresh) return "kept";
  await tx.taskTemplate.update({ where: { id: existing.id }, data: fields });
  return "updated";
}

/**
 * D25: hard-delete CSV rows that aren't open work, with their files' rows.
 * Re-checks inside the transaction that each row was never synced by the
 * importer, never edited in the app and has no app timeline events, so a
 * stale list can't take anything else. Returns the Blob paths to delete
 * once the transaction commits.
 */
export async function deleteCsvRows(tx: Tx, ids: readonly string[]): Promise<{ deleted: number; blobPaths: string[] }> {
  if (!ids.length) return { deleted: 0, blobPaths: [] };
  const rows = await tx.task.findMany({
    where: { id: { in: [...ids] }, asanaId: { not: null }, asanaSyncedAt: null, appEditedAt: null, events: { none: { source: { not: "ASANA" } } } },
    select: { id: true, attachments: { select: { url: true, pathname: true, thumbPathname: true, posterPathname: true } } },
  });
  const blobPaths = rows.flatMap((r) => r.attachments.flatMap((a) => [a.url ?? a.pathname, a.thumbPathname, a.posterPathname])).filter((p): p is string => !!p);
  const res = await tx.task.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  return { deleted: res.count, blobPaths };
}
