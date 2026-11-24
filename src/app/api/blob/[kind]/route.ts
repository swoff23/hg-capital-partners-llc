import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { isFinalRefusal } from "@/lib/attachments/access";
import { contactUploadLimits, invoiceSendParent, invoiceUploadLimits, leaseUploadLimits, propertyUploadLimits, uploadLimits } from "@/lib/attachments/limits";
import { appScope, ownerRefusal, portalScope } from "@/lib/attachments/queue-owner";
import { UploadRefusal, tokenFailure } from "@/lib/attachments/token-failure";
import { blobToken, noStoreMessage } from "@/lib/attachments/blob-stores";
import { UPLOAD_KIND_ACCESS, UPLOAD_KIND_ALLOWED, type UploadKind as UploadKindKey } from "@/lib/attachments/upload-kinds";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/log";
import { sendRefusal } from "@/lib/invoices/core";
import { getPortalPrincipal } from "@/lib/portal/session";
import { contractorUploadRefusal } from "@/lib/tasks/service";

/**
 * Mints short-lived client-upload tokens so the browser uploads straight to
 * Vercel Blob (no 4.5 MB serverless body limit). One route for every kind
 * of upload; the DB row is written afterwards by the matching server action
 * (recordTaskAttachment / recordPropertyDocument / the listing and property
 * photo saves), which checks the blob itself with head() rather than
 * trusting the browser.
 *
 *   /api/blob/task-upload            { taskId, fileKind }               staff
 *   /api/blob/portal-task-upload     { taskId, fileKind, queuedAt? }    contractor, on a job they can open
 *   /api/blob/property-upload        { propertyId, fileKind }           staff, documents and photos
 *   /api/blob/listing-photo-upload   { propertyId }                     staff, public photos
 *   /api/blob/property-photo-upload  { propertyId }                     staff, the building's public photo
 *   /api/blob/lockbox-photo-upload   { propertyId }                     staff, a unit's private lockbox photo
 *   /api/blob/portal-contact-upload  { contactId, docKind, fileKind }   contractor, their own W-9 or insurance
 *   /api/blob/contact-upload         { contactId, docKind, fileKind }   staff, a contractor's W-9 or insurance
 *   /api/blob/lease-upload           { leaseId, termId, fileKind }      staff, a lease's signed term
 *   /api/blob/invoice-upload         { invoiceId, fileKind }            staff, a To review invoice's PDF or photo
 *   /api/blob/portal-invoice-upload  { taskId, fileKind }               contractor, Send invoice on a job they can send from
 *
 * The keys are lib/attachments/upload-kinds.ts UPLOAD_KINDS, which the
 * uploaders send; the table below is typed against that list, so a kind
 * without an entry fails typecheck. What each kind accepts is one table: the
 * uploader's check, this route's token and the record step's head() read the
 * same one (attachments/limits.ts, content-types.ts UPLOAD_RULES).
 *
 * A 400 means the server said no (an UploadRefusal: the job closed, a type or
 * size that isn't allowed, a session that ended) and the uploader's tile turns
 * red. A job that no longer takes the contractor's files (closed, or in Review
 * past its window) also says `final`, so the tile keeps only Remove, as the
 * record step's answer does (access.ts isFinalRefusal). Anything else that goes
 * wrong, a database blip included, is a 503, which the uploader waits out and
 * tries again (attachments/token-failure.ts).
 *
 * The queue that asks says whose it is (`owner` in the payload, queue-owner.ts):
 * a tab still showing Zack's queue after Mike signed in elsewhere is refused
 * with a 400 instead of getting a token under Mike's cookie, so its files wait
 * for Zack.
 *
 * Every kind only accepts a path of its own (paths.ts, limits.ts): Blob can't
 * pick the path for us, only refuse the one asked for. Task and property
 * document tokens carry a per-type allowlist and size cap from `fileKind`.
 *
 * A contractor's token is minted again for a resumed upload (the on-device
 * outbox), so `queuedAt` rides in the payload and the late-upload rule reads
 * it (tasks/attachments.ts contractorUploadRefusal): a file queued before
 * Mark done may still start, or resume, after the job moved to Review.
 */

type Uploader = { kind: "staff"; userId: string } | { kind: "contractor"; contactId: string; onlyTaskId: string | null };

interface Limits {
  maximumSizeInBytes: number;
  allowedContentTypes?: string[];
}

interface UploadKind {
  /** Who may mint a token for this kind. */
  principal: Uploader["kind"];
  /** clientPayload key naming the parent row. */
  idKey: "taskId" | "propertyId" | "contactId" | "leaseId" | "invoiceId";
  /** Throws with a message the uploader can act on, or returns the token's limits. */
  authorize: (id: string, pathname: string, payload: Record<string, unknown>, who: Uploader) => Promise<Limits>;
}

const propertyExists = async (id: string) => !!(await prisma.property.findUnique({ where: { id }, select: { id: true } }));

const stringOrNull = (v: unknown) => (typeof v === "string" ? v : null);

