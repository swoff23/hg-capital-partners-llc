import { get, issueSignedToken, presignUrl } from "@vercel/blob";
import { NextResponse } from "next/server";
import { contractorMaySee } from "@/lib/attachments/access";
import { normalizeContentType } from "@/lib/attachments/content-types";
import {
  ERROR_HEADERS,
  SIGNED_VIDEO_TTL_MS,
  fileResponseHeaders,
  previewName,
  signedRedirectHeaders,
  singleByteRange,
} from "@/lib/attachments/headers";
import { isPrivateStoreUrl, storeIdFromToken } from "@/lib/attachments/paths";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { getPortalPrincipal } from "@/lib/portal/session";
import { assertContractorAccess } from "@/lib/tasks/core";

export const dynamic = "force-dynamic";

/**
 * Gated file delivery for private documents (property attachments, task
 * attachments). The stored blob URL is never sent to the browser; links
 * point here, and this checks who's asking before streaming the bytes.
 *
 * Who may fetch what (KIND_VIEWERS):
 * - Staff get every file, as before. Files uploaded before documents went
 *   private are still public blobs, so for staff `get` is tried with private
 *   access first, then public, until "Move documents to private storage"
 *   (Settings → Storage) has re-uploaded them.
 * - Contractors get task files only: Shared, not removed, on a job they can
 *   open (core.assertContractorAccess), and only from our private store.
 *   Never property documents, never the public fallback.
 *
 * `?v=thumb` / `?v=poster` serve the row's thumbnail or video poster,
 * authorized by the row itself. A LINK row has no bytes here (the UI links
 * straight to it), so it's a 404. Videos redirect to a signed Blob URL for
 * that one path, good for 10 minutes, so phones can make Range requests
 * straight to Blob. Headers are in src/lib/attachments/headers.ts.
 */

type Viewer = { kind: "staff" } | { kind: "contractor"; contactId: string };

const KIND_VIEWERS: Record<string, readonly Viewer["kind"][]> = {
  task: ["staff", "contractor"],
  property: ["staff"],
};

interface Served {
  /** Blob URL or pathname in our store. */
  source: string;
  /** For signing a video URL; null when it can't be signed (an old public blob). */
  privatePathname: string | null;
  filename: string;
  contentType: string | null;
  /** Staff only: may fall back to the old public blob. */
  publicFallback: boolean;
}

type Variant = "thumb" | "poster";

async function currentViewer(allowed: readonly Viewer["kind"][]): Promise<Viewer | null> {
  if (allowed.includes("staff") && (await getCurrentUser())) return { kind: "staff" };
  if (allowed.includes("contractor")) {
    const portal = await getPortalPrincipal();
    if (portal) return { kind: "contractor", contactId: portal.contactId };
  }
  return null;
}

async function lookup(kind: string, id: string, variant: Variant | null, viewer: Viewer, storeId: string | null): Promise<Served | null> {
  if (kind === "task") {
    const a = await prisma.taskAttachment.findUnique({
      where: { id },
      select: {
        taskId: true,
        kind: true,
        url: true,
        pathname: true,
        filename: true,
        contentType: true,
        visibility: true,
        deletedAt: true,
        thumbPathname: true,
        posterPathname: true,
      },
    });
    if (!a || a.kind === "LINK" || !a.url) return null;
    const isPrivate = !!a.pathname && isPrivateStoreUrl(a.url, storeId, a.pathname);
    if (viewer.kind === "contractor") {
      if (!contractorMaySee(a) || !isPrivate) return null;
      try {
        await assertContractorAccess(prisma, a.taskId, viewer.contactId);
      } catch {
        return null;
      }
    }
    if (variant) {
      const p = variant === "thumb" ? a.thumbPathname : a.posterPathname;
      return p ? { source: p, privatePathname: p, filename: previewName(a.filename, variant, p), contentType: null, publicFallback: false } : null;
    }
    return {
      source: a.url,
      privatePathname: isPrivate ? a.pathname : null,
      filename: a.filename,
      contentType: a.contentType,
      publicFallback: viewer.kind === "staff",
    };
  }
  if (kind === "property" && viewer.kind === "staff" && !variant) {
    const a = await prisma.propertyAttachment.findUnique({ where: { id } });
    if (!a) return null;
    const isPrivate = isPrivateStoreUrl(a.url, storeId, a.pathname);
    return { source: a.url, privatePathname: isPrivate ? a.pathname : null, filename: a.filename, contentType: a.contentType, publicFallback: true };
  }
  return null;
}

