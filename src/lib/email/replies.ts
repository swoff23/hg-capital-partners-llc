import "server-only";
import type { TaskStatus } from "@prisma/client";
import { put } from "@vercel/blob";
import type { FileKind } from "@/lib/attachments/content-types";
import { taskUploadPath } from "@/lib/attachments/paths";
import { FieldError } from "@/lib/action-result";
import { BRAND } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { getEnv, type EmailEnv } from "@/lib/env";
import { invoiceAttachments, replyMakesInvoice } from "@/lib/invoices/inbound";
import { fileReplyInvoice } from "@/lib/invoices/inbox";
import { logError } from "@/lib/log";
import { firstName } from "@/lib/names";
import { jobSubject, jobWhere, openUrl, threadKey } from "@/lib/notifications/content";
import { jobLinkUrl } from "@/lib/portal/job-link-paths";
import { mintJobLink } from "@/lib/portal/job-links";
import { MAX_FILES_PER_POST, joinNames } from "@/lib/portal/job-view";
import { isActiveStatus } from "@/lib/task-scope";
import * as core from "@/lib/tasks/core";
import { renderPlainEmail } from "./render";
import {
  closedReplyItems,
  forwardFilesLine,
  forwardHeadline,
  forwardedFilesLine,
  fromAddress,
  htmlToText,
  isAutoReply,
  linkedFile,
  postedFilesLine,
  replyAddress,
  replyBody,
  replyToken,
  type CantPost,
} from "./inbound";
import { downloadAttachment, fetchReceivedAttachments, fetchReceivedEmail, recipientsOf, sortFile, type ReceivedAttachment, type ReceivedEmail } from "./received";
import { routeReply, type ReplyRoute } from "./reply-sender";
import { sendEmail } from "./send";

/**
 * Reply by email (docs/specs/contractor-job-emails.md, section 5): the
 * database half. A received email becomes a comment on its job, as the person
 * the email went to, with the files it carried. The webhook
 * (src/app/api/email/inbound) has already checked Resend's signature, and
 * reply-sender.ts has decided where the email goes.
 *
 * The rules, as Connor took them, with the emails redesign's fixes
 * (docs/specs/emails-redesign.md, section 7):
 *  1. A reply posts its words and files as a Shared comment; the usual emails
 *     go from there (a contractor's to both partners, a partner's to the
 *     contractor). Nothing comes back to the one who replied. A partner's
 *     reply about a contractor who has since left the job posts Internal.
 *  2. From another address: it still posts as the person the email went to,
 *     with "From mike@gmail.com" on its last line so everyone sees who sent it.
 *  3. A reply that can't post (the job closed, the contractor taken off it,
 *     their login off, or an old reply address), and a fresh email to the jobs
 *     address from a contractor's login, goes to both partners as an email,
 *     from "Zack Miller via HG Capital", with its files. With a job, it joins
 *     the job's thread ("Done: …" once closed, "Update: …" otherwise) and a
 *     partner's reply posts on the job; "Reply to answer Zack Miller." shows
 *     only where that reply would reach them. On a Done job, a PDF or a photo
 *     also makes a To review invoice linked to the job, from the contractor
 *     the reply went to, and the forward says so (contractor-invoices-plan.md
 *     4.2; src/lib/invoices/inbound.ts). A Canceled job's reply makes none.
 *  4. A file that didn't come through (over its size cap, past the 50 one post
 *     takes, or sent as an iCloud or Drive link): the rest posts, and one short
 *     email to the contractor's own login (never to an unproven sender: it
 *     carries a link that opens the job) says so in those words, and what to
 *     do. Files left out of a forward are said the same way.
 *  5. A reply never changes a job's status: "done" is only words.
 *  6. Quoted text, "Sent from my iPhone" and signatures are cut; out-of-office
 *     and other automatic replies, and replies with nothing in them, are dropped.
 *
 * Each email posts once: a webhook retried by Resend finds its own comment
 * (by the email's id) and stops before uploading anything again; a forward
 * and each note are sent under an idempotency key.
 */

