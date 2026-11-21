import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, Task } from "@prisma/client";
import { contractorArchiveBlockers, contractorJobsWhere, contractorOpenJobs, setContactArchived } from "@/lib/archive";
import { linkLegacyAssignee } from "@/lib/asana/import";
import { todayYmdEastern, ymdToDate } from "@/lib/dates";
import { makeClient } from "@/lib/db-client";
import { claimedRowVerdict, dueRowVerdict, parseItems } from "@/lib/notifications/content";
import { scratchRows } from "@/lib/scratch-rows";
import { recentRows, runSearch } from "@/lib/search-results";
import { contractorCanOpen } from "@/lib/task-scope";
import { buildActivity } from "./activity";
import { listedContactsWhere } from "./assignee-people";
import * as core from "./core";
import { MAX_WAITING_DRAFTS, draftAutoKey, draftBatchPrefix, draftsAddedNames } from "./drafts";
import {
  allTasksWhere,
  dueReminderWhere,
  legacyNameWhere,
  linkedTasksWhere,
  myDraftsWhere,
  openByPropertyWhere,
  openMakeTaskItemsWhere,
  othersDraftsWhere,
  paletteTaskWhere,
  playbookOpenTasksWhere,
  propertyOpenTasksWhere,
  recentAssignmentsWhere,
  takenHerePhotosWhere,
  taskPageWhere,
  todayWhere,
  viewScopeWhere,
  workedSinceWhere,
  DRAFTS_ORDER_BY,
  type AllFilters,
} from "./list-query";
import { APPROVAL_UNDO_MS, BUNDLE_QUIET_MS, DISCARD_KEEP_MS } from "./rules";

/**
 * Drafts from Claude on a real Postgres through the app's driver
 * (docs/specs/tasks-from-claude.md, section 13 step 3): a draft is absent
 * from every list, count, search, portal and reminder query; nothing on it
 * gives a contractor access or queues an email; Add does both; Add's Undo
 * takes back the access and the email the Add queued, and is refused once the
 * contractor has opened the job; Discard only marks a draft, its Undo brings
 * it back whole, and the sweep deletes it later; Add all is all or nothing
 * and its Undo is task by task; a save sent twice adds nothing, a key used
 * for other drafts is refused, and waiting drafts are capped.
 *
 * The queries in tasks/queries.ts, portal/queries.ts, missing/queries.ts and
 * the pages load Next and the app's own client, which node:test can't, so
 * each `where` is run here through the builder the code calls
 * (list-query.ts, task-scope.ts, archive.ts; task-scope.test.ts and
 * drafts.test.ts hold the callers to those builders). The send run (notifications/outbox.ts) is the
 * same: its two decisions are content.ts dueRowVerdict and claimedRowVerdict,
 * which are run here on rows as the run reads them.
 *
 * Opt-in like undo-approval.pg.test.ts, by the same guard: `npm test` skips
 * it unless HG_SCRATCH_DATABASE_URL names a local scratch database (its name
 * must contain "scratch"); it writes rows there and deletes them when it finishes
 * (scratch-rows.ts).
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_drafts_scratch npx tsx --test src/lib/tasks/drafts.pg.test.ts
 */

const URL_ENV = process.env.HG_SCRATCH_DATABASE_URL ?? "";

/** A database on this machine whose name says scratch, parsed whole (job-batch.pg.test.ts's rule). */
function isLocalScratch(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "postgresql:" &&
    url.username !== "" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    (url.port === "" || url.port === "5432") &&
    /^\/[a-z0-9_]*scratch[a-z0-9_]*$/.test(url.pathname) &&
    url.search === "" &&
    url.hash === ""
  );
}
const skip = isLocalScratch(URL_ENV) ? false : "set HG_SCRATCH_DATABASE_URL to a local scratch database to run this";
const timeout = 60_000;

type Partner = Extract<core.Principal, { kind: "staff" }>;

let prisma: PrismaClient;
/** What this run makes, deleted when it finishes so the scratch database stays as it was (scratch-rows.ts). */
const made = scratchRows(() => prisma);
/** Letters only, so it is one search word and never an address number. */
let run: string;
let pieter: Partner;
let connor: Partner;
/** Zack gets job emails: a login, a first sign-in, the switch on. */
let zack: Extract<core.Principal, { kind: "contractor" }>;
/** Rob has a login and never signed in, so nothing is emailed to him. */
let robId: string;
let propertyId: string;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  await made.takeTurn(URL_ENV);
  run = `d${(randomUUID() + randomUUID()).replace(/[^a-f]/g, "").slice(0, 10)}x`;
  const p = await made.user({ email: `pieter-${run}@example.test`, name: "Pieter Louw", passwordHash: "scrypt$x" });
  const c = await made.user({ email: `connor-${run}@example.test`, name: "Connor Swofford", passwordHash: "scrypt$x" });
  pieter = { kind: "staff", userId: p.id, label: "Pieter Louw" };
  connor = { kind: "staff", userId: c.id, label: "Connor Swofford" };
  const z = await made.contact({ fullName: `Zack ${run}` });
  await prisma.portalAccount.create({
    data: { contactId: z.id, email: `zack-${run}@example.test`, passwordHash: "scrypt$x", mustChangePassword: false, status: "ACTIVE", lastSignInAt: new Date() },
  });
  zack = { kind: "contractor", contactId: z.id, label: `Zack ${run}` };
  const r = await made.contact({ fullName: `Rob ${run}` });
  await prisma.portalAccount.create({ data: { contactId: r.id, email: `rob-${run}@example.test`, passwordHash: "scrypt$x", status: "ACTIVE" } });
  robId = r.id;
  propertyId = (await made.property({ address: `933 ${run} St, Buffalo, NY 14213` })).id;
});

after(async () => {
  if (skip) return;
  await made.remove();
  await prisma.$disconnect();
});

const inTx = <T>(fn: (tx: core.Tx) => Promise<T>): Promise<T> => prisma.$transaction(fn, { timeout: 30_000 });

/** A draft as Pieter's Claude saves it: for Zack, due today, at the property, with two checklist items. */
async function saveDraft(over: Partial<core.NewTaskInput> = {}, by: Partner = pieter): Promise<Task> {
  return inTx((tx) =>
    core.createTask(
      tx,
      {
        title: `Fix gutters ${run}`,
        description: "Gutters are pulling off the back.",
        dueDate: todayYmdEastern(),
        propertyId,
        assignee: { contactId: zack.contactId },
        checklist: [{ title: "Rehang the downspout" }, { title: "Seal the corner" }],
        draft: { batchKey: randomUUID(), index: 0 },
        ...over,
      },
      by,
    ),
  );
}

/** An ordinary To do task with the same words, place, person and date: what each query must still find. */
const saveTask = (over: Partial<core.NewTaskInput> = {}): Promise<Task> =>
  inTx((tx) => core.createTask(tx, { title: `Fix gutters ${run}`, dueDate: todayYmdEastern(), propertyId, assignee: { contactId: zack.contactId }, ...over }, pieter));

const accessRows = (taskId: string) => prisma.taskAccess.count({ where: { taskId } });
const liveAccess = (taskId: string, contactId = zack.contactId) => prisma.taskAccess.count({ where: { taskId, contactId, revokedAt: null } });
const emailRows = (taskId: string) => prisma.notificationOutbox.count({ where: { taskId } });
const statusOf = async (taskId: string) => (await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } }))?.status ?? null;

/** The ids among `ids` that a task `where` finds. */
async function idsIn(where: Prisma.TaskWhereInput, ids: readonly string[]): Promise<string[]> {
  const rows = await prisma.task.findMany({ where: { AND: [where, { id: { in: [...ids] } }] }, select: { id: true }, orderBy: { id: "asc" } });
  return rows.map((r) => r.id);
}

const refusal = (message: string | RegExp) => (err: unknown) =>
  err instanceof core.TaskRuleError && (typeof message === "string" ? err.message === message : message.test(err.message));

// ---------------------------------------------------------------------------
// A draft, as it's saved
// ---------------------------------------------------------------------------

