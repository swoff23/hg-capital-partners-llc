import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { todayYmdEastern } from "@/lib/dates";
import { makeClient } from "@/lib/db-client";
import type { ReceivedAttachment, ReceivedEmail } from "@/lib/email/received";
import { scratchRows } from "@/lib/scratch-rows";
import { FieldError } from "@/lib/action-result";
import * as core from "./core";
import type { Contractor } from "./core";
import { INVOICE_INBOX } from "./fields";
import {
  INVOICE_EMAILS_PER_DAY,
  INVOICE_EMAILS_PER_SENDER,
  fileReplyInvoice,
  invoiceAttachments,
  receiveInvoiceEmail,
  type InboundDeps,
} from "./inbound";
import { INVOICE_REVIEW_KIND, forgetInvoiceEmails, reviewBundleKey } from "./notify";

/**
 * The email ways in on a real Postgres (docs/contractor-invoices-plan.md, 4.2 and 4.3): an email to invoices@ and
 * a Done job's reply with a bill, with Resend's attachments and Blob stood in for. Opt-in, as core.pg.test.ts:
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_<worktree>_scratch npx tsx --test src/lib/invoices/inbound.pg.test.ts
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
const STORE = "teststore1";
const PREFIX = `inb-${run}`;

let connorId: string;
let connorEmail: string;
let zackId: string;
let zackEmail: string;
let zack: Contractor;
let propertyId: string;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV, NODE_ENV: "test" } as never);
  await made.takeTurn(URL_ENV);
  connorEmail = `connor-${run}@inbound.test`;
  connorId = (await made.user({ email: connorEmail, name: `Connor I${run}`, passwordHash: "x" })).id;
  zackEmail = `zack-${run}@inbound.test`;
  const z = await made.contact({
    fullName: `Zack I${run}`,
    email: zackEmail,
    portalAccount: { create: { email: zackEmail, passwordHash: "x", lastSignInAt: new Date(), jobEmails: true } },
  });
  zackId = z.id;
  zack = { kind: "contractor", contactId: z.id, label: z.fullName };
  propertyId = (await made.property({ address: `30 Inbound Ave, Buffalo, NY 14209 ${run}` })).id;
});

after(async () => {
  if (skip) return;
  const ids = (await prisma.invoice.findMany({ where: { inboundEmail: { resendId: { startsWith: PREFIX } } }, select: { id: true } })).map((i) => i.id);
  if (ids.length > 0) {
    await forgetInvoiceEmails(prisma, ids);
    await prisma.invoice.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.inboundEmail.deleteMany({ where: { resendId: { startsWith: PREFIX } } });
  await made.remove();
  await prisma.$disconnect();
});

let emailCount = 0;
function email(over: Partial<ReceivedEmail> = {}): ReceivedEmail {
  emailCount++;
  return {
    id: `${PREFIX}-${emailCount}`,
    from: `Zack <${zackEmail}>`,
    to: [`invoices@mail.hg.test`],
    cc: null,
    received_for: null,
    subject: "Invoice 1043",
    text: "Invoice #1043 for the water heater. $850.00",
    html: null,
    headers: {},
    authentication: { dmarc: "pass" },
    created_at: new Date().toISOString(),
    ...over,
  };
}

function pdf(id: string): ReceivedAttachment {
  return { id, filename: `Invoice ${id}.pdf`, size: 2000, content_type: "application/pdf", content_disposition: "attachment", content_id: null, download_url: `https://resend.test/${id}` };
}

/** Resend's attachments and the private store, stood in for; `put` and `del` record what they did. */
function fakes(list: ReceivedAttachment[] = []): InboundDeps & { puts: string[]; dels: string[] } {
  const puts: string[] = [];
  const dels: string[] = [];
  return {
    db: prisma,
    puts,
    dels,
    attachments: async () => list,
    download: async (a) => Buffer.from(`bytes of ${run} ${a.id}`),
    async put(pathname) {
      const stored = `${pathname.replace(/(\.[a-z0-9]+)?$/, (ext) => `-${randomUUID().slice(0, 6)}${ext}`)}`;
      puts.push(stored);
      return { url: `https://${STORE}.private.blob.vercel-storage.com/${stored}`, pathname: stored };
    },
    async del(url) {
      dels.push(url);
    },
  };
}