/**
 * The most a forward attaches, in bytes. Resend takes 40MB an email after base64 (a third bigger), so the files stay
 * under about 30MB; the rest are left out and said so, rather than the send failing every retry.
 */
const FORWARD_ATTACH_MAX = 28 * 1024 * 1024;

export type ReplyOutcome =
  | { outcome: "posted"; taskId: string; files: number; skipped: number }
  | { outcome: "forwarded"; taskId: string | null; why: CantPost; invoiced?: true }
  | { outcome: "ignored"; reason: string };

/** Our own addresses, bare: a fresh email to one of these from a contractor reaches the partners. */
function jobsAddresses(config: EmailEnv): string[] {
  return [config.from, config.replyTo].filter((a): a is string => !!a).map(fromAddress);
}

type TaskFacts = { id: string; title: string; status: TaskStatus; unitLabel: string | null; property: { address: string } | null };

/**
 * A reply, read from Resend once by the router (src/lib/email/router.ts), which passes it in; read here when it
 * didn't.
 */
export async function handleReceivedEmail(emailId: string, received?: ReceivedEmail): Promise<ReplyOutcome> {
  const env = getEnv();
  const config = env.email;
  if (!config) return { outcome: "ignored", reason: "email off" };
  const email = received ?? (await fetchReceivedEmail(config, emailId));
  if (isAutoReply(email.headers ?? {}, email.subject)) return { outcome: "ignored", reason: "automatic reply" };
  const route = await routeReply(prisma, { ...email, from: email.from ?? "" }, jobsAddresses(config));
  if (route.route === "ignore") return { outcome: "ignored", reason: route.reason };

  const from = fromAddress(email.from ?? "");
  const written = replyBody(email.text?.trim() ? email.text : htmlToText(email.html ?? ""));
  const loginEmail = route.route === "post" ? route.loginEmail : route.from.loginEmail;
  const words = from && from !== loginEmail ? [written, `From ${from}`].filter(Boolean).join("\n\n") : written;
  const list = { data: await fetchReceivedAttachments(config, emailId) };
  const sorted = list.data.map((a) => ({ a, s: sortFile(a) }));
  const allowed = sorted.filter((x): x is { a: ReceivedAttachment; s: { kind: FileKind; type: string } } => !!x.s && "type" in x.s);
  const tooBig = sorted.flatMap((x) => (x.s && "tooBig" in x.s ? [x.s.tooBig] : []));

  const task = route.taskId
    ? await prisma.task.findUnique({ where: { id: route.taskId }, select: { id: true, title: true, status: true, unitLabel: true, property: { select: { address: true } } } })
    : null;
  if (route.taskId && !task) return { outcome: "ignored", reason: "no job" };

  if (route.route === "forward") return forwardReply({ emailId, config, route, task, words, written, subject: email.subject, allowed, tooBig, email, attachments: list.data });
  if (!task) return { outcome: "ignored", reason: "no job" };
  return postReply({ emailId, config, route, task, words, written, allowed, tooBig, total: list.data.length, email, attachments: list.data });
}

// ---------------------------------------------------------------------------
// A reply that posts
// ---------------------------------------------------------------------------