test("a draft is saved as a Draft in the partner's name, through Claude, and shows the job to no one", { skip, timeout }, async () => {
  const batchKey = randomUUID();
  const draft = await saveDraft({ draft: { batchKey, index: 3 }, status: "IN_PROGRESS" });
  assert.equal(draft.status, "DRAFT", "whatever status came with it");
  assert.equal(draft.autoKey, draftAutoKey(pieter.userId, batchKey, 3));
  assert.equal(draft.createdByUserId, pieter.userId);
  assert.equal(draft.assigneeContactId, zack.contactId);

  const events = await prisma.taskEvent.findMany({ where: { taskId: draft.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  assert.deepEqual(
    events.map((e) => [e.kind, e.source, e.actorUserId]),
    [["CREATED", "CLAUDE", pieter.userId]],
  );
  assert.deepEqual(events[0].data, { to: { userId: null, contactId: zack.contactId } });
  // D14: "Pieter created this task", tagged "via Claude".
  const [line] = buildActivity(events, {}, todayYmdEastern());
  assert.ok(line.type === "line" && line.text === "Pieter created this task" && line.viaClaude === true);

  assert.deepEqual(
    (await prisma.taskChecklistItem.findMany({ where: { taskId: draft.id }, orderBy: { position: "asc" }, select: { title: true } })).map((i) => i.title),
    ["Rehang the downspout", "Seal the corner"],
  );
  assert.equal(await accessRows(draft.id), 0, "no TaskAccess row");
  assert.equal(await emailRows(draft.id), 0, "no NotificationOutbox row");
});

// ---------------------------------------------------------------------------
// 6.2: every place that must skip drafts
// ---------------------------------------------------------------------------

test("a draft is absent from every list, count, search, portal, reminder and import query; a task beside it is in each", { skip, timeout }, async () => {
  const today = todayYmdEastern();
  const template = await made.taskTemplate({ name: `Playbook ${run}` });
  // The draft: Zack's, due today, at the property, from a playbook, repeating, with a Missing info item.
  const draft = await saveDraft({ taskTemplateId: template.id, repeatRule: { freq: "weeks", interval: 1 }, checklist: [{ title: "Lockbox code", checkKey: `lockbox|${run}-draft` }] });
  // A second draft with only an imported name, for the queries that read those.
  const named = await saveDraft({ assignee: null, assigneeName: `Legacy ${run}` });
  const task = await saveTask({ taskTemplateId: template.id, repeatRule: { freq: "weeks", interval: 1 }, checklist: [{ title: "Lockbox code", checkKey: `lockbox|${run}-task` }] });
  const namedTask = await saveTask({ assignee: null, assigneeName: `Legacy ${run}` });
  const all = [draft.id, named.id, task.id, namedTask.id];
  const only = (ids: string[]) => [...ids].sort();
  const listed = only([task.id, namedTask.id]);

  // 1. Home's Today (tasks/queries.ts todayTasks): Mine, Contractors and Unassigned, for either partner.
  assert.deepEqual(await idsIn(todayWhere(pieter.userId), all), listed, "todayWhere");
  assert.deepEqual(await idsIn(todayWhere(connor.userId), all), listed, "todayWhere, the other partner");

  // 2. The Tasks list (allTasks, countAllTasks, taskViewCounts): each view, the search, each filter.
  const filters = (f: Partial<AllFilters>): AllFilters => ({ status: "all", owner: [], property: [], repeats: false, q: "", ...f });
  for (const status of ["open", "all"] as const) assert.deepEqual(await idsIn(allTasksWhere(filters({ status })), all), listed, `allTasksWhere ${status}`);
  assert.deepEqual(await idsIn(allTasksWhere(filters({ status: "done" })), all), [], "allTasksWhere done");
  assert.deepEqual(await idsIn(allTasksWhere(filters({ q: `gutters ${run}` })), all), listed, "allTasksWhere, the search");
  assert.deepEqual(await idsIn(allTasksWhere(filters({ owner: [`c:${zack.contactId}`] })), all), [task.id], "allTasksWhere, the assignee");
  assert.deepEqual(await idsIn(allTasksWhere(filters({ owner: [`n:Legacy ${run}`] })), all), [namedTask.id], "allTasksWhere, an imported name");
  assert.deepEqual(await idsIn(allTasksWhere(filters({ owner: ["none"] })), all), [namedTask.id], "allTasksWhere, Unassigned");
  assert.deepEqual(await idsIn(allTasksWhere(filters({ property: [propertyId] })), all), listed, "allTasksWhere, the property");
  assert.deepEqual(await idsIn(allTasksWhere(filters({ repeats: true })), all), [task.id], "allTasksWhere, Repeats");
  // 3. The numbers beside the filters (taskFilterCounts): each facet's counts, and the view's scope.
  for (const omit of ["owner", "property"] as const) {
    assert.deepEqual(await idsIn(allTasksWhere(filters({ owner: [`c:${zack.contactId}`], property: [propertyId] }), new Map(), omit), all), omit === "owner" ? listed : [task.id], `counts beside ${omit}`);
  }
  for (const status of ["open", "all"] as const) assert.deepEqual(await idsIn(viewScopeWhere(status), all), listed, `viewScopeWhere ${status}`);
  const byOwner = await prisma.task.groupBy({ by: ["assigneeContactId"], where: { AND: [allTasksWhere(filters({}), new Map(), "owner"), { id: { in: all } }] }, _count: { _all: true } });
  assert.equal(byOwner.find((g) => g.assigneeContactId === zack.contactId)?._count._all, 1, "the assignee count is the task alone");
  // 4. The imported names the filter lists (legacyAssignees).
  assert.deepEqual(await idsIn(legacyNameWhere, all), [namedTask.id], "legacyNameWhere");

  // 5. Search (search-results.ts): the palette's where, the real search, and Recent.
  assert.deepEqual(await idsIn(paletteTaskWhere(run), all), listed, "paletteTaskWhere");
  const paletteCount = await prisma.task.count({ where: paletteTaskWhere(run) });
  const found = await runSearch(prisma, { q: run, type: "task", limit: 20 });
  const taskGroup = found.groups.find((g) => g.type === "task");
  assert.deepEqual(only(taskGroup?.rows.map((r) => r.id).filter((id) => all.includes(id)) ?? []), listed, "runSearch rows");
  assert.equal(taskGroup?.total, paletteCount, "runSearch's total is the palette's count, which holds no draft");
  // Narrowed to a type with no match, the task count beside it is the same one.
  const elsewhere = (await runSearch(prisma, { q: run, type: "deal" })).groups.find((g) => g.type === "task");
  assert.deepEqual([elsewhere?.total, elsewhere?.rows.length], [paletteCount, 0], "the count shown from another type");
  const recent = await recentRows(prisma, all.map((recordId) => ({ kind: "TASK" as const, recordId })), 10);
  assert.deepEqual(only(recent.map((r) => r.id)), listed, "recentRows");

  // 6. A property's page and the Properties list's counts (properties/[id]/page.tsx, properties/(list)/page.tsx).
  assert.deepEqual(await idsIn(propertyOpenTasksWhere(propertyId), all), listed, "the property page's tasks");
  const openByProp = await prisma.task.groupBy({ by: ["propertyId"], where: { AND: [openByPropertyWhere, { id: { in: all } }] }, _count: true });
  assert.deepEqual(openByProp, [{ propertyId, _count: 2 }], "the Properties list's open count");
  // 7. Apply playbook's "still open" line (templates/[id]/apply/page.tsx).
  assert.deepEqual(await idsIn(playbookOpenTasksWhere(template.id), all), [task.id], "a playbook's open tasks");
  // 8. A task page's links to other tasks (tasks/[id]/page.tsx).
  assert.deepEqual(await idsIn(linkedTasksWhere(all, ["none"]), all), listed, "the titles a comment's links show");

  // 9. A contractor's page, Open and Done, and Archive's count (archive.ts).
  const open = await contractorOpenJobs(prisma, zack.contactId);
  assert.deepEqual(await idsIn(contractorJobsWhere(zack.contactId, open.names), all), [task.id], "contractorJobsWhere");
  assert.deepEqual(await idsIn(contractorJobsWhere(zack.contactId, [`Legacy ${run}`]), all), listed, "contractorJobsWhere with an imported name of theirs");
  // Archive's own count of his open jobs: the task alone, though two drafts name him by now.
  assert.equal(open.count, 1, "contractorOpenJobs' count");

  // 10. Missing info (missing/queries.ts workedThisYear and handedOff, missing/service.ts settleMissingInfo).
  const yearStart = ymdToDate(`${today.slice(0, 4)}-01-01`)!;
  assert.deepEqual(await idsIn(workedSinceWhere(yearStart, [zack.contactId]), all), [task.id], "workedThisYear");
  assert.deepEqual(await idsIn(workedSinceWhere(yearStart), all), [task.id], "workedThisYear, every contractor");
  const handed = await prisma.taskChecklistItem.findMany({ where: { AND: [openMakeTaskItemsWhere, { checkKey: { startsWith: `lockbox|${run}-` } }] }, select: { checkKey: true } });
  assert.deepEqual(handed.map((i) => i.checkKey), [`lockbox|${run}-task`], "handedOff");

  // 11. The 8 am run (notifications/reminders.ts), then core's own guard.
  assert.deepEqual(await idsIn(dueReminderWhere([ymdToDate(today)!]), all), [task.id], "queueDueReminders' jobs");
  assert.equal(await inTx((tx) => core.queueDueReminder(tx, { id: draft.id, assigneeContactId: zack.contactId }, "DUE_TODAY", today, new Date())), false, "queueDueReminder on a draft");
  assert.equal(await emailRows(draft.id), 0);
  assert.equal(await inTx((tx) => core.queueDueReminder(tx, { id: task.id, assigneeContactId: zack.contactId }, "DUE_TODAY", today, new Date())), true, "and it does queue for the task");

  // 12. The portal (portal/queries.ts listMyJobs and getJob start at contractorCanOpen), even with an access row
  // that should never exist, and every contractor write (assertContractorAccess).
  await prisma.taskAccess.create({ data: { taskId: draft.id, contactId: zack.contactId, source: "MANUAL" } });
  assert.deepEqual(await idsIn(contractorCanOpen(zack.contactId), all), [task.id], "contractorCanOpen");
  assert.deepEqual(await idsIn({ ...contractorCanOpen(zack.contactId), status: { in: ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW"] } }, all), [task.id], "My jobs, Open");
  await assert.rejects(inTx((tx) => core.assertContractorAccess(tx, draft.id, zack)), refusal("You don't have access to this job."));
  await assert.rejects(inTx((tx) => core.addComment(tx, draft.id, { body: "On my way." }, zack)), refusal("You don't have access to this job."));
  await assert.rejects(inTx((tx) => core.setStatus(tx, draft.id, "IN_PROGRESS", zack)), refusal("You don't have access to this job."));
  await inTx((tx) => core.assertContractorAccess(tx, task.id, zack));
  await prisma.taskAccess.deleteMany({ where: { taskId: draft.id } });

  // 13. Repeats: only a finish makes the next copy, and no status change reaches a draft.
  await assert.rejects(inTx((tx) => core.setStatus(tx, draft.id, "DONE", pieter)), refusal("That status change isn't allowed."));
  assert.equal(await prisma.task.count({ where: { repeatSeriesId: draft.id } }), 0);
  // 14. The Asana import's own task read (linkLegacyAssignee takes open work only).
  assert.equal(await inTx((tx) => linkLegacyAssignee(tx, { taskId: named.id, name: `Legacy ${run}`, assignee: { contactId: zack.contactId } })), false, "linkLegacyAssignee");
  assert.equal((await prisma.task.findUnique({ where: { id: named.id }, select: { assigneeContactId: true } }))?.assigneeContactId, null);

  // 15. The assignee picker's Recent rows (assignee-options.ts): Pieter's Claude picked Zack for the draft, and that
  // is no assignment of his until he adds it. The task's "created" line counts.
  const recentLines = await prisma.taskEvent.findMany({ where: { AND: [recentAssignmentsWhere(pieter.userId), { taskId: { in: all } }] }, select: { taskId: true } });
  assert.deepEqual(recentLines.map((e) => e.taskId), [task.id], "recentAssignmentsWhere");

  // 16. "Choose from photos taken here" (properties/photo.ts takenHerePhotos): a task's photo, never a draft's.
  for (const taskId of [draft.id, task.id]) {
    await prisma.taskAttachment.create({ data: { taskId, kind: "IMAGE", url: `https://blob.example.test/${run}/${taskId}.jpg`, pathname: `tasks/${run}/${taskId}.jpg`, filename: "here.jpg", size: 10, contentType: "image/jpeg" } });
  }
  const takenHere = await prisma.taskAttachment.findMany({ where: { AND: [takenHerePhotosWhere(propertyId), { taskId: { in: all } }] }, select: { taskId: true } });
  assert.deepEqual(takenHere.map((a) => a.taskId), [task.id], "takenHerePhotosWhere");

  // 17. Who the assignee list draws on (assignee-people.ts listedContactsWhere): a job puts someone on it, a draft alone doesn't.
  const luis = await made.contact({ fullName: `Luis ${run}` });
  const forLuis = await saveDraft({ assignee: { contactId: luis.id } });
  const onTheList = () => prisma.contact.count({ where: { AND: [listedContactsWhere, { id: { in: [luis.id, zack.contactId] } }] } });
  assert.equal(await onTheList(), 1, "Zack has a job; Luis has only a draft");
  await inTx((tx) => core.addDraft(tx, forLuis.id, pieter));
  assert.equal(await onTheList(), 2, "and once it's added, he is on it");

  // And the drafts are where they belong: My drafts for Pieter, the other group for Connor, newest first.
  assert.deepEqual(await idsIn(myDraftsWhere(pieter.userId), all), only([draft.id, named.id]), "myDraftsWhere");
  assert.deepEqual(await idsIn(othersDraftsWhere(pieter.userId), all), [], "othersDraftsWhere, mine");
  assert.deepEqual(await idsIn(myDraftsWhere(connor.userId), all), [], "myDraftsWhere, the other partner");
  assert.deepEqual(await idsIn(othersDraftsWhere(connor.userId), all), only([draft.id, named.id]), "othersDraftsWhere");
  const mine = await prisma.task.findMany({ where: { AND: [myDraftsWhere(pieter.userId), { id: { in: all } }] }, orderBy: DRAFTS_ORDER_BY, select: { id: true } });
  assert.deepEqual(mine.map((t) => t.id), [named.id, draft.id], "newest first");
  // A draft's own page finds it, as it finds any task (tasks/[id]/page.tsx).
  assert.deepEqual(await idsIn(taskPageWhere(draft.id), all), [draft.id], "taskPageWhere");
  assert.deepEqual(await idsIn(taskPageWhere(task.id), all), [task.id], "taskPageWhere, a task");
});

// ---------------------------------------------------------------------------
// 6.1 and D21: nothing on a draft emails anyone or shows the job to anyone
// ---------------------------------------------------------------------------

test("editing a draft's assignee, date and notes, commenting on it and adding a file queue nothing and give no access", { skip, timeout }, async () => {
  const draft = await saveDraft();
  const quiet = async (what: string) => {
    assert.equal(await emailRows(draft.id), 0, `${what}: no email row`);
    assert.equal(await accessRows(draft.id), 0, `${what}: no access row`);
  };
  // To Rob, back to Zack (who gets job emails), to a partner, and to Zack again: on a task each of these emails.
  for (const assignee of [{ contactId: robId }, { contactId: zack.contactId }, { userId: connor.userId }, { contactId: zack.contactId }]) {
    await inTx((tx) => core.patchTask(tx, draft.id, { assignee }, pieter));
    await quiet("a new assignee");
  }
  await inTx((tx) => core.patchTask(tx, draft.id, { dueDate: "2027-01-15", description: "Bring the tall ladder.", title: `Rehang gutters ${run}` }, pieter));
  await quiet("the date, the notes and the title");
  const comment = await inTx((tx) => core.addComment(tx, draft.id, { body: "Photos to follow.", visibility: "SHARED" }, pieter));
  await quiet("a Shared comment");
  const file = await inTx((tx) =>
    core.recordAttachment(tx, draft.id, { url: `https://blob.example.test/${run}.jpg`, pathname: `tasks/${run}.jpg`, filename: "gutter.jpg", size: 10, contentType: "image/jpeg" }, pieter, { visibility: "SHARED" }),
  );
  await quiet("a Shared file");
  // What's posted on a draft is addressed to nobody in particular, so it shows on the job of whoever has it once added.
  assert.equal(comment.audienceContactId, null);
  assert.equal(file.audienceContactId, null);
  const item = await prisma.taskChecklistItem.findFirstOrThrow({ where: { taskId: draft.id } });
  await inTx((tx) => core.setChecklistItem(tx, item.id, true, pieter));
  await quiet("a ticked item");

  // No status menu reaches Draft, either way.
  for (const to of ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW", "DONE", "CANCELED"] as const) {
    await assert.rejects(inTx((tx) => core.setStatus(tx, draft.id, to, pieter, { waitingOn: "the city", scheduledFor: "2027-01-15" })), refusal("That status change isn't allowed."), to);
  }
  const task = await saveTask();
  await assert.rejects(inTx((tx) => core.setStatus(tx, task.id, "DRAFT", pieter)), refusal("That status change isn't allowed."));
  assert.equal(await statusOf(draft.id), "DRAFT");
  assert.equal(await statusOf(task.id), "OPEN");
  await assert.rejects(inTx((tx) => core.createTask(tx, { title: "Not through Claude", status: "DRAFT" }, pieter)), refusal("That status change isn't allowed."));
});

// ---------------------------------------------------------------------------
// 6.3: Add
// ---------------------------------------------------------------------------

/** What the send run's batch read takes of a row (notifications/outbox.ts drainDue), which dueRowVerdict judges. */
const RUN_ROW = {
  id: true,
  taskId: true,
  recipientContactId: true,
  recipientUserId: true,
  items: true,
  openKey: true,
  sentAt: true,
  lastError: true,
  attempts: true,
  firstAt: true,
  sendAfter: true,
  recipientUser: { select: { email: true } },
  recipientContact: { select: { active: true, portalAccount: { select: { email: true, status: true, jobEmails: true } } } },
  task: { select: { status: true, access: { where: { revokedAt: null }, select: { contactId: true } } } },
} satisfies Prisma.NotificationOutboxSelect;

/** Zack's email rows on a job, as the send run reads them. */
const zackRows = (taskId: string, contactId = zack.contactId) =>
  prisma.notificationOutbox.findMany({ where: { taskId, recipientContactId: contactId }, orderBy: { id: "asc" }, select: RUN_ROW });

const kinds = (items: unknown) => parseItems(items).map((i) => i.kind);
const linesOf = async (taskId: string) =>
  buildActivity(await prisma.taskEvent.findMany({ where: { taskId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }), {}, todayYmdEastern()).flatMap((e) => (e.type === "line" ? [e.text] : []));

/** A file as a partner or a contractor adds one, at a Blob path of its own. */
const addFile = (taskId: string, name: string, p: core.Principal, visibility: "SHARED" | "INTERNAL" = "SHARED") => {
  const path = `tasks/${run}/${randomUUID()}/${name}`;
  return inTx((tx) => core.recordAttachment(tx, taskId, { url: `https://blob.example.test/${path}`, pathname: path, filename: name, size: 10, contentType: "image/jpeg" }, p, { visibility }));
};

test("Add: To do, the contractor's access, one 'assigned you' line that waits longer than the Undo, and who hears", { skip, timeout }, async () => {
  const draft = await saveDraft();
  const comment = await inTx((tx) => core.addComment(tx, draft.id, { body: "Ladder is in the garage.", visibility: "SHARED" }, pieter));
  const note = await inTx((tx) => core.addComment(tx, draft.id, { body: "Ask about the fence too.", visibility: "INTERNAL" }, pieter));
  const photo = await addFile(draft.id, "gutter.jpg", pieter);

  const added = await inTx((tx) => core.addDraft(tx, draft.id, pieter));
  assert.equal(added.task.status, "OPEN");
  // Told apart by id, never by name; both names ride along for the line (drafts.ts draftName).
  assert.deepEqual(added.contractor, { contactId: zack.contactId, firstName: "Zack", fullName: `Zack ${run}`, getsEmail: true });
  assert.deepEqual(draftsAddedNames([added.contractor]), { emailed: ["Zack"], quiet: [] });
  assert.equal(await liveAccess(draft.id), 1, "access");
  const access = await prisma.taskAccess.findFirstOrThrow({ where: { taskId: draft.id } });
  assert.deepEqual([access.source, access.grantedByUserId], ["ASSIGNEE", pieter.userId]);

  const rows = await zackRows(draft.id);
  assert.equal(rows.length, 1, "one email row");
  assert.deepEqual(kinds(rows[0].items), ["ASSIGNED"], "one ASSIGNED line, and nothing from the draft's own edits");
  assert.equal(parseItems(rows[0].items)[0].summary, `assigned you "Fix gutters ${run}"`);
  assert.ok(rows[0].sendAfter.getTime() - rows[0].firstAt.getTime() >= BUNDLE_QUIET_MS - 1000, "it waits its three minutes");
  assert.ok(BUNDLE_QUIET_MS > APPROVAL_UNDO_MS, "longer than the Undo lasts");
  assert.equal(await prisma.notificationOutbox.count({ where: { taskId: draft.id, recipientUserId: { not: null } } }), 0, "the partners are emailed nothing");

  // What was posted as Shared on the draft is Zack's now, as if written on his job; the Internal note is nobody's.
  const audience = async () => ({
    comment: (await prisma.taskEvent.findUniqueOrThrow({ where: { id: comment.id } })).audienceContactId,
    note: (await prisma.taskEvent.findUniqueOrThrow({ where: { id: note.id } })).audienceContactId,
    photo: (await prisma.taskAttachment.findUniqueOrThrow({ where: { id: photo.id } })).audienceContactId,
  });
  assert.deepEqual(await audience(), { comment: zack.contactId, note: null, photo: zack.contactId });

  // Activity: created through Claude, then added. The Add's line is Internal: the contractor's page never shows it.
  const add = await prisma.taskEvent.findUniqueOrThrow({ where: { id: added.addEventId } });
  assert.deepEqual([add.kind, add.visibility, add.source, add.actorUserId], ["STATUS", "INTERNAL", "APP", pieter.userId]);
  const data = add.data as { from: string; to: string; addressed: { to: string; events: string[]; files: string[] } };
  assert.deepEqual([data.from, data.to, data.addressed.to], ["DRAFT", "OPEN", zack.contactId]);
  assert.ok(data.addressed.events.includes(comment.id) && !data.addressed.events.includes(note.id));
  assert.deepEqual(data.addressed.files, [photo.id]);
  assert.deepEqual((await linesOf(draft.id)).filter((l) => /created|added this draft/.test(l)), ["Pieter created this task", "Pieter added this draft"]);

  // Now it is a task everywhere, and Zack can open it.
  assert.deepEqual(await idsIn(todayWhere(connor.userId), [draft.id]), [draft.id]);
  assert.deepEqual(await idsIn(contractorCanOpen(zack.contactId), [draft.id]), [draft.id]);
  assert.deepEqual(await idsIn(myDraftsWhere(pieter.userId), [draft.id]), []);
  await inTx((tx) => core.assertContractorAccess(tx, draft.id, zack));

  // A second Add (a double tap, the other partner's stale row) is refused with who added it, and writes nothing.
  await assert.rejects(inTx((tx) => core.addDraft(tx, draft.id, connor)), (err) => err instanceof core.TaskChangedError && err.message === "Pieter moved this to To do.");
  assert.deepEqual((await zackRows(draft.id)).map((r) => kinds(r.items)), [["ASSIGNED"]]);

  // Add's Undo addresses them to nobody again, as they were on the draft: a draft added for someone else shows them.
  await inTx((tx) => core.undoAddDraft(tx, draft.id, added.addEventId, pieter));
  assert.deepEqual(await audience(), { comment: null, note: null, photo: null });
  await inTx((tx) => core.patchTask(tx, draft.id, { assignee: { contactId: robId } }, pieter));
  await inTx((tx) => core.addDraft(tx, draft.id, pieter));
  assert.deepEqual(await audience(), { comment: robId, note: null, photo: robId });
});

test("Add says who doesn't hear: a contractor with no job emails gets access and no email, a partner's own task says nothing", { skip, timeout }, async () => {
  const forRob = await saveDraft({ assignee: { contactId: robId } });
  const rob = await inTx((tx) => core.addDraft(tx, forRob.id, pieter));
  assert.deepEqual(rob.contractor, { contactId: robId, firstName: "Rob", fullName: `Rob ${run}`, getsEmail: false });
  assert.equal(await liveAccess(forRob.id, robId), 1);
  assert.equal(await emailRows(forRob.id), 0);

  const own = await saveDraft({ assignee: { userId: pieter.userId } });
  const mine = await inTx((tx) => core.addDraft(tx, own.id, pieter));
  assert.equal(mine.contractor, null);
  assert.equal(await accessRows(own.id), 0);
  assert.equal(await emailRows(own.id), 0);
  assert.deepEqual(draftsAddedNames([rob.contractor, mine.contractor]), { emailed: [], quiet: ["Rob"] });

  await assert.rejects(inTx((tx) => core.addDraft(tx, "no-such-draft", pieter)), refusal("That draft no longer exists."));
  await assert.rejects(inTx((tx) => core.addDraft(tx, forRob.id, zack)), refusal("Only a partner can do that with a draft."));
});

test("Add refuses a draft whose unit is no longer on its building, until a unit that is there is picked", { skip, timeout }, async () => {
  const building = await made.property({ address: `77 ${run} Ave, Buffalo, NY 14213`, units: [{ id: `u-${run}-1`, label: "1" }, { id: `u-${run}-2`, label: "2" }] });
  const draft = await saveDraft({ propertyId: building.id, unitLabel: "2", assignee: { userId: pieter.userId } });
  // Unit 2 is removed from the building while the draft waits (nothing warns about a draft there).
  await prisma.property.update({ where: { id: building.id }, data: { units: [{ id: `u-${run}-1`, label: "1" }] } });
  await assert.rejects(
    inTx((tx) => core.addDraft(tx, draft.id, pieter)),
    (err) => err instanceof core.DraftRefusedError && err.taskId === draft.id && err.title === `Fix gutters ${run}` && err.message === "Unit 2 is gone. Pick the unit.",
  );
  await assert.rejects(inTx((tx) => core.addDrafts(tx, [draft.id], pieter)), refusal("Unit 2 is gone. Pick the unit."));
  assert.equal(await statusOf(draft.id), "DRAFT");
  await inTx((tx) => core.patchTask(tx, draft.id, { unitLabel: "1" }, pieter));
  assert.equal((await inTx((tx) => core.addDraft(tx, draft.id, pieter))).task.status, "OPEN");
});

// ---------------------------------------------------------------------------
// 6.3: Add's Undo, and the email that must not go
// ---------------------------------------------------------------------------

test("Undo inside the window: a draft again, no access row and no email row left, and a second Add emails once", { skip, timeout }, async () => {
  const today = todayYmdEastern();
  const draft = await saveDraft();
  const added = await inTx((tx) => core.addDraft(tx, draft.id, pieter));
  assert.equal((await zackRows(draft.id)).length, 1);
  // The 8 am run reaches the job while it is a task: "Due today" joins the waiting row.
  assert.equal(await inTx((tx) => core.queueDueReminder(tx, { id: draft.id, assigneeContactId: zack.contactId }, "DUE_TODAY", today, new Date())), true);
  assert.deepEqual((await zackRows(draft.id)).map((r) => kinds(r.items)), [["ASSIGNED", "DUE_TODAY"]]);

  const { task } = await inTx((tx) => core.undoAddDraft(tx, draft.id, added.addEventId, pieter));
  assert.equal(task.status, "DRAFT");
  assert.equal(await accessRows(draft.id), 0, "the access the Add gave is gone");
  assert.equal(await emailRows(draft.id), 0, "and so is every email its time as a task queued");
  await assert.rejects(inTx((tx) => core.assertContractorAccess(tx, draft.id, zack)), refusal("You don't have access to this job."));
  assert.deepEqual(await idsIn(contractorCanOpen(zack.contactId), [draft.id]), []);
  assert.deepEqual(await idsIn(todayWhere(pieter.userId), [draft.id]), []);
  assert.deepEqual(await idsIn(myDraftsWhere(pieter.userId), [draft.id]), [draft.id], "back in My drafts");
  const line = await prisma.taskEvent.findUniqueOrThrow({ where: { id: added.addEventId }, select: { deletedAt: true } });
  assert.ok(line.deletedAt, "the Add's line is soft-deleted");
  assert.deepEqual(await linesOf(draft.id), ["Pieter created this task"], "Activity shows nothing of it");

  // A retry of an Undo that went through is a quiet success.
  assert.equal((await inTx((tx) => core.undoAddDraft(tx, draft.id, added.addEventId, pieter))).task.status, "DRAFT");

  // While it is a draft again, nothing is queued and nothing is shown, as before the Add.
  await inTx((tx) => core.patchTask(tx, draft.id, { description: "Changed after the Undo." }, pieter));
  await inTx((tx) => core.addComment(tx, draft.id, { body: "Still a draft.", visibility: "SHARED" }, pieter));
  assert.equal(await emailRows(draft.id), 0);
  assert.equal(await accessRows(draft.id), 0);

  // Added again: it starts clean. A new access row, one new email row with one "assigned you", and that morning's
  // reminder queues as for a first Add (the row that held the first one went with the Undo).
  const again = await inTx((tx) => core.addDraft(tx, draft.id, pieter));
  assert.notEqual(again.addEventId, added.addEventId);
  assert.equal(await liveAccess(draft.id), 1);
  assert.deepEqual((await zackRows(draft.id)).map((r) => [kinds(r.items), r.sentAt, r.attempts]), [[["ASSIGNED"], null, 0]]);
  assert.equal(await inTx((tx) => core.queueDueReminder(tx, { id: draft.id, assigneeContactId: zack.contactId }, "DUE_TODAY", today, new Date())), true, "the reminder queues again");
  assert.equal(await inTx((tx) => core.queueDueReminder(tx, { id: draft.id, assigneeContactId: zack.contactId }, "DUE_TODAY", today, new Date())), false, "once");
  // The first Add's Undo, tapped late on a stale toast, doesn't take the second Add back.
  await assert.rejects(inTx((tx) => core.undoAddDraft(tx, draft.id, added.addEventId, pieter)), refusal("This task changed since."));
  assert.equal(await statusOf(draft.id), "OPEN");
  assert.equal(await liveAccess(draft.id), 1);
  assert.equal((await zackRows(draft.id)).length, 1);
});

test("Undo removes only the access an assignment made, and the send run closes any row for a draft unsent, whoever it is for", { skip, timeout }, async () => {
  const amy = await made.contact({ fullName: `Amy ${run}` });
  await prisma.portalAccount.create({
    data: { contactId: amy.id, email: `amy-${run}@example.test`, passwordHash: "scrypt$x", mustChangePassword: false, status: "ACTIVE", lastSignInAt: new Date() },
  });
  const draft = await saveDraft();
  const added = await inTx((tx) => core.addDraft(tx, draft.id, pieter));
  // Someone shared the job with Amy by hand. That row is not the Undo's to destroy.
  await prisma.taskAccess.create({ data: { taskId: draft.id, contactId: amy.id, source: "MANUAL" } });
  await inTx((tx) => core.undoAddDraft(tx, draft.id, added.addEventId, pieter));
  assert.deepEqual(
    (await prisma.taskAccess.findMany({ where: { taskId: draft.id }, select: { contactId: true, source: true } })).map((a) => [a.contactId, a.source]),
    [[amy.id, "MANUAL"]],
  );
  assert.deepEqual(await idsIn(contractorCanOpen(amy.id), [draft.id]), [], "she still can't open a draft");

  // Rows that outlived the Undo: one to Amy, who holds an access row and a login, and one to a partner.
  const item = { kind: "COMMENT", actorLabel: "Pieter Louw", summary: "commented", at: new Date().toISOString() };
  await prisma.notificationOutbox.create({ data: { openKey: `c:${amy.id}:${draft.id}`, recipientContactId: amy.id, taskId: draft.id, items: [item], sendAfter: new Date() } });
  await prisma.notificationOutbox.create({ data: { openKey: `u:${connor.userId}:${draft.id}`, recipientUserId: connor.userId, taskId: draft.id, items: [item], sendAfter: new Date() } });
  const rows = () => prisma.notificationOutbox.findMany({ where: { taskId: draft.id, OR: [{ recipientContactId: amy.id }, { recipientUserId: connor.userId }] }, orderBy: { openKey: "asc" }, select: RUN_ROW });
  const job = () => prisma.task.findUnique({ where: { id: draft.id }, select: { status: true, dueDate: true, scheduledFor: true, description: true } });
  const second = async (audience: "contractor" | "staff", items: unknown) => claimedRowVerdict({ audience, items: parseItems(items), job: await job(), hasAccess: true, today: todayYmdEastern() });

  // The run's first decision, on each row as its batch read finds it: closed unsent, "draft".
  for (const row of await rows()) assert.deepEqual(dueRowVerdict(row), { send: false, reason: "draft" });
  // Its second, for a run that read the row while the job was a task and claimed it after the Undo.
  assert.deepEqual(await second("contractor", [item]), { send: false, reason: "draft" });
  assert.deepEqual(await second("staff", [item]), { send: false, reason: "draft" });

  // The same rows once the draft is added: both go, so it was the draft that held them.
  await inTx((tx) => core.addDraft(tx, draft.id, pieter));
  const [toAmy, toConnor] = await rows();
  const first = [dueRowVerdict(toAmy), dueRowVerdict(toConnor)];
  assert.deepEqual(first.map((v) => v.send && v.delivery), [
    { ok: true, to: `amy-${run}@example.test`, audience: "contractor" },
    { ok: true, to: `connor-${run}@example.test`, audience: "staff" },
  ]);
  assert.equal((await second("contractor", [item])).send, true);
  assert.equal((await second("staff", [item])).send, true);
  // And a task that is gone closes its row too.
  assert.deepEqual(dueRowVerdict({ ...toAmy, task: null }), { send: false, reason: "no task" });
});

test("Undo is refused in lines of its own: the other partner, too late, the job moved on, its email sent or on its way", { skip, timeout }, async () => {
  const draft = await saveDraft();
  const added = await inTx((tx) => core.addDraft(tx, draft.id, pieter));
  const undo = (p: core.Principal = pieter, now = new Date()) => inTx((tx) => core.undoAddDraft(tx, draft.id, added.addEventId, p, now));

  // The first name, or the full one where someone else on the team goes by it (drafts.ts nameAmong).
  await assert.rejects(undo(connor), refusal(/^Only Pieter( Louw)? can undo this\.$/));
  await assert.rejects(undo(pieter, new Date(Date.now() + APPROVAL_UNDO_MS + 5_000)), refusal("Too late to undo."));
  await assert.rejects(inTx((tx) => core.undoAddDraft(tx, draft.id, "not-the-add", pieter)), refusal("This task changed since."));

  // A send run has the row (claimed: openKey cleared, a try spent), or it went: Zack has been told, or may be.
  const [row] = await zackRows(draft.id);
  await prisma.notificationOutbox.update({ where: { id: row.id }, data: { openKey: null, attempts: 1 } });
  await assert.rejects(undo(), refusal("The email is on its way."));
  await prisma.notificationOutbox.update({ where: { id: row.id }, data: { sentAt: new Date(), lastError: null } });
  await assert.rejects(undo(), refusal("Email already sent."));
  assert.equal(await statusOf(draft.id), "OPEN", "every refusal left it added");
  assert.equal(await liveAccess(draft.id), 1);
  // A row the run closed without sending never reached him, so it doesn't stop the Undo, and it stays as its record.
  await prisma.notificationOutbox.update({ where: { id: row.id }, data: { lastError: "no access" } });
  assert.equal((await undo()).task.status, "DRAFT");
  assert.equal(await accessRows(draft.id), 0);
  assert.deepEqual((await zackRows(draft.id)).map((r) => r.id), [row.id]);

  // Moved on since (a partner set it In progress): refused with who moved it, and it stays Zack's job.
  const moved = await saveDraft();
  const movedAdd = await inTx((tx) => core.addDraft(tx, moved.id, pieter));
  await inTx((tx) => core.setStatus(tx, moved.id, "IN_PROGRESS", connor));
  await assert.rejects(
    inTx((tx) => core.undoAddDraft(tx, moved.id, movedAdd.addEventId, pieter)),
    (err) => err instanceof core.TaskChangedError && err.current === "IN_PROGRESS" && err.message === "Connor moved this to In progress.",
  );
  assert.equal(await statusOf(moved.id), "IN_PROGRESS");
  assert.equal(await liveAccess(moved.id), 1);
});

test("Undo is refused once the contractor has touched the job: a line of theirs, a file of theirs, or their read mark", { skip, timeout }, async () => {
  // His first name, or his full one where another contractor goes by it.
  const opened = refusal(/^Zack( \S+)? already opened it\.$/);
  const stays = async (taskId: string) => {
    assert.equal(await statusOf(taskId), "OPEN", "it stays his job");
    assert.equal(await liveAccess(taskId), 1);
    assert.equal((await zackRows(taskId)).length, 1, "and his email still goes");
  };

  // He wrote on it.
  const wrote = await saveDraft();
  const wroteAdd = await inTx((tx) => core.addDraft(tx, wrote.id, pieter));
  await inTx((tx) => core.addComment(tx, wrote.id, { body: "On my way there now." }, zack));
  await assert.rejects(inTx((tx) => core.undoAddDraft(tx, wrote.id, wroteAdd.addEventId, pieter)), opened);
  await stays(wrote.id);

  // He added a photo.
  const filed = await saveDraft();
  const filedAdd = await inTx((tx) => core.addDraft(tx, filed.id, pieter));
  await addFile(filed.id, "before.jpg", zack);
  await assert.rejects(inTx((tx) => core.undoAddDraft(tx, filed.id, filedAdd.addEventId, pieter)), opened);
  await stays(filed.id);

  // He only opened it: the portal's read mark (portal/jobs.ts markJobSeen).
  const seen = await saveDraft();
  const seenAdd = await inTx((tx) => core.addDraft(tx, seen.id, pieter));
  await prisma.taskReadState.create({ data: { taskId: seen.id, contactId: zack.contactId } });
  await assert.rejects(inTx((tx) => core.undoAddDraft(tx, seen.id, seenAdd.addEventId, pieter)), opened);
  await stays(seen.id);

  // A partner opening it, or writing on it, stops nothing.
  const quiet = await saveDraft();
  const quietAdd = await inTx((tx) => core.addDraft(tx, quiet.id, pieter));
  await prisma.taskReadState.create({ data: { taskId: quiet.id, userId: connor.userId } });
  await inTx((tx) => core.addComment(tx, quiet.id, { body: "Thanks.", visibility: "INTERNAL" }, connor));
  assert.equal((await inTx((tx) => core.undoAddDraft(tx, quiet.id, quietAdd.addEventId, pieter))).task.status, "DRAFT");
});

test("Undo takes a row a send run claimed and handed back untried, so the job added again emails once", { skip, timeout }, async () => {
  const draft = await saveDraft();
  const added = await inTx((tx) => core.addDraft(tx, draft.id, pieter));
  const [row] = await zackRows(draft.id);
  // A run claimed it and the mail provider turned the run away for its rate: the try was given back, and the claim
  // had already cleared the row's key (notifications/outbox.ts). It is unsent, with no try against it.
  await prisma.notificationOutbox.update({ where: { id: row.id }, data: { openKey: null, attempts: 0, lastError: "rate limited", sendAfter: new Date(Date.now() + 60_000) } });
  assert.equal((await inTx((tx) => core.undoAddDraft(tx, draft.id, added.addEventId, pieter))).task.status, "DRAFT");
  assert.equal(await emailRows(draft.id), 0, "the handed-back row went with the Undo");

  await inTx((tx) => core.addDraft(tx, draft.id, pieter));
  const rows = await zackRows(draft.id);
  assert.deepEqual(rows.map((r) => [kinds(r.items), r.sentAt, r.attempts]), [[["ASSIGNED"], null, 0]], "one row, one 'assigned you'");
  assert.equal(rows.filter((r) => dueRowVerdict(r).send).length, 1, "and one email the send run would send");
});

test("Add's Undo is only for an Add: a task's own move back to To do is not one, and the task keeps its contractor's access and emails", { skip, timeout }, async () => {
  // An ordinary task Pieter set Waiting and then To do a moment ago: its latest status line is his, inside the
  // window, and it is not an Add's.
  const task = await saveTask();
  await inTx((tx) => core.setStatus(tx, task.id, "WAITING", pieter, { waitingOn: "the city" }));
  await inTx((tx) => core.setStatus(tx, task.id, "OPEN", pieter));
  const latest = await prisma.taskEvent.findFirstOrThrow({ where: { taskId: task.id, kind: "STATUS", deletedAt: null }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  assert.deepEqual([(latest.data as { from: string; to: string }).from, (latest.data as { to: string }).to, latest.actorUserId], ["WAITING", "OPEN", pieter.userId]);
  const state = async () => ({
    status: await statusOf(task.id),
    access: await prisma.taskAccess.findMany({ where: { taskId: task.id }, orderBy: { id: "asc" } }),
    emails: await prisma.notificationOutbox.findMany({ where: { taskId: task.id }, orderBy: { id: "asc" } }),
    hidden: await prisma.taskEvent.count({ where: { taskId: task.id, deletedAt: { not: null } } }),
  });
  const was = await state();
  assert.equal(was.status, "OPEN");
  assert.equal(was.access.length, 1);
  assert.ok(was.emails.length > 0, "Zack's emails wait");

  await assert.rejects(inTx((tx) => core.undoAddDraft(tx, task.id, latest.id, pieter)), refusal("This task changed since."));
  assert.deepEqual(await state(), was, "still To do, with his access, his waiting emails and every line");
  // Through Add all's Undo it is kept, by title, with the same line.
  const out = await inTx((tx) => core.undoAddDrafts(tx, [{ taskId: task.id, addEventId: latest.id }], pieter));
  assert.deepEqual([out.undone, out.kept], [[], [{ taskId: task.id, title: task.title, message: "This task changed since." }]]);
  assert.deepEqual(await state(), was);
});

test("a reminder the send run closed unsent for a draft reached nobody: the job added again that morning gets its reminder, once", { skip, timeout }, async () => {
  const today = todayYmdEastern();
  const draft = await saveDraft();
  const remind = () => inTx((tx) => core.queueDueReminder(tx, { id: draft.id, assigneeContactId: zack.contactId }, "DUE_TODAY", today, new Date()));
  // The 8 am run's "Due today" landed beside an Add's Undo, and the send run closed its row unsent because the job
  // was a draft by then (notifications/content.ts dueRowVerdict): sent to nobody, marked "draft".
  const closed = await prisma.notificationOutbox.create({
    data: { recipientContactId: zack.contactId, taskId: draft.id, items: [{ kind: "DUE_TODAY", actorLabel: "HG", summary: "due today", at: new Date().toISOString(), due: today }], sendAfter: new Date(), sentAt: new Date(), lastError: "draft", openKey: null },
  });
  assert.equal(await remind(), false, "never for a draft");

  await inTx((tx) => core.addDraft(tx, draft.id, pieter));
  assert.equal(await remind(), true, "the closed row doesn't count as his reminder");
  assert.equal(await remind(), false, "queued once");
  const open = (await zackRows(draft.id)).filter((r) => r.id !== closed.id);
  assert.deepEqual(open.map((r) => kinds(r.items)), [["ASSIGNED", "DUE_TODAY"]]);
  // A reminder that did go is one: the same row marked sent with no error stops a second.
  const other = await saveTask();
  await prisma.notificationOutbox.create({
    data: { recipientContactId: zack.contactId, taskId: other.id, items: [{ kind: "OVERDUE", actorLabel: "HG", summary: "due yesterday", at: new Date().toISOString(), due: today }], sendAfter: new Date(), sentAt: new Date(), lastError: null, openKey: null },
  });
  assert.equal(await inTx((tx) => core.queueDueReminder(tx, { id: other.id, assigneeContactId: zack.contactId }, "OVERDUE", today, new Date())), false);
});

test("a draft on a deal: no line on the deal when it is saved, one when it is added, and Add's Undo takes that line back", { skip, timeout }, async () => {
  const deal = await made.deal({ address: `41 ${run} Ave, Buffalo, NY 14213` });
  const notes = () => prisma.dealNote.findMany({ where: { dealId: deal.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { body: true, source: true, deletedAt: true, data: true } });
  const title = `Walk the roof ${run}`;
  const draft = await saveOne(randomUUID(), { title, dealId: deal.id, assignee: { contactId: zack.contactId } });
  assert.equal(draft.dealId, deal.id);
  assert.deepEqual(await notes(), [], "a draft is nobody's job yet: the deal hears nothing");
  // Editing it while it waits says nothing there either.
  await inTx((tx) => core.patchTask(tx, draft.id, { description: "Before the offer." }, pieter));
  assert.deepEqual(await notes(), []);

  const added = await inTx((tx) => core.addDraft(tx, draft.id, pieter));
  assert.deepEqual(await notes(), [{ body: `Task added: ${title}  ·  Pieter Louw`, source: "change", deletedAt: null, data: { taskEventId: added.addEventId } }]);

  await inTx((tx) => core.undoAddDraft(tx, draft.id, added.addEventId, pieter));
  const after = await notes();
  assert.equal(after.length, 1);
  assert.ok(after[0].deletedAt, "the deal's 'Task added' went with the Undo");

  // Added again: one live line, naming the new Add.
  const again = await inTx((tx) => core.addDraft(tx, draft.id, pieter));
  assert.deepEqual((await notes()).filter((n) => !n.deletedAt).map((n) => [n.body, n.data]), [[`Task added: ${title}  ·  Pieter Louw`, { taskEventId: again.addEventId }]]);
  // An ordinary task made on the deal says so at once, as before.
  const task = await inTx((tx) => core.createTask(tx, { title: `Order the survey ${run}`, dealId: deal.id }, pieter));
  assert.equal((await notes()).filter((n) => n.body.startsWith(`Task added: ${task.title}`)).length, 1);
});

// ---------------------------------------------------------------------------
// 6.3: Discard, its Undo and the sweep
// ---------------------------------------------------------------------------

/** One draft as the connector saves it (saveDrafts), so it carries its save's fingerprint. */
async function saveOne(batchKey: string, input: core.DraftInput, by: Partner = pieter): Promise<Task> {
  const out = await inTx((tx) => core.saveDrafts(tx, batchKey, [input], by));
  assert.equal(out.kind, "saved");
  return (out as Extract<core.SaveDraftsResult, { kind: "saved" }>).tasks[0];
}

const GUTTERS = (): core.DraftInput => ({
  title: `Fix gutters ${run}`,
  description: "Gutters are pulling off the back.",
  dueDate: todayYmdEastern(),
  propertyId,
  assignee: { contactId: zack.contactId },
  repeatRule: { freq: "weeks", interval: 2 },
  checklist: [{ title: "Rehang the downspout" }, { title: "Seal the corner" }],
});

/** Everything that hangs off a draft, to compare before a Discard and after its Undo. */
const whole = async (taskId: string) => {
  const row = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      checklist: { orderBy: { position: "asc" } },
      events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      attachments: { orderBy: { id: "asc" } },
    },
  });
  // All of it but the mark itself and the row's last-written time, which a Discard and its Undo both move.
  return { ...row, discardedAt: null, updatedAt: null };
};

test("Discard only marks the draft, gone to everyone at once; its Undo brings back the same row with its comment, photo and tick", { skip, timeout }, async () => {
  const batchKey = randomUUID();
  const draft = await saveOne(batchKey, GUTTERS());
  await inTx((tx) => core.addComment(tx, draft.id, { body: "Goes with the draft.", visibility: "INTERNAL" }, pieter));
  const photo = await addFile(draft.id, "gutter.jpg", pieter);
  const item = await prisma.taskChecklistItem.findFirstOrThrow({ where: { taskId: draft.id, position: 0 } });
  await inTx((tx) => core.setChecklistItem(tx, item.id, true, pieter));
  const before = await whole(draft.id);
  assert.equal(before.events.filter((e) => e.kind === "COMMENT").length, 1);
  assert.deepEqual(before.attachments.map((a) => a.id), [photo.id]);
  assert.deepEqual(before.checklist.map((c) => c.done), [true, false]);

  // Connor discards Pieter's draft from the second group (D17).
  const gone = await inTx((tx) => core.discardDraft(tx, draft.id, connor));
  assert.deepEqual(gone, { ids: [draft.id], propertyIds: [propertyId] });
  // Nothing was deleted.
  assert.ok((await prisma.task.findUniqueOrThrow({ where: { id: draft.id } })).discardedAt, "marked");
  assert.deepEqual(await whole(draft.id), before);

  // And it is absent everywhere a draft is read: both groups, Home's count, its own page, and every list of tasks.
  const absent = async (what: string) => {
    for (const [name, where] of [
      ["myDraftsWhere", myDraftsWhere(pieter.userId)],
      ["othersDraftsWhere", othersDraftsWhere(connor.userId)],
      ["taskPageWhere", taskPageWhere(draft.id)],
      ["todayWhere", todayWhere(pieter.userId)],
      ["allTasksWhere", allTasksWhere({ status: "all", owner: [], property: [], repeats: false, q: "" })],
      ["paletteTaskWhere", paletteTaskWhere(run)],
      ["propertyOpenTasksWhere", propertyOpenTasksWhere(propertyId)],
      ["contractorCanOpen", contractorCanOpen(zack.contactId)],
    ] as const) {
      assert.deepEqual(await idsIn(where, [draft.id]), [], `${what}: ${name}`);
    }
  };
  await absent("discarded");
  const waitingBefore = await prisma.task.count({ where: myDraftsWhere(pieter.userId) });

  // Every write that is for a draft answers as it does for one that is gone, and writes nothing.
  await assert.rejects(inTx((tx) => core.addDraft(tx, draft.id, pieter)), refusal("That draft no longer exists."));
  await assert.rejects(inTx((tx) => core.discardDraft(tx, draft.id, connor)), refusal("That draft no longer exists."));
  assert.deepEqual(await inTx((tx) => core.addDrafts(tx, [draft.id], pieter)), [], "Add all passes it over");
  assert.deepEqual(await inTx((tx) => core.discardDrafts(tx, [draft.id], pieter)), { ids: [], propertyIds: [] }, "Discard all passes it over");
  assert.equal(await inTx((tx) => core.deleteTask(tx, draft.id, pieter)), null, "Delete answers as for a task that is gone");
  assert.equal(await statusOf(draft.id), "DRAFT");
  // Its save sent again is still a save already made: it holds its key until the sweep.
  const replay = await inTx((tx) => core.saveDrafts(tx, batchKey, [GUTTERS()], pieter));
  assert.deepEqual([replay.kind, replay.kind === "replay" && replay.tasks.map((t) => t.id)], ["replay", [draft.id]]);
  assert.equal(await prisma.task.count({ where: { autoKey: { startsWith: draftBatchPrefix(pieter.userId, batchKey) } } }), 1);
  assert.equal(await prisma.task.count({ where: myDraftsWhere(pieter.userId) }), waitingBefore);
  assert.deepEqual(await whole(draft.id), before, "none of that touched it");

  // Undo, by id alone: the same row, whole.
  const back = await inTx((tx) => core.restoreDrafts(tx, [draft.id, "no-such-draft"], connor));
  assert.deepEqual([back.restored.map((t) => t.id), back.gone], [[draft.id], ["no-such-draft"]]);
  assert.equal(back.restored[0].discardedAt, null);
  assert.deepEqual(await whole(draft.id), before, "its fields, checklist with the tick, comment, photo and timeline");
  assert.deepEqual(await idsIn(myDraftsWhere(pieter.userId), [draft.id]), [draft.id], "back in Pieter's My drafts");
  assert.deepEqual(await idsIn(taskPageWhere(draft.id), [draft.id]), [draft.id]);
  assert.equal(await accessRows(draft.id), 0);
  assert.equal(await emailRows(draft.id), 0);

  // A second Undo finds it already back and changes nothing.
  assert.deepEqual((await inTx((tx) => core.restoreDrafts(tx, [draft.id], connor))).restored.map((t) => t.id), [draft.id]);
  assert.deepEqual(await whole(draft.id), before);

  // Once a partner has added it, it is a task: Discard refuses it, and an Undo's ids can't make it a draft again.
  await inTx((tx) => core.addDraft(tx, draft.id, pieter));
  await assert.rejects(inTx((tx) => core.discardDraft(tx, draft.id, connor)), (err) => err instanceof core.TaskChangedError && err.message === "Pieter moved this to To do.");
  assert.deepEqual((await inTx((tx) => core.discardDrafts(tx, [draft.id], connor))).ids, [], "Discard all passes it over");
  assert.deepEqual(await inTx((tx) => core.restoreDrafts(tx, [draft.id], connor)), { restored: [], gone: [draft.id] });
  assert.equal(await statusOf(draft.id), "OPEN");
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: draft.id } })).discardedAt, null);
});

test("a write sent by id to a discarded draft is refused as for a draft that is gone, and writes nothing; its Undo takes them again", { skip, timeout }, async () => {
  const building = await made.property({ address: `88 ${run} Ave, Buffalo, NY 14213`, units: [{ id: `w-${run}-1`, label: "1" }, { id: `w-${run}-2`, label: "2a" }] });
  const draft = await saveOne(randomUUID(), { ...GUTTERS(), propertyId: building.id, unitLabel: "2a" });
  const comment = await inTx((tx) => core.addComment(tx, draft.id, { body: "Written before the discard.", visibility: "SHARED" }, pieter));
  const deleted = await inTx((tx) => core.addComment(tx, draft.id, { body: "Deleted before the discard.", visibility: "INTERNAL" }, pieter));
  await inTx((tx) => core.deleteComment(tx, deleted.id, pieter));
  const photo = await addFile(draft.id, "gutter.jpg", pieter);
  const [first, second] = await prisma.taskChecklistItem.findMany({ where: { taskId: draft.id }, orderBy: { position: "asc" } });
  // An item removed while it waited: its Undo toast is still up in the tab left open.
  const extra = await inTx((tx) => core.addChecklistItem(tx, draft.id, "Check the fascia", pieter));
  const snapshot = await inTx((tx) => core.removeChecklistItem(tx, extra.id, pieter));

  // The draft's page is open in one tab. In another, Connor discards the draft.
  await inTx((tx) => core.discardDraft(tx, draft.id, connor));
  const before = await whole(draft.id);

  // Everything that page can still send, by the ids it holds.
  const sends: [name: string, send: () => Promise<unknown>][] = [
    ["an edit to the title and notes", () => inTx((tx) => core.patchTask(tx, draft.id, { title: `Rehang gutters ${run}`, description: "Typed after the discard." }, pieter))],
    ["a new contractor", () => inTx((tx) => core.patchTask(tx, draft.id, { assignee: { contactId: robId } }, pieter))],
    ["a new date", () => inTx((tx) => core.patchTask(tx, draft.id, { dueDate: "2027-01-15" }, pieter))],
    ["a comment", () => inTx((tx) => core.addComment(tx, draft.id, { body: "Typed after the discard.", visibility: "SHARED" }, pieter))],
    ["a comment's edit", () => inTx((tx) => core.editComment(tx, comment.id, { body: "Edited after the discard." }, pieter))],
    ["a comment's delete", () => inTx((tx) => core.deleteComment(tx, comment.id, pieter))],
    ["a comment's restore", () => inTx((tx) => core.restoreComment(tx, deleted.id, pieter))],
    ["a file", () => addFile(draft.id, "after.jpg", pieter)],
    ["a file's rename", () => inTx((tx) => core.renameAttachment(tx, photo.id, "renamed.jpg", pieter))],
    ["a file's removal", () => inTx((tx) => core.removeAttachment(tx, { id: photo.id, taskId: draft.id, asanaGid: null }, pieter))],
    // Restored before the next one is added, so each has a place of its own.
    ["an item's restore", () => inTx((tx) => core.restoreChecklistItem(tx, snapshot, pieter))],
    ["a checklist item", () => inTx((tx) => core.addChecklistItem(tx, draft.id, "Added after the discard", pieter))],
    ["a tick", () => inTx((tx) => core.setChecklistItem(tx, first.id, true, pieter))],
    ["an item's rename", () => inTx((tx) => core.renameChecklistItem(tx, second.id, "Renamed after the discard", pieter))],
    ["an item's removal", () => inTx((tx) => core.removeChecklistItem(tx, second.id, pieter))],
    ["a status", () => inTx((tx) => core.setStatus(tx, draft.id, "OPEN", pieter))],
  ];
  for (const [name, send] of sends) {
    await assert.rejects(send(), refusal("That draft no longer exists."), name);
    assert.deepEqual(await whole(draft.id), before, `${name} wrote nothing`);
  }
  assert.equal(await prisma.taskAttachment.count({ where: { taskId: draft.id } }), 1, "no file row for the upload that was refused");
  assert.equal(await accessRows(draft.id), 0);
  assert.equal(await emailRows(draft.id), 0);

  // A unit renamed on its building is the one write that still reaches it, so its Undo brings back a draft Add takes.
  await prisma.property.update({ where: { id: building.id }, data: { units: [{ id: `w-${run}-1`, label: "1" }, { id: `w-${run}-2`, label: "Unit 2A" }] } });
  assert.deepEqual(await inTx((tx) => core.renameTaskUnits(tx, building.id, [{ from: "2a", to: "Unit 2A" }], pieter)), [draft.id]);
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: draft.id } })).unitLabel, "Unit 2A");
  assert.ok((await prisma.task.findUniqueOrThrow({ where: { id: draft.id } })).discardedAt, "still discarded");

  // Undo of the discard: it waits again, and the same page's writes land as on any draft.
  assert.deepEqual((await inTx((tx) => core.restoreDrafts(tx, [draft.id], connor))).restored.map((t) => t.id), [draft.id]);
  for (const [name, send] of sends.filter(([name]) => name !== "a status" && name !== "a file's removal" && name !== "an item's removal")) {
    await assert.doesNotReject(send(), name);
  }
  const after = await whole(draft.id);
  assert.deepEqual([after.title, after.description, after.assigneeContactId, after.unitLabel], [`Rehang gutters ${run}`, "Typed after the discard.", robId, "Unit 2A"]);
  assert.deepEqual(after.checklist.map((c) => [c.title, c.done]), [["Rehang the downspout", true], ["Renamed after the discard", false], ["Check the fascia", false], ["Added after the discard", false]]);
  assert.deepEqual(after.attachments.map((a) => a.filename).sort(), ["after.jpg", "renamed.jpg"]);
  assert.equal(await accessRows(draft.id), 0, "still a draft: nobody was given the job");
  assert.equal(await emailRows(draft.id), 0);
  // And Add takes it, at the unit as it is now named.
  assert.equal((await inTx((tx) => core.addDraft(tx, draft.id, pieter))).task.status, "OPEN");
});

