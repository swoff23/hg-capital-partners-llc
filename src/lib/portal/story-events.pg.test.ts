import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { scratchRows } from "@/lib/scratch-rows";
import * as core from "@/lib/tasks/core";
import { portalActorLabel, storyLine } from "./job-view";
import { storyEvents } from "./story-events";

/**
 * The job's story on a contractor's Updates against a real database
 * (docs/specs/contractor-timeline.md): a job given to Zack, then to Bea,
 * shows Bea the job being added and given to her and what happened while
 * it was hers, in her words, and never Zack's name, his day, a line written
 * to him, an internal comment or a Waiting reason.
 *
 * The rows go through storyEvents, the SQL jobUpdates runs, and the same
 * named columns jobUpdates selects (queries.ts can't load under node:test,
 * so its SELECT is written out again here; queries.test.ts holds the
 * original to its keys).
 *
 * `npm test` skips it unless HG_SCRATCH_DATABASE_URL names a local scratch
 * database (its name must contain "scratch"); it deletes its rows when it
 * finishes (scratch-rows.ts).
 */

const URL_ENV = process.env.HG_SCRATCH_DATABASE_URL ?? "";

/** A database on this machine whose name says scratch (job-batch.pg.test.ts's rule). */
function isLocalScratch(raw: string): boolean {
  try {
    const url = new URL(raw);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) && /^\/[a-z0-9_]*scratch[a-z0-9_]*$/.test(url.pathname);
  } catch {
    return false;
  }
}

const skip = isLocalScratch(URL_ENV) ? false : "set HG_SCRATCH_DATABASE_URL to a local scratch database to run this";
const timeout = 30_000;

let prisma: PrismaClient;
const made = scratchRows(() => prisma);
let staff: Extract<core.Principal, { kind: "staff" }>;
let zack: Extract<core.Principal, { kind: "contractor" }>;
let bea: Extract<core.Principal, { kind: "contractor" }>;
let propertyId: string;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  await made.takeTurn(URL_ENV);
  const run = randomUUID().slice(0, 8);
  const connor = await made.user({ email: `connor-${run}@example.test`, name: "Connor Swofford", passwordHash: "scrypt$x" });
  staff = { kind: "staff", userId: connor.id, label: "Connor Swofford" };
  for (const [name, who] of [["Zack Day", "zack"], ["Bea Stone", "bea"]] as const) {
    const contact = await made.contact({ fullName: name });
    await prisma.portalAccount.create({
      data: { contactId: contact.id, email: `${who}-${run}@example.test`, passwordHash: "scrypt$x", status: "ACTIVE", lastSignInAt: new Date() },
    });
    const principal = { kind: "contractor" as const, contactId: contact.id, label: name };
    if (who === "zack") zack = principal;
    else bea = principal;
  }
  propertyId = (await made.property({ address: `${run} Story St, Buffalo, NY 14213` })).id;
});

after(async () => {
  if (skip) return;
  await made.remove();
  await prisma.$disconnect();
});

const inTx = <T>(f: (tx: core.Tx) => Promise<T>) => prisma.$transaction(f);

/** Bea's story lines, as jobUpdates reads and words them. */
async function storyFor(viewer: string, taskId: string) {
  const rows = await prisma.$queryRaw<
    {
      kind: string;
      actorLabel: string;
      actorUserId: string | null;
      actorContactId: string | null;
      from: string | null;
      to: string | null;
      itemTitle: string | null;
      itemAction: string | null;
      itemDone: string | null;
      request: string | null;
    }[]
  >`
    SELECT e."kind"::text AS "kind", e."actorLabel", e."actorUserId", e."actorContactId",
           CASE WHEN e."kind" IN ('STATUS', 'DUE', 'SCHEDULED', 'CHECKLIST') THEN e."data"->>'from' END AS "from",
           CASE WHEN e."kind" IN ('STATUS', 'DUE', 'SCHEDULED', 'CHECKLIST') THEN e."data"->>'to' END AS "to",
           CASE WHEN e."kind" = 'CHECKLIST' THEN e."data"->>'title' END AS "itemTitle",
           CASE WHEN e."kind" = 'CHECKLIST' THEN e."data"->>'action' END AS "itemAction",
           CASE WHEN e."kind" = 'CHECKLIST' THEN e."data"->>'done' END AS "itemDone",
           CASE WHEN e."kind" = 'CREATED' THEN e."data"->>'request' END AS "request"
    FROM "TaskEvent" e
    WHERE e."taskId" = ${taskId} AND ${storyEvents(viewer)}
    ORDER BY e."createdAt", e."id"`;
  return rows.map((r) => ({
    ...r,
    line: storyLine(
      {
        kind: r.kind,
        actor: r.actorUserId || r.actorContactId ? portalActorLabel(viewer, { userId: r.actorUserId, contactId: r.actorContactId, label: r.actorLabel }) : null,
        from: r.from,
        to: r.to,
        itemTitle: r.itemTitle,
        itemAction: r.itemAction,
        itemDone: r.itemDone,
        request: r.request === "true",
      },
      "2026-11-21",
    ),
  }));
}

