import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { scratchRows } from "@/lib/scratch-rows";
import { createTask, type Principal } from "./core";
import { HELD_KEEP_MS, NEW_TASK_FILES_FULL, NEW_TASK_FILES_MAX, NOT_THIS_FORM, attachForm, holdFile, releaseFile, releaseForm, sweepHeld, type HeldFile } from "./new-task-files";

/**
 * New task's files on a real Postgres (docs/specs/new-task-checklist-photos.md, section 3): a file held before Create
 * becomes the task's on Create, one that lands after attaches as it's recorded, both hang from the task's "created"
 * line as Shared files with no contractor of their own, and nobody picks up another person's form. Remove, Discard
 * and the sweep hand back the blobs to delete, and never a task's. Opt-in like the other pg tests: `npm test` skips it
 * unless HG_SCRATCH_DATABASE_URL names a local scratch database with the migrations applied. It removes what it adds.
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_tasks_scratch npx tsx --test src/lib/tasks/new-task-files.pg.test.ts
 */

const URL_ENV = process.env.HG_SCRATCH_DATABASE_URL ?? "";

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

let prisma: PrismaClient;
const made = scratchRows(() => prisma);
const run = randomUUID().slice(0, 8);
let connor: Principal & { kind: "staff" };
let pieter: Principal & { kind: "staff" };

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV, NODE_ENV: "test" } as never);
  await made.takeTurn(URL_ENV);
  const a = await prisma.user.create({ data: { email: `${run}-c@example.com`, name: `${run} Connor` } });
  const b = await prisma.user.create({ data: { email: `${run}-p@example.com`, name: `${run} Pieter` } });
  connor = { kind: "staff", userId: a.id, label: "Connor" } as typeof connor;
  pieter = { kind: "staff", userId: b.id, label: "Pieter" } as typeof pieter;
});

