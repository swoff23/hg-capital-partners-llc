import type { AttachmentKind, Prisma } from "@prisma/client";
import * as core from "@/lib/tasks/core";
import { requestClosed } from "./steps";

/**
 * What a resident adds to a task: their Shared updates, with their photos and
 * videos as the task's files, and the line in both partners' email
 * (docs/specs/maintenance-requests.md, sections 3.2 and 3.5). The form's Add
 * more (requests.ts addToRequest) and a reply by email
 * (docs/specs/tenant-welcome-email.md, Q2; email/replies.ts) both post through
 * addResidentUpdate, so a reply is the same addition the form makes, marked as
 * by email. No server-only and no Blob, so residents/replies.pg.test.ts runs
 * it on a scratch database.
 */

/** Refused with a line the resident can act on. */
export class ResidentRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResidentRequestError";
  }
}

export const REQUEST_CLOSED = "This request is closed. Send a new one if it's still a problem.";

/** Who wrote it: the system principal labeled "Dana Lee (resident)", which the partners' emails read as a resident. */
export interface Resident {
  tenantId: string;
  tenantName: string;
}

export const residentPrincipal = (who: Pick<Resident, "tenantName">): core.Principal => ({ kind: "system", label: `${who.tenantName} (resident)` });

/** A photo or video already in our store, ready to be a file on the task. */
export interface ResidentFile {
  url: string;
  pathname: string;
  filename: string;
  size: number;
  contentType: string;
  kind: AttachmentKind;
  thumbPathname?: string | null;
  posterPathname?: string | null;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
}

/**
 * The marks a resident's update carries in its data: whose it is, the photos sent with the request (`first`), and a
 * reply by email (`byEmail`, with the received email's id, so a redelivered webhook posts it once).
 */
export interface ResidentMarks {
  first?: true;
  byEmail?: true;
  emailId?: string;
}

export const photoWords = (n: number) => `${n} ${n === 1 ? "photo" : "photos"}`;

/** One Shared update by the resident, with no audience so any contractor on the job sees it, and its files. */
export async function writeResidentUpdate(
  tx: core.Tx,
  taskId: string,
  who: Resident,
  body: string | null,
  files: readonly ResidentFile[],
  now: Date,
  marks: ResidentMarks = {},
): Promise<string> {
  const data: Prisma.InputJsonObject = { resident: who.tenantId, ...marks };
  const event = await core.addEvent(tx, taskId, residentPrincipal(who), { kind: "COMMENT", visibility: "SHARED", body, audienceContactId: null, data, createdAt: now });
  for (const f of files) {
    await tx.taskAttachment.create({
      data: {
        taskId,
        eventId: event.id,
        url: f.url,
        pathname: f.pathname,
        filename: f.filename,
        size: f.size,
        contentType: f.contentType,
        kind: f.kind,
        visibility: "SHARED",
        uploadedByTenantId: who.tenantId,
        audienceContactId: null,
        thumbPathname: f.thumbPathname ?? null,
        posterPathname: f.posterPathname ?? null,
        width: f.width ?? null,
        height: f.height ?? null,
        durationSec: f.durationSec ?? null,
      },
    });
  }
  return event.id;
}

/** Take the task's row, as every writer on a task takes it first (core.ts addComment), and refuse a closed request. */
export async function lockOpenRequest(tx: core.Tx, taskId: string): Promise<void> {
  await core.lockTask(tx, taskId);
  const task = await tx.task.findUnique({ where: { id: taskId }, select: { status: true } });
  if (!task || requestClosed(task.status)) throw new ResidentRequestError(REQUEST_CLOSED);
}

/**
 * Add to an open request (section 3.5): one update with the note and files, and "added a note and 2 photos" in both
 * partners' email. Refused once the request is Done or canceled. With `byEmail` (the received email's id), an email
 * that already posted posts nothing again (null), checked under the task's lock so a redelivery running alongside
 * this one can't post it twice.
 */
export async function addResidentUpdate(
  tx: core.Tx,
  taskId: string,
  who: Resident,
  input: { note: string | null; files: readonly ResidentFile[]; byEmail?: string },
  now: Date,
): Promise<{ eventId: string } | null> {
  await lockOpenRequest(tx, taskId);
  if (input.byEmail && (await postedByEmail(tx, taskId, input.byEmail))) return null;
  const marks: ResidentMarks = input.byEmail ? { byEmail: true, emailId: input.byEmail } : {};
  const eventId = await writeResidentUpdate(tx, taskId, who, input.note, input.files, now, marks);
  const photos = input.files.length;
  const what = [input.note ? "a note" : null, photos ? photoWords(photos) : null].filter(Boolean).join(" and ");
  await core.notifyPartners(tx, taskId, { kind: "COMMENT", actorLabel: residentPrincipal(who).label, summary: `added ${what}`, at: now.toISOString(), eventId }, now);
  return { eventId };
}

/** This received email already posted on the task. */
export async function postedByEmail(db: Pick<Prisma.TransactionClient, "taskEvent">, taskId: string, emailId: string): Promise<boolean> {
  return !!(await db.taskEvent.findFirst({ where: { taskId, kind: "COMMENT", data: { path: ["emailId"], equals: emailId } }, select: { id: true } }));
}