test("Discard all takes only your own; its Undo brings each back, an archived contractor's too, which Add then refuses", { skip, timeout }, async () => {
  const jose = await made.contact({ fullName: `Jose ${run}` });
  const mine = await saveDraft();
  const forJose = await saveDraft({ assignee: { contactId: jose.id }, title: `Paint the porch ${run}` });
  const connors = await saveDraft({}, connor);
  const ids = [mine.id, forJose.id, connors.id];

  const gone = await inTx((tx) => core.discardDrafts(tx, ids, pieter, new Date(), { mine: true }));
  assert.deepEqual(gone.ids, [mine.id, forJose.id], "the drafts discarded, in the order asked");
  assert.deepEqual(gone.propertyIds, [propertyId]);
  assert.deepEqual(await idsIn(othersDraftsWhere(pieter.userId), ids), [connors.id], "the other partner's draft is untouched");
  assert.deepEqual(await idsIn(myDraftsWhere(pieter.userId), ids), []);
  assert.equal(await prisma.task.count({ where: { id: { in: ids } } }), 3, "nothing deleted");

  // Jose is archived before the Undo. A draft never stopped the archive (he has no open job), discarded or not.
  assert.deepEqual(await contractorArchiveBlockers(prisma, jose.id), { openJobs: 0, hasLogin: false });
  assert.equal(await inTx((tx) => setContactArchived(tx, jose.id, true, { id: connor.userId })), true);
  const back = await inTx((tx) => core.restoreDrafts(tx, gone.ids, pieter));
  assert.deepEqual([back.restored.map((t) => t.id), back.gone], [[mine.id, forJose.id], []], "both are back: the Undo checks nothing about them");
  // Add says it, in the house's own line for an archived contractor.
  await assert.rejects(
    inTx((tx) => core.addDraft(tx, forJose.id, pieter)),
    (err) => err instanceof core.DraftRefusedError && err.taskId === forJose.id && err.title === `Paint the porch ${run}` && err.message === core.ARCHIVED_ASSIGNEE_LINE,
  );
});

