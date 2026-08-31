import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Mints short-lived client-upload tokens for task attachments. The browser
 * uploads straight to Vercel Blob (no 4.5 MB serverless body limit); the DB row
 * is written afterwards by `recordTaskAttachment`.
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
        // requireUser() calls next/navigation's redirect(), which doesn't work inside a
        // Route Handler — it throws an opaque "NEXT_REDIRECT" that's indistinguishable
        // from a real error. getCurrentUser() just returns null instead, for a real 401.
        const user = await getCurrentUser();
        if (!user) throw new Error("Your session has expired — reload the page and sign in again.");
        const { taskId } = JSON.parse(clientPayload ?? "{}") as { taskId?: string };
        if (!taskId) throw new Error("Missing taskId");
        const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
        if (!task) throw new Error("Task not found");
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: 50 * 1024 * 1024,
        };
      },
      // Fires only from deployed environments; local dev records via the action.
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
