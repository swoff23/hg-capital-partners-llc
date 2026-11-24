import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient, TaskStatus, User } from "@prisma/client";
import { FieldError } from "@/lib/action-result";
import { todayYmdEastern } from "@/lib/dates";
import { makeClient } from "@/lib/db-client";
import { scratchRows } from "@/lib/scratch-rows";
import {
  ALREADY_ADDED,
  CONTRACTOR_ARCHIVED,
  DATE_NEEDED,
  FILE_NEEDED,
  JOB_CANCELED,
  JOB_NOT_FINISHED,
  METHOD_NEEDED,
  NO_JOB_ACCESS,
  PAID_DAY_NEEDED,
  SIGN_IN_TO_SEND,
  STAGE_FIELD,
  addInvoiceFile,
  approveInvoice,
  backToReview,
  createEmailInvoice,
  createPortalInvoice,
  createReplyInvoice,
  createStaffInvoice,
  editInvoice,
  linkJob,
  markNotInvoice,
  markPaid,
  matchContractor,
  saveInvoice,
  restoreInvoice,
  staffActor,
  systemActor,
  undoPaid,
  unlinkJob,
  type Contractor,
  type InvoiceFileMeta,
  type Staff,
} from "./core";
import { NUMBER_TOO_LONG, TOTAL_ABOVE_ZERO, contractorInvoiceWhere } from "./fields";

