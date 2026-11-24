import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient, TaskStatus } from "@prisma/client";
import { FieldError } from "@/lib/action-result";
import { todayYmdEastern } from "@/lib/dates";
import { makeClient } from "@/lib/db-client";
import { scratchRows } from "@/lib/scratch-rows";
import {
  approveInvoice,
  createEmailInvoice,
  createPortalInvoice,
  createReplyInvoice,
  createStaffInvoice,
  SIGN_IN_TO_SEND,
  markPaid,
  staffActor,
  systemActor,
  undoPaid,
  type Contractor,
  type InvoiceFileMeta,
  type Staff,
} from "./core";
import { PAID_SETTLE_MS } from "./fields";
import { ALREADY_ADDED, NOT_A_DOCUMENT, NOT_IN_FOLDER, NOT_PRIVATE, recordInvoiceUpload, sendPortalInvoice, useAsInvoice, type InvoiceBlobOps } from "./files";
import { INVOICE_REVIEW_KIND, closeUnclaimedInvoiceRow, invoiceEmailFor, isPartnerForward, paidKey, queueInvoiceReview, reviewBundleKey, type InvoiceOutboxRow } from "./notify";

/**
 * The invoice emails on a real Postgres (docs/contractor-invoices-plan.md, 5.3): what core.ts queues as it makes and
 * pays invoices, and what the drain's invoice branch (invoiceEmailFor, which notifications/outbox.ts drainDue calls
 * before and after it claims a row) sends from those rows; plus Use as invoice and Send invoice's files with the
 * Blob calls stood in for. Opt-in by the same guard as core.pg.test.ts; it removes what it adds.
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_<worktree>_scratch npx tsx --test src/lib/invoices/notify.pg.test.ts
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
const APP = "https://hg.test";
const STORE = "teststore1";

let connor: Staff;
let connorId: string;
let pieterId: string;
let zackId: string;
let zackEmail: string;
let mikeId: string;
let propertyId: string;
let zack: Contractor;
const contactIds: string[] = [];
const userIds: string[] = [];

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV, NODE_ENV: "test" } as never);
  await made.takeTurn(URL_ENV);
  // Partners are the users with a password (tasks/core.ts notify), so these two get the bundle.
  const c = await made.user({ email: `connor-${run}@notify.test`, name: `Connor N${run}`, passwordHash: "x" });
  const p = await made.user({ email: `pieter-${run}@notify.test`, name: `Pieter N${run}`, passwordHash: "x" });
  connor = staffActor(c);
  connorId = c.id;
  pieterId = p.id;
  userIds.push(c.id, p.id);
  zackEmail = `zack-${run}@notify.test`;
  const z = await made.contact({
    fullName: `Zack N${run}`,
    email: zackEmail,
    portalAccount: { create: { email: zackEmail, passwordHash: "x", lastSignInAt: new Date(), jobEmails: true } },
  });
  const m = await made.contact({ fullName: `Mike N${run}`, email: `mike-${run}@notify.test` });
  zackId = z.id;
  mikeId = m.id;
  contactIds.push(z.id, m.id);
  zack = { kind: "contractor", contactId: z.id, label: z.fullName };
  propertyId = (await made.property({ address: `20 Notify Ave, Buffalo, NY 14209 ${run}` })).id;
});

after(async () => {
  if (skip) return;
  const ids = (
    await prisma.invoice.findMany({
      where: {
        OR: [
          { contactId: { in: contactIds } },
          { createdByUserId: { in: userIds } },
          { createdByContactId: { in: contactIds } },
          { inboundEmail: { resendId: { startsWith: `ntf-${run}` } } },
          { events: { some: { OR: [{ actorUserId: { in: userIds } }, { actorLabel: { contains: run } }] } } },
        ],
      },
      select: { id: true },
    })
  ).map((i) => i.id);
  await dropReviewLines(ids);
  await prisma.invoice.deleteMany({ where: { id: { in: ids } } });
  await prisma.inboundEmail.deleteMany({ where: { resendId: { startsWith: `ntf-${run}` } } });
  await made.remove();
  await prisma.$disconnect();
});

/**
 * The bundle lines this file's invoices put on other partners' rows (a worktree's own users have passwords too):
 * taken off, and a row left empty deleted, so nothing about them is ever sent. This file's own partners' rows go
 * with them by cascade.
 */