async function bundled(userId: string): Promise<string[]> {
  const row = await prisma.notificationOutbox.findFirst({ where: { openKey: reviewBundleKey(userId) }, select: { items: true } });
  const items = (row?.items ?? []) as { kind: string; invoiceId?: string }[];
  return items.filter((i) => i.kind === INVOICE_REVIEW_KIND).map((i) => i.invoiceId!);
}

function filedId(r: Awaited<ReturnType<typeof receiveInvoiceEmail>>): string {
  assert.equal(r.outcome, "filed", JSON.stringify(r));
  return (r as { invoiceId: string }).invoiceId;
}

test("an emailed invoice lands with its files, its contractor and the whole stored email", { skip }, async () => {
  const e = email({ html: '<p>Invoice</p><a href="https://squareup.com/pay-invoice/x1">View invoice</a>' });
  const deps = fakes([pdf("a"), pdf("b")]);
  const id = filedId(await receiveInvoiceEmail(deps, e));
  const inv = await prisma.invoice.findUniqueOrThrow({
    where: { id },
    select: { source: true, stage: true, contactId: true, invoiceDate: true, files: { select: { pathname: true, sha256: true } }, inboundEmail: true },
  });
  assert.equal(inv.source, "EMAIL");
  assert.equal(inv.stage, "REVIEW");
  assert.equal(inv.contactId, zackId);
  assert.equal(inv.invoiceDate.toISOString().slice(0, 10), todayYmdEastern(new Date(e.created_at!)));
  assert.equal(inv.files.length, 2);
  for (const f of inv.files) assert.ok(f.pathname.startsWith(`invoices/${id}/`), f.pathname);
  assert.equal(inv.files[0].sha256, createHash("sha256").update(`bytes of ${run} ${inv.files[0].pathname.includes("Invoice-a") ? "a" : "b"}`).digest("hex"));
  const stored = inv.inboundEmail!;
  assert.equal(stored.localPart, INVOICE_INBOX);
  assert.equal(stored.from, zackEmail);
  assert.equal(stored.fromLine, `Zack <${zackEmail}>`);
  assert.equal(stored.dmarc, "pass");
  assert.equal(stored.status, "FILED");
  assert.equal(stored.text, "Invoice #1043 for the water heater. $850.00\n\nhttps://squareup.com/pay-invoice/x1");
  // A contractor's forward goes to the partners' bundle (M12).
  assert.ok((await bundled(connorId)).includes(id));
});

test("an email with no file still lands (M3)", { skip }, async () => {
  const deps = fakes([]);
  const id = filedId(await receiveInvoiceEmail(deps, email({ text: "Amount due: $400. View invoice https://jobber.test/i/7" })));
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id }, select: { files: true, contactId: true } });
  assert.equal(inv.files.length, 0);
  assert.equal(inv.contactId, zackId);
  assert.deepEqual(deps.puts, []);
});

test("one email delivered twice, or twice at once, makes one invoice", { skip }, async () => {
  const e = email();
  const first = fakes([pdf("c")]);
  const id = filedId(await receiveInvoiceEmail(first, e));
  const again = fakes([pdf("c")]);
  const r = await receiveInvoiceEmail(again, e);
  assert.deepEqual(r, { outcome: "ignored", reason: "already filed", invoiceId: id });
  assert.deepEqual(again.puts, [], "a filed email uploads nothing again");

  const both = email();
  const a = fakes([pdf("d")]);
  const b = fakes([pdf("d")]);
  const [ra, rb] = await Promise.all([receiveInvoiceEmail(a, both), receiveInvoiceEmail(b, both)]);
  const ids = new Set([ra, rb].map((x) => (x as { invoiceId?: string }).invoiceId));
  assert.equal(ids.size, 1, "both name the one invoice");
  assert.equal(await prisma.invoice.count({ where: { inboundEmail: { resendId: both.id } } }), 1);
  assert.equal([ra, rb].filter((x) => x.outcome === "filed").length, 1);
  // The delivery that lost deleted the copies it put; the winner's are on the invoice.
  const loser = ra.outcome === "filed" ? b : a;
  assert.equal(loser.dels.length, loser.puts.length);
  assert.equal(await prisma.inboundEmail.count({ where: { resendId: both.id } }), 1);
});

