"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import * as accounts from "@/lib/portal/accounts";
import { withResult } from "@/lib/server-action";

/**
 * The Portal access card on a contractor's page (docs/asana-migration-plan.md
 * §5.1). Staff only. A starting password comes back exactly once, to show
 * and text; nothing here ever returns a password hash.
 */

const id = z.string().min(1);

/** Every contractor page shows its card's state; the account ids don't say which page that is. */
const refresh = () => revalidatePath("/contractors/[id]", "page");

/**
 * Run a change and refresh the card whether or not it went through, so a
 * stale card catches up. After a Create login whose answer never arrived,
 * the retry's "already has a login" brings back the card with Reset password.
 */
async function thenRefresh<T>(change: () => Promise<T>): Promise<T> {
  try {
    return await change();
  } finally {
    refresh();
  }
}

export async function createPortalLogin(contactId: string, email: string): Promise<ActionResult<{ email: string; password: string }>> {
  return withResult("createPortalLogin", async () => {
    const user = await requireUser();
    const { account, password } = await thenRefresh(() => accounts.createPortalAccount(id.parse(contactId), z.string().max(320).parse(email), user));
    return { email: account.email, password };
  });
}

export async function resetPortalPassword(accountId: string): Promise<ActionResult<{ password: string }>> {
  return withResult("resetPortalPassword", async () => {
    const user = await requireUser();
    const { password } = await thenRefresh(() => accounts.resetPortalPassword(id.parse(accountId), user));
    return { password };
  });
}

export async function signOutPortalEverywhere(accountId: string): Promise<ActionResult<{ count: number }>> {
  return withResult("signOutPortalEverywhere", async () => {
    const user = await requireUser();
    const count = await thenRefresh(() => accounts.signOutEverywhere(id.parse(accountId), user));
    return { count };
  });
}

export async function removePortalAccess(accountId: string): Promise<ActionResult> {
  return withResult("removePortalAccess", async () => {
    const user = await requireUser();
    await thenRefresh(() => accounts.disablePortalAccount(id.parse(accountId), user));
  });
}

export async function restorePortalAccess(accountId: string): Promise<ActionResult> {
  return withResult("restorePortalAccess", async () => {
    const user = await requireUser();
    await thenRefresh(() => accounts.enablePortalAccount(id.parse(accountId), user));
  });
}