async function dropReviewLines(invoiceIds: string[]): Promise<void> {
  if (invoiceIds.length === 0) return;
  await prisma.$executeRaw`
    UPDATE "NotificationOutbox" SET "items" = (
      SELECT COALESCE(jsonb_agg(i), '[]'::jsonb) FROM jsonb_array_elements("items") i WHERE NOT ((i->>'invoiceId') = ANY(${invoiceIds}))
    )
    WHERE "sentAt" IS NULL AND "taskId" IS NULL AND "invoiceId" IS NULL
      AND EXISTS (SELECT 1 FROM jsonb_array_elements("items") i WHERE (i->>'invoiceId') = ANY(${invoiceIds}))`;
  await prisma.$executeRaw`DELETE FROM "NotificationOutbox" WHERE "sentAt" IS NULL AND "taskId" IS NULL AND "invoiceId" IS NULL AND "items" = '[]'::jsonb`;
}

async function refusal(p: Promise<unknown>): Promise<Record<string, string>> {
  try {
    await p;
  } catch (err) {
    if (err instanceof FieldError) return err.fieldErrors as Record<string, string>;
    throw err;
  }
  assert.fail("expected a refusal");
}

async function job(title: string, status: TaskStatus = "OPEN", assign: { userId?: string; contactId?: string } = {}): Promise<string> {
  const t = await prisma.task.create({
    data: { title: `${title} ${run}`, status, propertyId, assigneeUserId: assign.userId ?? null, assigneeContactId: assign.contactId ?? null },
  });
  return t.id;
}

let fileCount = 0;
/** A file meta in `folder`: a portal send's must be the contractor's own folder on the job (sendFolder). */
function file(folder = `invoices/${run}/`): InvoiceFileMeta {
  fileCount++;
  return {
    url: `https://${STORE}.private.blob.vercel-storage.com/${folder}${fileCount}.pdf`,
    pathname: `${folder}${fileCount}.pdf`,
    filename: `Invoice ${fileCount}.pdf`,
    size: 1200,
    contentType: "application/pdf",
    sha256: createHash("sha256").update(`notify ${run} ${fileCount}`).digest("hex"),
  };
}

/** Where Send invoice stages a contractor's uploads for a job (limits.ts invoiceUploadFolder). */
const sendFolder = (taskId: string, contactId: string) => `invoice-sends/${taskId}/${contactId}/`;

const rowSelect = { id: true, taskId: true, invoiceId: true, recipientUserId: true, recipientContactId: true, items: true, sendAfter: true, openKey: true } as const;

async function paidRows(invoiceId: string) {
  return prisma.notificationOutbox.findMany({ where: { invoiceId }, select: rowSelect, orderBy: { createdAt: "asc" } });
}

async function bundleRow(userId: string) {
  return prisma.notificationOutbox.findFirst({ where: { openKey: reviewBundleKey(userId) }, select: rowSelect });
}

/** Which invoices a partner's open bundle names. */
async function bundled(userId: string): Promise<string[]> {
  const row = await bundleRow(userId);
  const items = (row?.items ?? []) as { kind: string; invoiceId?: string }[];
  return items.filter((i) => i.kind === INVOICE_REVIEW_KIND).map((i) => i.invoiceId!);
}

/** A To pay invoice for Zack, numbered, ready for Mark paid. */
async function toPay(opts: { contactId?: string; taskIds?: string[]; number?: string | null } = {}): Promise<string> {
  const { id } = await createStaffInvoice(
    prisma,
    { contactId: opts.contactId ?? zackId, totalCents: 85000, invoiceNumber: opts.number === undefined ? "1043" : opts.number, taskIds: opts.taskIds ?? [] },
    connor,
    today,
  );
  await approveInvoice(prisma, id, connor);
  return id;
}

const plan = (row: InvoiceOutboxRow, now: Date) => invoiceEmailFor(prisma, row, { now, appUrl: APP });

// ---------------------------------------------------------------------------
// The Paid email (M15)
// ---------------------------------------------------------------------------

