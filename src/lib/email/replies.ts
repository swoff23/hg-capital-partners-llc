import "server-only";
import { put } from "@vercel/blob";
import type { FileKind } from "@/lib/attachments/content-types";
import { taskUploadPath } from "@/lib/attachments/paths";
import { FieldError } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { MAX_FILES_PER_POST } from "@/lib/portal/job-view";
import { escapeLike } from "@/lib/search";
import { getEnv } from "@/lib/env";
import { replyMakesInvoice, invoiceAttachments } from "@/lib/invoices/inbound";
import { fileReplyInvoice } from "@/lib/invoices/inbox";
import { logError } from "@/lib/log";
import { jobLinkUrl } from "@/lib/portal/job-link-paths";
import { mintJobLink, resolveJobLink } from "@/lib/portal/job-links";
import { jobSubject, jobWhere } from "@/lib/notifications/content";
import { isActiveStatus } from "@/lib/task-scope";
import * as core from "@/lib/tasks/core";
import { renderPlainEmail } from "./render";
import { closedReplyItems, fromAddress, htmlToText, isAutoReply, replyBody, replyToken, singleAddress, threadTaskId } from "./inbound";
import { downloadAttachment, fetchReceivedAttachments, fetchReceivedEmail, recipientsOf, sortFile, type ReceivedAttachment, type ReceivedEmail } from "./received";
import { sendEmail } from "./send";

/**
 * Reply by email (docs/specs/contractor-job-emails.md, section 5): the
 * database half. A received email becomes a comment on its job, as the person
 * the email went to, with the files it carried. The webhook
 * (src/app/api/email/inbound) has already checked Resend's signature.
 *
 * The six rules, as Connor took them:
 *  1. A reply posts its words and files as a Shared comment; the usual emails
 *     go from there (a contractor's to both partners, a partner's to the
 *     contractor). Nothing comes back to the one who replied.
 *  2. From another address: it still posts as the person the email went to,
 *     with "From mike@gmail.com" on its last line so everyone sees who sent it.
 *  3. On a closed job: not posted (closed jobs are read-only); it goes to both
 *     partners as an email with its files. On a Done job, a PDF or a photo
 *     also makes a To review invoice linked to the job, from the contractor
 *     the reply went to, and the forward says so (contractor-invoices-plan.md
 *     4.2; src/lib/invoices/inbound.ts). A Canceled job's reply makes none.
 *  4. A video too big for email (left out, or sent as an iCloud or Drive
 *     link): the rest posts, and one short email to the contractor's own
 *     login (never to an unproven sender: it carries a link that opens the
 *     job) says to add it on the job.
 *  5. A reply never changes a job's status: "done" is only words.
 *  6. Quoted text, "Sent from my iPhone" and signatures are cut; out-of-office
 *     and other automatic replies, and replies with nothing in them, are dropped.
 *
 * Each email posts once: a webhook retried by Resend finds its own comment
 * (by the email's id) and stops before uploading anything again.
 */

/** Links a phone puts in place of a file too big to attach: iCloud Mail Drop and Google Drive. */
const LINKED_FILE = /https:\/\/(?:www\.icloud\.com\/attachment\/|drive\.google\.com\/(?:file|open))/i;

export type ReplyOutcome =
  | { outcome: "posted"; taskId: string; files: number; skipped: number }
  | { outcome: "forwarded"; taskId: string; invoiced?: true }
  | { outcome: "ignored"; reason: string };

const bare = fromAddress;

