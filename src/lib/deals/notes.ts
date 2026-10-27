import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { initials } from "@/lib/utils";

/**
 * A deal's notes: what a partner writes on its timeline (`DealNote.source =
 * "manual"`). Moved out of service.ts so the deal's Activity (the record log,
 * docs/specs/activity-comments.md 2.9) owns its writes; the field changes
 * are deals/log.ts.
 */

/** Who wrote it: the signed-in user, as requireUser() returns them. */
export interface NoteAuthor {
  id: string;
  name: string | null;
  email: string;
}

/** A manual note on the timeline, signed with the author's initials. */
export async function addDealNote(dealId: string, body: string, actor: NoteAuthor): Promise<void> {
  const text = body.trim();
  if (!text) return;
  await prisma.dealNote.create({
    data: {
      dealId,
      body: `${text} (${initials(actor.name ?? actor.email)})`,
      noteDate: new Date(),
      source: "manual",
    },
  });
  revalidatePath(`/deals/${dealId}`);
}