test("a Paid email for an invoice with no job waits out the Undo window, then goes to the contractor's login", { skip }, async () => {
  const id = await toPay();
  const t0 = new Date();
  const paid = await markPaid(prisma, id, { paidOn: today, method: "CHECK" }, connor, t0);
  assert.equal(paid.email, "on");
  assert.equal(paid.contactName, `Zack N${run}`);
  const [row, ...rest] = await paidRows(id);
  assert.equal(rest.length, 0);
  assert.equal(row.openKey, paidKey(zackId, id));
  assert.equal(row.taskId, null);
  assert.equal(row.recipientContactId, zackId);
  assert.equal(row.sendAfter.getTime(), t0.getTime() + PAID_SETTLE_MS);

  const early = await plan(row, new Date(t0.getTime() + 30_000));
  assert.deepEqual(early, { kind: "wait", until: new Date(t0.getTime() + PAID_SETTLE_MS) });

  const now = new Date(t0.getTime() + PAID_SETTLE_MS + 1000);
  const p = await plan(row, now);
  assert.equal(p.kind, "send");
  if (p.kind !== "send") return;
  assert.equal(p.to, zackEmail);
  assert.equal(p.subject, "Paid: Invoice #1043, $850.00");
  assert.match(p.text, /by check\./);
  assert.match(p.text, /See your invoices: https:\/\/hg\.test\/p\/invoices/);
  assert.doesNotMatch(p.text, /\/p\/jobs\/|\?l=/, "never a job link");
});

test("a Paid email for an invoice on a job that sits on a partner sends too: no task read, no TaskAccess", { skip }, async () => {
  const onConnor = await job("Roof on Connor", "DONE", { userId: connorId });
  const id = await toPay({ taskIds: [onConnor], number: null });
  const t0 = new Date();
  await markPaid(prisma, id, { paidOn: today, method: "BASELANE" }, connor, t0);
  const [row] = await paidRows(id);
  assert.equal(await prisma.taskAccess.count({ where: { taskId: onConnor } }), 0);
  const p = await plan(row, new Date(t0.getTime() + PAID_SETTLE_MS));
  assert.equal(p.kind, "send");
  if (p.kind === "send") assert.equal(p.subject, "Paid: Invoice, $850.00");
});

test("a Paid row whose payment was undone is dropped; paid again, only the new payment's row sends", { skip }, async () => {
  const id = await toPay();
  const t0 = new Date(Date.now() - 10 * 60_000);
  const first = await markPaid(prisma, id, { paidOn: today, method: "ZELLE" }, connor, t0);
  const [row] = await paidRows(id);
  await undoPaid(prisma, id, first.paidAt, connor);
  assert.deepEqual(await plan(row, new Date()), { kind: "skip", reason: "not paid" });

  // A drain claimed the first row (its openKey cleared) before the Undo; then a new payment.
  await prisma.notificationOutbox.update({ where: { id: row.id }, data: { openKey: null } });
  const t1 = new Date(t0.getTime() + 60_000);
  await markPaid(prisma, id, { paidOn: today, method: "ZELLE" }, connor, t1);
  const rows = await paidRows(id);
  assert.equal(rows.length, 2);
  assert.deepEqual(await plan({ ...rows[0] }, new Date()), { kind: "skip", reason: "paid again" });
  assert.equal((await plan(rows[1], new Date())).kind, "send");
});

test("re-paid before the first row went: the open row carries the newer payment, so one email goes", { skip }, async () => {
  const id = await toPay();
  const t0 = new Date(Date.now() - 10 * 60_000);
  const first = await markPaid(prisma, id, { paidOn: today, method: "VENMO" }, connor, t0);
  await undoPaid(prisma, id, first.paidAt, connor);
  const t1 = new Date(t0.getTime() + 30_000);
  await markPaid(prisma, id, { paidOn: today, method: "VENMO" }, connor, t1);
  const rows = await paidRows(id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sendAfter.getTime(), t1.getTime() + PAID_SETTLE_MS);
  assert.equal((await plan(rows[0], new Date())).kind, "send");
});

test("no Paid row for a contractor without a login, and the toast says so; a switched-off contractor's row is dropped", { skip }, async () => {
  const id = await toPay({ contactId: mikeId });
  const paid = await markPaid(prisma, id, { paidOn: today, method: "CASH" }, connor);
  assert.equal(paid.email, "no-login");
  assert.equal((await paidRows(id)).length, 0);

  const z = await toPay();
  const t0 = new Date(Date.now() - 10 * 60_000);
  await markPaid(prisma, z, { paidOn: today, method: "CASH" }, connor, t0);
  const [row] = await paidRows(z);
  await prisma.portalAccount.update({ where: { contactId: zackId }, data: { jobEmails: false } });
  try {
    assert.deepEqual(await plan(row, new Date()), { kind: "skip", reason: "emails off" });
  } finally {
    await prisma.portalAccount.update({ where: { contactId: zackId }, data: { jobEmails: true } });
  }
});

