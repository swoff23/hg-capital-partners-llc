"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { archiveSignup, restoreSignup, setBaselaneSent, unkeepSignup } from "@/lib/archive-signup";
import { requireUser } from "@/lib/auth";
import { keepSignup } from "@/lib/portal/invites";
import { withResult } from "@/lib/server-action";

/**
 * The buttons on Home's Needs you rows for new contractors (docs/specs/contractor-onboarding.md, 4.5): Keep and
 * Archive on a sign-up, Sent on a Baselane link, and the toast's Undo for each. Staff only. The rules are in
 * lib/portal/invites.ts and lib/archive-signup.ts.
 */

const id = z.string().min(1);

/** Home's two rows and the Contractors list (its New badge and Active count) read what these change. */
function refresh() {
  revalidatePath("/");
  revalidatePath("/contractors");
  revalidatePath("/contractors/[id]", "page");
}

async function run(name: string, change: () => Promise<unknown>): Promise<ActionResult> {
  return withResult(name, async () => {
    try {
      await change();
    } finally {
      refresh();
    }
  });
}

export async function keepSignupAction(contactId: string): Promise<ActionResult> {
  return run("keepSignup", async () => {
    await requireUser();
    await keepSignup(id.parse(contactId));
  });
}

export async function undoKeepSignupAction(contactId: string): Promise<ActionResult> {
  return run("undoKeepSignup", async () => {
    await requireUser();
    await unkeepSignup(id.parse(contactId));
  });
}

export async function archiveSignupAction(contactId: string): Promise<ActionResult> {
  return run("archiveSignup", async () => {
    const user = await requireUser();
    await archiveSignup(id.parse(contactId), user);
  });
}

export async function undoArchiveSignupAction(contactId: string): Promise<ActionResult> {
  return run("undoArchiveSignup", async () => {
    const user = await requireUser();
    await restoreSignup(id.parse(contactId), user);
  });
}

/** Sent on a Baselane row, or with `sent` false its Undo. */
export async function markBaselaneSentAction(contactId: string, sent: boolean): Promise<ActionResult> {
  return run("markBaselaneSent", async () => {
    await requireUser();
    await setBaselaneSent(id.parse(contactId), z.boolean().parse(sent));
  });
}
