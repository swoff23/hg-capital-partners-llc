"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { appScope, assertQueueOwner } from "@/lib/attachments/queue-owner";
import * as documents from "@/lib/properties/documents";
import { withResult } from "@/lib/server-action";

/**
 * A property's Documents (docs/specs/uploads-photos.md 2.4): thin server
 * actions that authenticate, validate and call the documents service
 * (src/lib/properties/documents.ts). They hand back a result, not a throw, so
 * the uploader can show a refusal on its tile and a delete can say why it
 * didn't go.
 */

const id = z.string().min(1).max(64);

// Where the browser put the file and what to call it. Never its URL, size or
// type: the service reads those from Blob itself.
const recordedSchema = z
  .object({
    pathname: z.string().min(1).max(300),
    filename: z.string().min(1).max(255),
    // The queue sends its display hints along; documents keep none of them.
    width: z.number().nullish(),
    height: z.number().nullish(),
    durationSec: z.number().nullish(),
    thumbPathname: z.string().nullish(),
    posterPathname: z.string().nullish(),
  })
  .strict();

/**
 * After the browser finished uploading straight to Blob. Returns the new document's id. `queueOwner` is the upload
 * queue's scope (queue-owner.ts): a tab left open under another sign-in can't record its files as whoever signed in since.
 */
export async function recordPropertyDocument(
  propertyId: string,
  file: z.input<typeof recordedSchema>,
  queueOwner?: string | null,
): Promise<ActionResult<{ id: string }>> {
  return withResult("recordPropertyDocument", async () => {
    const user = await requireUser();
    assertQueueOwner(z.string().max(80).nullish().parse(queueOwner), appScope(user.id));
    const { pathname, filename } = recordedSchema.parse(file);
    return documents.recordPropertyAttachment(id.parse(propertyId), { pathname, filename }, { userId: user.id });
  });
}

/** Removes a document for good (asked once more in the list's confirm). */
export async function deletePropertyDocument(attachmentId: string): Promise<ActionResult> {
  return withResult("deletePropertyDocument", async () => {
    await requireUser();
    await documents.deletePropertyAttachment(id.parse(attachmentId));
  });
}

/** Renames a document; the extension stays its type's. Returns the saved name. */
export async function renamePropertyDocument(attachmentId: string, name: string): Promise<ActionResult<{ filename: string }>> {
  return withResult("renamePropertyDocument", async () => {
    await requireUser();
    return documents.renamePropertyAttachment(id.parse(attachmentId), z.string().max(255).parse(name));
  });
}