/** A GET URL for exactly this pathname, valid 10 minutes; null when the token can't sign one. */
async function signedVideoUrl(pathname: string, token: string): Promise<string | null> {
  // Signed URLs are built from the raw pathname; an old name with spaces or
  // other characters is streamed instead.
  if (!/^[A-Za-z0-9._\-/]+$/.test(pathname)) return null;
  try {
    const validUntil = Date.now() + SIGNED_VIDEO_TTL_MS;
    const signed = await issueSignedToken({ token, pathname, operations: ["get"], validUntil });
    const { presignedUrl } = await presignUrl(signed, { operation: "get", pathname, validUntil, access: "private" });
    return presignedUrl;
  } catch (err) {
    logError("files:sign-video", err, { pathname });
    return null;
  }
}

const fail = (message: string, status: number) => new NextResponse(message, { status, headers: ERROR_HEADERS });

export async function GET(req: Request, ctx: RouteContext<"/api/files/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  if (!Object.hasOwn(KIND_VIEWERS, kind)) return fail("Not found", 404);
  const allowed = KIND_VIEWERS[kind];
  const viewer = await currentViewer(allowed);
  if (!viewer) return fail("Unauthorized", 401);

  const v = new URL(req.url).searchParams.get("v");
  if (v !== null && v !== "thumb" && v !== "poster") return fail("Not found", 404);
  const variant: Variant | null = v;

  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  const file = await lookup(kind, id, variant, viewer, storeIdFromToken(token));
  if (!file) return fail("Not found", 404);

  const isVideo = !variant && normalizeContentType(file.contentType).startsWith("video/");
  if (isVideo && token && file.privatePathname) {
    const location = await signedVideoUrl(file.privatePathname, token);
    if (location) return new NextResponse(null, { status: 302, headers: signedRedirectHeaders(location) });
  }

  // Videos that couldn't be signed stream here instead, one byte range at a time.
  const range = isVideo ? singleByteRange(req.headers.get("range")) : null;
  const opts = { token, ...(range ? { headers: { range } } : {}) };
  // get() throws on any status but 200, 206, 304 and 404. A range past the
  // end is Blob's 416, which a player expects back as a 416, not a 404.
  let rangeRefused = false;
  const fetchBlob = (access: "private" | "public") =>
    get(file.source, { access, ...opts }).catch((err: unknown) => {
      if (range && err instanceof Error && / 416\b/.test(err.message)) rangeRefused = true;
      return null;
    });
  let blob = await fetchBlob("private");
  if ((!blob || blob.statusCode !== 200) && !rangeRefused && file.publicFallback) blob = await fetchBlob("public");
  if (rangeRefused) {
    return new NextResponse(null, { status: 416, headers: { ...ERROR_HEADERS, "Content-Range": "bytes */*" } });
  }
  if (!blob || blob.statusCode !== 200) return fail("File is missing from storage", 404);

  const headers = fileResponseHeaders({
    contentType: file.contentType || blob.headers.get("content-type"),
    filename: file.filename,
    size: blob.headers.get("content-length"),
  });
  const contentRange = blob.headers.get("content-range");
  if (isVideo) headers["Accept-Ranges"] = "bytes";
  if (contentRange) headers["Content-Range"] = contentRange;
  return new NextResponse(blob.stream, { status: contentRange ? 206 : 200, headers });
}
