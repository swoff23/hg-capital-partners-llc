import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

/**
 * Writes to a deal's activity timeline (`DealNote.source = "change"`).
 *
 * These used to live in deals/actions.ts. Anything exported from a
 * `"use server"` module is a public HTTP endpoint, and `logDealTaskEvent` had
 * no `requireUser()` — so any browser could post a fabricated entry onto any
 * deal. Plain server-side helpers here are only reachable from our own code;
 * the calling action is what authenticates.
 */

/** Append one or more change entries. Empty lines are dropped; no-op when nothing is left. */
/** Who did it — the signed-in user, or any {name,email} shape. */
export interface DealActor {
  name: string | null;
  email: string;
}

export async function logDealChanges(dealId: string, user: DealActor, lines: string[]): Promise<void> {
  const entries = lines.filter(Boolean);
  if (entries.length === 0) return;
  const who = user.name ?? user.email;
  await prisma.dealNote.createMany({
    data: entries.map((body) => ({
      dealId,
      body: `${body}  ·  ${who}`,
      noteDate: new Date(),
      source: "change",
    })),
  });
}

/** Called by the task actions when a task is created / completed against a deal. */
export async function logDealTaskEvent(dealId: string, userName: string, line: string): Promise<void> {
  await prisma.dealNote.create({
    data: { dealId, body: `${line}  ·  ${userName}`, noteDate: new Date(), source: "change" },
  });
  revalidatePath(`/deals/${dealId}`);
}