after(async () => {
  if (skip) return;
  await prisma.task.deleteMany({ where: { title: { startsWith: run } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
  await made.remove();
  await prisma.$disconnect();
});

const form = () => randomUUID();
let n = 0;
function file(formId: string, kind: HeldFile["kind"] = "IMAGE"): HeldFile {
  n++;
  return {
    pathname: `new-tasks/${formId}/orig/porch-${n}-abc.jpg`,
    url: `https://store.private.blob.vercel-storage.com/new-tasks/${formId}/orig/porch-${n}-abc.jpg`,
    filename: `Porch ${n}.jpg`,
    size: 1000 + n,
    contentType: kind === "FILE" ? "application/pdf" : "image/jpeg",
    kind,
    thumbPathname: `new-tasks/${formId}/thumb/porch-${n}-abc.jpg`,
    posterPathname: null,
    width: 4032,
    height: 3024,
    durationSec: null,
  };
}

const newTask = (title: string, formId: string | null, p = connor) =>
  prisma.$transaction(async (tx) => {
    const task = await createTask(tx, { title: `${run} ${title}` }, p);
    const attached = formId ? await attachForm(tx, formId, p.userId, task.id) : 0;
    return { task, attached };
  });

test("files held before Create become the task's: Shared, on its created line, no contractor of their own, no line of their own", { skip }, async () => {
  const f = form();
  const one = await prisma.$transaction((tx) => holdFile(tx, connor.userId, f, file(f)));
  const two = await prisma.$transaction((tx) => holdFile(tx, connor.userId, f, file(f, "FILE")));
  assert.equal(one.taskId, null);
  const { task, attached } = await newTask("Fix porch light", f);
  assert.equal(attached, 2);

  const created = await prisma.taskEvent.findFirstOrThrow({ where: { taskId: task.id, kind: "CREATED" } });
  const files = await prisma.taskAttachment.findMany({ where: { taskId: task.id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(
    files.map((a) => ({ eventId: a.eventId, visibility: a.visibility, audience: a.audienceContactId, by: a.uploadedByUserId, kind: a.kind })),
    [
      { eventId: created.id, visibility: "SHARED", audience: null, by: connor.userId, kind: "IMAGE" },
      { eventId: created.id, visibility: "SHARED", audience: null, by: connor.userId, kind: "FILE" },
    ],
  );
  assert.equal(await prisma.taskEvent.count({ where: { taskId: task.id, kind: "ATTACHMENT" } }), 0, "no Activity line of their own");
  const held = await prisma.newTaskUpload.findMany({ where: { id: { in: [one.id, two.id] } } });
  assert.deepEqual(held.map((h) => h.attachmentId).sort(), files.map((a) => a.id).sort());
});

test("a file recorded after Create attaches to the task as it lands", { skip }, async () => {
  const f = form();
  const { task, attached } = await newTask("Late photo", f);
  assert.equal(attached, 0, "nothing was up yet");
  const late = await prisma.$transaction((tx) => holdFile(tx, connor.userId, f, file(f)));
  assert.equal(late.taskId, task.id);
  const created = await prisma.taskEvent.findFirstOrThrow({ where: { taskId: task.id, kind: "CREATED" } });
  const att = await prisma.taskAttachment.findFirstOrThrow({ where: { taskId: task.id } });
  assert.equal(att.eventId, created.id);
  // A Retry of that record step gets the same row back, and no second file.
  const again = await prisma.$transaction((tx) => holdFile(tx, connor.userId, f, { ...file(f), pathname: att.pathname! }));
  assert.equal(again.id, late.id);
  assert.equal(await prisma.taskAttachment.count({ where: { taskId: task.id } }), 1);
});

test("a record and a Create at the same moment: the file is attached by one of the two", { skip }, async () => {
  for (let i = 0; i < 5; i++) {
    const f = form();
    const [, { task }] = await Promise.all([prisma.$transaction((tx) => holdFile(tx, connor.userId, f, file(f))), newTask(`Race ${i}`, f)]);
    assert.equal(await prisma.taskAttachment.count({ where: { taskId: task.id } }), 1, `round ${i}`);
  }
});

test("a form makes one task; a second Create with it attaches nothing", { skip }, async () => {
  const f = form();
  await prisma.$transaction((tx) => holdFile(tx, connor.userId, f, file(f)));
  const first = await newTask("First", f);
  const second = await newTask("Second", f);
  assert.equal(first.attached, 1);
  assert.equal(second.attached, 0);
  assert.equal(await prisma.taskAttachment.count({ where: { taskId: second.task.id } }), 0);
});

test("nobody picks up another person's form", { skip }, async () => {
  const f = form();
  const mine = file(f);
  await prisma.$transaction((tx) => holdFile(tx, connor.userId, f, mine));
  await assert.rejects(prisma.$transaction((tx) => holdFile(tx, pieter.userId, f, file(f))), { message: NOT_THIS_FORM });
  await assert.rejects(prisma.$transaction((tx) => holdFile(tx, pieter.userId, f, mine)), { message: NOT_THIS_FORM });
  const theirs = await newTask("Pieter's", f, pieter);
  assert.equal(theirs.attached, 0);
  assert.deepEqual(await prisma.$transaction((tx) => releaseForm(tx, pieter.userId, f)), []);
});

test("a form takes up to 50 files", { skip }, async () => {
  const f = form();
  for (let i = 0; i < NEW_TASK_FILES_MAX; i++) await prisma.$transaction((tx) => holdFile(tx, connor.userId, f, file(f)));
  await assert.rejects(prisma.$transaction((tx) => holdFile(tx, connor.userId, f, file(f))), { message: NEW_TASK_FILES_FULL });
  await prisma.$transaction((tx) => releaseForm(tx, connor.userId, f));
});

test("Remove and Discard hand back the blobs to delete, and never a task's file", { skip }, async () => {
  const f = form();
  const a = file(f);
  const one = await prisma.$transaction((tx) => holdFile(tx, connor.userId, f, a));
  assert.deepEqual(await prisma.$transaction((tx) => releaseFile(tx, pieter.userId, one.id)), [], "not theirs");
  assert.deepEqual(await prisma.$transaction((tx) => releaseFile(tx, connor.userId, one.id)), [a.url, a.thumbPathname]);
  assert.equal(await prisma.newTaskUpload.count({ where: { id: one.id } }), 0);

  const b = file(f);
  await prisma.$transaction((tx) => holdFile(tx, connor.userId, f, b));
  assert.deepEqual(await prisma.$transaction((tx) => releaseForm(tx, connor.userId, f)), [b.url, b.thumbPathname]);

  const g = form();
  const kept = await prisma.$transaction((tx) => holdFile(tx, connor.userId, g, file(g)));
  await newTask("Kept", g);
  assert.deepEqual(await prisma.$transaction((tx) => releaseFile(tx, connor.userId, kept.id)), [], "the task's now");
  assert.deepEqual(await prisma.$transaction((tx) => releaseForm(tx, connor.userId, g)), [], "the form made its task");
});

test("the sweep takes files on drafts past their keep, with their blobs, and leaves a task's blobs alone", { skip }, async () => {
  const f = form();
  const old = file(f);
  const row = await prisma.$transaction((tx) => holdFile(tx, connor.userId, f, old));
  const g = form();
  await prisma.$transaction((tx) => holdFile(tx, connor.userId, g, file(g)));
  const { task } = await newTask("Swept", g);
  const now = new Date(Date.now() + HELD_KEEP_MS + 60_000);
  const blobs = await prisma.$transaction((tx) => sweepHeld(tx, now, 10_000));
  assert.ok(blobs.includes(old.url) && blobs.includes(old.thumbPathname!));
  assert.equal(await prisma.newTaskUpload.count({ where: { id: row.id } }), 0);
  assert.equal(await prisma.newTaskUpload.count({ where: { formId: g } }), 0, "the attached row's bookkeeping goes too");
  assert.equal(await prisma.taskAttachment.count({ where: { taskId: task.id } }), 1, "the task keeps its file");
});