test("a forged From with DMARC failing matches no contractor and still emails the partners", { skip }, async () => {
  const asZack = filedId(await receiveInvoiceEmail(fakes(), email({ authentication: { dmarc: "fail" } })));
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: asZack }, select: { contactId: true } })).contactId, null);
  assert.ok((await bundled(connorId)).includes(asZack));

  // Posing as a partner: no partner skip without a DMARC pass, nor with a second address in the From.
  const asConnor = filedId(await receiveInvoiceEmail(fakes(), email({ from: `Connor <${connorEmail}>`, authentication: { dmarc: "fail" } })));
  assert.ok((await bundled(connorId)).includes(asConnor));
  const twoAddresses = filedId(await receiveInvoiceEmail(fakes(), email({ from: `${connorEmail}, x@evil.test` })));
  assert.ok((await bundled(connorId)).includes(twoAddresses));
  // A disguised From never matches Zack either.
  const disguised = filedId(await receiveInvoiceEmail(fakes(), email({ from: `"${zackEmail}" <x@evil.test>` })));
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: disguised }, select: { contactId: true } })).contactId, null);

  // The partner's own verified forward lands with no email to the partners (M12).
  const own = filedId(await receiveInvoiceEmail(fakes(), email({ from: `Connor <${connorEmail}>` })));
  assert.ok(!(await bundled(connorId)).includes(own));
});

test("automatic replies are stored, ignored and make nothing", { skip }, async () => {
  const e = email({ subject: "Out of office: back Monday", headers: { "auto-submitted": "auto-replied" } });
  const r = await receiveInvoiceEmail(fakes([pdf("e")]), e);
  assert.deepEqual(r, { outcome: "ignored", reason: "automatic reply" });
  const row = await prisma.inboundEmail.findUniqueOrThrow({ where: { resendId: e.id }, select: { status: true, invoice: true } });
  assert.equal(row.status, "IGNORED");
  assert.equal(row.invoice, null);
});

test("a billing tool's invoice, marked auto-generated or bulk, lands as To review", { skip }, async () => {
  const quickbooks = email({ subject: "Invoice 1043 from Zack's Plumbing", headers: { "auto-submitted": "auto-generated", precedence: "bulk" } });
  const id = filedId(await receiveInvoiceEmail(fakes([pdf("qb")]), quickbooks));
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id }, select: { stage: true, files: { select: { id: true } } } });
  assert.equal(inv.stage, "REVIEW");
  assert.equal(inv.files.length, 1);
});

test("a rule's refusal never makes Resend retry: the bill lands as Who's this from?, or the email is let go", { skip }, async () => {
  // The matched contractor deleted between the match and the write: core refuses that contact, so it lands unmatched.
  const gone = fakes([pdf("g")]);
  gone.createEmailInvoice = async (input, by) => {
    if (input.contactId) throw new FieldError({ contactId: "That contractor was deleted." });
    return core.createEmailInvoice(prisma, input, by);
  };
  const id = filedId(await receiveInvoiceEmail(gone, email()));
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id }, select: { contactId: true, files: { select: { pathname: true } } } });
  assert.equal(inv.contactId, null);
  assert.equal(inv.files.length, 1);
  assert.ok(inv.files[0].pathname.startsWith(`invoices/${id}/`));
  assert.equal(gone.puts.length, 2, "each try puts its own copy");
  assert.equal(gone.dels.length, 1, "the refused try's copy is deleted");

  // Refused both times: answered as ignored (a 200), its copies deleted, its stored row kept.
  const never = fakes([pdf("n")]);
  never.createEmailInvoice = async () => {
    throw new FieldError({ files: "That file is already on an invoice." });
  };
  const e = email();
  assert.deepEqual(await receiveInvoiceEmail(never, e), { outcome: "ignored", reason: "refused" });
  assert.equal(never.dels.length, never.puts.length);
  const row = await prisma.inboundEmail.findUniqueOrThrow({ where: { resendId: e.id }, select: { status: true, invoice: true } });
  assert.equal(row.status, "RECEIVED");
  assert.equal(row.invoice, null);

  // Anything else still throws, so the webhook answers 500 and Resend tries again.
  const down = fakes([pdf("x")]);
  down.createEmailInvoice = async () => {
    throw new Error("database down");
  };
  await assert.rejects(receiveInvoiceEmail(down, email()), /database down/);
  assert.equal(down.dels.length, down.puts.length);
});