// ---------------------------------------------------------------------------
// The partners' bundle (M12)
// ---------------------------------------------------------------------------

test("a staff bundle with no task sends for a portal send, tells only the other partner of a staff entry, skips job replies, and drops what left To review", { skip }, async () => {
  const before = new Set(await bundled(connorId));
  const beforePieter = new Set(await bundled(pieterId));
  const staff = await createStaffInvoice(prisma, { contactId: zackId }, connor, today);
  const done = await job("Paint hall", "DONE", { contactId: zackId });
  await prisma.taskAccess.create({ data: { taskId: done, contactId: zackId } });
  const t0 = new Date();
  const sent = await createPortalInvoice(prisma, { taskId: done, invoiceNumber: "77", totalCents: 12500, files: [file(sendFolder(done, zackId))] }, zack, today, t0);
  const replyEmail = await prisma.inboundEmail.create({
    data: { resendId: `ntf-${run}-${randomUUID()}`, localPart: "r", from: zackEmail, receivedAt: new Date(), dmarc: "pass" },
  });
  const reply = await createReplyInvoice(prisma, { inboundEmailId: replyEmail.id, taskId: done, files: [file()] }, zack);

  const now = (await bundled(connorId)).filter((i) => !before.has(i));
  assert.deepEqual(now, [sent.id], "Connor: the portal send, not his own entry or the reply");
  assert.ok(!now.includes(staff.id) && !now.includes(reply.id));
  assert.deepEqual((await bundled(pieterId)).filter((i) => !beforePieter.has(i)).sort(), [staff.id, sent.id].sort(), "Pieter: Connor's entry and the portal send");

  const row = (await bundleRow(connorId))!;
  assert.equal(row.taskId, null);
  assert.equal(row.invoiceId, null);
  assert.ok(row.sendAfter.getTime() >= t0.getTime() + 10 * 60_000 - 1000, "bundled over 10 minutes");
  const p = await plan(row, new Date());
  assert.equal(p.kind, "send");
  if (p.kind === "send") {
    assert.equal(p.to, `connor-${run}@notify.test`);
    assert.equal(p.subject, "1 new invoice to review");
    assert.match(p.text, new RegExp(`Zack N${run} · #77 · \\$125\\.00`));
    assert.match(p.text, /Review invoices: https:\/\/hg\.test\/invoices\?view=review/);
  }

  // Approved before the bundle went: nothing left to say.
  await approveInvoice(prisma, sent.id, connor);
  assert.deepEqual(await plan(row, new Date()), { kind: "skip", reason: "nothing to send" });
});

test("an emailed invoice tells the partners unless it's a partner's own DMARC-verified forward; a forged one still does", { skip }, async () => {
  const before = new Set(await bundled(connorId));
  const mail = (from: string, dmarc: string | null) =>
    prisma.inboundEmail.create({ data: { resendId: `ntf-${run}-${randomUUID()}`, localPart: "invoices", from, fromLine: `Someone <${from}>`, receivedAt: new Date(), dmarc } });
  const own = await createEmailInvoice(prisma, { inboundEmailId: (await mail(`CONNOR-${run}@notify.test`, "pass")).id, contactId: null, files: [] }, systemActor(`connor ${run}`));
  const forged = await createEmailInvoice(prisma, { inboundEmailId: (await mail(`connor-${run}@notify.test`, "fail")).id, contactId: null, files: [] }, systemActor(`forged ${run}`));
  const stranger = await createEmailInvoice(prisma, { inboundEmailId: (await mail(`someone-${run}@gmail.test`, "pass")).id, contactId: null, files: [] }, systemActor(`someone ${run}`));
  const now = (await bundled(connorId)).filter((i) => !before.has(i));
  assert.deepEqual(now.sort(), [forged.id, stranger.id].sort());
  assert.ok(!now.includes(own.id));
  const p = await plan((await bundleRow(connorId))!, new Date());
  assert.equal(p.kind, "send");
  // No contractor yet: the sender's address stands in for the name.
  if (p.kind === "send") assert.match(p.text, new RegExp(`someone-${run}@gmail\\.test`));
});

