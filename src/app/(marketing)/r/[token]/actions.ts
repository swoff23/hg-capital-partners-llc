"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireResidentLink } from "@/lib/residents/links";
import { DETAILS_MAX, NOTE_MAX, PETS_NOTE_MAX, WHATS_WRONG_MAX, addToRequest, cancelOwnRequest, recordResidentUpload, submitRequest } from "@/lib/residents/requests";
import { withResult } from "@/lib/server-action";

/**
 * A resident's writes from their request link (docs/specs/maintenance-requests.md,
 * section 3). No sign-in: every action resolves the link first
 * (requireResidentLink), which refuses one that has ended, and only ever acts
 * on that link's household. The rules and limits live in lib/residents/requests.ts.
 */

const token = z.string().min(1).max(100);
const ids = z.array(z.string().min(1).max(64)).max(10);

const upload = z.object({
  pathname: z.string().min(1).max(400),
  filename: z.string().max(255),
  width: z.number().nullish(),
  height: z.number().nullish(),
  durationSec: z.number().nullish(),
  thumbPathname: z.string().max(400).nullish(),
  posterPathname: z.string().max(400).nullish(),
});

/** The upload queue's record step: the file is up, so check it and hold it for Send. */
export async function recordUpload(t: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withResult("residents:recordUpload", async () => {
    const ctx = await requireResidentLink(token.parse(t));
    return recordResidentUpload(ctx, upload.parse(input));
  });
}

const request = z.object({
  whatsWrong: z.string().max(WHATS_WRONG_MAX + 10),
  details: z.string().max(DETAILS_MAX + 200).nullish(),
  letUsIn: z.boolean(),
  pets: z.boolean().nullish(),
  petsNote: z.string().max(PETS_NOTE_MAX + 40).nullish(),
  uploadIds: ids,
});

export async function sendRequest(t: string, input: unknown): Promise<ActionResult<{ id: string; firstPhotoId: string | null }>> {
  return withResult("residents:sendRequest", async () => {
    const tk = token.parse(t);
    const made = await submitRequest(await requireResidentLink(tk), request.parse(input));
    revalidatePath(`/r/${tk}`);
    return made;
  });
}

const addition = z.object({ note: z.string().max(NOTE_MAX + 200).nullish(), uploadIds: ids });

export async function addMore(t: string, requestId: string, input: unknown): Promise<ActionResult> {
  return withResult("residents:addMore", async () => {
    const tk = token.parse(t);
    await addToRequest(await requireResidentLink(tk), z.string().min(1).parse(requestId), addition.parse(input));
    revalidatePath(`/r/${tk}/${requestId}`);
  });
}

export async function cancelRequest(t: string, requestId: string): Promise<ActionResult> {
  return withResult("residents:cancelRequest", async () => {
    const tk = token.parse(t);
    await cancelOwnRequest(await requireResidentLink(tk), z.string().min(1).parse(requestId));
    revalidatePath(`/r/${tk}`);
    revalidatePath(`/r/${tk}/${requestId}`);
  });
}
