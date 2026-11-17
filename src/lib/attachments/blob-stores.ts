import "server-only";
import { getEnv } from "@/lib/env";

/**
 * Which Vercel Blob store a file lives in. Vercel sets public or private once,
 * for a whole store, and a private store refuses a public upload (Nov 15: every
 * listing photo failed that way, since the one store was private). So there are two:
 *
 *   private  BLOB_READ_WRITE_TOKEN         documents, task and job files, W-9s, leases
 *   public   PUBLIC_BLOB_READ_WRITE_TOKEN  listing photos and the building's photo, for the public site
 *
 * Neither falls back to the other: a public photo sent to the private store is
 * refused, and a private file in the public store could be read by anyone with
 * its URL. The upload kinds say which one each kind uses (upload-kinds.ts
 * UPLOAD_KIND_ACCESS).
 */
export type BlobAccess = "private" | "public";

export function blobToken(access: BlobAccess): string | undefined {
  const env = getEnv();
  return (access === "public" ? env.PUBLIC_BLOB_READ_WRITE_TOKEN : env.BLOB_READ_WRITE_TOKEN) || undefined;
}

/** The line a route or record step gives when the store a kind needs isn't connected. */
export function noStoreMessage(access: BlobAccess): string {
  return access === "public"
    ? "Listing photos need a public Blob store, and none is connected yet."
    : "File uploads need a Blob store, and none is connected yet.";
}
