"use server";
import { requireUser } from "@/lib/auth";
import { addDealNote as addNote } from "@/lib/deals/notes";
import { withLog } from "@/lib/server-action";

/**
 * The deal page's note box: authenticate, then add the note through
 * lib/deals/notes.ts. Moved here from deals/actions.ts so the deal's
 * Activity owns its own write.
 */
export async function addDealNote(dealId: string, formData: FormData) {
  return withLog("addDealNote", async () => {
    const user = await requireUser();
    await addNote(dealId, String(formData.get("body") ?? ""), user);
  });
}
