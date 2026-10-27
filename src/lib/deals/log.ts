import "server-only";
import { revalidatePath } from "next/cache";
import type { Deal } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEAL_FIELD_LABEL, dealStatusLabel } from "@/lib/config";

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
 * `recordDealChanges`; the change lines are read back as the deal's record
 * log (docs/specs/activity-comments.md 2.9).
 */

/** Who did it: the signed-in user, or any {name,email} shape. The id, when known, is who the line is by. */
export interface DealActor {
  id?: string;
  name: string | null;
  email: string;
}

/** Append one or more change entries. Empty lines are dropped; no-op when nothing is left. */
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

const val = (v: string | null | undefined) => (v == null || v === "" ? "—" : v);

/** Diff old deal vs the applied data object → human-readable change lines. */
export function diffDeal(before: Deal, data: Record<string, unknown>): string[] {
  const lines: string[] = [];
  if ("status" in data && data.status !== before.status)
    lines.push(`Status: ${val(dealStatusLabel(before.status))} → ${val(dealStatusLabel(data.status as string))}`);
  if ("priority" in data && (data.priority ?? null) !== before.priority)
    lines.push(`Priority: ${val(before.priority)} → ${val(data.priority as string)}`);
  if ("passReason" in data && (data.passReason ?? null) !== before.passReason)
    lines.push(`Pass reason: ${val(before.passReason)} → ${val(data.passReason as string)}`);
  if ("units" in data && (data.units ?? null) !== before.units)
    lines.push(`Units: ${before.units ?? "—"} → ${(data.units as number | null) ?? "—"}`);
  if ("theirPriceRaw" in data && (data.theirPriceRaw ?? null) !== before.theirPriceRaw)
    lines.push(`${DEAL_FIELD_LABEL.theirPrice}: ${val(before.theirPriceRaw)} → ${val(data.theirPriceRaw as string)}`);
  if ("ourPriceRaw" in data && (data.ourPriceRaw ?? null) !== before.ourPriceRaw)
    lines.push(`${DEAL_FIELD_LABEL.ourPrice}: ${val(before.ourPriceRaw)} → ${val(data.ourPriceRaw as string)}`);
  if ("nextAction" in data && (data.nextAction ?? null) !== before.nextAction)
    lines.push(`Next action: ${val(before.nextAction)} → ${val(data.nextAction as string)}`);
  if ("sourceUrl" in data && (data.sourceUrl ?? null) !== before.sourceUrl)
    lines.push(`${DEAL_FIELD_LABEL.sourceUrl} ${before.sourceUrl ? "updated" : "added"}`);
  if ("address" in data && data.address !== before.address)
    lines.push(`Address: ${before.address} → ${data.address}`);
  return lines;
}

/** The "Deal created" line, with the stage it started in. */
export async function recordDealCreated(deal: Pick<Deal, "id" | "status">, actor: DealActor): Promise<void> {
  await logDealChanges(deal.id, actor, [`Deal created (status ${dealStatusLabel(deal.status)})`]);
}

/** What an edit changed, from the deal as it was and the data applied to it; nothing when nothing changed. */
export async function recordDealChanges(dealId: string, actor: DealActor, before: Deal, data: Record<string, unknown>): Promise<void> {
  await logDealChanges(dealId, actor, diffDeal(before, data));
}