/** Who a reply posts as: the person its email went to, by its reply address, or (sent to plain jobs@) by the sender. */
async function replier(email: ReceivedEmail, from: string): Promise<{ taskId: string; p: core.Principal; loginEmail: string } | null> {
  const token = replyToken(recipientsOf(email));
  if (token) {
    const link = await resolveJobLink(token);
    if (!link || link.kind !== "REPLY") return null;
    return principalFor(link.taskId, { contactId: link.contactId, userId: link.userId });
  }
  // A mail app that ignored Reply-To: the thread names the job, and the sender must be its contractor or a partner.
  // A From line and a References header are easy to forge, so this way in needs the sender's domain to vouch for the
  // From (DMARC pass). The r+ address above needs no such check: its token is the secret.
  if (email.authentication?.dmarc !== "pass") return null;
  // One address in the From line, or no way in: a display name that holds another address is a disguise.
  if (!singleAddress(email.from)) return null;
  const headers = email.headers ?? {};
  const taskId = threadTaskId(`${headers["references"] ?? ""} ${headers["in-reply-to"] ?? ""}`);
  if (!taskId) return null;
  // Exact, case-insensitive: Prisma's insensitive equals is an ILIKE, so `_` and `%` in an address are escaped, or
  // za_k@outlook.com would match zack@outlook.com.
  const exactly = { equals: escapeLike(from), mode: "insensitive" as const };
  const user = await prisma.user.findFirst({ where: { email: exactly, passwordHash: { not: null } }, select: { id: true } });
  if (user) return principalFor(taskId, { userId: user.id, contactId: null });
  const account = await prisma.portalAccount.findFirst({ where: { email: exactly }, select: { contactId: true } });
  return account ? principalFor(taskId, { contactId: account.contactId, userId: null }) : null;
}

async function principalFor(
  taskId: string,
  who: { contactId: string | null; userId: string | null },
): Promise<{ taskId: string; p: core.Principal; loginEmail: string } | null> {
  if (who.userId) {
    const user = await prisma.user.findUnique({ where: { id: who.userId }, select: { id: true, name: true, email: true } });
    return user ? { taskId, p: { kind: "staff", userId: user.id, label: user.name ?? user.email }, loginEmail: user.email.toLowerCase() } : null;
  }
  if (!who.contactId) return null;
  const contact = await prisma.contact.findUnique({ where: { id: who.contactId }, select: { id: true, fullName: true, portalAccount: { select: { email: true } } } });
  if (!contact?.portalAccount) return null;
  return { taskId, p: { kind: "contractor", contactId: contact.id, label: contact.fullName, onlyTaskId: taskId }, loginEmail: contact.portalAccount.email.toLowerCase() };
}

/**
 * A reply, read from Resend once by the router (src/lib/email/router.ts), which passes it in; read here when it
 * didn't.
 */
