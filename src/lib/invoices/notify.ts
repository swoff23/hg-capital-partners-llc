import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { todayYmdEastern, toYmd } from "@/lib/dates";
import { fromAddress, singleAddress } from "@/lib/email/inbound";
import { renderPlainEmail } from "@/lib/email/render";
import { JOB_EMAIL_SELECT, jobEmailState, type JobEmailState } from "@/lib/portal/job-emails";
import { escapeLike } from "@/lib/search";
import { paidEmail, reviewEmail, type ReviewLine } from "./email-content";
import { PAID_SETTLE_MS, decimalToCents } from "./fields";

/**
 * The invoice emails' rows in NotificationOutbox (docs/contractor-invoices-plan.md, 5.3), on a passed client, as
 * core.ts is. core.ts queues them inside the write that makes or pays an invoice; the drain
 * (notifications/outbox.ts drainDue) gives them their own short branch through invoiceEmailFor, with no task read
 * and no TaskAccess check, since an invoice row carries no task.
 *
 *   The partners' bundle (M12)   one row per partner, openKey "u:<userId>:invoices", no task and no invoice; each
 *                                item names its invoice. Sent 10 minutes after its first line, and only for the
 *                                invoices still in To review then.
 *   The contractor's Paid (M15)  one row per payment, openKey "c:<contactId>:invoice:<invoiceId>", carrying the
 *                                invoiceId; its one item holds the payment's paidAt. Sent once the Undo window
 *                                (fields.ts PAID_SETTLE_MS) has passed, only while that same payment stands and the
 *                                invoice is still that contractor's, and only while jobEmailState is "on".
 *
 * Nothing here imports staff auth or the task services, so core.ts can use it from the portal and the inbound path.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** The items' kinds, which tell the drain an invoice row from a task one. */
export const INVOICE_REVIEW_KIND = "INVOICE_REVIEW";
export const INVOICE_PAID_KIND = "INVOICE_PAID";

/** How long the partners' bundle gathers new invoices from its first one (M12). */
export const REVIEW_BUNDLE_MS = 10 * 60_000;

export function reviewBundleKey(userId: string): string {
  return `u:${userId}:invoices`;
}

export function paidKey(contactId: string, invoiceId: string): string {
  return `c:${contactId}:invoice:${invoiceId}`;
}

