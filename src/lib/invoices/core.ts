import { Prisma, type InvoiceEventKind, type InvoicePayMethod, type InvoiceSource, type InvoiceStage, type PrismaClient } from "@prisma/client";
import { FieldError } from "@/lib/action-result";
import { invoiceSendParent, storedInvoiceUploadPath } from "@/lib/attachments/limits";
import { TEMPLATE_BUCKET } from "@/lib/config";
import { toYmd, todayYmdEastern, ymdToDate, type Ymd } from "@/lib/dates";
import { fromAddress, singleAddress } from "@/lib/email/inbound";
import { firstName } from "@/lib/names";
import type { JobEmailState } from "@/lib/portal/job-emails";
import { escapeLike } from "@/lib/search";
import {
  INVOICE_NUMBER_MAX,
  NUMBER_TOO_LONG,
  TOTAL_ABOVE_ZERO,
  TOTAL_MESSAGE,
  TOTAL_TOO_BIG,
  approveBlocker,
  centsToDecimal,
  cleanInvoiceNumber,
  decimalToCents,
  isPayMethod,
  isTotalCents,
  movedMessage,
  normalizeInvoiceNumber,
} from "./fields";
import { isPartnerForward, queueInvoiceReview, queuePaidEmail } from "./notify";

/**
 * Every contractor invoice write (docs/contractor-invoices-plan.md, 5.2), on
 * whatever client the caller hands in: the app's, through service.ts, or a
 * test's. Each write is one transaction that records its InvoiceEvent, and a
 * refusal is a FieldError keyed by the field it's about, so a form marks that
 * field and anything else becomes the toast.
 *
 * Concurrency (5.2): every write takes the invoice's row first (FOR NO KEY
 * UPDATE, as tasks/core.ts lockTask does) and goes ahead only while it's in
 * the stage the move expects; a field save only while it's in To review. The
 * one that lost reads why, keyed `stage`: "Pieter already marked this paid."
 * Two partners can't both mark one invoice paid, undo one Paid twice, or
 * reopen a paid one. This guards the app's record only; money moves in
 * Baselane, so paying once is the partners' working rule (M8). A write that
 * can change "Possible duplicate" queues behind the others like it first
 * (lockDuplicates), since it writes other invoices' rows too.
 *
 * Money arrives as integer cents (fields.ts readTotal reads what was typed)
 * and is stored as DECIMAL(12,2) text, never through a float of dollars.
 *
 * Deliberately no `server-only`, no revalidatePath and no network, so the
 * portal, the inbound email path and a test can all use it; nothing here
 * imports staff auth, QuickBooks, tasks/service or tasks/attachments
 * (auth-guard.test.ts holds that). The file metas it records are trusted: the
 * app reaches the writes that take them only through files.ts, which checks
 * each blob, and the inbound path, which makes its own (service.ts exposes no
 * write that takes a caller's meta).
 */

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

/** Who is acting. The label is what the history shows: "Connor Swofford", "Zack (Outlaw Carpentry)", "zack@gmail.com". */
export type Actor =
  | { kind: "staff"; userId: string; label: string }
  // onlyTaskId: a session an email's job link started (M16). It can't send an invoice.
  | { kind: "contractor"; contactId: string; label: string; onlyTaskId?: string | null }
  | { kind: "system"; label: string };

export type Staff = Extract<Actor, { kind: "staff" }>;
export type Contractor = Extract<Actor, { kind: "contractor" }>;

/** The signed-in partner as the actor on a write. */
export function staffActor(user: { id: string; name: string | null; email: string }): Staff {
  return { kind: "staff", userId: user.id, label: user.name?.trim() || user.email };
}

/** An email or another automated writer, named by what the history should say: the sender's address. */
export function systemActor(label: string): Actor {
  return { kind: "system", label };
}

export const NOT_FOUND = "That invoice is gone. Reload the page.";
export const CONTRACTOR_GONE = "That contractor is gone. Pick another.";
export const CONTRACTOR_ARCHIVED = "Archived. Pick someone else.";
export const JOB_GONE = "That job is gone. Pick another.";
export const JOB_CANCELED = "That job is canceled. Pick another.";
export const DATE_NEEDED = "Pick the invoice date.";
export const PAID_DAY_NEEDED = "Pick the day it was paid.";
export const METHOD_NEEDED = "Pick how it was paid.";
export const FILE_NEEDED = "Add the invoice file.";
export const NO_JOB_ACCESS = "You don't have access to this job.";
export const JOB_NOT_FINISHED = "Mark the job done first, then send the invoice.";
export const SIGN_IN_TO_SEND = "Sign in to send an invoice.";
export const ALREADY_ADDED = "That file is already on an invoice.";
export const NOT_IN_FOLDER = "That file isn't one you uploaded here.";

export const NOTE_MAX = 2000;
export const NOTE_TOO_LONG = "Use 2,000 characters or fewer.";
export const PAID_NOTE_MAX = 200;
export const PAID_NOTE_TOO_LONG = "Use 200 characters or fewer.";

/**
 * The FieldError key of a move that lost to someone else's (5.2). The invoice page reads it to close a sheet and
 * show where the invoice is now, rather than marking a field.
 */
export const STAGE_FIELD = "stage";

