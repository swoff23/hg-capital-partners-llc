"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { withLog, withResult } from "@/lib/server-action";
import { approvePending, connectAddress, denyPending, disconnect } from "@/lib/claude/oauth";
import { APPROVE_PATH } from "@/lib/claude/oauth-core";
import { CLAUDE_LINES, disconnectedMessage } from "./claude-state";

const SETTINGS_PATH = "/settings/claude";

/** Connect was tapped: this partner's own address, the same one every time, till Disconnect retires it. */
export async function startConnect(): Promise<ActionResult<{ address: string }>> {
  return withResult("startConnect", async () => {
    const user = await requireUser();
    const address = await connectAddress(user);
    if (!address) throw new Error(CLAUDE_LINES.noAddress);
    return { address };
  });
}

/** Disconnect on either partner's row. The message is the toast, with the first name from the record. */
export async function disconnectClaude(userId: string): Promise<ActionResult<{ message: string; phoneMessage: string }>> {
  return withResult("disconnectClaude", async () => {
    const user = await requireUser();
    if (typeof userId !== "string" || userId.length === 0 || userId.length > 100) throw new Error(CLAUDE_LINES.partnerGone);
    const result = await disconnect({ userId }, user);
    if (!result.ok) throw new Error(CLAUDE_LINES.partnerGone);
    revalidatePath(SETTINGS_PATH);
    // Always a success: disconnect() retires the address and ends a connection Claude had not finished too, and
    // `revoked` counts only finished ones, so 0 does not mean nothing happened.
    return disconnectedMessage(result.name);
  });
}

/**
 * Allow. A server action, so Next's origin check is the CSRF guard. `rid` is the hidden field the card was drawn
 * with: the request it names is the only one approved. Sends the browser back to Claude with the code; with no
 * valid request left it goes back to the approval page, which then shows the expired line.
 */
export async function allowClaude(form: FormData): Promise<void> {
  const to = await withLog("allowClaude", async () => {
    const user = await requireUser();
    const rid = form.get("rid");
    const result = await approvePending(user, rid);
    return result.ok ? result.redirectTo : APPROVE_PATH;
  });
  redirect(to);
}

/** Cancel: Claude hears that nothing was granted. With no matching request, back to Settings. */
export async function cancelClaude(form: FormData): Promise<void> {
  const to = await withLog("cancelClaude", async () => {
    const user = await requireUser();
    const rid = form.get("rid");
    const denied = await denyPending(user, rid);
    return denied ? denied.redirectTo : SETTINGS_PATH;
  });
  redirect(to);
}