/** The path must be this task's, the kind of file one this upload kind takes, and the type and size fit what the file says it is. */
function taskLimits(kind: "task-upload" | "portal-task-upload", taskId: string, pathname: string, payload: Record<string, unknown>): Limits {
  const limits = uploadLimits(taskId, pathname, payload.fileKind, UPLOAD_KIND_ALLOWED[kind]);
  if (typeof limits === "string") throw new UploadRefusal(limits);
  return limits;
}

/** The path must be this property's for its kind, and the type and size fit what the file says it is. */
async function propertyLimits(
  kind: "property-upload" | "listing-photo-upload" | "property-photo-upload" | "lockbox-photo-upload",
  propertyId: string,
  pathname: string,
  payload: Record<string, unknown>,
): Promise<Limits> {
  const limits = propertyUploadLimits(kind, propertyId, pathname, payload.fileKind);
  if (typeof limits === "string") throw new UploadRefusal(limits);
  if (!(await propertyExists(propertyId))) throw new UploadRefusal("Not found");
  return limits;
}

const KINDS: Record<string, UploadKind> = {
  "task-upload": {
    principal: "staff",
    idKey: "taskId",
    authorize: async (taskId, pathname, payload) => {
      const limits = taskLimits("task-upload", taskId, pathname, payload);
      if (!(await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } }))) throw new UploadRefusal("Not found");
      return limits;
    },
  },
  "portal-task-upload": {
    principal: "contractor",
    idKey: "taskId",
    authorize: async (taskId, pathname, payload, who) => {
      const limits = taskLimits("portal-task-upload", taskId, pathname, payload);
      if (who.kind !== "contractor") throw new UploadRefusal("Not found");
      const refusal = await contractorUploadRefusal(taskId, who, { atMint: true, queuedAt: stringOrNull(payload.queuedAt) });
      if (refusal) throw new UploadRefusal(refusal, isFinalRefusal(refusal));
      return limits;
    },
  },
  "property-upload": {
    principal: "staff",
    idKey: "propertyId",
    authorize: (id, pathname, payload) => propertyLimits("property-upload", id, pathname, payload),
  },
  "listing-photo-upload": {
    principal: "staff",
    idKey: "propertyId",
    // 25MB: a plain 10MB cap rejected real phone photos. No HEIC: most
    // browsers can't render it inline on the public site, so the uploader
    // converts it first.
    authorize: (id, pathname, payload) => propertyLimits("listing-photo-upload", id, pathname, payload),
  },
  "property-photo-upload": {
    principal: "staff",
    idKey: "propertyId",
    authorize: (id, pathname, payload) => propertyLimits("property-photo-upload", id, pathname, payload),
  },
  "lockbox-photo-upload": {
    principal: "staff",
    idKey: "propertyId",
    // A unit's lockbox photo and its thumbnail, to the private store (docs/specs/lockbox-location.md).
    authorize: (id, pathname, payload) => propertyLimits("lockbox-photo-upload", id, pathname, payload),
  },
  "portal-contact-upload": {
    principal: "contractor",
    idKey: "contactId",
    // Their own record only, from a full sign-in (not a job link), and only someone who came in by an invite or the
    // sign-up link: setup is theirs (docs/specs/contractor-onboarding.md, section 6).
    authorize: async (contactId, pathname, payload, who) => {
      const limits = contactUploadLimits(contactId, payload.docKind, pathname, payload.fileKind);
      if (typeof limits === "string") throw new UploadRefusal(limits);
      if (who.kind !== "contractor" || who.onlyTaskId || who.contactId !== contactId) throw new UploadRefusal("Not found");
      const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { signupSource: true, archivedAt: true } });
      if (!contact || contact.archivedAt || contact.signupSource === "STAFF") throw new UploadRefusal("Not found", true);
      return limits;
    },
  },
  "contact-upload": {
    principal: "staff",
    idKey: "contactId",
    // A W-9 or policy that came by email, added from the contractor's page: any contractor still in the directory.
    authorize: async (contactId, pathname, payload) => {
      const limits = contactUploadLimits(contactId, payload.docKind, pathname, payload.fileKind);
      if (typeof limits === "string") throw new UploadRefusal(limits);
      const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { archivedAt: true } });
      if (!contact || contact.archivedAt) throw new UploadRefusal("Not found", true);
      return limits;
    },
  },
  "lease-upload": {
    principal: "staff",
    idKey: "leaseId",
    // A signed lease, added from the lease page (docs/specs/tenants.md): any lease still in the app.
    authorize: async (leaseId, pathname, payload) => {
      const limits = leaseUploadLimits(leaseId, pathname, payload.fileKind);
      if (typeof limits === "string") throw new UploadRefusal(limits);
      if (!(await prisma.lease.findUnique({ where: { id: leaseId }, select: { id: true } }))) throw new UploadRefusal("Not found", true);
      return limits;
    },
  },
  "invoice-upload": {
    principal: "staff",
    idKey: "invoiceId",
    // Add the invoice file (docs/contractor-invoices-plan.md, 6 item 2): a PDF or a photo, onto an invoice still in To
    // review. To pay and Paid are read-only, so their files wait for Back to review.
    authorize: async (invoiceId, pathname, payload) => {
      const limits = invoiceUploadLimits("invoice-upload", invoiceId, pathname, payload.fileKind);
      if (typeof limits === "string") throw new UploadRefusal(limits);
      const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { stage: true } });
      if (!inv) throw new UploadRefusal("Not found", true);
      if (inv.stage !== "REVIEW") throw new UploadRefusal("Move it back to To review to add a file.", true);
      return limits;
    },
  },
  "portal-invoice-upload": {
    principal: "contractor",
    idKey: "taskId",
    // Send invoice (4.1): from a full sign-in, on a job with live access, once it's In review or Done. The files wait
    // in invoice-sends/<taskId>/<contactId>/ until the send records them on the new invoice (invoices/files.ts). The
    // folder is the signed-in contractor's own, so no one else on the job can stage into it or claim from it.
    authorize: async (taskId, pathname, payload, who) => {
      if (who.kind !== "contractor") throw new UploadRefusal("Not found");
      const limits = invoiceUploadLimits("portal-invoice-upload", invoiceSendParent(taskId, who.contactId), pathname, payload.fileKind);
      if (typeof limits === "string") throw new UploadRefusal(limits);
      const refusal = await sendRefusal(prisma, taskId, who);
      if (refusal) throw new UploadRefusal(refusal, true);
      return limits;
    },
  },
} satisfies Record<UploadKindKey, UploadKind>;

