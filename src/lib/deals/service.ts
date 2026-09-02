import "server-only";
import { revalidatePath } from "next/cache";
import type { Deal } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeAddress } from "@/lib/normalize";
import { amountToDecimal } from "@/lib/money";
import { initials } from "@/lib/utils";
import { isDealStatus, type DealStatus } from "@/lib/config";
import { logDealChanges } from "./log";

/**
 * Deal domain: every write to Deal / DealNote goes through here. The server
 * actions authenticate + parse and call in. Rules that live here:
 *   - an address that normalizes to an existing deal's address is a duplicate
 *   - prices keep the raw text and a parsed Decimal (null when not one number)
 *   - status is validated against DEAL_STATUSES; unknown values are ignored
 *   - every change is diffed and appended to the deal's activity timeline
 */

export interface Actor {
  name: string | null;
  email: string;
}

const actorLabel = (a: Actor) => a.name ?? a.email;

function revalidateDeal(id: string): void {
  revalidatePath("/deals");
  revalidatePath(`/deals/${id}`);
  revalidatePath("/");
}

/** The existing deal this address would duplicate, or null. */
export async function findDuplicateDeal(address: string): Promise<Deal | null> {
  const dup = await prisma.deal.findFirst({
    where: { address: { contains: address.split(",")[0].trim(), mode: "insensitive" } },
  });
  return dup && normalizeAddress(dup.address) === normalizeAddress(address) ? dup : null;
}

export interface NewDeal {
  address: string;
  status: DealStatus;
  priority?: string | null;
  theirPriceRaw?: string | null;
  ourPriceRaw?: string | null;
  units?: number | null;
  sourceUrl?: string | null;
  nextAction?: string | null;
}

export async function createDeal(
  input: NewDeal,
  actor: Actor,
): Promise<{ deal: Deal; duplicateOf?: undefined } | { deal?: undefined; duplicateOf: Deal }> {
  const duplicateOf = await findDuplicateDeal(input.address);
  if (duplicateOf) return { duplicateOf };

  const deal = await prisma.deal.create({
    data: {
      address: input.address.trim(),
      status: input.status,
      priority: input.priority || null,
      theirPriceRaw: input.theirPriceRaw || null,
      theirPrice: amountToDecimal(input.theirPriceRaw),
      ourPriceRaw: input.ourPriceRaw || null,
      ourPrice: amountToDecimal(input.ourPriceRaw),
      units: input.units ?? null,
      sourceUrl: input.sourceUrl || null,
      nextAction: input.nextAction || null,
    },
  });
  await logDealChanges(deal.id, actor, [`Deal created (status ${deal.status})`]);
  revalidatePath("/deals");
  return { deal };
}

/** Whitelisted inline-editable fields. A key that is present is written; null / "" clears. */
export interface DealPatch {
  address?: string;
  status?: string;
  priority?: string | null;
  passReason?: string | null;
  theirPriceRaw?: string | null;
  ourPriceRaw?: string | null;
  units?: number | null;
  nextAction?: string | null;
  sourceUrl?: string | null;
}

const val = (v: string | null | undefined) => (v == null || v === "" ? "—" : v);

/** Diff old deal vs the applied data object → human-readable change lines. */
export function diffDeal(before: Deal, data: Record<string, unknown>): string[] {
  const lines: string[] = [];
  if ("status" in data && data.status !== before.status)
    lines.push(`Status: ${val(before.status)} → ${val(data.status as string)}`);
  if ("priority" in data && (data.priority ?? null) !== before.priority)
    lines.push(`Priority: ${val(before.priority)} → ${val(data.priority as string)}`);
  if ("passReason" in data && (data.passReason ?? null) !== before.passReason)
    lines.push(`Pass reason: ${val(before.passReason)} → ${val(data.passReason as string)}`);
  if ("units" in data && (data.units ?? null) !== before.units)
    lines.push(`Units: ${before.units ?? "—"} → ${(data.units as number | null) ?? "—"}`);
  if ("theirPriceRaw" in data && (data.theirPriceRaw ?? null) !== before.theirPriceRaw)
    lines.push(`Their price: ${val(before.theirPriceRaw)} → ${val(data.theirPriceRaw as string)}`);
  if ("ourPriceRaw" in data && (data.ourPriceRaw ?? null) !== before.ourPriceRaw)
    lines.push(`Our price: ${val(before.ourPriceRaw)} → ${val(data.ourPriceRaw as string)}`);
  if ("nextAction" in data && (data.nextAction ?? null) !== before.nextAction)
    lines.push(`Next action: ${val(before.nextAction)} → ${val(data.nextAction as string)}`);
  if ("sourceUrl" in data && (data.sourceUrl ?? null) !== before.sourceUrl)
    lines.push(`Listing URL ${before.sourceUrl ? "updated" : "added"}`);
  if ("address" in data && data.address !== before.address)
    lines.push(`Address: ${before.address} → ${data.address}`);
  return lines;
}

export async function patchDeal(id: string, patch: DealPatch, actor: Actor): Promise<void> {
  const before = await prisma.deal.findUniqueOrThrow({ where: { id } });
  const data: Record<string, unknown> = {};
  if (patch.address?.trim()) data.address = patch.address.trim();
  if (patch.status && isDealStatus(patch.status)) data.status = patch.status;
  if ("priority" in patch) data.priority = patch.priority || null;
  if ("passReason" in patch) data.passReason = patch.passReason || null;
  if ("units" in patch) data.units = patch.units ?? null;
  if ("sourceUrl" in patch) data.sourceUrl = patch.sourceUrl?.trim() || null;
  if ("theirPriceRaw" in patch) {
    data.theirPriceRaw = patch.theirPriceRaw || null;
    data.theirPrice = amountToDecimal(patch.theirPriceRaw);
  }
  if ("ourPriceRaw" in patch) {
    data.ourPriceRaw = patch.ourPriceRaw || null;
    data.ourPrice = amountToDecimal(patch.ourPriceRaw);
  }
  if ("nextAction" in patch) data.nextAction = patch.nextAction || null;
  if (Object.keys(data).length === 0) return;

  await prisma.deal.update({ where: { id }, data });
  await logDealChanges(id, actor, diffDeal(before, data));
  revalidateDeal(id);
}

/** A manual note on the timeline, signed with the author's initials. */
export async function addDealNote(dealId: string, body: string, actor: Actor): Promise<void> {
  const text = body.trim();
  if (!text) return;
  await prisma.dealNote.create({
    data: {
      dealId,
      body: `${text} (${initials(actorLabel(actor))})`,
      noteDate: new Date(),
      source: "manual",
    },
  });
  revalidatePath(`/deals/${dealId}`);
}
