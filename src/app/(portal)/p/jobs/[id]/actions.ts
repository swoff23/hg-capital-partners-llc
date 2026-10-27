"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { portalScope, withQueueOwner } from "@/lib/attachments/queue-owner";
import * as jobs from "@/lib/portal/jobs";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { withResult } from "@/lib/server-action";

/**
 * The job page's actions: check who's calling, parse, call the portal
 * service (src/lib/portal/jobs.ts), and hand back a one-line result for the
 * page to show. Every rule (access, the job's state, Start job and Mark done
 * only) is enforced in the service and core, not here.
 *
 * An update and a Mark done carry the photos the upload queue held, so they
 * name the queue's owner too, as the record step, a batch post and its Undo do
 * (upload-actions.ts, queue-owner.ts): a tab still showing Zack's job after
 * Mike signs in elsewhere is refused instead of posting as Mike. The write runs
 * inside withQueueOwner, so it cannot happen before the check. A call that
 * names no owner passes.
 */

const id = z.string().min(1).max(64);
const owner = z.string().max(80).nullish();

const updateSchema = z
  .object({
    body: z.string().max(5000).default(""),
    attachmentIds: z.array(id).max(50).default([]),
    // Made in the browser for each send, so a Retry after a timeout that did post never posts twice
    // (activity 2.7; core.addComment answers a repeat with the first). Strict schemas refuse a key they don't
    // know, so it has to be named here.
    clientId: z.string().min(1).max(64).optional(),
  })
  .strict();

export async function startJobAction(taskId: string): Promise<ActionResult> {
  return withResult("portal:startJob", async () => {
    await requirePortalPrincipal();
    await jobs.startJob(id.parse(taskId));
  });
}

export async function markJobDoneAction(taskId: string, input: z.input<typeof updateSchema>, queueOwner?: string | null): Promise<ActionResult> {
  return withResult("portal:markJobDone", async () => {
    const p = await requirePortalPrincipal();
    await withQueueOwner(owner.parse(queueOwner), portalScope(p.contactId), () => jobs.markJobDone(id.parse(taskId), updateSchema.parse(input)));
  });
}

export async function postJobUpdateAction(taskId: string, input: z.input<typeof updateSchema>, queueOwner?: string | null): Promise<ActionResult> {
  return withResult("portal:postJobUpdate", async () => {
    const p = await requirePortalPrincipal();
    await withQueueOwner(owner.parse(queueOwner), portalScope(p.contactId), () => jobs.postJobUpdate(id.parse(taskId), updateSchema.parse(input)));
  });
}

export async function setChecklistItemAction(itemId: string, done: boolean): Promise<ActionResult> {
  return withResult("portal:setChecklistItem", async () => {
    await requirePortalPrincipal();
    await jobs.setJobChecklistItem(id.parse(itemId), z.boolean().parse(done));
  });
}
