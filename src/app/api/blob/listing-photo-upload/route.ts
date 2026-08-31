import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Mints short-lived client-upload tokens for a listing's hero photo. Same
 * pattern as api/blob/property-upload — authenticated (only Connor/Pieter add
 * listings), scoped to a real property, browser uploads straight to Blob.
 * Images only, well under the 50MB document limit — this is one photo, not a
 * file cabinet.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "File uploads aren't configured — no Blob store connected yet." },
      { status: 503 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        await requireUser();
        const { propertyId } = JSON.parse(clientPayload ?? "{}") as { propertyId?: string };
        if (!propertyId) throw new Error("Missing propertyId");
        const property = await prisma.property.findUnique({
          where: { id: propertyId },
          select: { id: true },
        });
        if (!property) throw new Error("Property not found");
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: 10 * 1024 * 1024,
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }
}