/** A UTC instant as the outbox's timestamp-without-zone columns hold it (outbox.ts claim explains why). */
const utc = (at: Date) => Prisma.sql`(${at.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

/**
 * Whether an emailed invoice is a partner's own forward (M12): the sender's domain vouches for the From (DMARC
 * pass), the raw From header holds one address (InboundEmail.fromLine, never the bare stored address, which always
 * looks like one), and that is a partner's sign-in email. A partner is a user with a password, as queueInvoiceReview
 * finds them. Then neither partner hears of it by email. Compared case-insensitively with `_` and `%` escaped, as
 * matchContractor does.
 */
export async function isPartnerForward(db: Db, fromLine: string | null | undefined, dmarc: string | null | undefined): Promise<boolean> {
  if (dmarc !== "pass" || !fromLine || !singleAddress(fromLine)) return false;
  const from = fromAddress(fromLine);
  if (!from.includes("@")) return false;
  const user = await db.user.findFirst({
    where: { email: { equals: escapeLike(from), mode: "insensitive" }, passwordHash: { not: null } },
    select: { id: true },
  });
  return !!user;
}

/**
 * A new To review invoice, for both partners' bundle (M12): one line on each partner's open row, made with the first
 * line and sent REVIEW_BUNDLE_MS after it. Partners are the users with a password, as tasks/core.ts notify finds
 * them, in id order so two writes queueing at once take their rows the same way round. The caller decides who is
 * skipped (a staff entry, a job reply, a partner's own forward). Returns how many rows it wrote to.
 */
export async function queueInvoiceReview(tx: Db, invoiceId: string, now: Date = new Date(), exceptUserId?: string | null): Promise<number> {
  // A partner's own entry tells only the other partners: the one who entered it already knows (picked Nov 24).
  const staff = await tx.user.findMany({
    where: { passwordHash: { not: null }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const item = JSON.stringify({ kind: INVOICE_REVIEW_KIND, actorLabel: "", summary: "", at: now.toISOString(), invoiceId });
  for (const s of staff) {
    await tx.$executeRaw`
      INSERT INTO "NotificationOutbox"
        ("id", "openKey", "recipientUserId", "items", "firstAt", "sendAfter", "createdAt")
      VALUES (${randomUUID()}, ${reviewBundleKey(s.id)}, ${s.id}, jsonb_build_array(${item}::jsonb), ${utc(now)}, ${utc(new Date(now.getTime() + REVIEW_BUNDLE_MS))}, ${utc(now)})
      ON CONFLICT ("openKey") DO UPDATE SET "items" = "NotificationOutbox"."items" || EXCLUDED."items"`;
  }
  return staff.length;
}

/** Whether a contractor hears of a payment by email now (M15), or why not; null with no contractor. */
export async function contractorEmailState(tx: Db, contactId: string | null): Promise<JobEmailState | null> {
  if (!contactId) return null;
  const c = await tx.contact.findUnique({ where: { id: contactId }, select: { active: true, portalAccount: { select: JOB_EMAIL_SELECT } } });
  if (!c) return null;
  return jobEmailState(c.portalAccount, c.active);
}

/**
 * The Paid email for one payment (M15), queued in Mark paid's transaction while the contractor's emails are on
 * (the drain checks again). It goes once PAID_SETTLE_MS has passed from `paidAt`. Paid again before an earlier
 * row went replaces that row's payment, so one invoice sends one Paid email for the payment that stood. Returns the
 * contractor's email state, which Mark paid's toast reads (email-content.ts paidToastDetail).
 */
export async function queuePaidEmail(
  tx: Db,
  input: { invoiceId: string; contactId: string; paidAt: Date; actorLabel: string },
): Promise<JobEmailState | null> {
  const state = await contractorEmailState(tx, input.contactId);
  if (state !== "on") return state;
  const at = input.paidAt.toISOString();
  const item = JSON.stringify({ kind: INVOICE_PAID_KIND, actorLabel: input.actorLabel, summary: "", at, invoiceId: input.invoiceId });
  const sendAfter = new Date(input.paidAt.getTime() + PAID_SETTLE_MS);
  await tx.$executeRaw`
    INSERT INTO "NotificationOutbox"
      ("id", "openKey", "recipientContactId", "invoiceId", "items", "firstAt", "sendAfter", "createdAt")
    VALUES (${randomUUID()}, ${paidKey(input.contactId, input.invoiceId)}, ${input.contactId}, ${input.invoiceId}, jsonb_build_array(${item}::jsonb), ${utc(input.paidAt)}, ${utc(sendAfter)}, ${utc(input.paidAt)})
    ON CONFLICT ("openKey") DO UPDATE SET "items" = EXCLUDED."items", "sendAfter" = EXCLUDED."sendAfter", "firstAt" = EXCLUDED."firstAt"`;
  return state;
}

/**
 * Takes every unsent email line about these invoices back off the outbox, for fixtures and tests that make invoices
 * and must send nothing: the partners' bundle lines about them (a row left empty is deleted) and the contractors'
 * unsent Paid rows.
 */
export async function forgetInvoiceEmails(db: Db, invoiceIds: readonly string[]): Promise<void> {
  if (invoiceIds.length === 0) return;
  const ids = [...invoiceIds];
  await db.$executeRaw`
    UPDATE "NotificationOutbox" SET "items" = (
      SELECT COALESCE(jsonb_agg(i), '[]'::jsonb) FROM jsonb_array_elements("items") i WHERE NOT ((i->>'invoiceId') = ANY(${ids}))
    )
    WHERE "sentAt" IS NULL AND "taskId" IS NULL AND "invoiceId" IS NULL
      AND EXISTS (SELECT 1 FROM jsonb_array_elements("items") i WHERE (i->>'invoiceId') = ANY(${ids}))`;
  await db.$executeRaw`DELETE FROM "NotificationOutbox" WHERE "sentAt" IS NULL AND "taskId" IS NULL AND "invoiceId" IS NULL AND "items" = '[]'::jsonb`;
  await db.$executeRaw`DELETE FROM "NotificationOutbox" WHERE "sentAt" IS NULL AND "invoiceId" = ANY(${ids})`;
}

// ---------------------------------------------------------------------------
// At send time
// ---------------------------------------------------------------------------

interface RowItem {
  kind: string;
  at?: string;
  invoiceId?: string;
}

function rowItems(json: unknown): RowItem[] {
  if (!Array.isArray(json)) return [];
  return json.filter((i): i is RowItem => !!i && typeof i === "object" && typeof (i as RowItem).kind === "string");
}

/** The outbox row as the drain read it. */
export interface InvoiceOutboxRow {
  id: string;
  taskId: string | null;
  invoiceId: string | null;
  recipientUserId: string | null;
  recipientContactId: string | null;
  items: unknown;
}

/** Whether a row is an invoice email's, for the drain's own branch: it carries an invoice, or its lines are invoice lines. */
export function isInvoiceRow(row: Pick<InvoiceOutboxRow, "taskId" | "invoiceId" | "items">): boolean {
  if (row.taskId) return false;
  if (row.invoiceId) return true;
  const items = rowItems(row.items);
  return items.length > 0 && items.every((i) => i.kind === INVOICE_REVIEW_KIND || i.kind === INVOICE_PAID_KIND);
}

/**
 * Closes an invoice row the drain hasn't claimed, without sending, only while it still holds the items the plan was
 * made from. The writers append to the open row (queueInvoiceReview) or replace its payment (queuePaidEmail) by its
 * openKey, so a line queued between the drain's read and this close changes the items: this writes nothing, and the
 * row stays open to be read again on the next run. Returns whether it closed.
 */
export async function closeUnclaimedInvoiceRow(db: Db, row: Pick<InvoiceOutboxRow, "id" | "items">, now: Date, reason: string): Promise<boolean> {
  const r = await db.notificationOutbox.updateMany({
    where: { id: row.id, sentAt: null, items: { equals: (row.items ?? []) as Prisma.InputJsonValue } },
    data: { sentAt: now, lastError: reason, openKey: null },
  });
  return r.count === 1;
}

export type InvoiceEmailPlan =
  | { kind: "send"; to: string; subject: string; text: string; html: string }
  /** Closed without sending, with the reason the row keeps. */
  | { kind: "skip"; reason: string }
  /** Not yet: the Undo window hasn't passed. */
  | { kind: "wait"; until: Date };

const STATE_REASON: Record<Exclude<JobEmailState, "on">, string> = { "no-login": "no login", "not-signed-in": "not signed in", off: "emails off" };

/**
 * What one invoice row sends now, read fresh (5.3): the drain calls it before the claim to close what can't go,
 * and again after the claim so what goes is what is true as it goes. No task read and no TaskAccess check: a Paid
 * email goes for an invoice with no job, or on a job that sits on a partner.
 */
export async function invoiceEmailFor(db: Db, row: InvoiceOutboxRow, ctx: { now: Date; appUrl: string }): Promise<InvoiceEmailPlan> {
  const items = rowItems(row.items);
  if (row.invoiceId) return paidPlan(db, row, items, ctx);
  if (row.recipientUserId) return reviewPlan(db, row.recipientUserId, items, ctx);
  return { kind: "skip", reason: "no recipient" };
}

async function paidPlan(db: Db, row: InvoiceOutboxRow, items: RowItem[], ctx: { now: Date; appUrl: string }): Promise<InvoiceEmailPlan> {
  const line = items.find((i) => i.kind === INVOICE_PAID_KIND);
  if (!row.recipientContactId || !line?.at) return { kind: "skip", reason: "no recipient" };
  const inv = await db.invoice.findUnique({
    where: { id: row.invoiceId! },
    select: { stage: true, contactId: true, paidAt: true, paidOn: true, payMethod: true, invoiceNumber: true, total: true },
  });
  if (!inv) return { kind: "skip", reason: "no invoice" };
  if (inv.stage !== "PAID" || !inv.paidAt || !inv.paidOn) return { kind: "skip", reason: "not paid" };
  if (inv.contactId !== row.recipientContactId) return { kind: "skip", reason: "not theirs" };
  // Undone and paid again: this row's payment is gone, and the newer one has a row of its own.
  if (inv.paidAt.toISOString() !== new Date(line.at).toISOString()) return { kind: "skip", reason: "paid again" };
  const settles = new Date(inv.paidAt.getTime() + PAID_SETTLE_MS);
  if (settles > ctx.now) return { kind: "wait", until: settles };
  const c = await db.contact.findUnique({
    where: { id: row.recipientContactId },
    select: { fullName: true, active: true, portalAccount: { select: { ...JOB_EMAIL_SELECT, email: true } } },
  });
  const state = jobEmailState(c?.portalAccount, c?.active ?? false);
  if (!c?.portalAccount || state !== "on") return { kind: "skip", reason: state === "on" ? "no login" : STATE_REASON[state] };
  const email = paidEmail({
    contactName: c.fullName,
    invoiceNumber: inv.invoiceNumber,
    totalCents: decimalToCents(inv.total),
    paidOn: toYmd(inv.paidOn)!,
    method: inv.payMethod,
    today: todayYmdEastern(ctx.now),
    appUrl: ctx.appUrl,
  });
  const rendered = renderPlainEmail({ line: email.line, items: email.items, buttonLabel: email.buttonLabel, buttonUrl: email.buttonUrl });
  return { kind: "send", to: c.portalAccount.email, subject: email.subject, ...rendered };
}

async function reviewPlan(db: Db, userId: string, items: RowItem[], ctx: { appUrl: string }): Promise<InvoiceEmailPlan> {
  const ids = [...new Set(items.filter((i) => i.kind === INVOICE_REVIEW_KIND && i.invoiceId).map((i) => i.invoiceId!))];
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user) return { kind: "skip", reason: "no recipient" };
  // Only what still waits in To review: an invoice approved, cleared or paid since says nothing (M12).
  const open =
    ids.length === 0
      ? []
      : await db.invoice.findMany({
          where: { id: { in: ids }, stage: "REVIEW" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { invoiceNumber: true, total: true, contact: { select: { fullName: true } }, inboundEmail: { select: { from: true } } },
        });
  if (open.length === 0) return { kind: "skip", reason: "nothing to send" };
  const lines: ReviewLine[] = open.map((inv) => ({
    contactName: inv.contact?.fullName ?? null,
    senderEmail: inv.inboundEmail ? fromAddress(inv.inboundEmail.from) || null : null,
    invoiceNumber: inv.invoiceNumber,
    totalCents: decimalToCents(inv.total),
  }));
  const email = reviewEmail({ recipientName: user.name, lines, appUrl: ctx.appUrl });
  const rendered = renderPlainEmail({ line: email.line, items: email.items, buttonLabel: email.buttonLabel, buttonUrl: email.buttonUrl });
  return { kind: "send", to: user.email, subject: email.subject, ...rendered };
}