test("a partner's address first in a two-address From, or a user with no password, never skips the partners' email", { skip }, async () => {
  const before = new Set(await bundled(connorId));
  const noLogin = await made.user({ email: `placeholder-${run}@notify.test`, name: `Placeholder N${run}` });
  userIds.push(noLogin.id);
  const partner = `connor-${run}@notify.test`;
  // The stored address is the first one, a partner's; only the raw header shows there were two (M11, M12).
  const two = await prisma.inboundEmail.create({
    data: { resendId: `ntf-${run}-${randomUUID()}`, localPart: "invoices", from: partner, fromLine: `${partner}, x-${run}@evil.test`, receivedAt: new Date(), dmarc: "pass" },
  });
  const placeholder = await prisma.inboundEmail.create({
    data: { resendId: `ntf-${run}-${randomUUID()}`, localPart: "invoices", from: noLogin.email, fromLine: noLogin.email, receivedAt: new Date(), dmarc: "pass" },
  });
  // A row stored without its header is never a partner's forward.
  const bare = await prisma.inboundEmail.create({
    data: { resendId: `ntf-${run}-${randomUUID()}`, localPart: "invoices", from: partner, receivedAt: new Date(), dmarc: "pass" },
  });
  const a = await createEmailInvoice(prisma, { inboundEmailId: two.id, contactId: null, files: [] }, systemActor(`two ${run}`));
  const b = await createEmailInvoice(prisma, { inboundEmailId: placeholder.id, contactId: null, files: [] }, systemActor(`placeholder ${run}`));
  const c = await createEmailInvoice(prisma, { inboundEmailId: bare.id, contactId: null, files: [] }, systemActor(`bare ${run}`));
  assert.deepEqual((await bundled(connorId)).filter((i) => !before.has(i)).sort(), [a.id, b.id, c.id].sort());
  assert.equal(await isPartnerForward(prisma, `Connor <${partner}>`, "pass"), true);
  assert.equal(await isPartnerForward(prisma, `${partner}, x-${run}@evil.test`, "pass"), false);
  assert.equal(await isPartnerForward(prisma, noLogin.email, "pass"), false);
  assert.equal(await isPartnerForward(prisma, null, "pass"), false);
});

test("the drain's close before a claim writes nothing once a line was queued since its read, so that line still sends", { skip }, async () => {
  const user = await made.user({ email: `bundle-${run}@notify.test`, name: `Bundle N${run}`, passwordHash: "x" });
  userIds.push(user.id);
  // Invoice X is in the bundle, then approved: the drain's read plans "nothing to send".
  const x = await createStaffInvoice(prisma, { contactId: zackId, totalCents: 100 }, connor, today);
  await queueInvoiceReview(prisma, x.id);
  await approveInvoice(prisma, x.id, connor);
  const read = (await bundleRow(user.id))!;
  assert.deepEqual(await plan(read, new Date()), { kind: "skip", reason: "nothing to send" });
  // Before the close runs, a portal send for invoice Y lands on the same open row.
  const y = await createStaffInvoice(prisma, { contactId: zackId, invoiceNumber: `Y${run}` }, connor, today);
  await queueInvoiceReview(prisma, y.id);
  assert.equal(await closeUnclaimedInvoiceRow(prisma, read, new Date(), "nothing to send"), false, "the row changed, so it stays open");
  const still = (await bundleRow(user.id))!;
  assert.equal(still.id, read.id);
  assert.equal((await plan(still, new Date())).kind, "send", "Y still goes");
  // Read again and unchanged, it closes.
  await prisma.invoice.update({ where: { id: y.id }, data: { stage: "NOT_INVOICE", deletedAt: new Date() } });
  assert.equal(await closeUnclaimedInvoiceRow(prisma, still, new Date(), "nothing to send"), true);
  const closed = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: read.id }, select: { sentAt: true, openKey: true, lastError: true } });
  assert.ok(closed.sentAt);
  assert.equal(closed.openKey, null);
  assert.equal(closed.lastError, "nothing to send");
});