test("a job given to Zack, then to Bea, tells Bea only her part, in her words", { skip, timeout }, async () => {
  const task = await inTx((tx) => core.createTask(tx, { title: "Cabinet install", propertyId, dueDate: "2026-11-24", assignee: { contactId: zack.contactId } }, staff));
  const id = task.id;
  // While it's Zack's: an internal comment, a Waiting reason that names him, his day, and a due date moved for him.
  await inTx((tx) => core.addComment(tx, id, { body: "Zack quoted $400, too high.", visibility: "INTERNAL" }, staff));
  await inTx((tx) => core.setStatus(tx, id, "WAITING", staff, { waitingOn: "Zack's quote, $400" }));
  await inTx((tx) => core.scheduleByContractor(tx, id, "2026-11-23", zack));
  await inTx((tx) => core.patchTask(tx, id, { dueDate: "2026-11-25" }, staff));

  // Then it's Bea's: a new due date, a checklist she ticks, the notes, and a wait with its own reason.
  await inTx((tx) => core.patchTask(tx, id, { assignee: { contactId: bea.contactId } }, staff));
  await inTx((tx) => core.patchTask(tx, id, { dueDate: "2026-11-26" }, staff));
  const item = await inTx((tx) => core.addChecklistItem(tx, id, "Uppers", staff));
  await inTx((tx) => core.setChecklistItem(tx, item.id, true, bea));
  await inTx((tx) => core.patchTask(tx, id, { description: "Hang the uppers first." }, staff));
  await inTx((tx) => core.setStatus(tx, id, "WAITING", staff, { waitingOn: "Parts from the supplier, $1,200" }));
  await inTx((tx) => core.setStatus(tx, id, "OPEN", staff));

  const story = await storyFor(bea.contactId, id);
  const lines = story.map((r) => r.line).filter(Boolean);

  // Never Zack: not his name, not his day, not a line written while the job was his, not an assignment naming him.
  assert.ok(story.every((r) => r.actorContactId === null || r.actorContactId === bea.contactId), "no other contractor's rows");
  for (const line of lines) assert.doesNotMatch(line!, /Zack|\$|quote|supplier|Nov 23|Nov 25/, line!);
  assert.equal(story.filter((r) => r.kind === "ASSIGNED").length, 1, "only the assignment that gave it to her");
  assert.ok(!story.some((r) => r.kind === "COMMENT" || r.kind === "ACCESS" || r.kind === "TITLE"), "no comment, access or title rows");

  assert.deepEqual(lines, [
    "Connor added this job",
    "Connor gave you this job",
    "Connor moved the due date to Thu, Nov 26",
    "You checked “Uppers”",
    "Connor edited the notes",
    "Connor set status to Waiting",
    "Connor set status to To do",
  ]);

  // Zack, for his part, never sees Bea's: her tick isn't his, and her assignment isn't to him.
  const his = await storyFor(zack.contactId, id);
  assert.ok(his.every((r) => r.actorContactId === null || r.actorContactId === zack.contactId));
  assert.ok(!his.some((r) => r.kind === "CHECKLIST" && r.actorContactId === bea.contactId));
});

test("a job handed away and back shows its contractor both of their stretches and nothing between", { skip, timeout }, async () => {
  const task = await inTx((tx) => core.createTask(tx, { title: "Patch the porch", propertyId, dueDate: "2026-11-24", assignee: { contactId: bea.contactId } }, staff));
  const id = task.id;
  // Bea's first stretch: Connor edits the notes for her.
  await inTx((tx) => core.patchTask(tx, id, { description: "Bea's notes." }, staff));
  // Zack has it for a while: Connor moves Due and adds a to-do.
  await inTx((tx) => core.patchTask(tx, id, { assignee: { contactId: zack.contactId } }, staff));
  await inTx((tx) => core.patchTask(tx, id, { dueDate: "2026-11-25" }, staff));
  await inTx((tx) => core.addChecklistItem(tx, id, "Zack's railing", staff));
  // Back to Bea, then one change of her second stretch.
  await inTx((tx) => core.patchTask(tx, id, { assignee: { contactId: bea.contactId } }, staff));
  await inTx((tx) => core.patchTask(tx, id, { dueDate: "2026-11-26" }, staff));
  const lines = (await storyFor(bea.contactId, id)).map((r) => r.line).filter(Boolean);
  assert.deepEqual(lines, [
    "Connor added this job",
    "Connor edited the notes",
    "Connor gave you this job",
    "Connor moved the due date to Thu, Nov 26",
  ]);
});

test("an assignment undone keeps the contractor's whole story, their own lines too", { skip, timeout }, async () => {
  const task = await inTx((tx) => core.createTask(tx, { title: "Fix the gate", propertyId, dueDate: "2026-11-24", assignee: { contactId: zack.contactId } }, staff));
  const id = task.id;
  await inTx((tx) => core.scheduleByContractor(tx, id, "2026-11-23", zack));
  const item = await inTx((tx) => core.addChecklistItem(tx, id, "Hinges", staff));
  await inTx((tx) => core.setChecklistItem(tx, item.id, true, zack));
  // A partner picks Bea by mistake and taps Undo on the toast, which writes the assignment back to Zack.
  await inTx((tx) => core.patchTask(tx, id, { assignee: { contactId: bea.contactId } }, staff));
  await inTx((tx) => core.patchTask(tx, id, { assignee: { contactId: zack.contactId } }, staff));
  const lines = (await storyFor(zack.contactId, id)).map((r) => r.line).filter(Boolean);
  assert.ok(lines.includes("You checked “Hinges”"), lines.join(" | "));
  assert.equal(lines.filter((l) => l === "Connor gave you this job").length, 1, "only the Undo's line: the job was added with him");
  assert.ok(!lines.some((l) => /Bea/.test(l!)));
  // Bea, who had it for a moment, sees nothing of his.
  const hers = (await storyFor(bea.contactId, id)).map((r) => r.line).filter(Boolean);
  assert.ok(!hers.some((l) => /Hinges|Nov 23/.test(l!)), hers.join(" | "));
});