/** A file already in private Blob. The service checks the blob's real size and type with head() and passes those. */
export interface InvoiceFileMeta {
  url: string;
  pathname: string;
  filename: string;
  size: number;
  contentType: string | null;
  /** Of the bytes, hex. */
  sha256: string;
  thumbPathname?: string | null;
  width?: number | null;
  height?: number | null;
}

// ---------------------------------------------------------------------------
// The row, its lock and its history
// ---------------------------------------------------------------------------

const ROW = {
  id: true,
  stage: true,
  source: true,
  contactId: true,
  invoiceNumber: true,
  invoiceDate: true,
  total: true,
  note: true,
  approvedAt: true,
  paidOn: true,
  paidAt: true,
  payMethod: true,
  contact: { select: { fullName: true } },
} satisfies Prisma.InvoiceSelect;

type Row = Prisma.InvoiceGetPayload<{ select: typeof ROW }>;

/** The history lines that move an invoice between stages, newest of which says who put it where it is. */
const MOVES: readonly InvoiceEventKind[] = ["APPROVED", "REOPENED", "PAID", "UNDONE", "NOT_INVOICE", "RESTORED"];

function actorFields(by: Actor) {
  return {
    actorUserId: by.kind === "staff" ? by.userId : null,
    actorContactId: by.kind === "contractor" ? by.contactId : null,
    actorLabel: by.label.trim() || "HG Capital",
  };
}

function isActor(by: Actor, line: { actorUserId: string | null; actorContactId: string | null }): boolean {
  if (by.kind === "staff") return line.actorUserId === by.userId;
  if (by.kind === "contractor") return line.actorContactId === by.contactId;
  return false;
}

async function addEvent(tx: Tx, invoiceId: string, kind: InvoiceEventKind, by: Actor, data: Prisma.InputJsonObject = {}): Promise<void> {
  await tx.invoiceEvent.create({ data: { invoiceId, kind, data, ...actorFields(by) } });
}

/** Takes the invoice's row until the transaction ends, then reads it: a write that waited sees what the other left. */
async function lockInvoice(tx: Tx, id: string): Promise<Row | null> {
  await tx.$executeRaw`SELECT 1 FROM "Invoice" WHERE "id" = ${id} FOR NO KEY UPDATE`;
  return tx.invoice.findUnique({ where: { id }, select: ROW });
}

