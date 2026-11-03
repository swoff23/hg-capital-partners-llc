"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { withLog, withResult } from "@/lib/server-action";
import { parseDealPatch, type dealFieldsSchema } from "@/lib/deals/fields";
import * as deals from "@/lib/deals/service";

/**
 * Thin server actions: authenticate, validate, call the deal service.
 * Everything that touches the database lives in src/lib/deals/service.ts.
 * New deal's create is `deals/new/actions.ts`; a note on the deal's
 * timeline is `deals/[id]/note-actions.ts`. The edits here and New deal check
 * every field by the same rules (lib/deals/fields.ts).
 */

/**
 * The Deals list's stage pick. Parsed like `saveDealFields`, so a direct call
 * can't store what the deal page would refuse (a one-letter address, units as
 * text, a `javascript:` link). A refusal throws to the caller, which the list
 * row catches (`callAction`); the deal page saves through `saveDealFields`,
 * which answers with a result instead.
 */
export async function patchDeal(id: string, patch: deals.DealPatch) {
  return withLog("patchDeal", async () => {
    const user = await requireUser();
    await deals.patchDeal(z.string().min(1).parse(id), parseDealPatch(patch), user);
  });
}

/**
 * Save the deal page's edits: the heading, the rail's facts, the stage. Each
 * carries the text it loaded in `expected`, so a field someone else saved
 * meanwhile refuses the save and says who and when, instead of being written
 * over. A refusal comes back as a result: the field stays open with what was
 * typed, and its line says why in plain words (lib/deals/fields.ts).
 */
export async function saveDealFields(
  id: string,
  patch: z.input<typeof dealFieldsSchema>,
  expected: Record<string, string> = {},
): Promise<ActionResult> {
  return withResult("saveDealFields", async () => {
    const user = await requireUser();
    await deals.patchDeal(
      z.string().min(1).parse(id),
      parseDealPatch(patch),
      user,
      z.record(z.string(), z.string().max(2000)).parse(expected),
    );
  });
}

/**
 * Archive the deal, or with `archived` false restore it: its page's ⋯ menu,
 * its Archived line, and the toast's Undo for either.
 */
export async function setDealArchived(id: string, archived: boolean): Promise<ActionResult> {
  return withResult("setDealArchived", async () => {
    const user = await requireUser();
    await deals.setDealArchive(z.string().min(1).parse(id), z.boolean().parse(archived), user);
  });
}
