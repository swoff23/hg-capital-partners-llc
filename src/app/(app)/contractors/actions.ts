"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import * as contractors from "@/lib/contractors/service";
import * as accounts from "@/lib/portal/accounts";
import { withResult } from "@/lib/server-action";

/**
 * A contractor's page: the Contact section's Edit, and the Portal access card
 * (docs/asana-migration-plan.md §5.1). Staff only. A starting password comes
 * back exactly once, to show and text; nothing here ever returns a password
 * hash.
 */

const id = z.string().min(1);

const fieldsSchema = z.record(z.string(), z.string().max(20_000));

/**
 * Save the Contact section's edits. `changes` holds only the fields the
 * editor changed ("" clears one), and `expected` what it loaded for each, so
 * a field someone else saved meanwhile refuses the save. The service checks
 * each field (src/lib/contractors/contact-fields.ts) and refreshes every page
 * that shows the contractor; a refusal comes back as the error, and the
 * editor keeps what was typed.
 */
export async function patchContact(contactId: string, changes: Record<string, string>, expected: Record<string, string>): Promise<ActionResult> {
  return withResult("patchContact", async () => {
    await requireUser();
    await contractors.patchContact(id.parse(contactId), fieldsSchema.parse(changes), fieldsSchema.parse(expected));
  });
}

const newContractorSchema = z
  .object({
    fullName: z.string().max(200),
    company: z.string().max(500),
    trades: z.string().max(500),
    phone: z.string().max(100),
    email: z.string().max(500),
    mailingAddress: z.string().max(2000),
    billingInfo: z.string().max(500),
    availability: z.string().max(500),
    comments: z.string().max(20_000),
  })
  .partial()
  .strict();

/**
 * Add a contractor from the New contractor sheet. The name is required;
 * everything else is optional. A field that doesn't read comes back on its
 * own line (`fieldErrors`), and nothing is saved.
 */
export async function createContractor(input: z.input<typeof newContractorSchema>): Promise<ActionResult<{ id: string; fullName: string }>> {
  return withResult("createContractor", async () => {
    await requireUser();
    return contractors.createContact(newContractorSchema.parse(input) as Record<string, string>);
  });
}

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

/** Change the email a contractor signs in with. Their password and signed-in devices are untouched. */
export async function changePortalLoginEmail(accountId: string, email: string): Promise<ActionResult<{ email: string }>> {
  return withResult("changePortalLoginEmail", async () => {
    const user = await requireUser();
    return thenRefresh(() => accounts.changePortalEmail(id.parse(accountId), z.string().max(320).parse(email), user));
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