test("re-paid between the drain's read and its close: the newer payment's Paid email isn't lost", { skip }, async () => {
  const id = await toPay();
  const t0 = new Date(Date.now() - PAID_SETTLE_MS - 60_000);
  const first = await markPaid(prisma, id, { paidOn: today, method: "CHECK" }, connor, t0);
  const read = (await paidRows(id))[0];
  await undoPaid(prisma, id, first.paidAt, connor);
  assert.deepEqual(await plan(read, new Date()), { kind: "skip", reason: "not paid" });
  // Paid again before the close: the open row now carries the new payment.
  await markPaid(prisma, id, { paidOn: today, method: "ZELLE" }, connor, new Date(t0.getTime() + 1000));
  assert.equal(await closeUnclaimedInvoiceRow(prisma, read, new Date(), "not paid"), false);
  const rows = await paidRows(id);
  assert.equal(rows.length, 1);
  assert.equal((await plan(rows[0], new Date())).kind, "send");
});

// ---------------------------------------------------------------------------
// Use as invoice and Send invoice's files (4.1, 4.4)
// ---------------------------------------------------------------------------

function fakeBlobs(blobs: Record<string, { size: number; contentType: string; host?: string }> = {}) {
  const calls = { copies: [] as [string, string][], deleted: [] as string[], hashed: [] as string[] };
  const ops: InvoiceBlobOps = {
    storeId: STORE,
    async head(pathname) {
      const b = blobs[pathname];
      return b ? { url: `https://${b.host ?? `${STORE}.private.blob.vercel-storage.com`}/${pathname}`, pathname, size: b.size, contentType: b.contentType } : null;
    },
    async sha256(url) {
      calls.hashed.push(url);
      return createHash("sha256").update(url).digest("hex");
    },
    async copy(from, to, contentType) {
      calls.copies.push([from, to]);
      const pathname = to.replace(/(\.[a-z0-9]+)$/i, `-Rnd${calls.copies.length}$1`);
      return { url: `https://${STORE}.private.blob.vercel-storage.com/${pathname}`, pathname, contentType };
    },
    async del(u) {
      calls.deleted.push(u);
    },
  };
  return { ops, calls };
}

async function attachment(taskId: string, over: { kind?: "IMAGE" | "FILE" | "VIDEO"; url?: string } = {}): Promise<string> {
  const n = randomUUID().slice(0, 6);
  const pathname = `tasks/${taskId}/orig/bill-${n}.pdf`;
  const a = await prisma.taskAttachment.create({
    data: {
      taskId,
      kind: over.kind ?? "FILE",
      url: over.url ?? `https://${STORE}.private.blob.vercel-storage.com/${pathname}`,
      pathname,
      filename: `Bill ${n}.pdf`,
      size: 2048,
      contentType: over.kind === "VIDEO" ? "video/mp4" : "application/pdf",
    },
  });
  return a.id;
}

test("Use as invoice copies the job's file into the invoice's own folder, links the job and fills in its contractor", { skip }, async () => {
  const before = new Set(await bundled(connorId));
  const t = await job("Gutters", "DONE", { contactId: zackId });
  const aId = await attachment(t);
  const { ops, calls } = fakeBlobs();
  const { id } = await useAsInvoice(prisma, ops, aId, connor, today);
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { files: true, tasks: true } });
  assert.equal(inv.source, "STAFF");
  assert.equal(inv.stage, "REVIEW");
  assert.equal(inv.contactId, zackId);
  assert.deepEqual(inv.tasks.map((x) => x.taskId), [t]);
  assert.equal(calls.copies.length, 1);
  const a = await prisma.taskAttachment.findUniqueOrThrow({ where: { id: aId } });
  assert.equal(calls.copies[0][0], a.url);
  assert.ok(calls.copies[0][1].startsWith(`invoices/${id}/`), "into the invoice's own folder");
  assert.equal(inv.files.length, 1);
  assert.ok(inv.files[0].pathname.startsWith(`invoices/${id}/`));
  assert.notEqual(inv.files[0].pathname, a.pathname, "its own copy, not the job's blob");
  assert.equal(inv.files[0].sha256, createHash("sha256").update(a.url!).digest("hex"));
  assert.equal(inv.files[0].filename, a.filename);
  // A partner's own entry: no staff email (M12).
  assert.deepEqual((await bundled(connorId)).filter((i) => !before.has(i)), []);

  // Deleting the job keeps the invoice and its file (the job's title stays on the link).
  await prisma.task.delete({ where: { id: t } });
  const kept = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { files: true, tasks: true } });
  assert.equal(kept.files.length, 1);
  assert.equal(kept.tasks[0].taskId, null);
});

