"use server";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { launchSendPlan, sendLaunchLinks } from "@/lib/residents/service";
import { withResult } from "@/lib/server-action";

/**
 * The Tenants list's launch-day send (docs/specs/maintenance-requests.md,
 * section 4.5): how many get a link, then the send itself.
 */

export type LaunchPlan = { count: number; noEmail: number };

export async function requestLinksPlan(): Promise<ActionResult<LaunchPlan>> {
  return withResult("requestLinksPlan", async () => {
    await requireUser();
    const plan = await launchSendPlan();
    return { count: plan.send.length, noEmail: plan.noEmail };
  });
}

export async function sendRequestLinks(): Promise<ActionResult<{ sent: number; failed: number }>> {
  return withResult("sendRequestLinks", async () => {
    await requireUser();
    return sendLaunchLinks();
  });
}