test("past 10 from one sender or 50 a day, the rest are dropped and counted; a partner's forward isn't", { skip }, async () => {
  // A day of its own, far off, so nothing else today counts.
  const day = new Date(Date.UTC(2041 + (parseInt(run.slice(0, 4), 16) % 40), 2, 10, 16));
  const at = (minutes: number) => new Date(day.getTime() + minutes * 60_000);
  let n = 0;
  const filler = (from: string, count: number) =>
    prisma.inboundEmail.createMany({
      data: Array.from({ length: count }, () => ({
        resendId: `${PREFIX}-cap-${++n}`,
        localPart: INVOICE_INBOX,
        from,
        fromLine: from,
        dmarc: "pass",
        receivedAt: at(n),
        status: "RECEIVED" as const,
      })),
    });
  const sender = `bulk-${run}@inbound.test`;
  await filler(sender, INVOICE_EMAILS_PER_SENDER);
  const tenth = await receiveInvoiceEmail(fakes(), email({ from: sender, created_at: at(100).toISOString() }));
  assert.deepEqual(tenth, { outcome: "ignored", reason: "over the cap" });
  // Another sender still gets in until the day is full.
  filedId(await receiveInvoiceEmail(fakes(), email({ from: `other-${run}@inbound.test`, created_at: at(101).toISOString() })));
  const room = INVOICE_EMAILS_PER_DAY - INVOICE_EMAILS_PER_SENDER - 1;
  for (let i = 0; i < room; i++) await filler(`s${i}-${run}@inbound.test`, 1);
  const full = email({ from: `late-${run}@inbound.test`, created_at: at(200).toISOString() });
  assert.deepEqual(await receiveInvoiceEmail(fakes(), full), { outcome: "ignored", reason: "over the cap" });
  // A retry of a dropped email stays dropped.
  assert.deepEqual(await receiveInvoiceEmail(fakes(), full), { outcome: "ignored", reason: "over the cap" });
  // A partner's DMARC-verified forward lands past both caps, as many as come.
  for (let i = 0; i < 3; i++) filedId(await receiveInvoiceEmail(fakes(), email({ from: `Connor <${connorEmail}>`, created_at: at(300 + i).toISOString() })));
  // Forged as the partner, it's capped like anyone.
  const forged = await receiveInvoiceEmail(fakes(), email({ from: `Connor <${connorEmail}>`, authentication: { dmarc: "fail" }, created_at: at(310).toISOString() }));
  assert.deepEqual(forged, { outcome: "ignored", reason: "over the cap" });
  const dropped = await prisma.inboundEmail.count({
    where: { resendId: { startsWith: PREFIX }, status: "OVER_CAP", receivedAt: { gte: day, lt: at(24 * 60) } },
  });
  assert.equal(dropped, 3, "the over-cap rows the Invoices page counts (queries.ts droppedInvoiceEmailsToday)");
});

test("a Done job's reply with a bill makes one invoice from the token's contractor, linked to the job", { skip }, async () => {
  const task = await prisma.task.create({ data: { title: `Replace water heater ${run}`, status: "DONE", propertyId, assigneeContactId: zackId } });
  const e = email({ from: `Zack <${zackEmail}>`, to: [`r+${"t".repeat(43)}@mail.hg.test`] });
  const files = invoiceAttachments([pdf("f")]);
  const deps = fakes();
  const first = await fileReplyInvoice(deps, { email: e, localPart: "r", taskId: task.id, files, by: zack });
  assert.equal(first.created, true);
  const again = await fileReplyInvoice(fakes(), { email: e, localPart: "r", taskId: task.id, files, by: zack });
  assert.deepEqual(again, { id: first.id, created: false });
  assert.equal(await prisma.invoice.count({ where: { inboundEmail: { resendId: e.id } } }), 1);
  const inv = await prisma.invoice.findUniqueOrThrow({
    where: { id: first.id },
    select: { source: true, contactId: true, createdByContactId: true, tasks: { select: { taskId: true } }, files: { select: { pathname: true } }, inboundEmail: { select: { localPart: true, status: true } } },
  });
  assert.equal(inv.source, "REPLY");
  assert.equal(inv.contactId, zackId);
  assert.equal(inv.createdByContactId, zackId);
  assert.deepEqual(inv.tasks, [{ taskId: task.id }]);
  assert.equal(inv.files.length, 1);
  assert.ok(inv.files[0].pathname.startsWith(`invoices/${first.id}/`));
  assert.deepEqual(inv.inboundEmail, { localPart: "r", status: "FILED" });
  // Its forward already went to the partners, so no bundle line (M12).
  assert.ok(!(await bundled(connorId)).includes(first.id));
  // Outside the invoice inbox's caps: the reply's stored email isn't an invoice email.
  assert.equal(await prisma.inboundEmail.count({ where: { resendId: e.id, localPart: INVOICE_INBOX } }), 0);
});
