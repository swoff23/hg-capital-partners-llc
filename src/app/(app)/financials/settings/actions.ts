"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { treatmentForCategory } from "@/lib/quickbooks/categorize";
import { getConnection } from "@/lib/quickbooks/client";
import { applyMapsTo, parseMapsTo } from "@/lib/quickbooks/mapping";
import { revokeToken } from "@/lib/quickbooks/oauth";
import { decryptSecret } from "@/lib/quickbooks/crypto";
import { runQuickbooksSync } from "@/lib/quickbooks/sync";
import { withLog } from "@/lib/server-action";

function revalidate() {
  revalidatePath("/financials");
  revalidatePath("/financials/settings");
  revalidatePath("/financials/rent-roll");
  revalidatePath("/properties");
}

async function realm(): Promise<string> {
  const conn = await getConnection();
  if (!conn) throw new Error("QuickBooks is not connected");
  return conn.realmId;
}

/** Re-stamp the denormalized dimensions on every LedgerLine for one class. */
async function restampClass(realmId: string, classId: string) {
  const c = await prisma.qboClass.findUniqueOrThrow({ where: { id: classId } });
  await prisma.ledgerLine.updateMany({
    where: { realmId, classKey: c.qboId },
    data: { propertyId: c.propertyId, entityId: c.entityId, classRole: c.role },
  });
}

const CLASS_ROLES = ["UNMAPPED", "PROPERTY", "ENTITY", "OVERHEAD", "IGNORE"] as const;

/**
 * "Maps to": one pick for a class, which sets its role and its target
 * together (applyMapsTo in lib/quickbooks/mapping.ts). `key` is the picker's:
 * "p:<propertyId>", "e:<entityId>", "OVERHEAD", "IGNORE", or null for
 * Unmapped. A person's pick is no longer an auto-match.
 */
export async function mapClass(classId: string, key: string | null) {
  return withLog("mapClass", async () => {
    await requireUser();
    z.string().nullable().parse(key);
    const pick = parseMapsTo(key);
    if (!pick) throw new Error("Choose what this class maps to");
    const realmId = await realm();
    const current = await prisma.qboClass.findUniqueOrThrow({
      where: { id: classId },
      select: { role: true, propertyId: true, entityId: true },
    });
    await prisma.qboClass.update({ where: { id: classId }, data: { ...applyMapsTo(current, pick), autoMatched: false } });
    await restampClass(realmId, classId);
    revalidate();
  });
}

const restoreSchema = z.object({
  role: z.enum(CLASS_ROLES),
  propertyId: z.string().nullable(),
  entityId: z.string().nullable(),
  autoMatched: z.boolean(),
});

/** Undo after "Maps to": puts back exactly the role, property, entity and auto-match the class had. */
export async function restoreClassMapping(classId: string, before: z.input<typeof restoreSchema>) {
  return withLog("restoreClassMapping", async () => {
    await requireUser();
    const data = restoreSchema.parse(before);
    const realmId = await realm();
    await prisma.qboClass.update({ where: { id: classId }, data });
    await restampClass(realmId, classId);
    revalidate();
  });
}

const CATEGORIES = [
  "RENT", "OTHER_INCOME", "TAXES", "INSURANCE", "REPAIRS", "UTILITIES", "MANAGEMENT",
  "LEGAL_PROFESSIONAL", "LEASING_COMMISSION", "BANK_FEES", "SOFTWARE", "TRAVEL", "OTHER_OPEX",
  "DEBT_INTEREST", "UNCATEGORIZED", "CAPEX", "INTERCOMPANY", "OWNER_EQUITY", "SUSPENSE",
  "EXCLUDED", "OTHER",
] as const;

export async function setAccountCategory(accountId: string, categoryInput: string) {
  return withLog("setAccountCategory", async () => {
    await requireUser();
    const category = z.enum(CATEGORIES).parse(categoryInput);
    const realmId = await realm();
    const acct = await prisma.qboAccount.update({
      where: { id: accountId },
      data: { category, categoryLocked: true },
    });
    const treatment = treatmentForCategory(category, acct.classification || null);
    await prisma.qboAccount.update({ where: { id: accountId }, data: { treatment } });
    await prisma.ledgerLine.updateMany({
      where: { realmId, accountQboId: acct.qboId },
      data: { category, treatment },
    });
    revalidate();
  });
}

export async function setAccountingMethod(method: "CASH" | "ACCRUAL") {
  return withLog("setAccountingMethod", async () => {
    await requireUser();
    z.enum(["CASH", "ACCRUAL"]).parse(method);
    await prisma.quickbooksConnection.update({
      where: { realmId: await realm() },
      data: { accountingMethod: method },
    });
    revalidate();
  });
}

export async function syncNow() {
  return withLog("syncNow", async () => {
    await requireUser();
    const result = await runQuickbooksSync({ trigger: "MANUAL" });
    revalidate();
    return result;
  });
}

export async function disconnectQuickbooks(forget: boolean) {
  return withLog("disconnectQuickbooks", async () => {
    await requireUser();
    const conn = await getConnection();
    if (!conn) return;
    try {
      await revokeToken(decryptSecret(conn.refreshTokenEnc));
    } catch {
      /* best effort */
    }
    if (forget) {
      await prisma.quickbooksConnection.delete({ where: { id: conn.id } });
    } else {
      await prisma.quickbooksConnection.update({ where: { id: conn.id }, data: { status: "REVOKED" } });
    }
    revalidate();
  });
}