test("the sweep deletes only drafts discarded more than ten minutes ago, with their rows, and hands back their files", { skip, timeout }, async () => {
  // A day nothing else in this database was discarded on, so the sweep here can only find this test's rows.
  const day = new Date("2020-01-01T12:00:00Z");
  const at = (ms: number) => new Date(day.getTime() + ms);
  const old = await saveDraft();
  const recent = await saveDraft();
  const waiting = await saveDraft();
  const task = await saveTask();
  const photo = await addFile(old.id, "old.jpg", pieter);
  await addFile(recent.id, "recent.jpg", pieter);
  await inTx((tx) => core.discardDrafts(tx, [old.id], pieter, day));
  await inTx((tx) => core.discardDrafts(tx, [recent.id], pieter, at(DISCARD_KEEP_MS / 2)));
  const all = [old.id, recent.id, waiting.id, task.id];

  // Exactly ten minutes on, the first is not yet past its keep.
  assert.deepEqual(await inTx((tx) => core.sweepDiscardedDrafts(tx, at(DISCARD_KEEP_MS))), { ids: [], blobs: [] });
  assert.equal(await prisma.task.count({ where: { id: { in: all } } }), 4);

  const swept = await inTx((tx) => core.sweepDiscardedDrafts(tx, at(DISCARD_KEEP_MS + 1_000)));
  assert.deepEqual(swept, { ids: [old.id], blobs: [photo.url] });
  assert.deepEqual((await prisma.task.findMany({ where: { id: { in: all } }, select: { id: true }, orderBy: { id: "asc" } })).map((t) => t.id), [recent.id, waiting.id, task.id].sort());
  assert.equal(await prisma.taskEvent.count({ where: { taskId: old.id } }), 0);
  assert.equal(await prisma.taskAttachment.count({ where: { taskId: old.id } }), 0);
  assert.equal(await prisma.taskChecklistItem.count({ where: { taskId: old.id } }), 0);
  // Its Undo, tapped after that, says it is gone; the one still kept comes back.
  const back = await inTx((tx) => core.restoreDrafts(tx, [old.id, recent.id], pieter));
  assert.deepEqual([back.restored.map((t) => t.id), back.gone], [[recent.id], [old.id]]);
  // Brought back, it is no longer the sweep's, however long ago it was discarded.
  assert.deepEqual(await inTx((tx) => core.sweepDiscardedDrafts(tx, at(60 * 60_000))), { ids: [], blobs: [] });
  assert.equal(await statusOf(recent.id), "DRAFT");
});

