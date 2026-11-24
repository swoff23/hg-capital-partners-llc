import "server-only";
import { BlobNotFoundError, head, type HeadBlobResult } from "@vercel/blob";
import type { AttachmentKind } from "@prisma/client";
import { PREVIEW_RULE, UPLOAD_RULES, fileKindForType, filenameForType, normalizeContentType } from "@/lib/attachments/content-types";
import { blobSizeRefusal, durationHint, pixelHint } from "@/lib/attachments/limits";
import { isPrivateStoreUrl, storeIdFromToken, storedResidentUploadRole, type UploadRole } from "@/lib/attachments/paths";
import { prisma } from "@/lib/db";
import { todayYmdEastern, toYmd, type Ymd } from "@/lib/dates";
import { sendEmail } from "@/lib/email/send";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import * as core from "@/lib/tasks/core";
import { ResidentRequestError, addResidentUpdate, lockOpenRequest, photoWords, residentPrincipal, writeResidentUpdate } from "./additions";
import { requestCopyEmail, residentHome, type ResidentStep } from "./emails";
import { residentMayCancel, stepOf } from "./steps";
import { residentUrl, type ResidentContext } from "./links";
import { residentReplyTo } from "./reply-address";

/**
 * What a resident does from their link (docs/specs/maintenance-requests.md,
 * sections 3 and 4.1): send a request, add to one, cancel one, and the reads
 * their pages show. A request is a task (decision 1), written with a system
 * principal labeled "Dana Lee (resident)", beside a ResidentRequest that keeps
 * their own words and answers. Their files are Shared with no audience, so any
 * contractor on the job sees them (portal/queries.ts visibleFile).
 */

// The refusal and the addition core live in additions.ts, which a reply by email posts through too.
export { ResidentRequestError };

/** Short, since it leads every email subject; the rest goes in Tell us more. */
export const WHATS_WRONG_MAX = 50;
export const DETAILS_MAX = 2000;
export const PETS_NOTE_MAX = 120;
export const NOTE_MAX = 2000;
export const FILES_PER_SEND = 10;
const REQUESTS_PER_DAY = 20;
/** Photos and videos one link may upload in a day, sent or not: plenty for a few requests, and a limit on a leaked link. */
const UPLOADS_PER_DAY = 60;
export const UPLOADS_FULL = "That's a lot of photos today. Send what you have, or text us in our group chat.";

/** The link has uploaded its day's worth (the token route and the record step both check). */
export async function residentUploadsFull(linkId: string, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - 24 * 60 * 60_000);
  return (await prisma.residentUpload.count({ where: { linkId, createdAt: { gt: since } } })) >= UPLOADS_PER_DAY;
}

const principalFor = residentPrincipal;

// ---------------------------------------------------------------------------
// Uploads: checked with head(), held until a send attaches them
// ---------------------------------------------------------------------------

export interface ResidentUploadInput {
  pathname: string;
  filename: string;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  thumbPathname?: string | null;
  posterPathname?: string | null;
}

function blobAuth(): { token: string; storeId: string } {
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  const storeId = storeIdFromToken(token);
  if (!token || !storeId) throw new ResidentRequestError("Photos can't be added right now. Send it without them, or text us.");
  return { token, storeId };
}

/** One blob in this link's folder, in our private store, of a type and size its role allows. */
async function verifyBlob(linkId: string, pathname: string, role: UploadRole, auth: { token: string; storeId: string }) {
  if (storedResidentUploadRole(pathname, linkId) !== role) throw new ResidentRequestError("That file didn't upload from this link.");
  let blob: HeadBlobResult;
  try {
    blob = await head(pathname, { token: auth.token });
  } catch (err) {
    if (err instanceof BlobNotFoundError) throw new ResidentRequestError("That upload didn't finish. Try again.");
    throw err;
  }
  if (blob.pathname !== pathname || !isPrivateStoreUrl(blob.url, auth.storeId, pathname)) throw new ResidentRequestError("That file didn't upload from this link.");
  const contentType = normalizeContentType(blob.contentType);
  const kind = fileKindForType(contentType);
  const rule = role === "orig" ? (kind === "image" || kind === "video" ? UPLOAD_RULES[kind] : null) : PREVIEW_RULE.contentTypes.includes(contentType) ? PREVIEW_RULE : null;
  if (!rule || (role === "orig" && !kind)) throw new ResidentRequestError("Only photos and videos can be added here.");
  const tooBig = blobSizeRefusal(blob.size, rule.maxBytes);
  if (tooBig) throw new ResidentRequestError(tooBig);
  return { url: blob.url, size: blob.size, contentType, kind };
}

