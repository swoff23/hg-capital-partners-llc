import "server-only";
import { revalidatePath } from "next/cache";
import { BlobNotFoundError, del, head, type HeadBlobResult } from "@vercel/blob";
import { UPLOAD_RULES, fileKindForType, filenameForType, normalizeContentType } from "@/lib/attachments/content-types";
import { storedPropertyDocumentPath } from "@/lib/attachments/limits";
import { isPrivateStoreUrl, storeIdFromToken } from "@/lib/attachments/paths";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";

/**
 * A property's Documents (docs/specs/uploads-photos.md 2.4): the record step
 * for what the browser just uploaded straight to private Blob, and deleting
 * and renaming. Moved out of ./service.ts (build plan 1.3). Server actions
 * (properties/[id]/document-actions.ts) authenticate and parse, then call in.
 *
 * The record step no longer takes the browser's word for the file: like a
 * task's it asks Blob (head()) for the real size and type, and holds them to
 * the same table the token route used (content-types.ts UPLOAD_RULES:
 * documents up to 50 MB, photos up to 25 MB), so the server stops trusting the
 * browser. A file that is refused is deleted from the store.
 */

/** A document the server won't keep. The message is for the person uploading. */
export class PropertyDocumentError extends Error {}

/** What the browser sends once an upload finishes: where it put the file and what to call it. */
export interface PropertyDocumentInput {
  pathname: string;
  filename: string;
}

/** Who added it: the signed-in staff member, for "Connor · Oct 3". */
export interface PropertyDocumentActor {
  userId: string;
}

function blobAuth(): { token: string; storeId: string } {
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  const storeId = storeIdFromToken(token);
  if (!token || !storeId) throw new PropertyDocumentError("File uploads need a Blob store, and none is connected yet.");
  return { token, storeId };
}

/** Best effort: delete a blob a refused record step named, so it doesn't sit in the store unrecorded. */
async function discard(url: string | null, pathname: string, token: string): Promise<void> {
  try {
    await del(url ?? pathname, { token });
  } catch (err) {
    logError("properties:documents:discard", err, { pathname });
  }
}

/**
 * Records a property document the browser uploaded to
 * /api/blob/property-upload. The path must be this property's, the blob must
 * be in our private store, and its type and size must fit the table. Returns
 * the new row's id.
 */
export async function recordPropertyAttachment(
  propertyId: string,
  input: PropertyDocumentInput,
  by: PropertyDocumentActor,
): Promise<{ id: string }> {
  const { token, storeId } = blobAuth();
  if (!storedPropertyDocumentPath(input.pathname, propertyId)) throw new PropertyDocumentError("That file isn't in this property's folder.");
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  if (!property) throw new PropertyDocumentError("That property no longer exists.");
  if (await prisma.propertyAttachment.findFirst({ where: { pathname: input.pathname }, select: { id: true } })) {
    throw new PropertyDocumentError("That file is already attached.");
  }

  let blob: HeadBlobResult;
  try {
    blob = await head(input.pathname, { token });
  } catch (err) {
    if (err instanceof BlobNotFoundError) throw new PropertyDocumentError("That upload didn't finish. Try again.");
    throw err;
  }
  const refuse = async (message: string): Promise<never> => {
    await discard(blob.pathname === input.pathname ? blob.url : null, input.pathname, token);
    throw new PropertyDocumentError(message);
  };
  if (blob.pathname !== input.pathname || !isPrivateStoreUrl(blob.url, storeId, input.pathname)) {
    return refuse("That file isn't in our private storage.");
  }
  const contentType = normalizeContentType(blob.contentType);
  const kind = fileKindForType(contentType);
  if (!kind || kind === "video") return refuse("That type of file can't be added here.");
  const cap = UPLOAD_RULES[kind].maxBytes;
  if (blob.size > cap) return refuse(`That file is over the ${Math.round(cap / (1024 * 1024))} MB limit.`);

  const row = await prisma.propertyAttachment.create({
    data: {
      propertyId,
      url: blob.url,
      pathname: input.pathname,
      // The name agrees with the verified type, so "Invoice.html" stored as text/plain is "Invoice.txt".
      filename: filenameForType(input.filename, contentType).slice(0, 255) || "file",
      size: Math.max(0, Math.trunc(blob.size)),
      contentType,
      uploadedByUserId: by.userId,
    },
    select: { id: true },
  });
  revalidatePath(`/properties/${propertyId}`);
  return { id: row.id };
}

/** Removes the row, then the blob, for good. Rows from before documents went private may point at a public blob; del() takes either. */
export async function deletePropertyAttachment(attachmentId: string): Promise<void> {
  const att = await prisma.propertyAttachment.findUnique({ where: { id: attachmentId } });
  if (!att) return;
  await prisma.propertyAttachment.delete({ where: { id: attachmentId } });
  try {
    await del(att.url, { token: getEnv().BLOB_READ_WRITE_TOKEN });
  } catch (err) {
    // The blob is already gone, or the token is missing: the row is dropped all the same.
    logError("properties:documents:delete", err, { attachmentId });
  }
  revalidatePath(`/properties/${att.propertyId}`);
}

/** Gives a document a new name. The extension stays the type's, so a rename can't turn a PDF into something else. Returns the saved name. */
export async function renamePropertyAttachment(attachmentId: string, name: string): Promise<{ filename: string }> {
  const att = await prisma.propertyAttachment.findUnique({ where: { id: attachmentId }, select: { propertyId: true, contentType: true } });
  if (!att) throw new PropertyDocumentError("That file no longer exists.");
  const next = filenameForType(name.trim(), att.contentType);
  if (!name.trim()) throw new PropertyDocumentError("Enter a name.");
  await prisma.propertyAttachment.update({ where: { id: attachmentId }, data: { filename: next } });
  revalidatePath(`/properties/${att.propertyId}`);
  return { filename: next };
}
