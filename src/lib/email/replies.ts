import "server-only";
import type { TaskStatus } from "@prisma/client";
import { put } from "@vercel/blob";
import { UPLOAD_RULES, fileKindForType, uploadContentType, type FileKind } from "@/lib/attachments/content-types";
import { taskUploadPath } from "@/lib/attachments/paths";
import { BRAND } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { getEnv, type EmailEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { firstName } from "@/lib/names";
import { jobSubject, jobWhere, openUrl, threadKey } from "@/lib/notifications/content";
import { jobLinkUrl } from "@/lib/portal/job-link-paths";
import { mintJobLink } from "@/lib/portal/job-links";
import { MAX_FILES_PER_POST, joinNames } from "@/lib/portal/job-view";
import { isActiveStatus } from "@/lib/task-scope";
import { ResidentRequestError, addResidentUpdate, postedByEmail, type ResidentFile } from "@/lib/residents/additions";
import { FILES_PER_SEND, NOTE_MAX } from "@/lib/residents/requests";
import * as core from "@/lib/tasks/core";
import { renderPlainEmail } from "./render";
import {
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
  residentForwardHeadline,
  residentReplyWords,
  type OurAddresses,
  type ResidentForward,
} from "./inbound";
import { routeReply, type ReplyRoute, type ResidentFrom } from "./reply-sender";
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
 *     only where that reply would reach them.
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

const RESEND_API = "https://api.resend.com";

/** An inline picture under this size is a signature's logo, not a photo of the job. */
const SIGNATURE_IMAGE_MAX = 30_000;

/**
 * The most a forward attaches, in bytes. Resend takes 40MB an email after base64 (a third bigger), so the files stay
 * under about 30MB; the rest are left out and said so, rather than the send failing every retry.
 */
const FORWARD_ATTACH_MAX = 28 * 1024 * 1024;

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
  | { outcome: "forwarded"; taskId: string | null }
  | { outcome: "ignored"; reason: string };

async function resendGet<T>(config: EmailEnv, path: string): Promise<T> {
  const res = await fetch(`${RESEND_API}${path}`, { headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Resend ${res.status} on ${path}`);
  return (await res.json()) as T;
}

/** Our own addresses, bare: a fresh email to one of these from a contractor reaches the partners. */
function jobsAddresses(config: EmailEnv): string[] {
  return [config.from, config.replyTo].filter((a): a is string => !!a).map(fromAddress);
}

type Sorted = { kind: FileKind; type: string } | { tooBig: FileKind } | null;

/** What a file is, and whether it may post: photos, videos and documents, within each kind's size cap. */
function sortFile(a: ReceivedAttachment): Sorted {
  // The name's extension when the mail app sent a generic type (application/octet-stream, image/jpg), as uploads do.
  const type = uploadContentType(a.filename ?? "", a.content_type) ?? "";
  const kind = fileKindForType(type);
  if (!kind) return null;
  const rule = UPLOAD_RULES[kind];
  if (!rule.contentTypes.includes(type)) return null;
  if (a.content_disposition === "inline" && a.content_id && kind === "image" && a.size < SIGNATURE_IMAGE_MAX) return null;
  if (a.size > rule.maxBytes) return { tooBig: kind };
  return { kind, type };
}

type Allowed = { a: ReceivedAttachment; s: { kind: FileKind; type: string } };

/** An email's files: the ones that may post, and the kinds of those over their size cap. */
function sortFiles(list: readonly ReceivedAttachment[]): { allowed: Allowed[]; tooBig: FileKind[] } {
  const sorted = list.map((a) => ({ a, s: sortFile(a) }));
  return {
    allowed: sorted.filter((x): x is Allowed => !!x.s && "type" in x.s),
    tooBig: sorted.flatMap((x) => (x.s && "tooBig" in x.s ? [x.s.tooBig] : [])),
  };
}

type TaskFacts = { id: string; title: string; status: TaskStatus; unitLabel: string | null; property: { address: string } | null };
const TASK_FACTS = { id: true, title: true, status: true, unitLabel: true, property: { select: { address: true } } } as const;

export async function handleReceivedEmail(emailId: string): Promise<ReplyOutcome> {
  const env = getEnv();
  const config = env.email;
  if (!config) return { outcome: "ignored", reason: "email off" };
  const email = await resendGet<ReceivedEmail>(config, `/emails/receiving/${encodeURIComponent(emailId)}`);
  if (isAutoReply(email.headers ?? {}, email.subject)) return { outcome: "ignored", reason: "automatic reply" };
  const route = await routeReply(prisma, { ...email, from: email.from ?? "" }, jobsAddresses(config));
  if (route.route === "ignore") return { outcome: "ignored", reason: route.reason };

  const from = fromAddress(email.from ?? "");
  const written = replyBody(email.text?.trim() ? email.text : htmlToText(email.html ?? ""));
  const list = await resendGet<{ data: ReceivedAttachment[] }>(config, `/emails/receiving/${encodeURIComponent(emailId)}/attachments?limit=100`);
  const { allowed, tooBig } = sortFiles(list.data);
  // A tenant's reply (docs/specs/tenant-welcome-email.md, Q2): its From is their own address on file, so no "From" line.
  if (route.route === "resident-post" || route.route === "resident-forward") {
    return residentReply({ emailId, route, written, allowed, tooBig, ours: { appUrl: env.appUrl, addresses: jobsAddresses(config) } });
  }
  const loginEmail = route.route === "post" ? route.loginEmail : route.from.loginEmail;
  const words = from && from !== loginEmail ? [written, `From ${from}`].filter(Boolean).join("\n\n") : written;

  const task = route.taskId ? await prisma.task.findUnique({ where: { id: route.taskId }, select: TASK_FACTS }) : null;
  if (route.taskId && !task) return { outcome: "ignored", reason: "no job" };

  if (route.route === "forward") return forwardReply({ emailId, config, route, task, words, written, subject: email.subject, allowed, tooBig });
  if (!task) return { outcome: "ignored", reason: "no job" };
  return postReply({ emailId, config, route, task, words, written, allowed, tooBig, total: list.data.length, email });
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
  allowed: Allowed[];
  tooBig: FileKind[];
  total: number;
  email: ReceivedEmail;
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
    const res = await fetch(a.download_url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Couldn't download ${a.filename ?? a.id}: ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
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
    return forwardReply({ emailId, config: input.config, route: again, task, words, written, subject: input.email.subject, allowed: input.allowed, tooBig });
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

/** The partners a reply goes to: everyone who can sign in (core.ts notifyPartners). */
function partnersToTell(): Promise<Partner[]> {
  return prisma.user.findMany({ where: { passwordHash: { not: null } }, select: { id: true, name: true, email: true }, orderBy: { id: "asc" } });
}

type Partner = { id: string; name: string | null; email: string };

/** A forward's files: they ride along as attachments, as many as one post takes and as fit in one email; the rest are said. */
function packForward(allowed: readonly Allowed[], tooBig: readonly FileKind[]): { attach: ReceivedAttachment[]; dropped: FileKind[] } {
  const attach: ReceivedAttachment[] = [];
  const dropped: FileKind[] = [...tooBig];
  let bytes = 0;
  for (const { a, s } of allowed) {
    if (attach.length < MAX_FILES_PER_POST && bytes + a.size <= FORWARD_ATTACH_MAX) {
      attach.push(a);
      bytes += a.size;
    } else dropped.push(s.kind);
  }
  return { attach, dropped };
}

/**
 * One email to each partner, under a key per received email and partner (`<key>/<partnerId>`): a redelivered webhook
 * re-runs this, and Resend sends a repeated key only once. Anyone missed it: throws, so the webhook answers 500 and
 * Resend delivers the reply again, and the keys keep the partners who already have it from getting it twice.
 */
async function sendToPartners(input: {
  partners: readonly Partner[];
  key: string;
  subject: string;
  rendered: { text: string; html: string };
  attach: readonly ReceivedAttachment[];
  taskId: string | null;
  fromName: string;
  threadKey?: string;
  replyTo?: (partner: Partner) => Promise<string | undefined>;
}): Promise<void> {
  let failed = 0;
  for (const partner of input.partners) {
    const replyTo = input.replyTo ? await input.replyTo(partner) : undefined;
    const res = await sendEmail({
      to: partner.email,
      subject: input.subject,
      text: input.rendered.text,
      html: input.rendered.html,
      attachments: input.attach.map((f) => ({ filename: f.filename ?? "file", path: f.download_url })),
      ...(input.threadKey ? { threadKey: input.threadKey } : {}),
      fromName: input.fromName,
      ...(replyTo ? { replyTo } : {}),
      idempotencyKey: `${input.key}/${partner.id}`,
    });
    // 409 on a keyed send: Resend already has this key (sent, or sending now). A retry's body differs, since the
    // attachments' download links are re-signed and a reply address is new each time, so Resend refuses it rather
    // than sending it twice.
    if (!res.ok && res.status !== 409) {
      failed++;
      logError("email:reply-forward", new Error(res.error ?? "send failed"), { taskId: input.taskId });
    }
  }
  if (failed > 0) throw new Error(`A reply that couldn't post didn't reach ${failed} of ${input.partners.length} partners`);
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
  allowed: Allowed[];
  tooBig: FileKind[];
}): Promise<ReplyOutcome> {
  const { emailId, config, route, task, words } = input;
  const appUrl = getEnv().appUrl.replace(/\/+$/, "");
  const name = route.from.fullName;
  const where = task ? jobWhere(task.property?.address ?? null, task.unitLabel) : "";

  const { attach, dropped } = packForward(input.allowed, input.tooBig);
  const partners = await partnersToTell();
  const partnerNames = joinNames(partners.map((u) => firstName(u.name ?? "") || u.name || u.email));
  const fresh = subjectLine(input.subject);

  if (input.written || attach.length > 0) {
    const subject = task
      ? jobSubject({ word: isActiveStatus(task.status) ? "Update" : "Done", title: task.title, where })
      : fresh || `${name} wrote to ${BRAND.app}`;
    const rendered = renderPlainEmail({
      line: forwardHeadline(name, route.why),
      // The job, named, then their words.
      items: [task ? [task.title, where].filter(Boolean).join(", ") : "", words].filter(Boolean),
      closing: forwardFilesLine(attach.length, dropped.length) ?? undefined,
      buttonLabel: task ? "Open task" : "Open contractor",
      buttonUrl: task ? `${appUrl}/tasks/${task.id}` : `${appUrl}/contractors/${route.from.contactId}`,
      footnote: route.from.reachable ? `Reply to answer ${name}.` : undefined,
    });
    await sendToPartners({
      partners,
      key: `reply-forward/${emailId}`,
      subject,
      rendered,
      attach,
      taskId: task?.id ?? null,
      ...(task ? { threadKey: threadKey(task.id) } : {}),
      fromName: `${name} via ${BRAND.app}`,
      // With a job, a partner's reply posts on it as them (Internal if Zack has left it); with none, it goes straight to
      // the contractor's address, which their domain vouched for.
      replyTo: async (partner) => (task ? replyAddress(await partnerReplyLink(task.id, partner.id, route.from.contactId), config.from) : (route.from.loginEmail ?? undefined)),
    });
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
  if (!input.written && attach.length === 0) return { outcome: "ignored", reason: line ? "only files too big" : "empty" };
  return { outcome: "forwarded", taskId: task?.id ?? null };
}

// ---------------------------------------------------------------------------
// A tenant's reply (docs/specs/tenant-welcome-email.md, Q2)
// ---------------------------------------------------------------------------

/**
 * A tenant's reply to a resident email, routed by reply-sender.ts residentRoute (their own address, DMARC pass). On an
 * open request it posts as their own addition, through the same writer as the form's Add more (residents/additions.ts):
 * their words, cut as a note is and stopped where our own email is quoted (inbound.ts residentReplyWords: it carries
 * their form link, and the contractor reads what posts), and their photos and videos as Add more takes them, marked by
 * email, with the usual line in both partners' email. A redelivery of one that posted sends only its left-over files. Files the request can't take (documents, past ten) go to both partners. Anything else
 * (the form email, a closed request, after moving out) goes to both partners with the home named. From "HG Capital",
 * never "via", with no reply address and no job thread: a partner answers in the group chat, and a reply to the
 * forward never posts on the job for the contractor. Never sent to the contractor.
 */
async function residentReply(input: {
  emailId: string;
  route: Extract<ReplyRoute, { route: "resident-post" | "resident-forward" }>;
  written: string;
  allowed: Allowed[];
  tooBig: FileKind[];
  ours: OurAddresses;
}): Promise<ReplyOutcome> {
  const { emailId, route, tooBig } = input;
  // Their own words only: our email, quoted, carries their form link, and the contractor reads what posts.
  const written = residentReplyWords(input.written, input.ours);
  const task = route.taskId ? await prisma.task.findUnique({ where: { id: route.taskId }, select: TASK_FACTS }) : null;
  if (route.taskId && !task) return { outcome: "ignored", reason: "no job" };

  // What Add more takes: photos and videos under their caps, ten at a time (requests.ts FILES_PER_SEND).
  const media = input.allowed.filter((x) => x.s.kind === "image" || x.s.kind === "video");
  const files = media.slice(0, FILES_PER_SEND);
  const rest = input.allowed.filter((x) => !files.includes(x));
  // Files the request can't take (documents, past ten) ride along to the partners; ones too big to attach are said.
  // Its own key, so a redelivery sends it once whatever the request has done since.
  const sendLeftOver = async (on: TaskFacts) => {
    if (rest.length || tooBig.length) await forwardResident({ emailId, why: "files", from: route.from, task: on, written: "", allowed: rest, tooBig, key: "resident-reply-files" });
  };

  // A redelivered webhook whose reply posted while the request was open, and the request closed or the lease ended
  // since: its words and photos are on the request, so only what it couldn't take goes again, never "after this closed".
  if (route.route === "resident-forward" && task && (await postedByEmail(prisma, task.id, emailId))) {
    await sendLeftOver(task);
    return { outcome: "ignored", reason: "already posted" };
  }
  if (route.route === "resident-forward" || !task) {
    const why = route.route === "resident-forward" ? route.why : "no-request";
    return forwardResident({ emailId, why, from: route.from, task, written, allowed: input.allowed, tooBig });
  }

  const note = written ? (written.length > NOTE_MAX ? `${written.slice(0, NOTE_MAX - 1).trimEnd()}…` : written) : null;
  if (!note && !files.length && !rest.length && !tooBig.length) return { outcome: "ignored", reason: "empty" };

  let posted = false;
  // Posted before (a redelivered webhook): nothing to upload again. Checked again under the lock.
  if ((note || files.length) && !(await postedByEmail(prisma, task.id, emailId))) {
    const uploaded = await uploadReplyFiles(task.id, files);
    try {
      const made = await prisma.$transaction(
        (tx) => addResidentUpdate(tx, task.id, { tenantId: route.from.tenantId, tenantName: route.from.fullName }, { note, files: uploaded, byEmail: emailId }, new Date()),
        { timeout: 30_000, maxWait: 10_000 },
      );
      posted = !!made;
    } catch (err) {
      // Closed between the routing and the post: it reaches the partners instead of failing every retry, unless a
      // delivery running alongside this one posted it just before.
      if (!(err instanceof ResidentRequestError)) throw err;
      if (!(await postedByEmail(prisma, task.id, emailId))) {
        const fresh = await prisma.task.findUnique({ where: { id: task.id }, select: TASK_FACTS });
        return forwardResident({ emailId, why: "closed", from: route.from, task: fresh ?? task, written, allowed: input.allowed, tooBig });
      }
    }
  }
  await sendLeftOver(task);
  if (posted) return { outcome: "posted", taskId: task.id, files: files.length, skipped: rest.length + tooBig.length };
  return note || files.length ? { outcome: "ignored", reason: "already posted" } : { outcome: "forwarded", taskId: task.id };
}

/** A reply's photos and videos into our store, under the task, as a contractor's reply's go (postReply). */
async function uploadReplyFiles(taskId: string, files: readonly Allowed[]): Promise<ResidentFile[]> {
  if (!files.length) return [];
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is unset: a reply's files have nowhere to go");
  const uploaded: ResidentFile[] = [];
  for (const { a, s } of files) {
    const res = await fetch(a.download_url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Couldn't download ${a.filename ?? a.id}: ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const filename = a.filename?.trim() || `email-${a.id}`;
    const blob = await put(taskUploadPath(taskId, filename, "orig", s.type), bytes, { access: "private", token, contentType: s.type, addRandomSuffix: true });
    uploaded.push({ url: blob.url, pathname: blob.pathname, filename, size: bytes.length, contentType: s.type, kind: s.kind === "video" ? "VIDEO" : "IMAGE" });
  }
  return uploaded;
}

/** A tenant's reply, or its files that couldn't post, to both partners: the headline, the request or home, their words. */
async function forwardResident(input: {
  emailId: string;
  why: ResidentForward;
  from: ResidentFrom;
  task: TaskFacts | null;
  written: string;
  allowed: Allowed[];
  tooBig: FileKind[];
  key?: string;
}): Promise<ReplyOutcome> {
  const { task, from } = input;
  const appUrl = getEnv().appUrl.replace(/\/+$/, "");
  const { attach, dropped } = packForward(input.allowed, input.tooBig);
  if (!input.written && attach.length === 0 && dropped.length === 0) return { outcome: "ignored", reason: "empty" };
  const where = task ? jobWhere(task.property?.address ?? null, task.unitLabel) : jobWhere(from.address, from.unitLabel);
  const word = !task ? "Reply" : task.status === "CANCELED" ? "Canceled" : isActiveStatus(task.status) ? "Update" : "Done";
  const rendered = renderPlainEmail({
    line: residentForwardHeadline(from.fullName, input.why),
    // The request or the home, named, then their words.
    items: [task ? [task.title, where].filter(Boolean).join(", ") : where, input.written].filter(Boolean),
    closing: forwardFilesLine(attach.length, dropped.length) ?? undefined,
    buttonLabel: task ? "Open task" : "Open lease",
    buttonUrl: task ? `${appUrl}/tasks/${task.id}` : `${appUrl}/tenants/${from.leaseId}`,
  });
  await sendToPartners({
    partners: await partnersToTell(),
    key: `${input.key ?? "resident-reply-forward"}/${input.emailId}`,
    subject: jobSubject({ word, title: task ? task.title : from.fullName, where }),
    rendered,
    attach,
    taskId: task?.id ?? null,
    fromName: BRAND.app,
  });
  return { outcome: "forwarded", taskId: task?.id ?? null };
}
