import "server-only";
import { BlobNotFoundError, del, head, type HeadBlobResult } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { UPLOAD_RULES, fileKindForType, filenameForType, normalizeContentType } from "@/lib/attachments/content-types";
import { blobSizeRefusal, storedLeaseDocumentPath } from "@/lib/attachments/limits";
import { isPrivateStoreUrl, storeIdFromToken } from "@/lib/attachments/paths";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";

/**
 * A signed lease's file (docs/specs/tenants.md): the record step for what the
 * browser just uploaded straight to private Blob from the lease page, checked
 * the way a contractor's W-9 is (lib/contractors/documents.ts): where it is,
 * that it's in the private store, its type and its size. It's kept on the
 * lease and linked to its term; a term that had a file keeps the older one on
 * the lease, unlinked, so nothing signed is lost.
 */

export class LeaseFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeaseFileError";
  }
}

function blobAuth(): { token: string; storeId: string } {
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  const storeId = storeIdFromToken(token);
  if (!token || !storeId) throw new LeaseFileError("File uploads need a Blob store, and none is connected yet.");
  return { token, storeId };
}

async function discard(url: string | null, pathname: string, token: string): Promise<void> {
  try {
    await del(url ?? pathname, { token });
  } catch (err) {
    logError("tenants:files:discard", err, { pathname });
  }
}

export async function storeLeaseFile(leaseId: string, termId: string, input: { pathname: string; filename: string }, userId: string): Promise<{ id: string }> {
  const term = await prisma.leaseTerm.findUnique({ where: { id: termId }, select: { leaseId: true } });
  if (!term || term.leaseId !== leaseId) throw new LeaseFileError("This term is gone. Reload the page.");
  const { token, storeId } = blobAuth();
  if (!storedLeaseDocumentPath(input.pathname, leaseId)) throw new LeaseFileError("That file isn't in this lease's folder.");
  if (await prisma.leaseFile.findFirst({ where: { pathname: input.pathname }, select: { id: true } })) throw new LeaseFileError("That file is already added.");
  let blob: HeadBlobResult;
  try {
    blob = await head(input.pathname, { token });
  } catch (err) {
    if (err instanceof BlobNotFoundError) throw new LeaseFileError("That upload didn't finish. Try again.");
    throw err;
  }
  const refuse = async (message: string): Promise<never> => {
    await discard(blob.pathname === input.pathname ? blob.url : null, input.pathname, token);
    throw new LeaseFileError(message);
  };
  if (blob.pathname !== input.pathname || !isPrivateStoreUrl(blob.url, storeId, input.pathname)) return refuse("That file isn't in our private storage.");
  const contentType = normalizeContentType(blob.contentType);
  const kind = fileKindForType(contentType);
  if (!kind || kind === "video") return refuse("Add a PDF or a photo of the lease.");
  const sizeRefusal = blobSizeRefusal(blob.size, UPLOAD_RULES[kind].maxBytes);
  if (sizeRefusal) return refuse(sizeRefusal);

  const row = await prisma.$transaction(async (tx) => {
    const file = await tx.leaseFile.create({
      data: {
        leaseId,
        url: blob.url,
        pathname: input.pathname,
        filename: filenameForType(input.filename, contentType).slice(0, 255) || "lease",
        size: Math.max(0, Math.trunc(blob.size)),
        contentType,
        uploadedByUserId: userId,
      },
      select: { id: true },
    });
    await tx.leaseTerm.update({ where: { id: termId }, data: { fileId: file.id } });
    return file;
  });
  revalidatePath(`/tenants/${leaseId}`);
  return row;
}