test("Use as invoice: never a video, never a file still in public storage; a canceled job's file makes one with no job", { skip }, async () => {
  const t = await job("Video job", "IN_PROGRESS");
  const { ops, calls } = fakeBlobs();
  assert.deepEqual(await refusal(useAsInvoice(prisma, ops, await attachment(t, { kind: "VIDEO" }), connor, today)), { file: NOT_A_DOCUMENT });
  const publicUrl = `https://public1.public.blob.vercel-storage.com/old-${run}.pdf`;
  const r = await refusal(useAsInvoice(prisma, ops, await attachment(t, { url: publicUrl }), connor, today));
  assert.ok(r.file);
  assert.equal(calls.copies.length, 0, "nothing copied for a refusal");

  const canceled = await job("Canceled job", "CANCELED", { contactId: zackId });
  const { id } = await useAsInvoice(prisma, ops, await attachment(canceled), connor, today);
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { tasks: true } });
  assert.equal(inv.tasks.length, 0);
  assert.equal(inv.contactId, zackId);
});

test("Send invoice records the contractor's uploads, hashed, on the new invoice; a blob outside our private store is refused and deleted", { skip }, async () => {
  const t = await job("Deck", "REVIEW", { contactId: zackId });
  await prisma.taskAccess.create({ data: { taskId: t, contactId: zackId } });
  const good = `${sendFolder(t, zackId)}bill-${run}-Ab1.pdf`;
  const outside = `${sendFolder(t, zackId)}photo-${run}-Cd2.jpg`;
  const { ops, calls } = fakeBlobs({
    [good]: { size: 3000, contentType: "application/pdf" },
    [outside]: { size: 3000, contentType: "image/jpeg", host: "public1.public.blob.vercel-storage.com" },
  });
  assert.deepEqual(await refusal(sendPortalInvoice(prisma, ops, { taskId: t, files: [{ pathname: outside, filename: "photo.jpg" }] }, zack, today)), { files: NOT_PRIVATE });
  assert.equal(calls.deleted.length, 1);

  const { id } = await sendPortalInvoice(prisma, ops, { taskId: t, invoiceNumber: "88", totalCents: 9900, files: [{ pathname: good, filename: "Bill.pdf" }] }, zack, today);
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { files: true, tasks: true } });
  assert.equal(inv.source, "PORTAL");
  assert.deepEqual(inv.tasks.map((x) => x.taskId), [t]);
  assert.equal(inv.files[0].pathname, good);
  assert.equal(inv.files[0].sha256, createHash("sha256").update(`https://${STORE}.private.blob.vercel-storage.com/${good}`).digest("hex"));

  // Send tapped again after the first one committed (its answer lost): the invoice it made, not a refusal or a second one.
  const again = await sendPortalInvoice(prisma, ops, { taskId: t, files: [{ pathname: good, filename: "Bill.pdf" }] }, zack, today);
  assert.equal(again.id, id);
  assert.equal(await prisma.invoiceFile.count({ where: { pathname: good } }), 1);
  // That blob plus a new one is a different send, so the blob already on an invoice is refused.
  const extra = `${sendFolder(t, zackId)}bill-${run}-Gh4.pdf`;
  const { ops: more } = fakeBlobs({ [good]: { size: 3000, contentType: "application/pdf" }, [extra]: { size: 3000, contentType: "application/pdf" } });
  const both = [{ pathname: good, filename: "Bill.pdf" }, { pathname: extra, filename: "Bill 2.pdf" }];
  assert.deepEqual(await refusal(sendPortalInvoice(prisma, more, { taskId: t, files: both }, zack, today)), { files: ALREADY_ADDED });
  // Another contractor naming Zack's blob never gets his invoice back.
  assert.ok((await refusal(sendPortalInvoice(prisma, ops, { taskId: t, files: [{ pathname: good, filename: "Bill.pdf" }] }, { kind: "contractor", contactId: mikeId, label: "Mike" }, today))).invoice);
  // A link session can't send at all.
  const fresh = `${sendFolder(t, zackId)}bill-${run}-Ef3.pdf`;
  assert.deepEqual(await refusal(sendPortalInvoice(prisma, ops, { taskId: t, files: [{ pathname: fresh, filename: "Bill.pdf" }] }, { ...zack, onlyTaskId: t }, today)), {
    invoice: SIGN_IN_TO_SEND,
  });
});

