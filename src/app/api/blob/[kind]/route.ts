import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { propertyUploadLimits, uploadLimits } from "@/lib/attachments/limits";
import { UploadRefusal, tokenFailure } from "@/lib/attachments/token-failure";
import { UPLOAD_KIND_ALLOWED, type UploadKind as UploadKindKey } from "@/lib/attachments/upload-kinds";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
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
 *
 * The keys are lib/attachments/upload-kinds.ts UPLOAD_KINDS, which the
 * uploaders send; the table below is typed against that list, so a kind
 * without an entry fails typecheck. What each kind accepts is one table: the
 * uploader's check, this route's token and the record step's head() read the
 * same one (attachments/limits.ts, content-types.ts UPLOAD_RULES).
 *
 * A 400 means the server said no (an UploadRefusal: the job closed, a type or
 * size that isn't allowed, a session that ended) and the uploader's tile turns
 * red. Anything else that goes wrong, a database blip included, is a 503, which
 * the uploader waits out and tries again (attachments/token-failure.ts).
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

type Uploader = { kind: "staff"; userId: string } | { kind: "contractor"; contactId: string };

interface Limits {
  maximumSizeInBytes: number;
  allowedContentTypes?: string[];
}

interface UploadKind {
  /** Who may mint a token for this kind. */
  principal: Uploader["kind"];
  /** clientPayload key naming the parent row. */
  idKey: "taskId" | "propertyId";
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
  kind: "property-upload" | "listing-photo-upload" | "property-photo-upload",
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
      const refusal = await contractorUploadRefusal(taskId, who.contactId, { atMint: true, queuedAt: stringOrNull(payload.queuedAt) });
      if (refusal) throw new UploadRefusal(refusal);
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
} satisfies Record<UploadKindKey, UploadKind>;

async function currentUploader(kind: Uploader["kind"]): Promise<Uploader | null> {
  if (kind === "staff") {
    const user = await getCurrentUser();
    return user ? { kind: "staff", userId: user.id } : null;
  }
  const portal = await getPortalPrincipal();
  return portal ? { kind: "contractor", contactId: portal.contactId } : null;
}

export async function POST(request: Request, ctx: RouteContext<"/api/blob/[kind]">): Promise<NextResponse> {
  const { kind } = await ctx.params;
  if (!Object.hasOwn(KINDS, kind)) return NextResponse.json({ error: "Unknown upload kind" }, { status: 404 });
  const cfg = KINDS[kind];

  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "File uploads need a Blob store, and none is connected yet." }, { status: 503 });
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
      // Fires only from deployed environments; the DB row is recorded by the action.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (err) {
    // Contractors reach this route too: a database or Blob error is logged in
    // full and answered with a generic line, never its own message. A refusal
    // is a 400 (the tile turns red); anything the route didn't throw on purpose
    // is a 503, so the file waits and tries again (token-failure.ts).
    const failure = tokenFailure(err, body.type);
    if (failure.status === 503) logError("blob:token", err, { kind });
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