/**
 * The invoice rules on a real Postgres (docs/contractor-invoices-plan.md, 5.2): stage moves and their refusals,
 * two partners marking one invoice paid at once, Undo paid, Back to review, Not an invoice and its Undo, the
 * duplicate rule, what a contractor sees, and the ways in. Opt-in by the same guard as
 * src/lib/draws/core.pg.test.ts: `npm test` skips it unless HG_SCRATCH_DATABASE_URL names a local scratch database
 * with the migrations applied. It removes what it adds.
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_<worktree>_scratch npx tsx --test src/lib/invoices/core.pg.test.ts
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
const today = todayYmdEastern();

let connor: Staff;
let pieter: Staff;
let connorUser: User;
let zackId: string;
let mikeId: string;
let propertyId: string;
let zack: Contractor;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV, NODE_ENV: "test" } as never);
  await made.takeTurn(URL_ENV);
  connorUser = await made.user({ email: `connor-${run}@invoices.test`, name: `Connor Inv${run}` });
  const pieterUser = await made.user({ email: `pieter-${run}@invoices.test`, name: `Pieter Inv${run}` });
  connor = staffActor(connorUser);
  pieter = staffActor(pieterUser);
  const z = await made.contact({ fullName: `Zack Inv${run}`, email: `zack-${run}@invoices.test` });
  const m = await made.contact({ fullName: `Mike Inv${run}`, email: `mike-${run}@invoices.test` });
  zackId = z.id;
  mikeId = m.id;
  zack = { kind: "contractor", contactId: z.id, label: z.fullName };
  propertyId = (await made.property({ address: `15 Oxford Ave, Buffalo, NY 14209 ${run}` })).id;
});

after(async () => {
  if (skip) return;
  // made.remove deletes this file's invoices, the partners' email lines about them and its stored emails.
  await made.remove();
  await prisma.$disconnect();
});

async function refusal(p: Promise<unknown>): Promise<Record<string, string>> {
  try {
    await p;
  } catch (err) {
    if (err instanceof FieldError) return err.fieldErrors as Record<string, string>;
    throw err;
  }
  assert.fail("expected a refusal");
}

const first = (s: Staff) => s.label.split(" ")[0];

async function job(title: string, status: TaskStatus = "OPEN"): Promise<string> {
  const t = await prisma.task.create({ data: { title: `${title} ${run}`, status, propertyId } });
  return t.id;
}

let fileCount = 0;
/** A file meta in `folder`: a portal send's must be the contractor's own folder on the job (sendFolder). */
function file(bytes = `invoice ${run} ${fileCount}`, folder = `invoices/${run}/`): InvoiceFileMeta {
  fileCount++;
  return {
    url: `https://store.private.blob.vercel-storage.com/${folder}${fileCount}.pdf`,
    pathname: `${folder}${fileCount}.pdf`,
    filename: `Invoice ${fileCount}.pdf`,
    size: 1200,
    contentType: "application/pdf",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

/** Where Send invoice stages a contractor's uploads for a job (limits.ts invoiceUploadFolder). */
const sendFile = (taskId: string, contactId = zackId) => file(undefined, `invoice-sends/${taskId}/${contactId}/`);

const read = (id: string) => prisma.invoice.findUniqueOrThrow({ where: { id }, include: { events: { orderBy: { createdAt: "asc" } }, tasks: true, files: true } });

/** A To review invoice with a contractor and a total, ready to approve. */
async function ready(by: Staff = connor, number: string | null = null): Promise<string> {
  const { id } = await createStaffInvoice(prisma, { contactId: zackId, totalCents: 85000, invoiceNumber: number }, by, today);
  return id;
}

async function toPay(by: Staff = connor): Promise<string> {
  const id = await ready(by);
  await approveInvoice(prisma, id, by);
  return id;
}

async function email(over: { receivedAt?: Date } = {}): Promise<string> {
  const row = await made.inboundEmail({ resendId: `inv-${run}-${randomUUID()}`, localPart: "invoices", from: `zack-${run}@invoices.test`, receivedAt: over.receivedAt ?? new Date(), text: "Invoice attached." });
  return row.id;
}

// ---------------------------------------------------------------------------

test("a staff entry starts in To review, dated today, with its number saved clean", { skip }, async () => {
  const { id } = await createStaffInvoice(prisma, { invoiceNumber: " #001043 " }, connor, today);
  const inv = await read(id);
  assert.equal(inv.stage, "REVIEW");
  assert.equal(inv.source, "STAFF");
  assert.equal(inv.createdByUserId, connorUser.id);
  assert.equal(inv.createdByContactId, null);
  assert.equal(inv.invoiceNumber, "001043");
  assert.equal(inv.invoiceNumberNormalized, "1043");
  assert.equal(inv.invoiceDate.toISOString().slice(0, 10), today);
  assert.equal(inv.contactId, null);
  assert.equal(inv.total, null);
  assert.deepEqual(
    inv.events.map((e) => [e.kind, e.actorUserId, e.actorLabel]),
    [["ARRIVED", connorUser.id, connor.label]],
  );
});

test("a new invoice refuses a bad number, total or date", { skip }, async () => {
  assert.deepEqual(await refusal(createStaffInvoice(prisma, { invoiceNumber: "x".repeat(61) }, connor, today)), { invoiceNumber: NUMBER_TOO_LONG });
  assert.deepEqual(await refusal(createStaffInvoice(prisma, { totalCents: -500 }, connor, today)), { total: TOTAL_ABOVE_ZERO });
  assert.deepEqual(await refusal(createStaffInvoice(prisma, { invoiceDate: "2026-02-30" }, connor, today)), { invoiceDate: DATE_NEEDED });
});

test("fields save only in To review, one line each, and a save that changes nothing writes nothing", { skip }, async () => {
  const { id } = await createStaffInvoice(prisma, {}, connor, today);
  assert.deepEqual(await editInvoice(prisma, id, { contactId: zackId, totalCents: 85050, note: " Roof " }, connor), { changed: ["contractor", "total", "note"] });
  assert.deepEqual(await editInvoice(prisma, id, { totalCents: 85050, note: "Roof" }, connor), { changed: [] });
  let inv = await read(id);
  assert.equal(inv.total?.toString(), "850.5");
  assert.equal(inv.note, "Roof");
  const edits = inv.events.filter((e) => e.kind === "EDITED").map((e) => e.data);
  assert.deepEqual(edits, [
    { field: "contractor", from: null, to: `Zack Inv${run}` },
    { field: "total", from: null, to: "850.50" },
    { field: "note", from: null, to: "Roof" },
  ]);
  await approveInvoice(prisma, id, connor);
  assert.deepEqual(await refusal(editInvoice(prisma, id, { totalCents: 90000 }, pieter)), { [STAGE_FIELD]: `${first(connor)} already approved this.` });
  assert.deepEqual(await refusal(editInvoice(prisma, id, { totalCents: 90000 }, connor)), { [STAGE_FIELD]: "You already approved this." });
  inv = await read(id);
  assert.equal(inv.total?.toString(), "850.5");
});

test("an archived contractor can't be picked, but stays on the invoice that has them", { skip }, async () => {
  const archived = await made.contact({ fullName: `Old Inv${run}`, archivedAt: new Date() });
  const { id } = await createStaffInvoice(prisma, {}, connor, today);
  assert.deepEqual(await refusal(editInvoice(prisma, id, { contactId: archived.id }, connor)), { contactId: CONTRACTOR_ARCHIVED });
  await prisma.invoice.update({ where: { id }, data: { contactId: archived.id } });
  assert.deepEqual(await editInvoice(prisma, id, { contactId: archived.id, note: "Kept" }, connor), { changed: ["note"] });
});

test("Approve needs a contractor and a total, and records who", { skip }, async () => {
  const { id } = await createStaffInvoice(prisma, {}, connor, today);
  assert.deepEqual(await refusal(approveInvoice(prisma, id, connor)), { approve: "Add a contractor and a total to approve." });
  await editInvoice(prisma, id, { contactId: zackId }, connor);
  assert.deepEqual(await refusal(approveInvoice(prisma, id, connor)), { approve: "Add a total to approve." });
  await editInvoice(prisma, id, { totalCents: 85000 }, connor);
  await approveInvoice(prisma, id, pieter);
  const inv = await read(id);
  assert.equal(inv.stage, "TO_PAY");
  assert.equal(inv.approvedByUserId, pieter.userId);
  assert.ok(inv.approvedAt);
  assert.deepEqual(await refusal(approveInvoice(prisma, id, connor)), { [STAGE_FIELD]: `${first(pieter)} already approved this.` });
});

test("Back to review reopens the fields and clears who approved it", { skip }, async () => {
  const id = await toPay();
  await backToReview(prisma, id, pieter);
  const inv = await read(id);
  assert.equal(inv.stage, "REVIEW");
  assert.equal(inv.approvedAt, null);
  assert.equal(inv.approvedByUserId, null);
  assert.equal(inv.events.at(-1)?.kind, "REOPENED");
  assert.deepEqual(await editInvoice(prisma, id, { totalCents: 86000 }, connor), { changed: ["total"] });
  assert.deepEqual(await refusal(backToReview(prisma, id, connor)), { [STAGE_FIELD]: `${first(pieter)} moved this back to To review.` });
});

test("two partners marking one invoice paid at once: one pays, the other reads who did", { skip }, async () => {
  for (let round = 0; round < 3; round++) {
    const id = await toPay();
    const results = await Promise.allSettled([
      markPaid(prisma, id, { paidOn: today, method: "BASELANE" }, connor),
      markPaid(prisma, id, { paidOn: today, method: "CHECK", note: "1201" }, pieter),
    ]);
    const won = results.findIndex((r) => r.status === "fulfilled");
    assert.ok(won >= 0, "one of them pays");
    const lost = results[1 - won];
    assert.equal(lost.status, "rejected");
    const err = (lost as PromiseRejectedResult).reason;
    assert.ok(err instanceof FieldError, String(err));
    const winner = won === 0 ? connor : pieter;
    assert.deepEqual(err.fieldErrors, { [STAGE_FIELD]: `${first(winner)} already marked this paid.` });
    const inv = await read(id);
    assert.equal(inv.stage, "PAID");
    assert.equal(inv.paidByUserId, winner.userId);
    assert.equal(inv.events.filter((e) => e.kind === "PAID").length, 1);
  }
});

test("Mark paid needs the day and a listed method, and only from To pay", { skip }, async () => {
  const review = await ready();
  assert.deepEqual(await refusal(markPaid(prisma, review, { paidOn: today, method: "BASELANE" }, connor)), {
    [STAGE_FIELD]: "Someone moved this back to To review.",
  });
  const id = await toPay();
  assert.deepEqual(await refusal(markPaid(prisma, id, { paidOn: "", method: "BASELANE" }, connor)), { paidOn: PAID_DAY_NEEDED });
  assert.deepEqual(await refusal(markPaid(prisma, id, { paidOn: today, method: "WIRE" as never }, connor)), { method: METHOD_NEEDED });
  const r = await markPaid(prisma, id, { paidOn: "2026-11-02", method: "CARD", note: " 1201 " }, connor, new Date("2026-11-03T15:00:00.123Z"));
  assert.deepEqual(r, { paidAt: "2026-11-03T15:00:00.123Z", contactId: zackId, contactName: `Zack Inv${run}`, email: "no-login" });
  const inv = await read(id);
  assert.equal(inv.paidOn?.toISOString(), "2026-11-02T00:00:00.000Z");
  assert.equal(inv.payMethod, "CARD");
  assert.equal(inv.paidNote, "1201");
  assert.deepEqual(inv.events.at(-1)?.data, { paidOn: "2026-11-02", method: "CARD", note: "1201" });
});

test("Undo paid takes back only the payment it names, and clears every paid field", { skip }, async () => {
  const id = await toPay();
  const firstPay = await markPaid(prisma, id, { paidOn: today, method: "ZELLE", note: "sent" }, connor);
  await undoPaid(prisma, id, firstPay.paidAt, connor);
  let inv = await read(id);
  assert.equal(inv.stage, "TO_PAY");
  assert.deepEqual([inv.paidOn, inv.paidAt, inv.payMethod, inv.paidNote, inv.paidByUserId], [null, null, null, null, null]);
  assert.ok(inv.approvedAt, "still approved");
  assert.equal(inv.events.at(-1)?.kind, "UNDONE");
  // Undo again, from a second tab: it's already back.
  assert.deepEqual(await refusal(undoPaid(prisma, id, firstPay.paidAt, connor)), { [STAGE_FIELD]: "You moved this back to To pay." });
  // Pieter pays it again; Connor's old Undo can't take his payment back.
  const second = await markPaid(prisma, id, { paidOn: today, method: "BASELANE" }, pieter);
  assert.deepEqual(await refusal(undoPaid(prisma, id, firstPay.paidAt, connor)), { [STAGE_FIELD]: `${first(pieter)} already marked this paid.` });
  assert.deepEqual(await refusal(undoPaid(prisma, id, "not a time", connor)), { [STAGE_FIELD]: `${first(pieter)} already marked this paid.` });
  await undoPaid(prisma, id, second.paidAt, connor);
  inv = await read(id);
  assert.equal(inv.stage, "TO_PAY");
});

test("Not an invoice clears it from To review or To pay, never Paid, and its Undo puts it back as it was", { skip }, async () => {
  const id = await toPay();
  assert.deepEqual(await refusal(markNotInvoice(prisma, id, "REVIEW", connor)), { [STAGE_FIELD]: "You already approved this." });
  assert.deepEqual(await markNotInvoice(prisma, id, "TO_PAY", connor), { from: "TO_PAY" });
  let inv = await read(id);
  assert.equal(inv.stage, "NOT_INVOICE");
  assert.ok(inv.deletedAt);
  assert.deepEqual(await refusal(approveInvoice(prisma, id, pieter)), { [STAGE_FIELD]: `${first(connor)} marked this not an invoice.` });
  assert.deepEqual(await restoreInvoice(prisma, id, pieter), { stage: "TO_PAY" });
  inv = await read(id);
  assert.equal(inv.stage, "TO_PAY");
  assert.equal(inv.deletedAt, null);
  assert.ok(inv.approvedAt, "its approval came back with it");
  assert.deepEqual(await refusal(restoreInvoice(prisma, id, connor)), { [STAGE_FIELD]: `${first(pieter)} already put this back.` });

  const review = await ready();
  await markNotInvoice(prisma, review, "REVIEW", connor);
  assert.deepEqual(await restoreInvoice(prisma, review, connor), { stage: "REVIEW" });

  const paid = await toPay();
  await markPaid(prisma, paid, { paidOn: today, method: "CASH" }, pieter);
  assert.deepEqual(await refusal(markNotInvoice(prisma, paid, "TO_PAY", connor)), { [STAGE_FIELD]: `${first(pieter)} already marked this paid.` });
});

test("a possible duplicate: same contractor and number, compared loosely, across every stage", { skip }, async () => {
  const a = await ready(connor, "#1043");
  await approveInvoice(prisma, a, connor);
  await markPaid(prisma, a, { paidOn: today, method: "BASELANE" }, connor);
  const b = await ready(connor, "1043");
  assert.equal((await read(b)).duplicateOfId, a, "#1043 and 1043 match, and Paid counts");
  const { id: c } = await createStaffInvoice(prisma, { contactId: mikeId, invoiceNumber: "1043" }, connor, today);
  assert.equal((await read(c)).duplicateOfId, null, "another contractor's 1043 is another bill");
  const { id: noContact } = await createStaffInvoice(prisma, { invoiceNumber: "1043" }, connor, today);
  assert.equal((await read(noContact)).duplicateOfId, null, "no contractor, nothing to compare the number with");
  // A new number ends the match; the old one brings it back.
  await editInvoice(prisma, b, { invoiceNumber: "1044" }, connor);
  assert.equal((await read(b)).duplicateOfId, null);
  await editInvoice(prisma, b, { invoiceNumber: "10-43" }, connor);
  assert.equal((await read(b)).duplicateOfId, a);
  // Moving the contractor ends it too, and starts one with Mike's 1043, which came after it.
  await editInvoice(prisma, b, { contactId: mikeId }, connor);
  assert.equal((await read(b)).duplicateOfId, null);
  assert.equal((await read(c)).duplicateOfId, b, "the newer one warns");
  // Not an invoice still counts, so a bill sent again after its first copy was cleared still warns.
  const f = await ready(connor, "77");
  await markNotInvoice(prisma, f, "REVIEW", connor);
  const g = await ready(connor, "0077");
  assert.equal((await read(g)).duplicateOfId, f);
});

test("a duplicate follows a change to the older invoice, and links the newest earlier copy", { skip }, async () => {
  const older = await ready(connor, "555");
  const newer = await ready(connor, "556");
  assert.equal((await read(newer)).duplicateOfId, null);
  await editInvoice(prisma, older, { invoiceNumber: "556" }, connor);
  assert.equal((await read(newer)).duplicateOfId, older, "the newer one warns once the older one matches it");
  assert.equal((await read(older)).duplicateOfId, null, "the older one doesn't");
  await editInvoice(prisma, older, { invoiceNumber: "557" }, connor);
  assert.equal((await read(newer)).duplicateOfId, null, "and stops when it no longer does");

  const j1 = await ready(connor, "900");
  const j2 = await ready(connor, "900");
  const j3 = await ready(connor, "900");
  assert.equal((await read(j2)).duplicateOfId, j1);
  assert.equal((await read(j3)).duplicateOfId, j2);
});

test("matching invoices edited at once all save, with no deadlock, and their duplicate links end up right", { skip }, async () => {
  const number = `D${run}`;
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) ids.push(await ready(connor, `${number}-${i}`));
  // Every one takes the same number at once: each save writes the newer ones' links while others do the same.
  const saves = await Promise.allSettled(ids.map((id, i) => editInvoice(prisma, id, { invoiceNumber: number }, i % 2 ? pieter : connor)));
  assert.deepEqual(saves.map((r) => (r.status === "rejected" ? String(r.reason) : "ok")), ["ok", "ok", "ok", "ok"]);
  const rows = await prisma.invoice.findMany({ where: { id: { in: ids } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, duplicateOfId: true } });
  assert.deepEqual(
    rows.map((r) => r.duplicateOfId),
    [null, rows[0].id, rows[1].id, rows[2].id],
  );
});

test("a possible duplicate: the very same file, whoever it's from", { skip }, async () => {
  const bytes = `same pdf ${run}`;
  const { id: d } = await createStaffInvoice(prisma, { files: [file(bytes)] }, connor, today);
  const { id: e } = await createStaffInvoice(prisma, { contactId: mikeId }, connor, today);
  assert.equal((await read(e)).duplicateOfId, null);
  await addInvoiceFile(prisma, e, file(`other pdf ${run}`), connor);
  assert.equal((await read(e)).duplicateOfId, null);
  const added = file(bytes);
  const { id: fileId } = await addInvoiceFile(prisma, e, added, connor);
  assert.equal((await read(e)).duplicateOfId, d);
  // The same upload recorded twice is one file.
  assert.deepEqual(await addInvoiceFile(prisma, e, added, connor), { id: fileId });
  const inv = await read(e);
  assert.equal(inv.files.length, 2);
  assert.equal(inv.events.filter((x) => x.kind === "FILE_ADDED").length, 2);
  // A file already on another invoice is refused in words, not by the unique index's raw error.
  const onD = (await read(d)).files[0];
  assert.deepEqual(await refusal(addInvoiceFile(prisma, e, { ...file(), url: onD.url, pathname: onD.pathname }, connor)), { files: ALREADY_ADDED });
  // Files go on only in To review.
  await editInvoice(prisma, e, { totalCents: 1000 }, connor);
  await approveInvoice(prisma, e, connor);
  assert.deepEqual(await refusal(addInvoiceFile(prisma, e, file(), pieter)), { [STAGE_FIELD]: `${first(connor)} already approved this.` });
});

test("jobs: any but a canceled one, once each, and a deleted job leaves its title", { skip }, async () => {
  const open = await job("Fix leak");
  const canceled = await job("Paint porch", "CANCELED");
  const { id } = await createStaffInvoice(prisma, { taskIds: [open, open] }, connor, today);
  assert.equal((await read(id)).tasks.length, 1);
  assert.deepEqual(await refusal(linkJob(prisma, id, canceled, connor)), { taskId: JOB_CANCELED });
  const other = await job("Replace gutter", "DONE");
  await linkJob(prisma, id, other, connor);
  await linkJob(prisma, id, other, connor);
  let inv = await read(id);
  assert.equal(inv.tasks.length, 2);
  assert.equal(inv.events.filter((e) => e.kind === "EDITED").length, 1);
  await prisma.task.delete({ where: { id: other } });
  inv = await read(id);
  const kept = inv.tasks.find((t) => t.taskId === null);
  assert.equal(kept?.title, `Replace gutter ${run}`);
  await unlinkJob(prisma, id, { linkId: kept!.id }, connor);
  await unlinkJob(prisma, id, { taskId: open }, connor);
  await unlinkJob(prisma, id, { taskId: open }, connor);
  inv = await read(id);
  assert.equal(inv.tasks.length, 0);
  assert.deepEqual(
    inv.events.filter((e) => e.kind === "EDITED").map((e) => (e.data as { added?: string; removed?: string }).added ?? `-${(e.data as { removed?: string }).removed}`),
    [`Replace gutter ${run}`, `-Replace gutter ${run}`, `-Fix leak ${run}`],
  );
});

test("Save writes fields and jobs together, or nothing when one part is refused", { skip }, async () => {
  const open = await job("Fix leak");
  const old = await job("Paint porch");
  const canceled = await job("Replace gutter", "CANCELED");
  const { id } = await createStaffInvoice(prisma, { taskIds: [old] }, connor, today);
  const r = await saveInvoice(prisma, id, { patch: { contactId: zackId, totalCents: 85050 }, link: [open], unlink: [{ taskId: old }] }, connor);
  assert.deepEqual(r, { changed: ["contractor", "total", "jobs"] });
  let inv = await read(id);
  assert.deepEqual(inv.tasks.map((t) => t.taskId), [open]);
  assert.equal(inv.total?.toString(), "850.5");

  assert.deepEqual(await refusal(saveInvoice(prisma, id, { patch: { note: "Never" }, link: [canceled], unlink: [{ taskId: open }] }, connor)), { taskId: JOB_CANCELED });
  inv = await read(id);
  assert.equal(inv.note, null);
  assert.deepEqual(inv.tasks.map((t) => t.taskId), [open]);

  assert.deepEqual(await saveInvoice(prisma, id, { patch: {}, link: [], unlink: [] }, connor), { changed: [] });
  await approveInvoice(prisma, id, connor);
  assert.deepEqual(await refusal(saveInvoice(prisma, id, { patch: { note: "Late" }, link: [], unlink: [] }, pieter)), { [STAGE_FIELD]: `${first(connor)} already approved this.` });
});

test("Send invoice: signed in, with live access to a job in review or done, and a file", { skip }, async () => {
  await prisma.portalAccount.create({ data: { contactId: zackId, email: `zack-login-${run}@invoices.test`, passwordHash: "x" } });
  const done = await job("Fix leak", "DONE");
  const working = await job("Drywall", "IN_PROGRESS");
  const theirs = await job("Gutter", "REVIEW");
  const notTheirs = await job("Roof", "DONE");
  for (const taskId of [done, working, theirs]) await prisma.taskAccess.create({ data: { taskId, contactId: zackId } });
  const input = { taskId: done, invoiceNumber: "#88", totalCents: 42000, files: [sendFile(done)] };
  assert.deepEqual(await refusal(createPortalInvoice(prisma, input, { ...zack, onlyTaskId: done }, today)), { invoice: SIGN_IN_TO_SEND });
  assert.deepEqual(await refusal(createPortalInvoice(prisma, { ...input, files: [] }, zack, today)), { files: FILE_NEEDED });
  assert.deepEqual(await refusal(createPortalInvoice(prisma, { ...input, taskId: working }, zack, today)), { invoice: JOB_NOT_FINISHED });
  assert.deepEqual(await refusal(createPortalInvoice(prisma, { ...input, taskId: notTheirs }, zack, today)), { invoice: NO_JOB_ACCESS });
  const { id } = await createPortalInvoice(prisma, input, zack, today);
  const inv = await read(id);
  assert.equal(inv.source, "PORTAL");
  assert.equal(inv.stage, "REVIEW");
  assert.equal(inv.contactId, zackId);
  assert.equal(inv.createdByContactId, zackId);
  assert.equal(inv.createdByUserId, null);
  assert.equal(inv.invoiceNumber, "88");
  assert.deepEqual(inv.tasks.map((t) => t.taskId), [done]);
  assert.equal(inv.files.length, 1);
  assert.deepEqual([inv.events[0].kind, inv.events[0].actorContactId], ["ARRIVED", zackId]);
  await createPortalInvoice(prisma, { ...input, taskId: theirs, files: [sendFile(theirs)] }, zack, today);
  await prisma.taskAccess.update({ where: { taskId_contactId: { taskId: theirs, contactId: zackId } }, data: { revokedAt: new Date() } });
  assert.deepEqual(await refusal(createPortalInvoice(prisma, { ...input, taskId: theirs, files: [sendFile(theirs)] }, zack, today)), { invoice: NO_JOB_ACCESS });
});

test("a contractor sees their own portal invoices at once, the rest once approved, never Not an invoice or anyone else's", { skip }, async () => {
  const sees = async (contactId: string) => new Set((await prisma.invoice.findMany({ where: contractorInvoiceWhere(contactId), select: { id: true } })).map((r) => r.id));
  const doneJob = await job("Window", "DONE");
  await prisma.taskAccess.upsert({ where: { taskId_contactId: { taskId: doneJob, contactId: zackId } }, create: { taskId: doneJob, contactId: zackId }, update: {} });
  if (!(await prisma.portalAccount.findUnique({ where: { contactId: zackId } }))) {
    await prisma.portalAccount.create({ data: { contactId: zackId, email: `zack-login-${run}@invoices.test`, passwordHash: "x" } });
  }
  const { id: sent } = await createPortalInvoice(prisma, { taskId: doneJob, files: [sendFile(doneJob)] }, zack, today);
  const emailed = (await createEmailInvoice(prisma, { inboundEmailId: await email(), contactId: zackId, files: [] }, systemActor(`zack-${run}@invoices.test`))).id;
  const entered = await ready();
  const cleared = await ready();
  await markNotInvoice(prisma, cleared, "REVIEW", connor);
  const { id: mikes } = await createStaffInvoice(prisma, { contactId: mikeId, totalCents: 100 }, connor, today);
  await approveInvoice(prisma, mikes, connor);

  let zackSees = await sees(zackId);
  assert.ok(zackSees.has(sent), "their Send invoice shows at once, as Received");
  assert.ok(!zackSees.has(emailed), "an emailed one waits for approval");
  assert.ok(!zackSees.has(entered), "a staff entry waits for approval");
  assert.ok(!zackSees.has(cleared), "never Not an invoice");
  assert.ok(!zackSees.has(mikes), "never another contractor's");

  await editInvoice(prisma, emailed, { totalCents: 5000 }, connor);
  await approveInvoice(prisma, emailed, connor);
  await approveInvoice(prisma, entered, connor);
  await markPaid(prisma, entered, { paidOn: today, method: "BASELANE" }, connor);
  await markNotInvoice(prisma, sent, "REVIEW", connor);
  zackSees = await sees(zackId);
  assert.ok(zackSees.has(emailed) && zackSees.has(entered), "To pay and Paid show");
  assert.ok(!zackSees.has(sent), "their own, once cleared, doesn't");
  // Staff moved a portal invoice to Mike: Mike doesn't see it as Received; it waits for approval like the others.
  await restoreInvoice(prisma, sent, connor);
  await editInvoice(prisma, sent, { contactId: mikeId }, connor);
  assert.ok(!(await sees(mikeId)).has(sent));
  assert.ok(!(await sees(zackId)).has(sent));
});

test("an emailed invoice is made once per email, dated the day it came in, by no one", { skip }, async () => {
  // 11:30 pm in Buffalo on Nov 17 is Nov 18 in UTC; the invoice is dated the 17th.
  const inboundEmailId = await email({ receivedAt: new Date("2026-11-18T04:30:00Z") });
  const by = systemActor(`zack-${run}@invoices.test`);
  const [one, two] = await Promise.all([
    createEmailInvoice(prisma, { inboundEmailId, contactId: null, files: [file()] }, by),
    createEmailInvoice(prisma, { inboundEmailId, contactId: null, files: [file()] }, by),
  ]);
  assert.equal(one.id, two.id, "a second delivery finds the first one's invoice");
  assert.deepEqual([one.created, two.created].sort(), [false, true]);
  assert.equal(await prisma.invoice.count({ where: { inboundEmailId } }), 1);
  const inv = await read(one.id);
  assert.equal(inv.source, "EMAIL");
  assert.equal(inv.stage, "REVIEW");
  assert.equal(inv.invoiceDate.toISOString().slice(0, 10), "2026-11-17");
  assert.deepEqual([inv.createdByUserId, inv.createdByContactId, inv.contactId], [null, null, null]);
  assert.deepEqual([inv.events[0].actorUserId, inv.events[0].actorContactId, inv.events[0].actorLabel], [null, null, `zack-${run}@invoices.test`]);
  assert.equal((await prisma.inboundEmail.findUniqueOrThrow({ where: { id: inboundEmailId } })).status, "FILED");
});

test("a reply invoice is the reply token's contractor's, on its job", { skip }, async () => {
  const doneJob = await job("Fence", "DONE");
  const inboundEmailId = await email();
  const r = await createReplyInvoice(prisma, { inboundEmailId, taskId: doneJob, files: [file()] }, zack);
  assert.equal(r.created, true);
  const again = await createReplyInvoice(prisma, { inboundEmailId, taskId: doneJob, files: [file()] }, zack);
  assert.deepEqual(again, { id: r.id, created: false });
  const inv = await read(r.id);
  assert.equal(inv.source, "REPLY");
  assert.equal(inv.contactId, zackId);
  assert.equal(inv.createdByContactId, zackId);
  assert.deepEqual(inv.tasks.map((t) => t.taskId), [doneJob]);
  assert.equal(inv.files.length, 1);
});

test("an emailed invoice's contractor: DMARC pass, one address, exactly one contractor", { skip }, async () => {
  const addr = `zack-${run}@invoices.test`;
  assert.equal(await matchContractor(prisma, addr, "pass"), zackId);
  assert.equal(await matchContractor(prisma, `Zack <${addr.toUpperCase()}>`, "pass"), zackId, "case doesn't matter");
  assert.equal(await matchContractor(prisma, addr, "fail"), null, "a From the domain doesn't vouch for");
  assert.equal(await matchContractor(prisma, addr, null), null);
  assert.equal(await matchContractor(prisma, `"${addr}" <other-${run}@invoices.test>`, "pass"), null, "a disguised From");
  assert.equal(await matchContractor(prisma, `z_ck-${run}@invoices.test`, "pass"), null, "an underscore is a letter, not a wildcard");
  // The login email counts as much as the contact email.
  const login = `zack-login-${run}@invoices.test`;
  if (!(await prisma.portalAccount.findUnique({ where: { contactId: zackId } }))) {
    await prisma.portalAccount.create({ data: { contactId: zackId, email: login, passwordHash: "x" } });
  }
  assert.equal(await matchContractor(prisma, login, "pass"), zackId);
  // Two contractors with one address: nobody, and staff pick.
  const shared = `shared-${run}@invoices.test`;
  const a = await made.contact({ fullName: `Crew A ${run}`, email: shared });
  const b = await made.contact({ fullName: `Crew B ${run}`, email: shared });
  assert.equal(await matchContractor(prisma, shared, "pass"), null);
  await prisma.contact.update({ where: { id: b.id }, data: { archivedAt: new Date() } });
  assert.equal(await matchContractor(prisma, shared, "pass"), a.id, "an archived contractor doesn't count");
});