const KIND: Record<"image" | "video", AttachmentKind> = { image: "IMAGE", video: "VIDEO" };

/**
 * The record step for the resident's upload queue: the file is up, so check it
 * and hold it for the send. A Retry of a record that went through gets the same
 * row back.
 */
export async function recordResidentUpload(ctx: ResidentContext, input: ResidentUploadInput): Promise<{ id: string }> {
  const existing = await prisma.residentUpload.findUnique({ where: { pathname: input.pathname }, select: { id: true, linkId: true } });
  if (existing) {
    if (existing.linkId !== ctx.linkId) throw new ResidentRequestError("That file didn't upload from this link.");
    return { id: existing.id };
  }
  if (await residentUploadsFull(ctx.linkId)) throw new ResidentRequestError(UPLOADS_FULL);
  const auth = blobAuth();
  const orig = await verifyBlob(ctx.linkId, input.pathname, "orig", auth);
  const thumb = input.thumbPathname ? await verifyBlob(ctx.linkId, input.thumbPathname, "thumb", auth) : null;
  const poster = input.posterPathname && orig.kind === "video" ? await verifyBlob(ctx.linkId, input.posterPathname, "poster", auth) : null;
  const row = await prisma.residentUpload.create({
    data: {
      linkId: ctx.linkId,
      pathname: input.pathname,
      url: orig.url,
      filename: filenameForType(input.filename, orig.contentType),
      size: orig.size,
      contentType: orig.contentType,
      kind: KIND[orig.kind as "image" | "video"],
      thumbPathname: thumb ? input.thumbPathname : null,
      posterPathname: poster ? input.posterPathname : null,
      width: pixelHint(input.width),
      height: pixelHint(input.height),
      durationSec: durationHint(input.durationSec),
    },
    select: { id: true },
  });
  return row;
}

/** The held uploads a send names: only this link's, only ones not attached yet, oldest first. */
async function heldUploads(tx: core.Tx, ctx: ResidentContext, uploadIds: readonly string[]) {
  return uploadIds.length
    ? tx.residentUpload.findMany({ where: { id: { in: [...uploadIds] }, linkId: ctx.linkId, usedAt: null }, orderBy: { createdAt: "asc" } })
    : [];
}

/** Mark the held uploads attached. Only ones still unattached: a second send racing this one for the same files finds none left and is refused. */
async function markUsed(tx: core.Tx, ids: readonly string[], now: Date): Promise<void> {
  if (!ids.length) return;
  const { count } = await tx.residentUpload.updateMany({ where: { id: { in: [...ids] }, usedAt: null }, data: { usedAt: now } });
  if (count !== ids.length) throw new ResidentRequestError("Those photos are already on a request. Add them again.");
}

/**
 * The held uploads a send names, as file rows on the task, under one Shared update by the resident. Returns the
 * update's id, or null when there were none. `first`: the photos sent with the request, which its page shows under
 * Additional comments.
 */
async function attachUploads(
  tx: core.Tx,
  taskId: string,
  ctx: ResidentContext,
  uploadIds: readonly string[],
  body: string | null,
  now: Date,
  first = false,
): Promise<{ eventId: string | null; photos: number }> {
  const uploads = await heldUploads(tx, ctx, uploadIds);
  if (!uploads.length && !body) return { eventId: null, photos: 0 };
  const eventId = await writeResidentUpdate(tx, taskId, ctx, body, uploads, now, first ? { first: true } : {});
  await markUsed(tx, uploads.map((u) => u.id), now);
  return { eventId, photos: uploads.length };
}

// ---------------------------------------------------------------------------
// Send, add, cancel
// ---------------------------------------------------------------------------

export interface RequestInput {
  whatsWrong: string;
  details?: string | null;
  letUsIn: boolean;
  pets?: boolean | null;
  petsNote?: string | null;
  uploadIds?: string[];
}

/**
 * Send a request (section 3.2): a task in Needs you, due today and unassigned like the move-in report, with
 * Permission to enter on after a Yes, the resident's photos on it, a line in both partners' email, and the resident's
 * own copy by email.
 */
