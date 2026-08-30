"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { normalizeAddress } from "@/lib/normalize";
import { formToObject } from "@/lib/forms";

const dealSchema = z.object({
  address: z.string().min(4),
  status: z.string().default("Active"),
  priority: z.string().optional(),
  theirPriceRaw: z.string().optional(),
  ourPriceRaw: z.string().optional(),
  units: z.coerce.number().int().positive().optional(),
  sourceUrl: z.string().url().optional(),
  nextAction: z.string().optional(),
  nextActionDue: z.string().optional(),
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

export async function createDeal(formData: FormData) {
  await requireUser();
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
      nextActionDue: p.nextActionDue ? new Date(p.nextActionDue) : null,
    },
  });
  revalidatePath("/deals");
  redirect(`/deals/${deal.id}`);
}

export async function updateDeal(id: string, formData: FormData) {
  await requireUser();
  // The edit form always submits every field; "" means "clear".
  const has = (k: string) => formData.has(k);
  const str = (k: string) => (formData.get(k)?.toString().trim() || null);
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
  if (has("nextActionDue")) {
    const d = str("nextActionDue");
    data.nextActionDue = d ? new Date(d) : null;
  }

  await prisma.deal.update({ where: { id }, data });
  revalidatePath(`/deals/${id}`);
  revalidatePath("/deals");
}

/** Inline edits from the Acquisitions list. Only whitelisted fields. */
export async function patchDeal(
  id: string,
  patch: Partial<{
    status: string;
    priority: string | null;
    theirPriceRaw: string | null;
    ourPriceRaw: string | null;
    nextAction: string | null;
    nextActionDue: string | null;
    sourceUrl: string | null;
  }>,
) {
  await requireUser();
  const data: Record<string, unknown> = {};
  if (patch.status) data.status = patch.status;
  if ("priority" in patch) data.priority = patch.priority || null;
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
  if ("nextActionDue" in patch) {
    data.nextActionDue = patch.nextActionDue ? new Date(patch.nextActionDue) : null;
  }
  if (Object.keys(data).length === 0) return;

  await prisma.deal.update({ where: { id }, data });
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
      body: `${body}\n\n— ${user.name ?? user.email}`,
      noteDate: dateStr ? new Date(dateStr) : new Date(),
      source: "manual",
    },
  });
  revalidatePath(`/deals/${dealId}`);
}