/** Why a move can't go: the invoice is in `stage` now, and its newest move line says who put it there. */
async function movedRefusal(tx: Tx, invoiceId: string, stage: InvoiceStage, by: Actor): Promise<FieldError> {
  const last = await tx.invoiceEvent.findFirst({
    where: { invoiceId, kind: { in: [...MOVES] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { kind: true, actorLabel: true, actorUserId: true, actorContactId: true },
  });
  const who = last ? (isActor(by, last) ? "You" : firstName(last.actorLabel) || null) : null;
  return new FieldError({ [STAGE_FIELD]: movedMessage(stage, last?.kind ?? null, who) });
}

/** The locked invoice, while it's in one of `expected`; otherwise the refusal that says where it went. */
async function openInvoice(tx: Tx, id: string, expected: readonly InvoiceStage[], by: Actor): Promise<Row> {
  const row = await lockInvoice(tx, id);
  if (!row) throw new FieldError({ invoice: NOT_FOUND });
  if (!expected.includes(row.stage)) throw await movedRefusal(tx, id, row.stage, by);
  return row;
}

/** A write that holds only while the row is still in the stage it was read in (it is, under the lock). */
async function updateInStage(tx: Tx, row: Row, data: Prisma.InvoiceUncheckedUpdateManyInput): Promise<void> {
  const r = await tx.invoice.updateMany({ where: { id: row.id, stage: row.stage }, data });
  if (r.count !== 1) throw new FieldError({ invoice: NOT_FOUND });
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

function readNumber(raw: string | null | undefined): { invoiceNumber: string | null; invoiceNumberNormalized: string | null } {
  const invoiceNumber = cleanInvoiceNumber(raw);
  if (invoiceNumber && invoiceNumber.length > INVOICE_NUMBER_MAX) throw new FieldError({ invoiceNumber: NUMBER_TOO_LONG });
  return { invoiceNumber, invoiceNumberNormalized: normalizeInvoiceNumber(invoiceNumber) };
}

/** Cents as the column's text, or null for no total. A refusal names the total field. */
function readTotalCents(cents: number | null | undefined): string | null {
  if (cents == null) return null;
  if (isTotalCents(cents)) return centsToDecimal(cents);
  if (typeof cents !== "number" || !Number.isInteger(cents)) throw new FieldError({ total: TOTAL_MESSAGE });
  throw new FieldError({ total: cents <= 0 ? TOTAL_ABOVE_ZERO : TOTAL_TOO_BIG });
}

function readText(raw: string | null | undefined, max: number, field: string, message: string): string | null {
  const s = raw?.trim() || null;
  if (s && s.length > max) throw new FieldError({ [field]: message });
  return s;
}

/** A contractor to put on an invoice: one that exists, and not archived unless it's already the invoice's (M11). */
async function checkContact(tx: Tx, contactId: string, current: string | null): Promise<{ id: string; fullName: string }> {
  const c = await tx.contact.findUnique({ where: { id: contactId }, select: { id: true, fullName: true, archivedAt: true } });
  if (!c) throw new FieldError({ contactId: CONTRACTOR_GONE });
  if (c.archivedAt && c.id !== current) throw new FieldError({ contactId: CONTRACTOR_ARCHIVED });
  return { id: c.id, fullName: c.fullName };
}

/** A job an invoice can be for (M7): any job that isn't canceled, whoever it sits on. Never a playbook's template row. */
async function jobToLink(tx: Tx, taskId: string): Promise<{ id: string; title: string; status: string }> {
  const t = await tx.task.findUnique({ where: { id: taskId }, select: { id: true, title: true, status: true, bucket: true } });
  if (!t || t.bucket === TEMPLATE_BUCKET) throw new FieldError({ taskId: JOB_GONE });
  if (t.status === "CANCELED") throw new FieldError({ taskId: JOB_CANCELED });
  return t;
}

const SHA256 = /^[0-9a-f]{64}$/;

function fileData(meta: InvoiceFileMeta) {
  const sha256 = meta.sha256.trim().toLowerCase();
  // The service hashes the bytes itself, so a bad one is a bug, not something to tell a person.
  if (!SHA256.test(sha256)) throw new Error("An invoice file needs the SHA-256 of its bytes, in hex");
  return {
    url: meta.url,
    pathname: meta.pathname,
    filename: meta.filename.trim() || "Invoice",
    size: meta.size,
    contentType: meta.contentType,
    sha256,
    thumbPathname: meta.thumbPathname ?? null,
    width: meta.width ?? null,
    height: meta.height ?? null,
  };
}

/**
 * A blob already recorded on an invoice (InvoiceFile.pathname is unique): two Send invoice taps racing with the same
 * uploads, or a file already on another invoice. The unique index is what stops the second record; this words it.
 */
function isFileTaken(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  return /pathname/.test(`${JSON.stringify(err.meta ?? {})} ${err.message}`);
}

/** Runs a write that records files, with a file that's already taken as the files field's refusal, not a raw error. */
async function recordingFiles<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isFileTaken(err)) throw new FieldError({ files: ALREADY_ADDED });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Possible duplicates (M10)
// ---------------------------------------------------------------------------

type DupFields = { id: string; createdAt: Date; contactId: string | null; invoiceNumberNormalized: string | null; duplicateOfId: string | null; files: { sha256: string }[] };

const DUP_SELECT = {
  id: true,
  createdAt: true,
  contactId: true,
  invoiceNumberNormalized: true,
  duplicateOfId: true,
  files: { select: { sha256: true } },
} satisfies Prisma.InvoiceSelect;

/** What another invoice must share with this one to be the same bill: the contractor and number, or a file's bytes. */
function sameBill(inv: DupFields): Prisma.InvoiceWhereInput[] {
  const shas = [...new Set(inv.files.map((f) => f.sha256))];
  return [
    ...(inv.contactId && inv.invoiceNumberNormalized ? [{ contactId: inv.contactId, invoiceNumberNormalized: inv.invoiceNumberNormalized }] : []),
    ...(shas.length > 0 ? [{ files: { some: { sha256: { in: shas } } } }] : []),
  ];
}

/** Invoices made before this one, by when they were made (the id settles a tie). */
const madeBefore = (inv: DupFields): Prisma.InvoiceWhereInput => ({
  OR: [{ createdAt: { lt: inv.createdAt } }, { createdAt: inv.createdAt, id: { lt: inv.id } }],
});
const madeAfter = (inv: DupFields): Prisma.InvoiceWhereInput => ({
  OR: [{ createdAt: { gt: inv.createdAt } }, { createdAt: inv.createdAt, id: { gt: inv.id } }],
});

/**
 * Serializes every write that can change "Possible duplicate" (a new invoice, a contractor or number edit, a file
 * added) for the rest of its transaction. Each of those holds its own invoice's row and then writes other invoices'
 * duplicateOfId, so two at once could each hold a row the other wants and deadlock, and each would work from a read
 * the other was about to change. It's taken first, before the write's own row lock, so a write waiting here holds no
 * invoice row; stage moves never take it and only lock their own row, so they can't close a cycle. Invoices are
 * written a few at a time, so one queue costs nothing.
 */
async function lockDuplicates(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('invoice-duplicates')::bigint)`;
}

/**
 * The invoice this one may repeat: the newest one made before it with the same contractor and number, or the very
 * same file. Every stage counts, Paid and Not an invoice included, so a bill sent again after it was paid, or after
 * its first copy was cleared, still warns. The newest, so a re-bill links the copy that was paid rather than the
 * wrong file it replaced. Null when none matches.
 */
async function duplicateOf(tx: Tx, inv: DupFields): Promise<string | null> {
  const same = sameBill(inv);
  if (same.length === 0) return null;
  const found = await tx.invoice.findFirst({
    where: { AND: [{ id: { not: inv.id } }, madeBefore(inv), { OR: same }] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return found?.id ?? null;
}

async function setDuplicateOf(tx: Tx, inv: DupFields): Promise<void> {
  const dup = await duplicateOf(tx, inv);
  if (dup !== inv.duplicateOfId) await tx.invoice.update({ where: { id: inv.id }, data: { duplicateOfId: dup } });
}

/**
 * Keeps "Possible duplicate" true after a change to this invoice's contractor, number or files: this one against
 * every older invoice, then every newer one that pointed at it or matches it now, since this change can start or
 * end their match. Only this invoice changed, so one level is the whole of it. It warns; nothing is merged or held.
 * The caller holds lockDuplicates, so no other such write runs alongside.
 */
async function recomputeDuplicates(tx: Tx, invoiceId: string): Promise<void> {
  const me = await tx.invoice.findUnique({ where: { id: invoiceId }, select: DUP_SELECT });
  if (!me) return;
  await setDuplicateOf(tx, me);
  const same = sameBill(me);
  const newer = await tx.invoice.findMany({
    where: { id: { not: me.id }, OR: [{ duplicateOfId: me.id }, ...(same.length > 0 ? [{ AND: [madeAfter(me), { OR: same }] }] : [])] },
    orderBy: { id: "asc" },
    select: DUP_SELECT,
  });
  for (const n of newer) await setDuplicateOf(tx, n);
}

// ---------------------------------------------------------------------------
// Making an invoice
// ---------------------------------------------------------------------------

interface Insert {
  /** Set by Use as invoice, whose file is copied into invoices/<id>/ before the row exists (files.ts). */
  id?: string;
  source: InvoiceSource;
  contactId: string | null;
  invoiceNumber?: string | null;
  invoiceDate: Ymd;
  totalCents?: number | null;
  note?: string | null;
  createdByUserId?: string | null;
  createdByContactId?: string | null;
  inboundEmailId?: string | null;
  taskIds: readonly string[];
  files: readonly InvoiceFileMeta[];
  /**
   * Whether both partners hear of it in their bundle (M12, notify.ts): a portal send and an emailed invoice do; a
   * partner's own entry, a job reply (its forward already went) and a partner's own forward don't.
   */
  tellStaff: boolean;
}

/**
 * A new To review invoice (M6: every way in starts there), with its jobs, its files and its ARRIVED line, and the
 * partners' email line in the same transaction when it's one they hear of. Nothing before this in the transaction
 * may lock an invoice row (lockDuplicates).
 */
async function insertInvoice(tx: Tx, x: Insert, by: Actor, now: Date = new Date()): Promise<{ id: string }> {
  await lockDuplicates(tx);
  const invoiceDate = ymdToDate(x.invoiceDate);
  if (!invoiceDate) throw new FieldError({ invoiceDate: DATE_NEEDED });
  const number = readNumber(x.invoiceNumber);
  const total = readTotalCents(x.totalCents);
  const note = readText(x.note, NOTE_MAX, "note", NOTE_TOO_LONG);
  // The archived rule is the staff picker's (M11); a contractor the system matched or a reply token named stays.
  if (x.contactId) await checkContact(tx, x.contactId, x.source === "STAFF" ? null : x.contactId);
  const jobs: { id: string; title: string }[] = [];
  for (const taskId of new Set(x.taskIds)) jobs.push(await jobToLink(tx, taskId));
  const inv = await tx.invoice.create({
    data: {
      ...(x.id ? { id: x.id } : {}),
      source: x.source,
      stage: "REVIEW",
      contactId: x.contactId,
      ...number,
      invoiceDate,
      total,
      note,
      createdByUserId: x.createdByUserId ?? null,
      createdByContactId: x.createdByContactId ?? null,
      inboundEmailId: x.inboundEmailId ?? null,
      tasks: { create: jobs.map((j) => ({ taskId: j.id, title: j.title })) },
      files: { create: x.files.map(fileData) },
    },
    select: { id: true },
  });
  await addEvent(tx, inv.id, "ARRIVED", by, { source: x.source, files: x.files.length });
  await recomputeDuplicates(tx, inv.id);
  if (x.tellStaff) await queueInvoiceReview(tx, inv.id, now);
  return inv;
}

export interface StaffInvoiceInput {
  /** Use as invoice only: the id its copied file's folder was named for (files.ts). */
  id?: string;
  contactId?: string | null;
  invoiceNumber?: string | null;
  /** The invoice's date; today (Buffalo) when not given. */
  invoiceDate?: Ymd | null;
  totalCents?: number | null;
  note?: string | null;
  taskIds?: readonly string[];
  /** Use as invoice only: its copy of the job's file (files.ts). service.ts's New invoice takes none. */
  files?: readonly InvoiceFileMeta[];
}

/**
 * A partner's New invoice, or Use as invoice on a job's file (4.4): made on the first file dropped or the first
 * field saved, so it can start nearly empty. It's a To review invoice like any other (M6); the partner's own Approve
 * moves it on.
 */
export async function createStaffInvoice(db: Db, input: StaffInvoiceInput, by: Staff, today: Ymd): Promise<{ id: string }> {
  return recordingFiles(() =>
    db.$transaction((tx) =>
      insertInvoice(
        tx,
        {
          id: input.id,
          source: "STAFF",
          contactId: input.contactId ?? null,
          invoiceNumber: input.invoiceNumber,
          invoiceDate: input.invoiceDate === undefined || input.invoiceDate === null ? today : input.invoiceDate,
          totalCents: input.totalCents,
          note: input.note,
          createdByUserId: by.userId,
          taskIds: input.taskIds ?? [],
          files: input.files ?? [],
          // A partner's own entry: no staff email (M12).
          tellStaff: false,
        },
        by,
      ),
    ),
  );
}

export interface PortalInvoiceInput {
  /** The job they sent it from, which it's linked to. */
  taskId: string;
  invoiceNumber?: string | null;
  totalCents?: number | null;
  /** At least one (M3), each from this contractor's own folder on the job (files.ts checks the blobs). */
  files: readonly InvoiceFileMeta[];
}

/**
 * Why a contractor can't send an invoice from this job, or null when they can (M7, M16): a link session signs in
 * first, and the job must be one they have live TaskAccess to, with an active login, once it's In review or Done.
 * The portal-invoice-upload token route asks this before any bytes move, and the send asks again.
 */
export async function sendRefusal(db: Db | Tx, taskId: string, by: Pick<Contractor, "contactId" | "onlyTaskId">): Promise<string | null> {
  if (by.onlyTaskId) return SIGN_IN_TO_SEND;
  const access = await db.taskAccess.findUnique({
    where: { taskId_contactId: { taskId, contactId: by.contactId } },
    select: { revokedAt: true, contact: { select: { active: true, portalAccount: { select: { status: true } } } }, task: { select: { status: true } } },
  });
  if (!access || access.revokedAt || !access.contact.active || access.contact.portalAccount?.status !== "ACTIVE") return NO_JOB_ACCESS;
  if (access.task.status !== "REVIEW" && access.task.status !== "DONE") return JOB_NOT_FINISHED;
  return null;
}

/**
 * Send invoice on a portal job (4.1): from a signed-in contractor with live access to the job, once it's In review
 * or Done (M7), never from a link session (M16), with at least one file. It's theirs and linked to that job. The app
 * calls it only through files.ts sendPortalInvoice, which checks each blob first.
 */
export async function createPortalInvoice(db: Db, input: PortalInvoiceInput, by: Contractor, today: Ymd, now: Date = new Date()): Promise<{ id: string }> {
  return recordingFiles(() =>
    db.$transaction(async (tx) => {
      if (by.onlyTaskId) throw new FieldError({ invoice: SIGN_IN_TO_SEND });
      if (input.files.length === 0) throw new FieldError({ files: FILE_NEEDED });
      const refusal = await sendRefusal(tx, input.taskId, by);
      if (refusal) throw new FieldError({ invoice: refusal });
      // Only what this contractor staged for this job: never another contractor's upload, a task attachment or a
      // W-9 named by its private URL.
      const folder = invoiceSendParent(input.taskId, by.contactId);
      if (input.files.some((f) => !storedInvoiceUploadPath("portal-invoice-upload", f.pathname, folder))) throw new FieldError({ files: NOT_IN_FOLDER });
      return insertInvoice(
        tx,
        {
          source: "PORTAL",
          contactId: by.contactId,
          invoiceNumber: input.invoiceNumber,
          invoiceDate: today,
          totalCents: input.totalCents,
          createdByContactId: by.contactId,
          taskIds: [input.taskId],
          files: input.files,
          tellStaff: true,
        },
        by,
        now,
      );
    }),
  );
}

/**
 * The stored email an emailed invoice comes from, locked so a second delivery of the same email waits here and
 * then finds the invoice the first one made.
 */
async function lockEmail(tx: Tx, inboundEmailId: string): Promise<{ receivedAt: Date; fromLine: string | null; dmarc: string | null; invoiceId: string | null }> {
  await tx.$executeRaw`SELECT 1 FROM "InboundEmail" WHERE "id" = ${inboundEmailId} FOR UPDATE`;
  const email = await tx.inboundEmail.findUnique({
    where: { id: inboundEmailId },
    select: { receivedAt: true, fromLine: true, dmarc: true, invoice: { select: { id: true } } },
  });
  if (!email) throw new Error(`No stored email ${inboundEmailId} to make an invoice from`);
  return { receivedAt: email.receivedAt, fromLine: email.fromLine, dmarc: email.dmarc, invoiceId: email.invoice?.id ?? null };
}

export interface EmailInvoiceInput {
  /** The id its files' folder (invoices/<id>/) was named for, when the inbound path stored them before the row. */
  id?: string;
  /** The stored InboundEmail it came in. Its words and From show on the invoice through it. */
  inboundEmailId: string;
  /** The contractor M11 matched (matchContractor, on the same stored From header), or null: "Who's this from?". */
  contactId: string | null;
  /** Zero or more (M3): an emailed amount or a "View invoice" link with no PDF still lands. */
  files: readonly InvoiceFileMeta[];
}

/**
 * A forward to invoices@ (4.3): one To review invoice per email, dated the day it arrived, with its files. Made
 * by no one (the email's From says who), and marks the email filed. A second delivery of the same email makes
 * nothing and hands back the first one's invoice.
 */
export async function createEmailInvoice(db: Db, input: EmailInvoiceInput, by: Actor, now: Date = new Date()): Promise<{ id: string; created: boolean }> {
  return recordingFiles(() =>
    db.$transaction(async (tx) => {
      const email = await lockEmail(tx, input.inboundEmailId);
      if (email.invoiceId) return { id: email.invoiceId, created: false };
      // A partner's own DMARC-verified forward needs no email to the partners (M12); a forged From still sends one.
      // It reads the raw From header the router stored, the line matchContractor checks (M11), not the bare address.
      const fromPartner = await isPartnerForward(tx, email.fromLine, email.dmarc);
      const inv = await insertInvoice(
        tx,
        {
          id: input.id,
          source: "EMAIL",
          contactId: input.contactId,
          invoiceDate: todayYmdEastern(email.receivedAt),
          inboundEmailId: input.inboundEmailId,
          taskIds: [],
          files: input.files,
          tellStaff: !fromPartner,
        },
        by,
        now,
      );
      await tx.inboundEmail.update({ where: { id: input.inboundEmailId }, data: { status: "FILED" } });
      return { ...inv, created: true };
    }),
  );
}

export interface ReplyInvoiceInput {
  /** As EmailInvoiceInput's: the id its files' folder was named for. */
  id?: string;
  /** The stored InboundEmail of the reply, which makes it once per Resend id. */
  inboundEmailId: string;
  /** The Done job the reply was on (4.2). */
  taskId: string;
  files: readonly InvoiceFileMeta[];
}

/**
 * A reply on a Done job's email with the bill attached (4.2): a To review invoice from the contractor the reply
 * token names (`by`), linked to that job, with the reply's files. Fields start empty but those two. Once per email,
 * as createEmailInvoice.
 */
export async function createReplyInvoice(db: Db, input: ReplyInvoiceInput, by: Contractor): Promise<{ id: string; created: boolean }> {
  return recordingFiles(() =>
    db.$transaction(async (tx) => {
      const email = await lockEmail(tx, input.inboundEmailId);
      if (email.invoiceId) return { id: email.invoiceId, created: false };
      const inv = await insertInvoice(
        tx,
        {
          id: input.id,
          source: "REPLY",
          contactId: by.contactId,
          invoiceDate: todayYmdEastern(email.receivedAt),
          createdByContactId: by.contactId,
          inboundEmailId: input.inboundEmailId,
          taskIds: [input.taskId],
          files: input.files,
          // The reply's forward to the partners already went (replies.ts); no second email (M12).
          tellStaff: false,
        },
        by,
      );
      await tx.inboundEmail.update({ where: { id: input.inboundEmailId }, data: { status: "FILED" } });
      return { ...inv, created: true };
    }),
  );
}

// ---------------------------------------------------------------------------
// Editing in To review
// ---------------------------------------------------------------------------

export interface InvoicePatch {
  contactId?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: Ymd | null;
  totalCents?: number | null;
  note?: string | null;
}

type Change = { field: string; from: string | null; to: string | null };

/**
 * A To review field, saved as the partner leaves it (6.1, item 4). Only while the invoice is still in To review:
 * after Approve they're read-only and Back to review reopens them. One EDITED line per field that changed; a save
 * that changes nothing writes nothing. A new contractor or number checks for duplicates again (M10).
 */
export async function editInvoice(db: Db, invoiceId: string, patch: InvoicePatch, by: Staff): Promise<{ changed: string[] }> {
  return db.$transaction(async (tx) => {
    // A contractor or number can change "Possible duplicate", so that save queues with the others like it first.
    if (patch.contactId !== undefined || patch.invoiceNumber !== undefined) await lockDuplicates(tx);
    const row = await openInvoice(tx, invoiceId, ["REVIEW"], by);
    const data: Prisma.InvoiceUncheckedUpdateManyInput = {};
    const changes: Change[] = [];
    if (patch.contactId !== undefined && patch.contactId !== row.contactId) {
      const next = patch.contactId ? await checkContact(tx, patch.contactId, row.contactId) : null;
      data.contactId = next?.id ?? null;
      changes.push({ field: "contractor", from: row.contact?.fullName ?? null, to: next?.fullName ?? null });
    }
    if (patch.invoiceNumber !== undefined) {
      const n = readNumber(patch.invoiceNumber);
      if (n.invoiceNumber !== row.invoiceNumber) {
        Object.assign(data, n);
        changes.push({ field: "invoiceNumber", from: row.invoiceNumber, to: n.invoiceNumber });
      }
    }
    if (patch.invoiceDate !== undefined) {
      const day = ymdToDate(patch.invoiceDate);
      if (!day) throw new FieldError({ invoiceDate: DATE_NEEDED });
      if (toYmd(day) !== toYmd(row.invoiceDate)) {
        data.invoiceDate = day;
        changes.push({ field: "invoiceDate", from: toYmd(row.invoiceDate), to: toYmd(day) });
      }
    }
    if (patch.totalCents !== undefined) {
      const total = readTotalCents(patch.totalCents);
      const before = row.total == null ? null : centsToDecimal(decimalToCents(row.total) ?? 0);
      if (total !== before) {
        data.total = total;
        changes.push({ field: "total", from: before, to: total });
      }
    }
    if (patch.note !== undefined) {
      const note = readText(patch.note, NOTE_MAX, "note", NOTE_TOO_LONG);
      if (note !== row.note) {
        data.note = note;
        changes.push({ field: "note", from: row.note, to: note });
      }
    }
    if (changes.length === 0) return { changed: [] };
    await updateInStage(tx, row, data);
    for (const c of changes) await addEvent(tx, invoiceId, "EDITED", by, c);
    if (changes.some((c) => c.field === "contractor" || c.field === "invoiceNumber")) await recomputeDuplicates(tx, invoiceId);
    return { changed: changes.map((c) => c.field) };
  });
}

/** Tacks a job onto a To review invoice (M7). Linking one already on it does nothing. */
export async function linkJob(db: Db, invoiceId: string, taskId: string, by: Staff): Promise<void> {
  await db.$transaction(async (tx) => {
    await openInvoice(tx, invoiceId, ["REVIEW"], by);
    const on = await tx.invoiceTask.findFirst({ where: { invoiceId, taskId }, select: { id: true } });
    if (on) return;
    const job = await jobToLink(tx, taskId);
    await tx.invoiceTask.create({ data: { invoiceId, taskId: job.id, title: job.title } });
    await addEvent(tx, invoiceId, "EDITED", by, { field: "jobs", taskId: job.id, added: job.title });
  });
}

/** A job on an invoice, by the job, or by the link itself for a deleted job that kept only its title. */
export type JobRef = { taskId: string } | { linkId: string };

/** Takes a job off a To review invoice. One already off does nothing. */
export async function unlinkJob(db: Db, invoiceId: string, ref: JobRef, by: Staff): Promise<void> {
  await db.$transaction(async (tx) => {
    await openInvoice(tx, invoiceId, ["REVIEW"], by);
    const link = await tx.invoiceTask.findFirst({
      where: { invoiceId, ...("taskId" in ref ? { taskId: ref.taskId } : { id: ref.linkId }) },
      select: { id: true, taskId: true, title: true },
    });
    if (!link) return;
    await tx.invoiceTask.delete({ where: { id: link.id } });
    await addEvent(tx, invoiceId, "EDITED", by, { field: "jobs", taskId: link.taskId, removed: link.title });
  });
}

/**
 * A file on a To review invoice (6, item 2: Add the invoice file, for a PDF that turns up later), with a "file
 * added" line. The same blob twice (a retried upload) records it once; a blob already on another invoice is
 * refused. Checks for duplicates again (M10). The app calls it only through files.ts recordInvoiceUpload.
 */
export async function addInvoiceFile(db: Db, invoiceId: string, meta: InvoiceFileMeta, by: Actor): Promise<{ id: string }> {
  return recordingFiles(() =>
    db.$transaction(async (tx) => {
      await lockDuplicates(tx);
      await openInvoice(tx, invoiceId, ["REVIEW"], by);
      const had = await tx.invoiceFile.findUnique({ where: { pathname: meta.pathname }, select: { id: true, invoiceId: true } });
      if (had?.invoiceId === invoiceId) return { id: had.id };
      if (had) throw new FieldError({ files: ALREADY_ADDED });
      const f = await tx.invoiceFile.create({ data: { invoiceId, ...fileData(meta) }, select: { id: true, filename: true } });
      await addEvent(tx, invoiceId, "FILE_ADDED", by, { fileId: f.id, filename: f.filename });
      await recomputeDuplicates(tx, invoiceId);
      return { id: f.id };
    }),
  );
}

// ---------------------------------------------------------------------------
// Stage moves
// ---------------------------------------------------------------------------

/** Approve (M5): To review to To pay. Needs a contractor and a total above zero; either partner approves any invoice. */
export async function approveInvoice(db: Db, invoiceId: string, by: Staff, now: Date = new Date()): Promise<void> {
  await db.$transaction(async (tx) => {
    const row = await openInvoice(tx, invoiceId, ["REVIEW"], by);
    const blocker = approveBlocker({ contactId: row.contactId, totalCents: decimalToCents(row.total) });
    if (blocker) throw new FieldError({ approve: blocker });
    await updateInStage(tx, row, { stage: "TO_PAY", approvedAt: now, approvedByUserId: by.userId });
    await addEvent(tx, invoiceId, "APPROVED", by);
  });
}

/** Back to review: To pay to To review, its fields open again. It clears who approved it and when. */
export async function backToReview(db: Db, invoiceId: string, by: Staff): Promise<void> {
  await db.$transaction(async (tx) => {
    const row = await openInvoice(tx, invoiceId, ["TO_PAY"], by);
    await updateInStage(tx, row, { stage: "REVIEW", approvedAt: null, approvedByUserId: null });
    await addEvent(tx, invoiceId, "REOPENED", by);
  });
}

export interface PaidInput {
  /** The paid date; the sheet starts on today. */
  paidOn: Ymd;
  method: InvoicePayMethod;
  /** A check number or a short note. */
  note?: string | null;
}

export interface PaidResult {
  /** This payment's mark, which Undo paid takes. */
  paidAt: string;
  contactId: string | null;
  /** The contractor's name, for the toast: "Marked paid · Zack gets an email". */
  contactName: string | null;
  /** Whether the contractor gets the Paid email (M15), or why not; null with no contractor. email-content.ts paidToastDetail words it. */
  email: JobEmailState | null;
}

/**
 * Mark paid (M8): To pay to Paid, with the day, how and an optional note, as the partner sends the money. The one
 * who's second reads "Pieter already marked this paid." `paidAt` in the answer is this payment's mark: Undo paid
 * takes it, so an Undo left on an old screen can't take back a later payment. The contractor's Paid email is queued
 * in the same transaction (notify.ts), to go once the Undo window has passed.
 */
export async function markPaid(db: Db, invoiceId: string, input: PaidInput, by: Staff, now: Date = new Date()): Promise<PaidResult> {
  return db.$transaction(async (tx) => {
    const row = await openInvoice(tx, invoiceId, ["TO_PAY"], by);
    const paidOn = ymdToDate(input.paidOn);
    if (!paidOn) throw new FieldError({ paidOn: PAID_DAY_NEEDED });
    if (!isPayMethod(input.method)) throw new FieldError({ method: METHOD_NEEDED });
    const paidNote = readText(input.note, PAID_NOTE_MAX, "paidNote", PAID_NOTE_TOO_LONG);
    await updateInStage(tx, row, { stage: "PAID", paidOn, paidAt: now, payMethod: input.method, paidNote, paidByUserId: by.userId });
    await addEvent(tx, invoiceId, "PAID", by, { paidOn: toYmd(paidOn), method: input.method, note: paidNote });
    const email = row.contactId ? await queuePaidEmail(tx, { invoiceId, contactId: row.contactId, paidAt: now, actorLabel: by.label }) : null;
    return { paidAt: now.toISOString(), contactId: row.contactId, contactName: row.contact?.fullName ?? null, email };
  });
}

/**
 * Undo paid (M8): Paid back to To pay, for the payment marked at `paidAt` only. Paid again since, by anyone, and
 * this refuses rather than take back the newer one. It clears every paid field.
 */
export async function undoPaid(db: Db, invoiceId: string, paidAt: string, by: Staff): Promise<void> {
  await db.$transaction(async (tx) => {
    const row = await openInvoice(tx, invoiceId, ["PAID"], by);
    const mark = Date.parse(paidAt);
    if (!row.paidAt || !Number.isFinite(mark) || row.paidAt.getTime() !== mark) throw await movedRefusal(tx, invoiceId, row.stage, by);
    await updateInStage(tx, row, { stage: "TO_PAY", paidOn: null, paidAt: null, payMethod: null, paidNote: null, paidByUserId: null });
    await addEvent(tx, invoiceId, "UNDONE", by, { paidOn: toYmd(row.paidOn), method: row.payMethod });
  });
}

/**
 * Not an invoice (M4): clears junk, a work photo or a duplicate from To review or To pay, never once it's Paid. A
 * soft delete, undone by restoreInvoice. `expected` is the stage the page showed.
 */
export async function markNotInvoice(
  db: Db,
  invoiceId: string,
  expected: "REVIEW" | "TO_PAY",
  by: Staff,
  now: Date = new Date(),
): Promise<{ from: "REVIEW" | "TO_PAY" }> {
  return db.$transaction(async (tx) => {
    const row = await openInvoice(tx, invoiceId, [expected], by);
    await updateInStage(tx, row, { stage: "NOT_INVOICE", deletedAt: now });
    await addEvent(tx, invoiceId, "NOT_INVOICE", by, { from: expected });
    return { from: expected };
  });
}

/** The Undo of Not an invoice: back to the stage it was cleared from, as it was there. */
export async function restoreInvoice(db: Db, invoiceId: string, by: Staff): Promise<{ stage: "REVIEW" | "TO_PAY" }> {
  return db.$transaction(async (tx) => {
    const row = await openInvoice(tx, invoiceId, ["NOT_INVOICE"], by);
    const cleared = await tx.invoiceEvent.findFirst({
      where: { invoiceId, kind: "NOT_INVOICE" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { data: true },
    });
    const from = (cleared?.data as { from?: unknown } | null)?.from;
    // A To pay invoice keeps its approval while cleared; without one it can only go back to To review.
    const stage = from === "TO_PAY" && row.approvedAt ? "TO_PAY" : "REVIEW";
    await updateInStage(tx, row, { stage, deletedAt: null, ...(stage === "REVIEW" ? { approvedAt: null, approvedByUserId: null } : {}) });
    await addEvent(tx, invoiceId, "RESTORED", by, { to: stage });
    return { stage };
  });
}

// ---------------------------------------------------------------------------
// Who sent an email (M11)
// ---------------------------------------------------------------------------

/**
 * The contractor an emailed invoice is from, or null for "Who's this from?" (M11). Only when the sender's domain
 * vouches for the From (DMARC pass), the From line holds a single address, and that address is exactly one
 * unarchived contractor's login email (PortalAccount.email) or contact email (Contact.email). Compared
 * case-insensitively, with `_` and `%` escaped as replies.ts does, since Prisma's insensitive equals is an ILIKE.
 * Never creates a contractor. The router passes the raw From header it stores as InboundEmail.fromLine, the same
 * line createEmailInvoice's partner check reads.
 */
export async function matchContractor(db: Tx, fromLine: string, dmarc: string | null | undefined): Promise<string | null> {
  if (dmarc !== "pass" || !singleAddress(fromLine)) return null;
  const from = fromAddress(fromLine);
  if (!from.includes("@")) return null;
  const exactly = { equals: escapeLike(from), mode: "insensitive" as const };
  const found = await db.contact.findMany({
    where: { archivedAt: null, OR: [{ email: exactly }, { portalAccount: { email: exactly } }] },
    select: { id: true },
    take: 2,
  });
  return found.length === 1 ? found[0].id : null;
}