export async function submitRequest(ctx: ResidentContext, input: RequestInput, now = new Date()): Promise<{ id: string; firstPhotoId: string | null }> {
  const whatsWrong = input.whatsWrong.trim().replace(/\s+/g, " ");
  if (whatsWrong.length < 2) throw new ResidentRequestError("Say what's wrong.");
  if (whatsWrong.length > WHATS_WRONG_MAX) throw new ResidentRequestError(`Keep "What's wrong?" to ${WHATS_WRONG_MAX} characters. Put the rest in Tell us more.`);
  const details = input.details?.trim() || null;
  if (details && details.length > DETAILS_MAX) throw new ResidentRequestError("That's a lot of detail. Shorten it a little.");
  const pets = input.letUsIn ? (input.pets ?? null) : null;
  if (input.letUsIn && pets === null) throw new ResidentRequestError("Say whether there are pets inside.");
  const petsNote = pets ? input.petsNote?.trim().slice(0, PETS_NOTE_MAX) || null : null;
  const uploadIds = [...new Set(input.uploadIds ?? [])];
  if (uploadIds.length > FILES_PER_SEND) throw new ResidentRequestError(`Add up to ${FILES_PER_SEND} photos or videos at a time.`);

  const since = new Date(now.getTime() - 24 * 60 * 60_000);
  if ((await prisma.residentRequest.count({ where: { tenantId: ctx.tenantId, createdAt: { gt: since } } })) >= REQUESTS_PER_DAY) {
    throw new ResidentRequestError("That's a lot of requests today. Text us in our group chat if more come up.");
  }

  const p = principalFor(ctx);
  const made = await prisma.$transaction(async (tx) => {
    const task = await core.createTask(
      tx,
      { title: whatsWrong, description: details, propertyId: ctx.propertyId, unitLabel: ctx.unitLabel, dueDate: todayYmdEastern(now), entryPermitted: input.letUsIn },
      p,
      now,
    );
    // The CREATED line says it came from a resident, so Activity reads "sent this request".
    await tx.taskEvent.updateMany({ where: { taskId: task.id, kind: "CREATED" }, data: { data: { request: true } } });
    const request = await tx.residentRequest.create({
      data: { taskId: task.id, leaseId: ctx.leaseId, tenantId: ctx.tenantId, tenantName: ctx.tenantName, whatsWrong, details, letUsIn: input.letUsIn, pets, petsNote },
      select: { id: true },
    });
    const attached = await attachUploads(tx, task.id, ctx, uploadIds, null, now, true);
    // The partners' email line (section 4.3): their words and answers, since the partner copy doesn't carry the notes.
    const answers = input.letUsIn ? ["Can come in", pets ? `Pets: ${petsNote ?? "yes"}` : "No pets"] : ["Coordinate when home"];
    const said = details ? `: "${details.length > 200 ? `${details.slice(0, 199)}…` : details}"` : "";
    const withPhotos = attached.photos ? ` with ${photoWords(attached.photos)}` : "";
    await core.notifyPartners(
      tx,
      task.id,
      { kind: "CREATED", actorLabel: p.label, summary: `sent this request${withPhotos}${said} · ${answers.join(" · ")}`, at: now.toISOString(), ...(attached.eventId ? { eventId: attached.eventId } : {}) },
      now,
    );
    const first = attached.eventId
      ? await tx.taskAttachment.findFirst({ where: { eventId: attached.eventId, kind: "IMAGE", thumbPathname: { not: null } }, orderBy: { createdAt: "asc" }, select: { id: true } })
      : null;
    return { id: request.id, firstPhotoId: first?.id ?? null };
  });

  if (ctx.email) {
    try {
      const mail = requestCopyEmail({
        firstName: ctx.firstName,
        whatsWrong,
        home: residentHome(ctx.address, ctx.unitLabel),
        details,
        letUsIn: input.letUsIn,
        pets,
        petsNote,
        url: residentUrl(ctx.token, `/${made.id}`),
      });
      const replyTo = await residentReplyTo({ tenantId: ctx.tenantId, leaseId: ctx.leaseId, requestId: made.id });
      await sendEmail({ to: ctx.email, subject: mail.subject, text: mail.text, html: mail.html, fromName: mail.fromName, ...(replyTo ? { replyTo } : {}) });
    } catch (err) {
      logError("residents:request-copy", err, { requestId: made.id }, { level: "warning" });
    }
  }
  return made;
}

