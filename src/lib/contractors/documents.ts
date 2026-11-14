import "server-only";
import { BlobNotFoundError, del, head, type HeadBlobResult } from "@vercel/blob";
import { UPLOAD_RULES, fileKindForType, filenameForType, normalizeContentType } from "@/lib/attachments/content-types";
import { blobSizeRefusal, storedContactDocumentPath } from "@/lib/attachments/limits";
import { isPrivateStoreUrl, storeIdFromToken } from "@/lib/attachments/paths";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";

/**
 * A contractor's W-9 and insurance files (docs/specs/contractor-onboarding.md): the one record step for both ways
 * in, the contractor's own setup (lib/portal/setup.ts) and staff adding one from the contractor's page (a W-9 that
 * came by email). Each checks who may write first; this checks the blob itself, as property documents do: where it
 * is, that it's in the private store, its type and its size. Older files stay; the newest of a kind is the one shown.
 */

export class ContactDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContactDocumentError";
  }
}

export type ContactDocFolder = "w9" | "insurance";

/** The Blob token and the private store's id, or a refusal a person can read. */
export function contactBlobAuth(): { token: string; storeId: string } {
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  const storeId = storeIdFromToken(token);
  if (!token || !storeId) throw new ContactDocumentError("File uploads need a Blob store, and none is connected yet.");
  return { token, storeId };
}

/** Deletes a stored blob, logging (never throwing) when Blob says no. */
export async function discardContactBlob(url: string | null, pathname: string, token: string): Promise<void> {
  try {
    await del(url ?? pathname, { token });
  } catch (err) {
    logError("contractors:documents:discard", err, { pathname });
  }
}

/** Records an uploaded W-9 or policy on the contractor. `by` is the contractor (from setup) or a partner. */
export async function storeContactDocument(
  contactId: string,
  docKind: ContactDocFolder,
  input: { pathname: string; filename: string },
  by: { contactId: string; userId?: never } | { userId: string; contactId?: never },
): Promise<{ id: string }> {
  const { token, storeId } = contactBlobAuth();
  if (!storedContactDocumentPath(input.pathname, contactId, docKind)) throw new ContactDocumentError("That file isn't in this contractor's folder.");
  if (await prisma.contactDocument.findUnique({ where: { pathname: input.pathname }, select: { id: true } })) {
    throw new ContactDocumentError("That file is already added.");
  }
  let blob: HeadBlobResult;
  try {
    blob = await head(input.pathname, { token });
  } catch (err) {
    if (err instanceof BlobNotFoundError) throw new ContactDocumentError("That upload didn't finish. Try again.");
    throw err;
  }
  const refuse = async (message: string): Promise<never> => {
    await discardContactBlob(blob.pathname === input.pathname ? blob.url : null, input.pathname, token);
    throw new ContactDocumentError(message);
  };
  if (blob.pathname !== input.pathname || !isPrivateStoreUrl(blob.url, storeId, input.pathname)) return refuse("That file isn't in our private storage.");
  const contentType = normalizeContentType(blob.contentType);
  const kind = fileKindForType(contentType);
  if (!kind || kind === "video") return refuse("Add a photo or a PDF.");
  const sizeRefusal = blobSizeRefusal(blob.size, UPLOAD_RULES[kind].maxBytes);
  if (sizeRefusal) return refuse(sizeRefusal);
  const row = await prisma.contactDocument.create({
    data: {
      contactId,
      kind: docKind === "w9" ? "W9" : "INSURANCE",
      url: blob.url,
      pathname: input.pathname,
      filename: filenameForType(input.filename, contentType).slice(0, 255) || "file",
      size: Math.max(0, Math.trunc(blob.size)),
      contentType,
      uploadedByContactId: by.contactId ?? null,
      uploadedByUserId: by.userId ?? null,
    },
    select: { id: true },
  });
  // A policy on file answers the insurance question.
  if (docKind === "insurance") await prisma.contact.update({ where: { id: contactId }, data: { noInsurance: false } });
  return row;
}

/** Staff adding a file from the contractor's page: any contractor, archived ones aside. */
export async function storeStaffContactDocument(
  contactId: string,
  docKind: ContactDocFolder,
  input: { pathname: string; filename: string },
  userId: string,
): Promise<{ id: string }> {
  const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { archivedAt: true } });
  if (!c) throw new ContactDocumentError("This contractor no longer exists.");
  if (c.archivedAt) throw new ContactDocumentError("Restore this contractor first.");
  return storeContactDocument(contactId, docKind, input, { userId });
}
