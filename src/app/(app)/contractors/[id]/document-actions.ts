"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { MAX_FILENAME } from "@/lib/attachments/content-types";
import { appScope, assertQueueOwner } from "@/lib/attachments/queue-owner";
import { storeStaffContactDocument } from "@/lib/contractors/documents";
import { withResult } from "@/lib/server-action";

/**
 * A W-9 or insurance policy a partner adds from the contractor's page, such as one that came by email
 * (docs/specs/contractor-onboarding.md). The rules and the blob checks are lib/contractors/documents.ts.
 */

const id = z.string().min(1).max(64);
const docKind = z.enum(["w9", "insurance"]);

// Where the browser put the file and what to call it, never its URL, size or type: the service reads those from Blob.
// The queue sends display hints along; a contractor's paperwork keeps none of them.
const recordedSchema = z
  .object({
    pathname: z.string().min(1).max(300),
    filename: z.string().min(1).max(MAX_FILENAME * 4),
    width: z.number().nullish(),
    height: z.number().nullish(),
    durationSec: z.number().nullish(),
    thumbPathname: z.string().nullish(),
    posterPathname: z.string().nullish(),
  })
  .strict();

/** After the browser finished uploading straight to Blob: records the file on the contractor. */
export async function recordContactDocumentAction(
  contactId: string,
  kind: "w9" | "insurance",
  file: z.input<typeof recordedSchema>,
  queueOwner?: string | null,
): Promise<ActionResult<{ id: string }>> {
  return withResult("recordContactDocument", async () => {
    const user = await requireUser();
    assertQueueOwner(z.string().max(80).nullish().parse(queueOwner), appScope(user.id));
    const { pathname, filename } = recordedSchema.parse(file);
    const contact = id.parse(contactId);
    const row = await storeStaffContactDocument(contact, docKind.parse(kind), { pathname, filename }, user.id);
    revalidatePath(`/contractors/${contact}`);
    revalidatePath("/contractors");
    return row;
  });
}