test("Delete is not for a draft: it is refused and the draft stays; a task goes", { skip, timeout }, async () => {
  const draft = await saveDraft();
  await assert.rejects(inTx((tx) => core.deleteTask(tx, draft.id, pieter)), refusal("This is a draft. Discard it."));
  assert.equal(await statusOf(draft.id), "DRAFT");
  assert.equal(await prisma.taskChecklistItem.count({ where: { taskId: draft.id } }), 2);
  // An Add's Undo makes a task a draft again: Delete refuses it from then on.
  const added = await inTx((tx) => core.addDraft(tx, draft.id, pieter));
  await inTx((tx) => core.undoAddDraft(tx, draft.id, added.addEventId, pieter));
  await assert.rejects(inTx((tx) => core.deleteTask(tx, draft.id, pieter)), refusal(core.DRAFT_DELETE_LINE));
  const task = await saveTask();
  assert.equal((await inTx((tx) => core.deleteTask(tx, task.id, pieter)))?.id, task.id);
  assert.equal(await statusOf(task.id), null);
});

// ---------------------------------------------------------------------------
// 6.3 and 6.4: Add all is all or nothing; its Undo is task by task
// ---------------------------------------------------------------------------

test("Add all adds every draft or none: one with an archived contractor stops them all, and names itself", { skip, timeout }, async () => {
  const jose = await made.contact({ fullName: `Jose ${run}` });
  const a = await saveDraft();
  const b = await saveDraft({ assignee: { contactId: jose.id }, title: `Paint the porch ${run}` });
  const c = await saveDraft({ assignee: { userId: pieter.userId } });
  const connors = await saveDraft({}, connor);
  const ids = [c.id, a.id, b.id, connors.id];
  // Archived after the draft was saved (6.4).
  assert.equal(await inTx((tx) => setContactArchived(tx, jose.id, true, { id: connor.userId })), true);

  await assert.rejects(
    inTx((tx) => core.addDrafts(tx, ids, pieter, new Date(), { mine: true })),
    (err) => err instanceof core.DraftRefusedError && err.taskId === b.id && err.title === `Paint the porch ${run}` && err.message === "Archived. Pick someone else.",
  );
  for (const id of ids) assert.equal(await statusOf(id), "DRAFT", "none were added");
  assert.equal(await prisma.taskAccess.count({ where: { taskId: { in: ids } } }), 0);
  assert.equal(await prisma.notificationOutbox.count({ where: { taskId: { in: ids } } }), 0);
  assert.equal(await prisma.taskEvent.count({ where: { taskId: { in: ids }, kind: "STATUS" } }), 0);
  // The same refusal on its own row and its own page.
  await assert.rejects(inTx((tx) => core.addDraft(tx, b.id, pieter)), refusal(core.ARCHIVED_ASSIGNEE_LINE));
  // And an archived contractor can't be picked for a draft, or saved on a new one.
  await assert.rejects(inTx((tx) => core.patchTask(tx, a.id, { assignee: { contactId: jose.id } }, pieter)), refusal(core.ARCHIVED_ASSIGNEE_LINE));
  await assert.rejects(saveDraft({ assignee: { contactId: jose.id } }), refusal(core.ARCHIVED_ASSIGNEE_LINE));

  // He picks someone else, then adds them all: his three, never the other partner's.
  await inTx((tx) => core.patchTask(tx, b.id, { assignee: { contactId: robId } }, pieter));
  const added = await inTx((tx) => core.addDrafts(tx, ids, pieter, new Date(), { mine: true }));
  assert.deepEqual(added.map((x) => x.task.id).sort(), [a.id, b.id, c.id].sort());
  assert.equal(await statusOf(connors.id), "DRAFT");
  assert.deepEqual(draftsAddedNames(added.map((x) => x.contractor)), { emailed: ["Zack"], quiet: ["Rob"] });
  assert.equal(await liveAccess(a.id), 1);
  assert.equal(await liveAccess(b.id, robId), 1);
  assert.equal(await emailRows(a.id), 1);
  assert.equal(await emailRows(b.id), 0);
  // Tapped again: nothing left to add, and nothing is written twice.
  assert.deepEqual(await inTx((tx) => core.addDrafts(tx, ids, pieter, new Date(), { mine: true })), []);
  assert.equal(await emailRows(a.id), 1);
});