async function currentUploader(kind: Uploader["kind"]): Promise<Uploader | null> {
  if (kind === "staff") {
    const user = await getCurrentUser();
    return user ? { kind: "staff", userId: user.id } : null;
  }
  const portal = await getPortalPrincipal();
  return portal ? { kind: "contractor", contactId: portal.contactId, onlyTaskId: portal.onlyTaskId } : null;
}

export async function POST(request: Request, ctx: RouteContext<"/api/blob/[kind]">): Promise<NextResponse> {
  const { kind } = await ctx.params;
  if (!Object.hasOwn(KINDS, kind)) return NextResponse.json({ error: "Unknown upload kind" }, { status: 404 });
  const cfg = KINDS[kind];

  // Listing and building photos go to the public store, everything else to the private one (blob-stores.ts).
  const access = UPLOAD_KIND_ACCESS[kind as UploadKindKey];
  const token = blobToken(access);
  if (!token) {
    return NextResponse.json({ error: noStoreMessage(access) }, { status: 503 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "That request isn't valid." }, { status: 400 });
  }

  // A token request comes from a signed-in browser. The upload-completed
  // callback comes from Blob itself, signed, with no session; handleUpload
  // verifies that signature.
  let who: Uploader | null = null;
  if (body.type === "blob.generate-client-token") {
    who = await currentUploader(cfg.principal);
    if (!who) {
      // Portal uploads don't exist while the portal is off or for anyone not signed in to it.
      if (cfg.principal === "contractor") return NextResponse.json({ error: "Not found" }, { status: 404 });
      // getCurrentUser() (not requireUser) so an expired session is a real
      // error message instead of an opaque NEXT_REDIRECT inside a Route Handler.
      return NextResponse.json({ error: "Your session expired, so reload the page and sign in again." }, { status: 400 });
    }
  }

  try {
    const result = await handleUpload({
      token,
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!who) throw new UploadRefusal("Not signed in");
        let parsed: unknown;
        try {
          parsed = JSON.parse(clientPayload ?? "{}");
        } catch {
          throw new UploadRefusal("That request isn't valid.");
        }
        const payload = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
        const wrongQueue = ownerRefusal(payload.owner, who.kind === "staff" ? appScope(who.userId) : portalScope(who.contactId));
        if (wrongQueue) throw new UploadRefusal(wrongQueue);
        const id = payload[cfg.idKey];
        if (typeof id !== "string" || !id) throw new UploadRefusal(`Missing ${cfg.idKey}`);
        const limits = await cfg.authorize(id, pathname, payload, who);
        return {
          addRandomSuffix: true,
          allowOverwrite: false,
          ...limits,
          tokenPayload: JSON.stringify({ [cfg.idKey]: id, principal: who.kind }),
        };
      },
      // No onUploadCompleted: the row is written by the record action, which checks the blob itself. With one, Blob
      // would call this route back after every file to run nothing, and every token logs that no callback URL could
      // be found off Vercel. A callback an older token still asks for is verified and answered all the same.
    });
    return NextResponse.json(result);
  } catch (err) {
    // Contractors reach this route too: a database or Blob error is logged in
    // full and answered with a generic line, never its own message. A refusal
    // is a 400 (the tile turns red); anything the route didn't throw on purpose
    // is a 503, so the file waits and tries again (token-failure.ts).
    const failure = tokenFailure(err, body.type);
    if (failure.status === 503) logError("blob:token", err, { kind });
    return NextResponse.json({ error: failure.message, ...(failure.final ? { final: true } : {}) }, { status: failure.status });
  }
}