async function postReply(input: {
  emailId: string;
  config: EmailEnv;
  route: Extract<ReplyRoute, { route: "post" }>;
  task: TaskFacts;
  words: string;
  written: string;
  allowed: { a: ReceivedAttachment; s: { kind: FileKind; type: string } }[];
  tooBig: FileKind[];
  total: number;
  email: ReceivedEmail;
  attachments: ReceivedAttachment[];
}): Promise<ReplyOutcome> {
  const env = getEnv();
  const { emailId, route, task, words, written, tooBig } = input;
  const { taskId, p, visibility } = route;
  const clientId = `email-${emailId}`.slice(0, 64);
  const where = jobWhere(task.property?.address ?? null, task.unitLabel);

  // Resend retried a webhook this already posted.
  const posted = await prisma.taskEvent.findFirst({ where: { taskId, kind: "COMMENT", data: { path: ["clientId"], equals: clientId } }, select: { id: true } });
  if (posted) return { outcome: "ignored", reason: "already posted" };

  // As many as one post from the job page takes (MAX_FILES_PER_POST); the rest are left out, as a portal post refuses them.
  const files = input.allowed.slice(0, MAX_FILES_PER_POST);
  const tooMany = input.allowed.length > files.length;
  // Rule 6: nothing written and nothing attached (a "From x" line alone is not a reply). Only files too big to post is
  // still worth the note, so the contractor knows to add them on the job.
  if (!written && files.length === 0) {
    const line = p.kind === "contractor" ? postedFilesLine({ tooBig, tooMany: false, max: MAX_FILES_PER_POST, linked: null, posted: false }) : null;
    if (line && p.kind === "contractor") await tellFiles(env.appUrl, { emailId, taskId, contactId: p.contactId, to: route.loginEmail, title: task.title, where, line });
    return { outcome: "ignored", reason: line ? "only files too big" : "empty" };
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
  let postedNow: boolean;
  try {
    // Several round trips a file, so more room than the 5-second default, as tasks/bulk.ts gives its batches.
    postedNow = await prisma.$transaction(
      async (tx) => {
        await core.lockTask(tx, taskId);
        const already = await tx.taskEvent.findFirst({ where: { taskId, kind: "COMMENT", data: { path: ["clientId"], equals: clientId } }, select: { id: true } });
        if (already) return false;
        const attachmentIds: string[] = [];
        for (const meta of uploaded) attachmentIds.push((await core.recordAttachment(tx, taskId, meta, p, { visibility, standalone: false })).id);
        // Rule 1 (and 5: the words never change the job's status).
        await core.addComment(tx, taskId, { body: words, visibility, attachmentIds, clientId }, p);
        return true;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (err) {
    // The job closed, or the contractor lost it, between the routing and the post: route it again, and a reply that
    // can't post now goes to the partners instead of failing every retry.
    if (!(err instanceof core.TaskRuleError)) throw err;
    if (p.kind !== "contractor") return { outcome: "ignored", reason: "can't post" };
    const again = await routeReply(prisma, { ...input.email, from: input.email.from ?? "" }, jobsAddresses(input.config));
    if (again.route !== "forward") throw err;
    return forwardReply({ emailId, config: input.config, route: again, task, words, written, subject: input.email.subject, allowed: input.allowed, tooBig, email: input.email, attachments: input.attachments });
  }
  if (!postedNow) return { outcome: "ignored", reason: "already posted" };

  // Rule 4: one short email back about the files that didn't come through, to their own login only: the note carries
  // a link that opens the job, and a reply's From isn't proof of anyone.
  const line = postedFilesLine({ tooBig, tooMany, max: MAX_FILES_PER_POST, linked: linkedFile(written) });
  if (line && p.kind === "contractor") await tellFiles(env.appUrl, { emailId, taskId, contactId: p.contactId, to: route.loginEmail, title: task.title, where, line });
  return { outcome: "posted", taskId, files: uploaded.length, skipped: input.total - uploaded.length };
}

/** The note about files that didn't post, with Add photos through a fresh job link, in the job's thread. */
async function tellFiles(appUrl: string, input: { emailId: string; taskId: string; contactId: string; to: string; title: string; where: string; line: string }): Promise<void> {
  const token = await mintJobLink(prisma, { taskId: input.taskId, kind: "EMAIL", contactId: input.contactId });
  const rendered = renderPlainEmail({ line: input.line, buttonLabel: "Add photos", buttonUrl: jobLinkUrl(appUrl, token, "photos") });
  const res = await sendEmail({
    to: input.to,
    // Names the job, so a contractor with several knows which one (docs/specs/contractor-job-emails.md 2.1).
    subject: jobSubject({ word: "Some files didn't post", title: input.title, where: input.where }),
    text: rendered.text,
    html: rendered.html,
    threadKey: threadKey(input.taskId),
    fromName: BRAND.app,
    idempotencyKey: `reply-too-big/${input.emailId}`,
  });
  if (!res.ok && res.status !== 409) logError("email:reply-too-big", new Error(res.error ?? "send failed"), { taskId: input.taskId });
}

// ---------------------------------------------------------------------------
// A reply that goes to the partners instead
// ---------------------------------------------------------------------------

/**
 * A partner's reply address for this job that names the contractor the email is about, so the partner's answer posts
 * on the job, and posts Internal once that contractor has left it (reply-sender.ts partnerRoute).
 */
function partnerReplyLink(taskId: string, userId: string, contactId: string): Promise<string> {
  return mintJobLink(prisma, { taskId, kind: "REPLY", userId, contactId });
}

/** One line, at most 150 characters: a sender's subject read back into ours. */
const subjectLine = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 150);

async function forwardReply(input: {
  emailId: string;
  config: EmailEnv;
  route: Extract<ReplyRoute, { route: "forward" }>;
  task: TaskFacts | null;
  words: string;
  written: string;
  subject: string | null;
  allowed: { a: ReceivedAttachment; s: { kind: FileKind; type: string } }[];
  tooBig: FileKind[];
  email: ReceivedEmail;
  attachments: ReceivedAttachment[];
}): Promise<ReplyOutcome> {
  const { emailId, config, route, task, words } = input;
  const appUrl = getEnv().appUrl.replace(/\/+$/, "");
  const name = route.from.fullName;
  const where = task ? jobWhere(task.property?.address ?? null, task.unitLabel) : "";

  // Its files ride along as attachments, as many as one post takes and as fit in one email; the rest are said.
  const attach: ReceivedAttachment[] = [];
  const dropped: FileKind[] = [...input.tooBig];
  let bytes = 0;
  for (const { a, s } of input.allowed) {
    if (attach.length < MAX_FILES_PER_POST && bytes + a.size <= FORWARD_ATTACH_MAX) {
      attach.push(a);
      bytes += a.size;
    } else dropped.push(s.kind);
  }

  const partners = await prisma.user.findMany({ where: { passwordHash: { not: null } }, select: { id: true, name: true, email: true }, orderBy: { id: "asc" } });
  const partnerNames = joinNames(partners.map((u) => firstName(u.name ?? "") || u.name || u.email));
  const fresh = subjectLine(input.subject);

  // On a Done job, a bill attached also lands in Invoices to review, before the forward that says so. Once per email:
  // a retry finds the invoice its first delivery made, and the forward's keys send it once.
  const bill = task && route.why === "closed" ? invoiceAttachments(input.attachments) : [];
  let invoiced = false;
  let invoiceFailed: unknown = null;
  if (task && route.why === "closed" && replyMakesInvoice(task.status, bill)) {
    try {
      await fileReplyInvoice(config, {
        email: input.email,
        localPart: replyToken(recipientsOf(input.email)) ? "r" : "jobs",
        taskId: task.id,
        files: bill,
        by: { kind: "contractor", contactId: route.from.contactId, label: name },
      });
      invoiced = true;
    } catch (err) {
      // The forward never waits on the invoice: it goes now, without the line, whatever went wrong. A rule's refusal
      // (the job was canceled a moment ago, say) ends there, since no retry would change it. Anything else (Blob or
      // the database down) fails the webhook after the forward, so Resend delivers it again for the invoice; the
      // forward's idempotency keys keep the partners from getting it twice.
      logError("email:reply-invoice", err, { taskId: task.id });
      if (!(err instanceof FieldError)) invoiceFailed = err;
    }
  }

  if (input.written || attach.length > 0) {
    const subject = task
      ? jobSubject({ word: isActiveStatus(task.status) ? "Update" : "Done", title: task.title, where })
      : fresh || `${name} wrote to ${BRAND.app}`;
    const rendered = renderPlainEmail({
      line: forwardHeadline(name, route.why),
      // The job, named, then their words, then "Added to Invoices to review" when the reply made an invoice.
      items: [task ? [task.title, where].filter(Boolean).join(", ") : "", ...closedReplyItems(words, invoiced)].filter(Boolean),
      closing: forwardFilesLine(attach.length, dropped.length) ?? undefined,
      buttonLabel: task ? "Open task" : "Open contractor",
      buttonUrl: task ? `${appUrl}/tasks/${task.id}` : `${appUrl}/contractors/${route.from.contactId}`,
      footnote: route.from.reachable ? `Reply to answer ${name}.` : undefined,
    });
    let failed = 0;
    for (const partner of partners) {
      // With a job, a partner's reply posts on it as them (Internal if Zack has left it); with none, it goes straight to
      // the contractor's address, which their domain vouched for.
      const replyTo = task ? replyAddress(await partnerReplyLink(task.id, partner.id, route.from.contactId), config.from) : (route.from.loginEmail ?? undefined);
      const res = await sendEmail({
        to: partner.email,
        subject,
        text: rendered.text,
        html: rendered.html,
        attachments: attach.map((f) => ({ filename: f.filename ?? "file", path: f.download_url })),
        ...(task ? { threadKey: threadKey(task.id) } : {}),
        fromName: `${name} via ${BRAND.app}`,
        ...(replyTo ? { replyTo } : {}),
        // Once per email and partner: a redelivered webhook re-runs this, and Resend sends a repeated key only once.
        idempotencyKey: `reply-forward/${emailId}/${partner.id}`,
      });
      // 409 on a keyed send: Resend already has this key (sent, or sending now). A retry's body differs, since the
      // attachments' download links are re-signed and the reply address is new each time, so Resend refuses it
      // rather than sending it twice.
      if (!res.ok && res.status !== 409) {
        failed++;
        logError("email:reply-forward", new Error(res.error ?? "send failed"), { taskId: task?.id ?? null });
      }
    }
    // Anyone missed it: fail, so the webhook answers 500 and Resend delivers the reply again. The idempotency keys keep
    // the partners who already have it from getting it twice.
    if (failed > 0) throw new Error(`A reply that couldn't post didn't reach ${failed} of ${partners.length} partners`);
  }

  // Files left out, said to the sender's own login while they can still open the job (closed, or an old address) or
  // the portal (a fresh email). Someone taken off the job, or with their login off, has nowhere to add them.
  const line = forwardedFilesLine(partnerNames || BRAND.app, dropped);
  const tell = route.why === "closed" || route.why === "old-link" || route.why === "no-job";
  if (line && tell && route.from.loginEmail) {
    const rendered = renderPlainEmail({
      line,
      buttonLabel: task ? "Open job" : "Open jobs",
      buttonUrl: task ? openUrl(appUrl, "contractor", task.id) : `${appUrl}/p`,
    });
    const res = await sendEmail({
      to: route.from.loginEmail,
      subject: task ? jobSubject({ word: "Some files didn't send", title: task.title, where }) : fresh ? `Some files didn't send: ${fresh}` : "Some files didn't send",
      text: rendered.text,
      html: rendered.html,
      ...(task ? { threadKey: threadKey(task.id) } : {}),
      fromName: BRAND.app,
      idempotencyKey: `reply-forward-note/${emailId}`,
    });
    if (!res.ok && res.status !== 409) logError("email:reply-forward-note", new Error(res.error ?? "send failed"), { taskId: task?.id ?? null });
  }
  if (invoiceFailed) throw invoiceFailed;
  // Why it couldn't post rides along: the router sends an off-task or no-job forward on to invoices@ too (inboxes.ts).
  const forwarded = { outcome: "forwarded", taskId: task?.id ?? null, why: route.why } as const;
  if (!input.written && attach.length === 0) return invoiced ? { ...forwarded, invoiced: true } : { outcome: "ignored", reason: line ? "only files too big" : "empty" };
  return invoiced ? { ...forwarded, invoiced: true } : forwarded;
}