export async function handleReceivedEmail(emailId: string, received?: ReceivedEmail): Promise<ReplyOutcome> {
  const env = getEnv();
  const config = env.email;
  if (!config) return { outcome: "ignored", reason: "email off" };
  const email = received ?? (await fetchReceivedEmail(config, emailId));
  const from = bare(email.from ?? "");
  if (isAutoReply(email.headers ?? {}, email.subject)) return { outcome: "ignored", reason: "automatic reply" };
  const who = await replier(email, from);
  if (!who) return { outcome: "ignored", reason: "no job" };
  const { taskId, p } = who;
  const clientId = `email-${emailId}`.slice(0, 64);

  // Resend retried a webhook this already posted.
  const posted = await prisma.taskEvent.findFirst({ where: { taskId, kind: "COMMENT", data: { path: ["clientId"], equals: clientId } }, select: { id: true } });
  if (posted) return { outcome: "ignored", reason: "already posted" };

  const written = replyBody(email.text?.trim() ? email.text : htmlToText(email.html ?? ""));
  const words = from && from !== who.loginEmail ? [written, `From ${from}`].filter(Boolean).join("\n\n") : written;
  const list = { data: await fetchReceivedAttachments(config, emailId) };
  const sorted = list.data.map((a) => ({ a, s: sortFile(a) }));
  // As many as one post from the job page takes (MAX_FILES_PER_POST); the rest are left out, as a portal post refuses them.
  const allowed = sorted.filter((x): x is { a: ReceivedAttachment; s: { kind: FileKind; type: string } } => !!x.s && !("tooBig" in x.s));
  const files = allowed.slice(0, MAX_FILES_PER_POST);
  const tooMany = allowed.length > files.length;
  const tooBig = sorted.some((x) => x.s && "tooBig" in x.s) || LINKED_FILE.test(written);
  // Rule 6: nothing written and nothing attached (a "From x" line alone is not a reply).
  if (!written && files.length === 0) return { outcome: "ignored", reason: "empty" };

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { title: true, status: true, unitLabel: true, property: { select: { address: true } } } });
  if (!task) return { outcome: "ignored", reason: "no job" };
  if (p.kind === "contractor") {
    try {
      await core.assertContractorAccess(prisma, taskId, p);
    } catch {
      return { outcome: "ignored", reason: "no access" };
    }
    // Rule 3: a closed job is read-only, so the reply reaches the partners as an email instead.
    if (!isActiveStatus(task.status)) {
      // On a Done job, a bill attached also lands in Invoices to review, before the forward that says so. Once per
      // email: a retry finds the invoice its first delivery made, and the forward's keys send it once.
      const bill = invoiceAttachments(list.data);
      let invoiced = false;
      let invoiceFailed: unknown = null;
      if (replyMakesInvoice(task.status, bill)) {
        try {
          await fileReplyInvoice(config, {
            email,
            localPart: replyToken(recipientsOf(email)) ? "r" : "jobs",
            taskId,
            files: bill,
            by: { kind: "contractor", contactId: p.contactId, label: p.label },
          });
          invoiced = true;
        } catch (err) {
          // The forward never waits on the invoice: it goes now, without the line, whatever went wrong. A rule's
          // refusal (the job was canceled a moment ago, say) ends there, since no retry would change it. Anything else
          // (Blob or the database down) fails the webhook after the forward, so Resend delivers it again for the
          // invoice; the forward's idempotency keys keep the partners from getting it twice.
          logError("email:reply-invoice", err, { taskId });
          if (!(err instanceof FieldError)) invoiceFailed = err;
        }
      }
      await forwardToPartners({ emailId, taskId, title: task.title, who: p.label, words, files: files.map((f) => f.a), invoiced });
      if (invoiceFailed) throw invoiceFailed;
      return invoiced ? { outcome: "forwarded", taskId, invoiced: true } : { outcome: "forwarded", taskId };
    }
  }

  const token = env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is unset: a reply's files have nowhere to go");
  // The files go up first (no lock held while they download), then one transaction under the job's lock records them
  // and posts the comment, checking inside it that this email hasn't posted: a retry or a second delivery running
  // alongside this one posts nothing twice. Its blobs, if it lost the race, are only unreferenced copies.
  const uploaded: core.AttachmentMeta[] = [];
  for (const { a, s: sorted } of files) {
    const bytes = await downloadAttachment(a);
    const filename = a.filename?.trim() || `email-${a.id}`;
    const blob = await put(taskUploadPath(taskId, filename, "orig", sorted.type), bytes, { access: "private", token, contentType: sorted.type, addRandomSuffix: true });
    uploaded.push({ url: blob.url, pathname: blob.pathname, filename, size: bytes.length, contentType: sorted.type });
  }
  // Several round trips a file, so more room than the 5-second default, as tasks/bulk.ts gives its batches.
  const postedNow = await prisma.$transaction(async (tx) => {
    await core.lockTask(tx, taskId);
    const already = await tx.taskEvent.findFirst({ where: { taskId, kind: "COMMENT", data: { path: ["clientId"], equals: clientId } }, select: { id: true } });
    if (already) return false;
    const attachmentIds: string[] = [];
    for (const meta of uploaded) attachmentIds.push((await core.recordAttachment(tx, taskId, meta, p, { visibility: "SHARED", standalone: false })).id);
    // Rule 1 (and 5: the words never change the job's status).
    await core.addComment(tx, taskId, { body: words, visibility: "SHARED", attachmentIds, clientId }, p);
    return true;
  }, { timeout: 30_000, maxWait: 10_000 });
  if (!postedNow) return { outcome: "ignored", reason: "already posted" };

  // Rule 4: one short email back about the file that didn't come through.
  // To their own login only: the note carries a link that opens the job, and a reply's From isn't proof of anyone.
  if ((tooBig || tooMany) && p.kind === "contractor") {
    await tellTooBig(env.appUrl, {
      emailId,
      taskId,
      contactId: p.contactId,
      to: who.loginEmail,
      // Names the job, so a contractor with several knows which one (docs/specs/contractor-job-emails.md 2.1).
      subject: jobSubject({ word: "Error", title: task.title, where: jobWhere(task.property?.address ?? null, task.unitLabel) }),
      line: tooMany
        ? `Only ${MAX_FILES_PER_POST} photos fit in one reply. Add the rest on the job.`
        : "Your video was too big for email. Add it on the job.",
    });
  }
  return { outcome: "posted", taskId, files: uploaded.length, skipped: list.data.length - uploaded.length };
}