/** The request, if it's this household's. */
async function ownRequest(ctx: ResidentContext, requestId: string) {
  const r = await prisma.residentRequest.findUnique({ where: { id: requestId }, select: { id: true, taskId: true, leaseId: true, task: { select: { title: true, status: true } } } });
  if (!r || r.leaseId !== ctx.leaseId) throw new ResidentRequestError("That request isn't on this link.");
  return r;
}

/** Add photos or a note (section 3.5), while it's open: the same addition a reply by email makes (additions.ts). */
export async function addToRequest(ctx: ResidentContext, requestId: string, input: { note?: string | null; uploadIds?: string[] }, now = new Date()): Promise<void> {
  const note = input.note?.trim() || null;
  if (note && note.length > NOTE_MAX) throw new ResidentRequestError("That note is long. Shorten it a little.");
  const uploadIds = [...new Set(input.uploadIds ?? [])];
  if (uploadIds.length > FILES_PER_SEND) throw new ResidentRequestError(`Add up to ${FILES_PER_SEND} photos or videos at a time.`);
  if (!note && !uploadIds.length) throw new ResidentRequestError("Write something or add a photo.");
  const r = await ownRequest(ctx, requestId);
  await prisma.$transaction(async (tx) => {
    await lockOpenRequest(tx, r.taskId);
    const uploads = await heldUploads(tx, ctx, uploadIds);
    if (!note && !uploads.length) throw new ResidentRequestError("Those photos are already on a request. Add them again.");
    await addResidentUpdate(tx, r.taskId, ctx, { note, files: uploads }, now);
    await markUsed(tx, uploads.map((u) => u.id), now);
  });
}

