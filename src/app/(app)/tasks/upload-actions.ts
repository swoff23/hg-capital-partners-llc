"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { withResult } from "@/lib/server-action";
import * as tasks from "@/lib/tasks/service";

/**
 * A task's files (docs/specs/uploads-photos.md): thin server actions that
 * authenticate, validate and call the task service
 * (src/lib/tasks/attachments.ts, re-exported by service.ts). Moved from
 * `tasks/actions.ts` (build plan 1.3).
 */

const id = z.string().min(1).max(64);

// Where the browser put the file and what to call it. Never its URL, size or
// type: the service reads those from Blob itself. Shared unless the composer
// says Internal (D15). Width, height and length are display hints: the service
// keeps them only when they are sane (limits.ts pixelHint, durationHint), so a
// 30000px panorama still uploads instead of being refused over a hint.
const uploadedSchema = z
  .object({
    pathname: z.string().min(1).max(300),
    filename: z.string().min(1).max(255),
    width: z.number().nullish(),
    height: z.number().nullish(),
    durationSec: z.number().nullish(),
    thumbPathname: z.string().min(1).max(300).nullish(),
    posterPathname: z.string().min(1).max(300).nullish(),
    visibility: z.enum(["SHARED", "INTERNAL"]).default("SHARED"),
    // false: the file goes out with a comment (the composer links it on Send), so no timeline line of its own.
    standalone: z.boolean().default(true),
  })
  .strict();

/**
 * After the browser finished uploading straight to Blob. Returns the new
 * attachment's id, or a message instead of throwing, for the uploader to show.
 */
export async function recordTaskAttachment(taskId: string, data: z.input<typeof uploadedSchema>): Promise<ActionResult<{ id: string }>> {
  return withResult("recordTaskAttachment", async () => {
    const user = await requireUser();
    const { visibility, standalone, ...file } = uploadedSchema.parse(data);
    return tasks.recordTaskAttachment(id.parse(taskId), file, tasks.staffPrincipal(user), { visibility, standalone });
  });
}

/**
 * A photo, video or file removed from the task page (staff only), gone for
 * good. One that was already posted leaves "Connor removed quote.pdf" in the
 * activity (uploads 2.4); the composer takes back a draft nobody saw through
 * `deleteTaskFile`, which leaves nothing.
 */
export async function removeTaskFile(attachmentId: string): Promise<ActionResult> {
  return withResult("removeTaskFile", async () => {
    const user = await requireUser();
    await tasks.deleteTaskAttachment(id.parse(attachmentId), tasks.staffPrincipal(user));
  });
}

/** Renames a file on the task page; its extension stays its type's. Returns the saved name. */
export async function renameTaskFile(attachmentId: string, name: string): Promise<ActionResult<{ filename: string }>> {
  return withResult("renameTaskFile", async () => {
    await requireUser();
    return tasks.renameTaskAttachment(id.parse(attachmentId), z.string().max(255).parse(name));
  });
}
