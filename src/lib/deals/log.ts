import "server-only";
import { revalidatePath } from "next/cache";
import type { Deal, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dealStatusLabel } from "@/lib/config";
import { changeData, changeText, diffDealChanges, type DealChange } from "./log-core";

/**
 * Writes to a deal's activity timeline (`DealNote.source = "change"`).
 *
 * These used to live in deals/actions.ts. Anything exported from a
 * `"use server"` module is a public HTTP endpoint, and `logDealTaskEvent` had
 * no `requireUser()` — so any browser could post a fabricated entry onto any
 * deal. Plain server-side helpers here are only reachable from our own code;
 * the calling action is what authenticates.
 *
 * The deal service records what it changed through `recordDealCreated` and
 * `recordDealChanges`. A change row now carries who made it (`authorUserId`)
 * and, for an edit, what moved as `{ field, from, to }` in `data`
 * (log-core.ts), so the deal's record log (docs/specs/activity-comments.md
 * 2.9) words and folds it without parsing text. The `body` keeps the readable
 * line beside it. A row with no known author (a task line from core, an
 * import) keeps the old "  ·  Name" at the end of its body.
 */

/** Who did it: the signed-in user, or any {name,email} shape. The id, when known, is who the line is by. */
export interface DealActor {
  id?: string;
  name: string | null;
  email: string;
}

type ChangeRow = { body: string; data?: DealChange };

/** Appends change rows, one per entry. Empty bodies are dropped; nothing is written when none are left. */
async function writeChangeRows(dealId: string, user: DealActor, rows: ChangeRow[]): Promise<void> {
  const entries = rows.filter((r) => r.body);
  if (entries.length === 0) return;
  const who = user.name ?? user.email;
  const now = new Date();
  await prisma.dealNote.createMany({
    data: entries.map((r) => ({
      dealId,
      // With an author on the row there is nothing to sign.
      body: user.id ? r.body : `${r.body}  ·  ${who}`,
      noteDate: now,
      source: "change",
      authorUserId: user.id ?? null,
      ...(r.data ? { data: changeData(r.data) satisfies Prisma.InputJsonObject } : {}),
    })),
  });
}

/** Append one or more change entries. Empty lines are dropped; no-op when nothing is left. */
export async function logDealChanges(dealId: string, user: DealActor, lines: string[]): Promise<void> {
  await writeChangeRows(
    dealId,
    user,
    lines.map((body) => ({ body })),
  );
}

/** Called by the task actions when a task is created / completed against a deal. */
export async function logDealTaskEvent(dealId: string, userName: string, line: string): Promise<void> {
  await prisma.dealNote.create({
    data: { dealId, body: `${line}  ·  ${userName}`, noteDate: new Date(), source: "change" },
  });
  revalidatePath(`/deals/${dealId}`);
}

/** Diff old deal vs the applied data object → human-readable change lines. */
export function diffDeal(before: Deal, data: Record<string, unknown>): string[] {
  return diffDealChanges(before, data).map(changeText);
}

/** The "Deal created" line, with the stage it started in. */
export async function recordDealCreated(deal: Pick<Deal, "id" | "status">, actor: DealActor): Promise<void> {
  await logDealChanges(deal.id, actor, [`Deal created (stage ${dealStatusLabel(deal.status)})`]);
}

/**
 * What an edit changed, from the deal as it was and the data applied to it:
 * one row per field with its old and new value. Nothing when nothing changed
 * (a field saved as it already read is not an edit).
 */
export async function recordDealChanges(dealId: string, actor: DealActor, before: Deal, data: Record<string, unknown>): Promise<void> {
  const changes = diffDealChanges(before, data);
  await writeChangeRows(
    dealId,
    actor,
    changes.map((c) => ({ body: changeText(c), data: c })),
  );
}