/** Cancel their own (section 3.6), only while it still shows Received. */
export async function cancelOwnRequest(ctx: ResidentContext, requestId: string, now = new Date()): Promise<void> {
  const r = await ownRequest(ctx, requestId);
  const tooLate = "We've started on it, so text us in our group chat to cancel.";
  try {
    await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id: r.taskId }, select: { status: true } });
      if (!task || !residentMayCancel(task.status)) throw new ResidentRequestError(tooLate);
      const p = principalFor(ctx);
      await core.setStatus(tx, r.taskId, "CANCELED", p, { expected: task.status }, now);
      await tx.residentRequest.update({ where: { id: r.id }, data: { canceledByResidentAt: now, closedNote: null, notifiedStep: "closed" } });
      await core.notifyPartners(tx, r.taskId, { kind: "COMMENT", actorLabel: p.label, summary: "canceled the request", at: now.toISOString() }, now);
    });
  } catch (err) {
    // A task that moved a moment ago refuses with staff words ("Connor moved this to Review."): the resident gets their own line.
    if (err instanceof core.TaskRuleError) throw new ResidentRequestError(tooLate);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// What their pages show
// ---------------------------------------------------------------------------

export interface RequestRow {
  id: string;
  whatsWrong: string;
  step: ResidentStep;
  /** Scheduled: the day; Done or Closed: the day it closed; Received: the day it came in. */
  day: Ymd | null;
}

/** Their household's requests, newest first, for the home's Open and Done lists. */
export async function householdRequests(ctx: ResidentContext): Promise<RequestRow[]> {
  const rows = await prisma.residentRequest.findMany({
    where: { leaseId: ctx.leaseId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, whatsWrong: true, createdAt: true, task: { select: { status: true, scheduledFor: true, completedAt: true } } },
  });
  return rows.map((r) => {
    const step = stepOf(r.task.status, r.task.scheduledFor);
    const day = step === "scheduled" ? toYmd(r.task.scheduledFor) : step === "received" ? todayYmdEastern(r.createdAt) : r.task.completedAt ? todayYmdEastern(r.task.completedAt) : null;
    return { id: r.id, whatsWrong: r.whatsWrong, step, day };
  });
}

export interface ResidentFile {
  id: string;
  kind: "image" | "video";
  hasThumb: boolean;
  durationSec: number | null;
}

export interface RequestView {
  id: string;
  whatsWrong: string;
  details: string | null;
  letUsIn: boolean;
  pets: boolean | null;
  petsNote: string | null;
  step: ResidentStep;
  receivedOn: Ymd;
  scheduledDay: Ymd | null;
  closedOn: Ymd | null;
  closedNote: string | null;
  canceledByResident: boolean;
  open: boolean;
  /** Open or Waiting: nobody has started on it, so the resident may still cancel it (section 3.6). */
  cancelable: boolean;
  /** Their first send's photos and videos. */
  files: ResidentFile[];
  /** What they added since, oldest first. */
  additions: { id: string; on: Ymd; note: string | null; files: ResidentFile[] }[];
}

/** The marks a resident's update carries in its data. */
function residentData(data: unknown): { resident?: string; first?: boolean } {
  return data && typeof data === "object" ? (data as { resident?: string; first?: boolean }) : {};
}

const fileOf = (a: { id: string; kind: AttachmentKind; thumbPathname: string | null; posterPathname: string | null; durationSec: number | null }): ResidentFile => ({
  id: a.id,
  kind: a.kind === "VIDEO" ? "video" : "image",
  hasThumb: !!(a.thumbPathname || a.posterPathname),
  durationSec: a.durationSec,
});

/** One request as its page shows it: the step, and only what the household sent. Never staff's words or files. */
export async function requestView(ctx: ResidentContext, requestId: string): Promise<RequestView | null> {
  const r = await prisma.residentRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      leaseId: true,
      whatsWrong: true,
      details: true,
      letUsIn: true,
      pets: true,
      petsNote: true,
      closedNote: true,
      canceledByResidentAt: true,
      createdAt: true,
      task: {
        select: {
          status: true,
          scheduledFor: true,
          completedAt: true,
          events: {
            where: { kind: "COMMENT", deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              body: true,
              data: true,
              createdAt: true,
              attachments: {
                where: { deletedAt: null, uploadedByTenantId: { not: null } },
                orderBy: { createdAt: "asc" },
                select: { id: true, kind: true, thumbPathname: true, posterPathname: true, durationSec: true },
              },
            },
          },
        },
      },
    },
  });
  if (!r || r.leaseId !== ctx.leaseId) return null;
  const step = stepOf(r.task.status, r.task.scheduledFor);
  // Their own cancel is this close only when it closed the task (the same moment); one reopened since is staff's to close.
  const byResident =
    step === "closed" && !!r.canceledByResidentAt && !!r.task.completedAt && Math.abs(r.task.completedAt.getTime() - r.canceledByResidentAt.getTime()) < 60_000;
  // Only the household's own updates (`data.resident`), never staff's or a contractor's. The one sent with the request
  // (`data.first`) is its photos; the rest were added later.
  const theirs = r.task.events.filter((e) => residentData(e.data).resident);
  const first = theirs.find((e) => residentData(e.data).first);
  const additions = theirs.filter((e) => e !== first).map((e) => ({ id: e.id, on: todayYmdEastern(e.createdAt), note: e.body, files: e.attachments.map(fileOf) }));
  return {
    id: r.id,
    whatsWrong: r.whatsWrong,
    details: r.details,
    letUsIn: r.letUsIn,
    pets: r.pets,
    petsNote: r.petsNote,
    step,
    receivedOn: todayYmdEastern(r.createdAt),
    scheduledDay: toYmd(r.task.scheduledFor),
    closedOn: r.task.completedAt && (step === "done" || step === "closed") ? todayYmdEastern(r.task.completedAt) : null,
    closedNote: step === "closed" && !byResident ? r.closedNote : null,
    canceledByResident: byResident,
    open: step === "received" || step === "scheduled",
    cancelable: residentMayCancel(r.task.status),
    files: first ? first.attachments.map(fileOf) : [],
    additions,
  };
}

/** The pets answer from their last request, filled in on the next (section 2, defaults). */
export async function lastPetsAnswer(ctx: ResidentContext): Promise<{ pets: boolean; petsNote: string | null } | null> {
  const r = await prisma.residentRequest.findFirst({
    where: { leaseId: ctx.leaseId, pets: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { pets: true, petsNote: true },
  });
  return r && r.pets !== null ? { pets: r.pets, petsNote: r.petsNote } : null;
}

/** Staff closed a resident's request (section 4.2): the note they see, or none for the group chat line. */
export async function saveClosedNote(taskId: string, note: string): Promise<void> {
  await prisma.residentRequest.updateMany({ where: { taskId }, data: { closedNote: note.trim().slice(0, 500) || null } });
}
