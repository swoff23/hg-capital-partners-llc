import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { userMessage } from "@/lib/action-result";
import { uploadLimits } from "@/lib/attachments/limits";
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
 * (recordTaskAttachment / recordPropertyAttachment / updatePropertyListings),
 * which for tasks checks the blob itself with head() rather than trusting
 * the browser.
 *
 *   /api/blob/task-upload           { taskId, fileKind }   staff
 *   /api/blob/portal-task-upload    { taskId, fileKind }   contractor, on a job they can open
 *   /api/blob/property-upload       { propertyId }         staff
 *   /api/blob/listing-photo-upload  { propertyId }         staff, images only
 *
 * Task kinds only accept a path under tasks/<taskId>/ (paths.ts): Blob can't
 * pick the path for us, only refuse the one asked for. Their token carries a
 * per-type allowlist and size cap from `fileKind` (attachments/limits.ts).
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

const MB = 1024 * 1024;
const propertyExists = async (id: string) => !!(await prisma.property.findUnique({ where: { id }, select: { id: true } }));

/** The path must be this task's, and the type and size fit what the file says it is. */
function taskLimits(taskId: string, pathname: string, payload: Record<string, unknown>): Limits {
  const limits = uploadLimits(taskId, pathname, payload.fileKind);
  if (typeof limits === "string") throw new Error(limits);
  return limits;
}

const KINDS: Record<string, UploadKind> = {
  "task-upload": {
    principal: "staff",
    idKey: "taskId",
    authorize: async (taskId, pathname, payload) => {
      const limits = taskLimits(taskId, pathname, payload);
      if (!(await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } }))) throw new Error("Not found");
      return limits;
    },
  },
  "portal-task-upload": {
    principal: "contractor",
    idKey: "taskId",
    authorize: async (taskId, pathname, payload, who) => {
      const limits = taskLimits(taskId, pathname, payload);
      if (who.kind !== "contractor") throw new Error("Not found");
      const refusal = await contractorUploadRefusal(taskId, who.contactId, { atMint: true });
      if (refusal) throw new Error(refusal);
      return limits;
    },
  },
  "property-upload": {
    principal: "staff",
    idKey: "propertyId",
    authorize: async (id) => {
      if (!(await propertyExists(id))) throw new Error("Not found");
      return { maximumSizeInBytes: 50 * MB };
    },
  },
  "listing-photo-upload": {
    principal: "staff",
    idKey: "propertyId",
    authorize: async (id) => {
      if (!(await propertyExists(id))) throw new Error("Not found");
      // 25MB: a plain 10MB cap rejected real phone photos. No HEIC: most
      // browsers can't render it inline on the public site.
      return { maximumSizeInBytes: 25 * MB, allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"] };
    },
  },
};

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

  const body = (await request.json()) as HandleUploadBody;

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
        if (!who) throw new Error("Not signed in");
        const parsed: unknown = JSON.parse(clientPayload ?? "{}");
        const payload = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
        const id = payload[cfg.idKey];
        if (typeof id !== "string" || !id) throw new Error(`Missing ${cfg.idKey}`);
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
    // full and answered with a generic line, never its own message.
    logError("blob:token", err, { kind });
    return NextResponse.json({ error: userMessage(err) }, { status: 400 });
  }
}
