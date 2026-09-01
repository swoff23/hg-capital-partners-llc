"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Deal, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { normalizeAddress } from "@/lib/normalize";
import { formToObject } from "@/lib/forms";
import { initials } from "@/lib/utils";

const dealSchema = z.object({
  address: z.string().min(4),
  status: z.string().default("Active"),
  priority: z.string().optional(),
  theirPriceRaw: z.string().optional(),
  ourPriceRaw: z.string().optional(),
  units: z.coerce.number().int().positive().optional(),
  sourceUrl: z.string().url().optional(),
  nextAction: z.string().optional(),
  passReason: z.string().optional(),
});

function money(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[$,\s]/g, "");
  const mult = /k$/.test(s) ? 1e3 : /m$/.test(s) ? 1e6 : 1;
  const num = s.replace(/[km]$/, "");
  if (!/^-?\d+(\.\d+)?$/.test(num)) return null; // "300s", ranges, notes → keep raw only
  return (parseFloat(num) * mult).toFixed(2);
}

/** Append one or more change entries to a deal's activity timeline. */
async function logDealChanges(dealId: string, user: User, lines: string[]) {
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

const val = (v: string | null | undefined) => (v == null || v === "" ? "—" : v);

/** Diff old deal vs the applied data object → human-readable change lines. */
function diffDeal(before: Deal, data: Record<string, unknown>): string[] {
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

export async function createDeal(formData: FormData) {
  const user = await requireUser();
  const p = dealSchema.parse(formToObject(formData));

  const dup = await prisma.deal.findFirst({
    where: { address: { contains: p.address.split(",")[0].trim(), mode: "insensitive" } },
  });
  if (dup && normalizeAddress(dup.address) === normalizeAddress(p.address)) {
    redirect(`/deals/${dup.id}?dup=1`);
  }

  const deal = await prisma.deal.create({
    data: {
      address: p.address.trim(),
      status: p.status,
      priority: p.priority || null,
      theirPriceRaw: p.theirPriceRaw || null,
      theirPrice: money(p.theirPriceRaw),
      ourPriceRaw: p.ourPriceRaw || null,
      ourPrice: money(p.ourPriceRaw),
      units: p.units ?? null,
      sourceUrl: p.sourceUrl || null,
      nextAction: p.nextAction || null,
    },
  });
  await logDealChanges(deal.id, user, [`Deal created (status ${deal.status})`]);
  revalidatePath("/deals");
  redirect(`/deals/${deal.id}`);
}

export async function updateDeal(id: string, formData: FormData) {
  const user = await requireUser();
  const before = await prisma.deal.findUniqueOrThrow({ where: { id } });
  const has = (k: string) => formData.has(k);
  const str = (k: string) => formData.get(k)?.toString().trim() || null;
  const data: Record<string, unknown> = {};
  if (has("address") && str("address")) data.address = str("address");
  if (has("status") && str("status")) data.status = str("status");
  if (has("priority")) data.priority = str("priority");
  if (has("passReason")) data.passReason = str("passReason");
  if (has("theirPriceRaw")) {
    data.theirPriceRaw = str("theirPriceRaw");
    data.theirPrice = money(str("theirPriceRaw"));
  }
  if (has("ourPriceRaw")) {
    data.ourPriceRaw = str("ourPriceRaw");
    data.ourPrice = money(str("ourPriceRaw"));
  }
  if (has("nextAction")) data.nextAction = str("nextAction");
  if (has("sourceUrl")) data.sourceUrl = str("sourceUrl");

  await prisma.deal.update({ where: { id }, data });
  await logDealChanges(id, user, diffDeal(before, data));
  revalidatePath(`/deals/${id}`);
  revalidatePath("/deals");
}

/** Inline edits from the Deals list and detail page. Only whitelisted fields. */
export async function patchDeal(
  id: string,
  patch: Partial<{
    address: string;
    status: string;
    priority: string | null;
    passReason: string | null;
    theirPriceRaw: string | null;
    ourPriceRaw: string | null;
    units: number | null;
    nextAction: string | null;
    sourceUrl: string | null;
  }>,
) {
  const user = await requireUser();
  const before = await prisma.deal.findUniqueOrThrow({ where: { id } });
  const data: Record<string, unknown> = {};
  if (patch.address?.trim()) data.address = patch.address.trim();
  if (patch.status) data.status = patch.status;
  if ("priority" in patch) data.priority = patch.priority || null;
  if ("passReason" in patch) data.passReason = patch.passReason || null;
  if ("units" in patch) data.units = patch.units ?? null;
  if ("sourceUrl" in patch) data.sourceUrl = patch.sourceUrl?.trim() || null;
  if ("theirPriceRaw" in patch) {
    data.theirPriceRaw = patch.theirPriceRaw || null;
    data.theirPrice = money(patch.theirPriceRaw);
  }
  if ("ourPriceRaw" in patch) {
    data.ourPriceRaw = patch.ourPriceRaw || null;
    data.ourPrice = money(patch.ourPriceRaw);
  }
  if ("nextAction" in patch) data.nextAction = patch.nextAction || null;
  if (Object.keys(data).length === 0) return;

  await prisma.deal.update({ where: { id }, data });
  await logDealChanges(id, user, diffDeal(before, data));
  revalidatePath("/deals");
  revalidatePath(`/deals/${id}`);
  revalidatePath("/");
}

export async function addDealNote(dealId: string, formData: FormData) {
  const user = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  const dateStr = String(formData.get("noteDate") ?? "");
  await prisma.dealNote.create({
    data: {
      dealId,
      body: `${body} (${initials(user.name ?? user.email)})`,
      noteDate: dateStr ? new Date(dateStr) : new Date(),
      source: "manual",
    },
  });
  revalidatePath(`/deals/${dealId}`);
}

/** Called by the task actions when a task is created against a deal. */
export async function logDealTaskEvent(dealId: string, userName: string, line: string) {
  await prisma.dealNote.create({
    data: { dealId, body: `${line}  ·  ${userName}`, noteDate: new Date(), source: "change" },
  });
  revalidatePath(`/deals/${dealId}`);
}
