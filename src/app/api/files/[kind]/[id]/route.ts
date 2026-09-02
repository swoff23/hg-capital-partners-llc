import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { contentDisposition } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Session-gated file delivery for private documents (property attachments,
 * task attachments). The stored blob URL is never sent to the browser;
 * links point here, and this streams the bytes only to a signed-in user.
 *
 * Files uploaded before documents went private are still public blobs;
 * `get` is tried with private access first, then public, so those keep
 * working until "Move documents to private storage" (Settings → Storage)
 * has re-uploaded them.
 */
async function lookup(kind: string, id: string) {
  if (kind === "task") {
    const a = await prisma.taskAttachment.findUnique({ where: { id } });
    return a && { url: a.url, filename: a.filename, contentType: a.contentType };
  }
  if (kind === "property") {
    const a = await prisma.propertyAttachment.findUnique({ where: { id } });
    return a && { url: a.url, filename: a.filename, contentType: a.contentType };
  }
  return null;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/files/[kind]/[id]">) {
  if (!(await getCurrentUser())) return new NextResponse("Unauthorized", { status: 401 });
  const { kind, id } = await ctx.params;
  const att = await lookup(kind, id);
  if (!att) return new NextResponse("Not found", { status: 404 });

  let blob = await get(att.url, { access: "private" }).catch(() => null);
  if (!blob || blob.statusCode !== 200) blob = await get(att.url, { access: "public" }).catch(() => null);
  if (!blob || blob.statusCode !== 200) return new NextResponse("File is missing from storage", { status: 404 });

  const headers = new Headers();
  headers.set("Content-Type", att.contentType || blob.headers.get("content-type") || "application/octet-stream");
  headers.set("Content-Disposition", contentDisposition(att.filename));
  headers.set("Cache-Control", "private, no-store");
  const len = blob.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  return new NextResponse(blob.stream, { status: 200, headers });
}