test("Add all's Undo is task by task: the one its contractor opened stays a task, by name, and the rest are drafts again", { skip, timeout }, async () => {
  const a = await saveDraft();
  const b = await saveDraft({ assignee: { contactId: robId }, title: `Paint the porch ${run}` });
  const c = await saveDraft({ assignee: { userId: pieter.userId } });
  const ids = [a.id, b.id, c.id];
  const added = await inTx((tx) => core.addDrafts(tx, ids, pieter));
  const adds = added.map((x) => ({ taskId: x.task.id, addEventId: x.addEventId }));
  // Rob opens his job before the Undo is tapped.
  await prisma.taskReadState.create({ data: { taskId: b.id, contactId: robId } });

  // Too late for every one of them: each is kept, with the same line, and nothing changes.
  const late = await inTx((tx) => core.undoAddDrafts(tx, adds, pieter, new Date(Date.now() + APPROVAL_UNDO_MS + 5_000)));
  assert.deepEqual([late.undone, late.kept.map((k) => k.message)], [[], ["Too late to undo.", "Too late to undo.", "Too late to undo."]]);
  for (const id of ids) assert.equal(await statusOf(id), "OPEN");

  const out = await inTx((tx) => core.undoAddDrafts(tx, [...adds, { taskId: "no-such-task", addEventId: "x" }], pieter));
  assert.deepEqual(out.undone.map((t) => t.id).sort(), [a.id, c.id].sort());
  assert.equal(out.kept.length, 2);
  const kept = out.kept.find((k) => k.taskId === b.id);
  assert.equal(kept?.title, `Paint the porch ${run}`);
  assert.match(kept?.message ?? "", /^Rob( \S+)? already opened it\.$/);
  assert.deepEqual(out.kept.find((k) => k.taskId === "no-such-task"), { taskId: "no-such-task", title: "", message: "That task no longer exists." });
  assert.deepEqual([await statusOf(a.id), await statusOf(b.id), await statusOf(c.id)], ["DRAFT", "OPEN", "DRAFT"]);
  // The one kept is whole: his access stands. The ones taken back left nothing behind.
  assert.equal(await liveAccess(b.id, robId), 1);
  assert.equal(await prisma.taskAccess.count({ where: { taskId: { in: [a.id, c.id] } } }), 0);
  assert.equal(await prisma.notificationOutbox.count({ where: { taskId: { in: [a.id, c.id] } } }), 0);
  const addLine = async (x: { addEventId: string }) => (await prisma.taskEvent.findUniqueOrThrow({ where: { id: x.addEventId } })).deletedAt !== null;
  assert.deepEqual(await Promise.all(adds.map(addLine)), adds.map((x) => x.taskId !== b.id), "only the kept one's Add line still shows");
});

