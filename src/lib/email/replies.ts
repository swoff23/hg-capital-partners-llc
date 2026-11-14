import "server-only";
import { put } from "@vercel/blob";
import { UPLOAD_RULES, fileKindForType, uploadContentType, type FileKind } from "@/lib/attachments/content-types";
import { taskUploadPath } from "@/lib/attachments/paths";
import { prisma } from "@/lib/db";
import { MAX_FILES_PER_POST } from "@/lib/portal/job-view";
import { escapeLike } from "@/lib/search";
import { getEnv, type EmailEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { jobLinkUrl } from "@/lib/portal/job-link-paths";
import { mintJobLink, resolveJobLink } from "@/lib/portal/job-links";
import { isActiveStatus } from "@/lib/task-scope";
import * as core from "@/lib/tasks/core";
import { renderPlainEmail } from "./render";
import { fromAddress, htmlToText, isAutoReply, replyBody, replyToken, singleAddress, threadTaskId } from "./inbound";
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
 *     partners as an email with its files.
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

const RESEND_API = "https://api.resend.com";

/** An inline picture under this size is a signature's logo, not a photo of the job. */
const SIGNATURE_IMAGE_MAX = 30_000;

/** Links a phone puts in place of a file too big to attach: iCloud Mail Drop and Google Drive. */
const LINKED_FILE = /https:\/\/(?:www\.icloud\.com\/attachment\/|drive\.google\.com\/(?:file|open))/i;

interface ReceivedEmail {
  id: string;
  from: string;
  to: string[] | null;
  cc: string[] | null;
  received_for: string[] | null;
  subject: string | null;
  text: string | null;
  html: string | null;
  headers: Record<string, string> | null;
  /** Resend's checks of the sender: "pass", "fail", "gray", "processing_failed" or "unknown". Null on old emails. */
  authentication: { spf?: string; dkim?: string; dmarc?: string } | null;
}

interface ReceivedAttachment {
  id: string;
  filename: string | null;
  size: number;
  content_type: string | null;
  content_disposition: string | null;
  content_id: string | null;
  download_url: string;
}

export type ReplyOutcome =
  | { outcome: "posted"; taskId: string; files: number; skipped: number }
  | { outcome: "forwarded"; taskId: string }
  | { outcome: "ignored"; reason: string };

async function resendGet<T>(config: EmailEnv, path: string): Promise<T> {
  const res = await fetch(`${RESEND_API}${path}`, { headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Resend ${res.status} on ${path}`);
  return (await res.json()) as T;
}

const bare = fromAddress;

/** Who a reply posts as: the person its email went to, by its reply address, or (sent to plain jobs@) by the sender. */
async function replier(email: ReceivedEmail, from: string): Promise<{ taskId: string; p: core.Principal; loginEmail: string } | null> {
  const token = replyToken([...(email.to ?? []), ...(email.received_for ?? []), ...(email.cc ?? [])]);
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

/** What a file is, and whether it may post: photos, videos and documents, within each kind's size cap. */
function sortFile(a: ReceivedAttachment): { kind: FileKind; type: string } | { tooBig: true } | null {
  // The name's extension when the mail app sent a generic type (application/octet-stream, image/jpg), as uploads do.
  const type = uploadContentType(a.filename ?? "", a.content_type) ?? "";
  const kind = fileKindForType(type);
  if (!kind) return null;
  const rule = UPLOAD_RULES[kind];
  if (!rule.contentTypes.includes(type)) return null;
  if (a.content_disposition === "inline" && a.content_id && kind === "image" && a.size < SIGNATURE_IMAGE_MAX) return null;
  if (a.size > rule.maxBytes) return { tooBig: true };
  return { kind, type };
}

export async function handleReceivedEmail(emailId: string): Promise<ReplyOutcome> {
  const env = getEnv();
  const config = env.email;
  if (!config) return { outcome: "ignored", reason: "email off" };
  const email = await resendGet<ReceivedEmail>(config, `/emails/receiving/${encodeURIComponent(emailId)}`);
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
  const list = await resendGet<{ data: ReceivedAttachment[] }>(config, `/emails/receiving/${encodeURIComponent(emailId)}/attachments?limit=100`);
  const sorted = list.data.map((a) => ({ a, s: sortFile(a) }));
  // As many as one post from the job page takes (MAX_FILES_PER_POST); the rest are left out, as a portal post refuses them.
  const allowed = sorted.filter((x): x is { a: ReceivedAttachment; s: { kind: FileKind; type: string } } => !!x.s && !("tooBig" in x.s));
  const files = allowed.slice(0, MAX_FILES_PER_POST);
  const tooMany = allowed.length > files.length;
  const tooBig = sorted.some((x) => x.s && "tooBig" in x.s) || LINKED_FILE.test(written);
  // Rule 6: nothing written and nothing attached (a "From x" line alone is not a reply).
  if (!written && files.length === 0) return { outcome: "ignored", reason: "empty" };

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { title: true, status: true } });
  if (!task) return { outcome: "ignored", reason: "no job" };
  if (p.kind === "contractor") {
    try {
      await core.assertContractorAccess(prisma, taskId, p);
    } catch {
      return { outcome: "ignored", reason: "no access" };
    }
    // Rule 3: a closed job is read-only, so the reply reaches the partners as an email instead.
    if (!isActiveStatus(task.status)) {
      await forwardToPartners({ emailId, taskId, title: task.title, who: p.label, words, files: files.map((f) => f.a) });
      return { outcome: "forwarded", taskId };
    }
  }

  const token = env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is unset: a reply's files have nowhere to go");
  // The files go up first (no lock held while they download), then one transaction under the job's lock records them
  // and posts the comment, checking inside it that this email hasn't posted: a retry or a second delivery running
  // alongside this one posts nothing twice. Its blobs, if it lost the race, are only unreferenced copies.
  const uploaded: core.AttachmentMeta[] = [];
  for (const { a, s: sorted } of files) {
    const res = await fetch(a.download_url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Couldn't download ${a.filename ?? a.id}: ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
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
      line: tooMany
        ? `Only ${MAX_FILES_PER_POST} photos fit in one reply. Add the rest on the job.`
        : "Your video was too big for email. Add it on the job.",
    });
  }
  return { outcome: "posted", taskId, files: uploaded.length, skipped: list.data.length - uploaded.length };
}

/** A reply on a closed job, to both partners, with its files attached by Resend from their download links. */
async function forwardToPartners(
  input: { emailId: string; taskId: string; title: string; who: string; words: string; files: ReceivedAttachment[] },
): Promise<void> {
  const partners = await prisma.user.findMany({ where: { passwordHash: { not: null } }, select: { id: true, email: true }, orderBy: { id: "asc" } });
  const first = input.who.split(/\s+/)[0] || input.who;
  const url = `${getEnv().appUrl}/tasks/${input.taskId}`;
  const rendered = renderPlainEmail({
    line: `${first} replied on a closed job: ${input.title}`,
    items: input.words ? [input.words] : [],
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
async function tellTooBig(appUrl: string, input: { emailId: string; taskId: string; contactId: string; to: string; line: string }): Promise<void> {
  const token = await mintJobLink(prisma, { taskId: input.taskId, kind: "EMAIL", contactId: input.contactId });
  const rendered = renderPlainEmail({
    line: input.line,
    buttonLabel: "Add photos",
    buttonUrl: jobLinkUrl(appUrl, token, "photos"),
  });
  const res = await sendEmail({
    to: input.to,
    subject: input.line.startsWith("Only") ? "Some of your photos didn't come through" : "Your video didn't come through",
    text: rendered.text,
    html: rendered.html,
    idempotencyKey: `reply-too-big/${input.emailId}`,
  });
  if (!res.ok && res.status !== 409) logError("email:reply-too-big", new Error(res.error ?? "send failed"), { taskId: input.taskId });
}