/** A reply on a closed job, to both partners, with its files attached by Resend from their download links. */
async function forwardToPartners(
  input: { emailId: string; taskId: string; title: string; who: string; words: string; files: ReceivedAttachment[]; invoiced?: boolean },
): Promise<void> {
  const partners = await prisma.user.findMany({ where: { passwordHash: { not: null } }, select: { id: true, email: true }, orderBy: { id: "asc" } });
  const first = input.who.split(/\s+/)[0] || input.who;
  const url = `${getEnv().appUrl}/tasks/${input.taskId}`;
  const rendered = renderPlainEmail({
    line: `${first} replied on a closed job: ${input.title}`,
    items: closedReplyItems(input.words, !!input.invoiced),
    buttonLabel: "Open task",
    buttonUrl: url,
    footnote: input.files.length ? `${input.files.length === 1 ? "Their file is" : `Their ${input.files.length} files are`} attached.` : undefined,
  });
  let failed = 0;
  for (const partner of partners) {
    const res = await sendEmail({
      to: partner.email,
      subject: `${first} replied on a closed job: ${input.title}`,
      text: rendered.text,
      html: rendered.html,
      attachments: input.files.map((f) => ({ filename: f.filename ?? "file", path: f.download_url })),
      // Once per email and partner: a redelivered webhook re-runs this, and Resend sends a repeated key only once.
      idempotencyKey: `reply-forward/${input.emailId}/${partner.id}`,
    });
    // 409 on a keyed send: Resend already has this key (sent, or sending now). A retry's body differs, since the
    // attachments' download links are re-signed each time, so Resend refuses it rather than sending it twice.
    if (!res.ok && res.status !== 409) {
      failed++;
      logError("email:reply-forward", new Error(res.error ?? "send failed"), { taskId: input.taskId });
    }
  }
  // Anyone missed it: fail, so the webhook answers 500 and Resend delivers the reply again. The idempotency keys keep
  // the partners who already have it from getting it twice.
  if (failed > 0) throw new Error(`The reply on a closed job didn't reach ${failed} of ${partners.length} partners`);
}

/** A file that didn't come through (too big, sent as a link, or past the 50 a post takes), with Add photos through a fresh job link. */
async function tellTooBig(appUrl: string, input: { emailId: string; taskId: string; contactId: string; to: string; subject: string; line: string }): Promise<void> {
  const token = await mintJobLink(prisma, { taskId: input.taskId, kind: "EMAIL", contactId: input.contactId });
  const rendered = renderPlainEmail({
    line: input.line,
    buttonLabel: "Add photos",
    buttonUrl: jobLinkUrl(appUrl, token, "photos"),
  });
  const res = await sendEmail({
    to: input.to,
    subject: input.subject,
    text: rendered.text,
    html: rendered.html,
    idempotencyKey: `reply-too-big/${input.emailId}`,
  });
  if (!res.ok && res.status !== 409) logError("email:reply-too-big", new Error(res.error ?? "send failed"), { taskId: input.taskId });
}