// ---------------------------------------------------------------------------
// Section 5: a save, sent once, twice, or under a key that was already used
// ---------------------------------------------------------------------------

test("a save lists the first thing said first; the same batchKey again is a replay, other drafts under it are refused, and nothing is written", { skip, timeout }, async () => {
  const batchKey = randomUUID();
  const said = (titles: string[]): core.DraftInput[] => titles.map((title) => ({ title, propertyId, assignee: { contactId: zack.contactId } }));
  const THREE = said([`Gutters ${run}`, `Faucet ${run}`, `Permit ${run}`]);
  const save = (by: Partner, drafts = THREE, key = batchKey) => inTx((tx) => core.saveDrafts(tx, key, drafts, by));
  const prefix = draftBatchPrefix(pieter.userId, batchKey);
  const saved = () => prisma.task.count({ where: { autoKey: { startsWith: prefix } } });
  const written = async () => [await saved(), await prisma.taskEvent.count({ where: { task: { autoKey: { startsWith: prefix } } } })];

  const first = await save(pieter);
  assert.ok(first.kind === "saved");
  assert.deepEqual(first.tasks.map((t) => [t.title, t.status, t.autoKey]), THREE.map((d, i) => [d.title, "DRAFT", draftAutoKey(pieter.userId, batchKey, i)]), "answered in the order sent");
  // My drafts lists newest first, and within one save the first thing he said is first.
  const listed = await prisma.task.findMany({ where: { AND: [myDraftsWhere(pieter.userId), { autoKey: { startsWith: prefix } }] }, orderBy: DRAFTS_ORDER_BY, select: { title: true } });
  assert.deepEqual(listed.map((t) => t.title), THREE.map((d) => d.title));
  const before = await written();

  // The same drafts again: a replay, with the tasks the first send made.
  const second = await save(pieter);
  assert.ok(second.kind === "replay");
  assert.deepEqual(second.tasks.map((t) => t.id), first.tasks.map((t) => t.id), "the drafts already saved, in the save's order");
  assert.deepEqual(await written(), before, "nothing new, and nothing written on them");
  // Built another way round, they are still the same drafts.
  const rebuilt = THREE.map((d) => ({ assignee: d.assignee, propertyId: d.propertyId, title: d.title }));
  assert.equal((await save(pieter, rebuilt)).kind, "replay");

  // Other drafts under the key: refused, never answered like a save, and none of them is written.
  for (const other of [said([`Gutters ${run}`, `Faucet ${run}`]), said([`Roof ${run}`, `Faucet ${run}`, `Permit ${run}`]), [...THREE, ...said([`Roof ${run}`])]]) {
    assert.deepEqual(await save(pieter, other), { kind: "key-reused" });
  }
  assert.deepEqual(await written(), before);
  assert.equal(await prisma.task.count({ where: { title: `Roof ${run}` } }), 0);

  // One of them added since: the replay still returns it, and still adds nothing.
  await inTx((tx) => core.addDraft(tx, first.tasks[0].id, pieter));
  const third = await save(pieter);
  assert.deepEqual(third.kind === "replay" && third.tasks.map((t) => [t.id, t.status]), first.tasks.map((t, i) => [t.id, i === 0 ? "OPEN" : "DRAFT"]));
  assert.equal(await saved(), 3);

  // The same key from the other partner's Claude is another save.
  assert.equal((await save(connor)).kind, "saved");
  assert.equal(await saved(), 3);
  assert.equal(await prisma.task.count({ where: { autoKey: { startsWith: draftBatchPrefix(connor.userId, batchKey) } } }), 3);

  // A save's "check" runs only for a save that is new: its refusal writes nothing, and a replay never runs it.
  const refusedKey = randomUUID();
  await assert.rejects(
    inTx((tx) => core.saveDrafts(tx, refusedKey, THREE, pieter, async () => Promise.reject(new core.TaskRuleError("Not today.")))),
    refusal("Not today."),
  );
  assert.equal(await prisma.task.count({ where: { autoKey: { startsWith: draftBatchPrefix(pieter.userId, refusedKey) } } }), 0);
  assert.equal((await inTx((tx) => core.saveDrafts(tx, batchKey, THREE, pieter, async () => Promise.reject(new Error("never asked"))))).kind, "replay");

  // Two sends of a new save at the same moment: one writes, the other waits and answers with what it wrote.
  const racedKey = randomUUID();
  const raced = await Promise.all([save(pieter, THREE, racedKey), save(pieter, THREE, racedKey)]);
  assert.deepEqual(raced.map((r) => r.kind).sort(), ["replay", "saved"]);
  const [x, y] = raced.map((r) => (r.kind === "saved" || r.kind === "replay" ? r.tasks.map((t) => t.id) : []));
  assert.deepEqual(x, y);
  assert.equal(await prisma.task.count({ where: { autoKey: { startsWith: draftBatchPrefix(pieter.userId, racedKey) } } }), 3);
});