test("Send invoice: a blob listed twice is one file, a double tap makes one invoice, and another contractor's folder is refused", { skip }, async () => {
  const t = await job("Porch", "DONE", { contactId: zackId });
  await prisma.taskAccess.create({ data: { taskId: t, contactId: zackId } });
  const twice = `${sendFolder(t, zackId)}bill-${run}-Tw1.pdf`;
  const tap = `${sendFolder(t, zackId)}bill-${run}-Tp2.pdf`;
  const mikes = `${sendFolder(t, mikeId)}bill-${run}-Mk3.pdf`;
  const { ops } = fakeBlobs({
    [twice]: { size: 3000, contentType: "application/pdf" },
    [tap]: { size: 3000, contentType: "application/pdf" },
    [mikes]: { size: 3000, contentType: "application/pdf" },
  });
  const one = await sendPortalInvoice(prisma, ops, { taskId: t, files: [{ pathname: twice, filename: "Bill.pdf" }, { pathname: twice, filename: "Bill.pdf" }] }, zack, today);
  assert.equal(await prisma.invoiceFile.count({ where: { invoiceId: one.id } }), 1);

  // Two taps at once with the same upload: one invoice. The later tap gets that invoice when it looks after the first
  // committed, or a worded refusal on the files field when the two raced.
  const input = { taskId: t, files: [{ pathname: tap, filename: "Bill.pdf" }] };
  const both = await Promise.allSettled([sendPortalInvoice(prisma, ops, input, zack, today), sendPortalInvoice(prisma, ops, input, zack, today)]);
  const made = both.flatMap((r) => (r.status === "fulfilled" ? [r.value.id] : []));
  assert.ok(made.length >= 1);
  assert.equal(new Set(made).size, 1, "one invoice");
  for (const r of both) {
    if (r.status === "fulfilled") continue;
    assert.ok(r.reason instanceof FieldError, `a FieldError, not ${String(r.reason)}`);
    assert.deepEqual((r.reason as FieldError).fieldErrors, { files: ALREADY_ADDED });
  }
  assert.equal(await prisma.invoiceFile.count({ where: { pathname: tap } }), 1);

  // Zack can't record a file staged in another contractor's folder on the same job, by the checked path or by core's.
  assert.deepEqual(await refusal(sendPortalInvoice(prisma, ops, { taskId: t, files: [{ pathname: mikes, filename: "Bill.pdf" }] }, zack, today)), { files: NOT_IN_FOLDER });
  assert.deepEqual(await refusal(createPortalInvoice(prisma, { taskId: t, files: [file(sendFolder(t, mikeId))] }, zack, today)), { files: NOT_IN_FOLDER });
  assert.deepEqual(await refusal(createPortalInvoice(prisma, { taskId: t, files: [file(`contacts/${mikeId}/w9/`)] }, zack, today)), { files: NOT_IN_FOLDER });
});

test("Add the invoice file recorded twice (a retry after the first committed) is one file; another invoice's blob is refused", { skip }, async () => {
  const { id } = await createStaffInvoice(prisma, { contactId: zackId, taskIds: [] }, connor, today);
  const other = await createStaffInvoice(prisma, { contactId: zackId, taskIds: [] }, connor, today);
  const pathname = `invoices/${id}/bill-${run}-Rc1.pdf`;
  const { ops } = fakeBlobs({ [pathname]: { size: 3000, contentType: "application/pdf" } });
  const first = await recordInvoiceUpload(prisma, ops, id, { pathname, filename: "Bill.pdf" }, connor);
  const retry = await recordInvoiceUpload(prisma, ops, id, { pathname, filename: "Bill.pdf" }, connor);
  assert.equal(retry.id, first.id);
  assert.equal(await prisma.invoiceFile.count({ where: { invoiceId: id } }), 1);
  assert.equal(await prisma.invoiceEvent.count({ where: { invoiceId: id, kind: "FILE_ADDED" } }), 1);
  // The same blob named for a different invoice isn't in that invoice's folder.
  assert.deepEqual(await refusal(recordInvoiceUpload(prisma, ops, other.id, { pathname, filename: "Bill.pdf" }, connor)), { files: NOT_IN_FOLDER });
});
