import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

/**
 * Mints short-lived client-upload tokens so the browser uploads straight to
 * Vercel Blob (no 4.5 MB serverless body limit). One route for every kind
 * of upload; the DB row is written afterwards by the matching server action
 * (recordTaskAttachment / recordPropertyAttachment / updatePropertyListings).
 *
 * URLs are unchanged from the three routes this replaces:
 *   /api/blob/task-upload           { taskId }
 *   /api/blob/property-upload       { propertyId }
 *   /api/blob/listing-photo-upload  { propertyId }   images only
 */
interface UploadKind {
  /** clientPayload key naming the parent row. */
  idKey: "taskId" | "propertyId";
  exists: (id: string) => Promise<boolean>;
  maximumSizeInBytes: number;
  allowedContentTypes?: string[];
}

const MB = 1024 * 1024;
const propertyExists = async (id: string) => !!(await prisma.property.findUnique({ where: { id }, select: { id: true } }));

const KINDS: Record<string, UploadKind> = {
  "task-upload": {
    idKey: "taskId",
    exists: async (id) => !!(await prisma.task.findUnique({ where: { id }, select: { id: true } })),
    maximumSizeInBytes: 50 * MB,
  },
  "property-upload": { idKey: "propertyId", exists: propertyExists, maximumSizeInBytes: 50 * MB },
  "listing-photo-upload": {
    idKey: "propertyId",
    exists: propertyExists,
    // 25MB — a plain 10MB cap rejected real phone photos. No HEIC: most
    // browsers can't render it inline on the public site.
    maximumSizeInBytes: 25 * MB,
    allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  },
};

export async function POST(request: Request, ctx: RouteContext<"/api/blob/[kind]">): Promise<NextResponse> {
  const { kind } = await ctx.params;
  const cfg = KINDS[kind];
  if (!cfg) return NextResponse.json({ error: "Unknown upload kind" }, { status: 404 });

  if (!getEnv().BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "File uploads aren't configured — no Blob store connected yet." }, { status: 503 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // getCurrentUser() (not requireUser) so an expired session is a real
        // error message instead of an opaque NEXT_REDIRECT inside a Route Handler.
        const user = await getCurrentUser();
        if (!user) throw new Error("Your session has expired — reload the page and sign in again.");
        const payload = JSON.parse(clientPayload ?? "{}") as Record<string, string | undefined>;
        const id = payload[cfg.idKey];
        if (!id) throw new Error(`Missing ${cfg.idKey}`);
        if (!(await cfg.exists(id))) throw new Error("Not found");
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: cfg.maximumSizeInBytes,
          ...(cfg.allowedContentTypes ? { allowedContentTypes: cfg.allowedContentTypes } : {}),
        };
      },
      // Fires only from deployed environments; the DB row is recorded by the action.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