test("a partner's waiting drafts are capped in the database: a save that would pass the cap writes nothing, and discarded ones don't count", { skip, timeout }, async () => {
  // A partner of this test's own, so the count is exact whatever the other tests left waiting.
  const u = await made.user({ email: `cap-${run}@example.test`, name: "Cap Tester", passwordHash: "scrypt$x" });
  const cap: Partner = { kind: "staff", userId: u.id, label: "Cap Tester" };
  const two: core.DraftInput[] = [{ title: `Over the cap A ${run}` }, { title: `Over the cap B ${run}` }];
  const waiting = () => prisma.task.count({ where: myDraftsWhere(cap.userId) });
  const rows = () => prisma.task.count({ where: { createdByUserId: cap.userId } });
  // One under the cap, as rows (a save of 199 would say nothing more).
  await prisma.task.createMany({
    data: Array.from({ length: MAX_WAITING_DRAFTS - 1 }, (_, i) => ({ title: `Waiting ${i} ${run}`, status: "DRAFT" as const, bucket: "General", createdByUserId: cap.userId })),
  });
  assert.equal(await waiting(), MAX_WAITING_DRAFTS - 1);

  assert.deepEqual(await inTx((tx) => core.saveDrafts(tx, randomUUID(), two, cap)), { kind: "too-many", waiting: MAX_WAITING_DRAFTS - 1 });
  assert.equal(await rows(), MAX_WAITING_DRAFTS - 1, "neither draft was written");
  // The other partner's save is not counted against him.
  assert.equal((await inTx((tx) => core.saveDrafts(tx, randomUUID(), two, connor))).kind, "saved");

  // Two saves at once that fit one at a time and not together: one is saved, the other refused, never both.
  const one: core.DraftInput[] = [{ title: `Last one ${run}` }];
  const both = await Promise.all([inTx((tx) => core.saveDrafts(tx, randomUUID(), one, cap)), inTx((tx) => core.saveDrafts(tx, randomUUID(), one, cap))]);
  assert.deepEqual(both.map((r) => r.kind).sort(), ["saved", "too-many"]);
  assert.equal(await waiting(), MAX_WAITING_DRAFTS, "exactly at the cap");

  // He discards one: it no longer waits, so there is room for one more, and not for two.
  const [first] = await prisma.task.findMany({ where: myDraftsWhere(cap.userId), take: 1, orderBy: { id: "asc" }, select: { id: true } });
  await inTx((tx) => core.discardDraft(tx, first.id, cap));
  assert.deepEqual(await inTx((tx) => core.saveDrafts(tx, randomUUID(), two, cap)), { kind: "too-many", waiting: MAX_WAITING_DRAFTS - 1 });
  assert.equal((await inTx((tx) => core.saveDrafts(tx, randomUUID(), one, cap))).kind, "saved");
  assert.equal(await waiting(), MAX_WAITING_DRAFTS);
  // Add all and Discard all take a full My drafts in one call.
  const mine = (await prisma.task.findMany({ where: myDraftsWhere(cap.userId), select: { id: true } })).map((t) => t.id);
  assert.equal((await inTx((tx) => core.discardDrafts(tx, mine, cap, new Date(), { mine: true }))).ids.length, MAX_WAITING_DRAFTS);
  assert.equal(await waiting(), 0);
});

test("the largest save the connector allows, 25 drafts of 20 items each, is one short transaction with every item in its place", { skip, timeout }, async () => {
  const big: core.DraftInput[] = Array.from({ length: 25 }, (_, d) => ({
    title: `Big save ${d} ${run}`,
    propertyId,
    assignee: { contactId: zack.contactId },
    checklist: Array.from({ length: 20 }, (_, i) => ({ title: ` Step ${i} ` })),
  }));
  const started = Date.now();
  const out = await inTx((tx) => core.saveDrafts(tx, randomUUID(), big, connor));
  const took = Date.now() - started;
  assert.ok(out.kind === "saved");
  // Five statements an item took 2,600 statements and several seconds here; one insert a draft takes well under two.
  assert.ok(took < 5_000, `took ${took} ms`);
  const items = await prisma.taskChecklistItem.findMany({ where: { taskId: { in: out.tasks.map((t) => t.id) } }, orderBy: [{ taskId: "asc" }, { position: "asc" }], select: { taskId: true, position: true, title: true, done: true } });
  assert.equal(items.length, 500);
  for (const task of out.tasks) {
    const own = items.filter((i) => i.taskId === task.id);
    assert.deepEqual(own.map((i) => [i.position, i.title, i.done]), Array.from({ length: 20 }, (_, i) => [i, `Step ${i}`, false]), "0 to 19 in order, trimmed, as addChecklistItem writes them");
  }
});
