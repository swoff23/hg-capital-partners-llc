import "server-only";
import { revalidatePath } from "next/cache";
import type { Deal } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FieldError } from "@/lib/action-result";
import { splitAddress } from "@/lib/address-suggestions";
import { sameStreetAddress, streetKey } from "@/lib/normalize";
import { amountToDecimal } from "@/lib/money";
import type { DealStatus } from "@/lib/config";
import { recordDealChanges, recordDealCreated } from "./log";
import { dealConflict, dealPatchData, guardedDealFields, staleDealFields, type DealPatch } from "./edits";

export type { DealPatch } from "./edits";

/**
 * Deal domain: every write to Deal / DealNote goes through here. The server
 * actions authenticate + parse and call in. Rules that live here:
 *   - an address with an existing deal's house number and street is a duplicate,
 *     when a deal is made and when one is renamed (the rename is refused on the
 *     address field, forms 2.6)
 *   - prices keep the raw text and a parsed Decimal (null when not one number)
 *   - status is validated against DEAL_STATUSES; unknown values are ignored
 *   - every change is diffed and appended to the deal's activity timeline
 *     (log.ts); a partner's own notes are notes.ts
 *   - every write records who made it (`updatedByUserId`), and a save from a
 *     page that has gone stale is refused with who changed it and when
 *     (edits.ts, forms 2.12)
 */

export interface Actor {
  /** The signed-in user's id, recorded as the deal's last editor. The user object `requireUser()` returns has it. */
  id: string;
  name: string | null;
  email: string;
}

const stamp = (a: Actor) => ({ updatedByUserId: a.id });

function revalidateDeal(id: string): void {
  revalidatePath("/deals");
  revalidatePath(`/deals/${id}`);
  revalidatePath("/");
}

/**
 * The existing deal this address would duplicate, or null: the same house
 * number and street however it was typed, with no street type, ZIP or town
 * that disagrees (see sameStreetAddress), newest first. The house number
 * narrows the rows; the street match is done here. `excludeId` leaves out
 * the deal being renamed, so it isn't its own duplicate.
 */
export async function findDuplicateDeal(address: string, opts: { excludeId?: string } = {}): Promise<Deal | null> {
  const lead = streetKey(address).split(" ")[0];
  if (!lead) return null;
  const candidates = await prisma.deal.findMany({
    where: { address: { contains: lead, mode: "insensitive" }, ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}) },
    orderBy: { updatedAt: "desc" },
  });
  return candidates.find((d) => sameStreetAddress(d.address, address)) ?? null;
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
      ...stamp(actor),
    },
  });
  await recordDealCreated(deal, actor);
  revalidatePath("/deals");
  return { deal };
}

/**
 * Edit a deal. `expected` holds, for each field the editor changed, the text
 * it loaded for it (the deal rail sends it; the list's stage pick doesn't):
 * a field whose stored value has moved off that was saved by someone else
 * meanwhile, and nothing is written. Before this a stale deal page silently
 * wrote over a partner's newer edit.
 */
export async function patchDeal(id: string, patch: DealPatch, actor: Actor, expected: Record<string, string> = {}): Promise<void> {
  const before = await prisma.deal.findUniqueOrThrow({ where: { id }, include: { updatedByUser: { select: { name: true, email: true } } } });
  const data = dealPatchData(patch);
  if (Object.keys(data).length === 0) return;

  // A rename onto an address another deal has is refused on the address field, like New deal's.
  if (typeof data.address === "string" && data.address !== before.address) {
    const duplicateOf = await findDuplicateDeal(data.address, { excludeId: id });
    if (duplicateOf) throw new FieldError({ address: `${splitAddress(duplicateOf.address).street} is already a deal.` });
  }

  const guarded = guardedDealFields(patch, expected);
  if (guarded.length > 0) {
    const stale = staleDealFields(before, patch, expected);
    if (stale.length > 0) throw dealConflict(before, stale);
    // At the version just read, so a save that lands in between is refused too.
    const r = await prisma.deal.updateMany({ where: { id, updatedAt: before.updatedAt }, data: { ...data, ...stamp(actor) } });
    if (r.count === 0) {
      const now = await prisma.deal.findUniqueOrThrow({ where: { id }, include: { updatedByUser: { select: { name: true, email: true } } } });
      throw dealConflict(now, guarded);
    }
  } else {
    await prisma.deal.update({ where: { id }, data: { ...data, ...stamp(actor) } });
  }
  await recordDealChanges(id, actor, before, data);
  revalidateDeal(id);
}
