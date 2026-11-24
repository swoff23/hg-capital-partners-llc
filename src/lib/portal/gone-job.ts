import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { findGoneCrewJob } from "./gone-crew-jobs";
import { goneJobFor, type GoneJob, type GoneJobFacts } from "./gone-job-text";
import { sessionIsLive } from "./limits";
import { portalCookieForRequest } from "./request";
import { hashToken, isWellFormedToken } from "./tokens";

/**
 * What a crew member's one-job link says once the job is out of reach
 * (docs/specs/emails-redesign.md, Q7): canceled, deleted, or the contractor was taken off it. The words are in
 * gone-job-text.ts; a deleted job's come from the note deleteTask kept (gone-crew-jobs.ts). Nothing here opens the
 * job; it reads the title and street and nothing more, and only for someone holding that crew link or crew session.
 */

/** Where a crew session whose job was canceled or deleted, or whose contractor was taken off it, goes from any portal page (session.ts). */
export const GONE_SESSION_PATH = "/j/gone";

async function factsFor(taskId: string, contactId: string | null): Promise<GoneJobFacts | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      status: true,
      title: true,
      unitLabel: true,
      property: { select: { address: true } },
      access: contactId ? { where: { contactId, revokedAt: null }, select: { id: true } } : false,
    },
  });
  if (!task) return null;
  const contact = contactId ? await prisma.contact.findUnique({ where: { id: contactId }, select: { fullName: true } }) : null;
  return {
    canceled: task.status === "CANCELED",
    contractorHasJob: !!task.access && task.access.length > 0,
    contractorName: contact?.fullName ?? null,
    title: task.title,
    address: task.property?.address ?? null,
    unitLabel: task.unitLabel,
  };
}

/**
 * A CREW link's gone state, by its token: null for any other kind, an unknown token, or a job that is still the
 * contractor's to open (the caller sends them on as before). A deleted job's link has no row left; the note its
 * delete kept answers instead. A link revoked on its own still reads: it is the contractor who lost the job.
 */
export async function goneJobForCrewLink(token: string): Promise<GoneJob | null> {
  if (!isWellFormedToken(token)) return null;
  const link = await prisma.jobLink.findUnique({ where: { tokenHash: hashToken(token) }, select: { kind: true, taskId: true, contactId: true } });
  if (!link) return findGoneCrewJob(prisma, "LINK", token);
  if (link.kind !== "CREW") return null;
  const facts = await factsFor(link.taskId, link.contactId);
  return facts ? goneJobFor(facts) : null;
}

/** The same for a crew session already on the job page: the job it holds is `taskId`, the contractor's contact `contactId`. */
export async function goneJobForSession(taskId: string, contactId: string): Promise<GoneJob | null> {
  const facts = await factsFor(taskId, contactId);
  return facts ? goneJobFor(facts) : null;
}

/**
 * The verdict for the crew session in this browser's portal cookie, once it no longer opens its job: canceled or the
 * contractor taken off (the session still exists but stopped opening it, session.ts linkSessionStillOpens), or deleted
 * (the session went with the job; the note its delete kept answers). Null for anything else, so that visit goes to
 * sign in as before: no cookie, a full session, a contractor's own email-link session, a session signed out, expired
 * or removed, or a job still theirs. Cached per request.
 */
export const goneJobForCrewSession = cache(async (): Promise<GoneJob | null> => {
  const { name } = await portalCookieForRequest();
  const token = (await cookies()).get(name)?.value;
  if (!isWellFormedToken(token)) return null;
  const now = new Date();
  const row = await prisma.portalSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      revokedAt: true,
      onlyTaskId: true,
      jobLink: { select: { kind: true } },
      account: { select: { status: true, contact: { select: { id: true, active: true } } } },
    },
  });
  if (!row) return findGoneCrewJob(prisma, "SESSION", token, now);
  if (!row.onlyTaskId || row.jobLink?.kind !== "CREW" || !sessionIsLive(row, now)) return null;
  if (row.account.status !== "ACTIVE" || !row.account.contact.active) return null;
  return goneJobForSession(row.onlyTaskId, row.account.contact.id);
});
