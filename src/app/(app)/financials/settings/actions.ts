"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { treatmentForCategory } from "@/lib/quickbooks/categorize";
import { getConnection } from "@/lib/quickbooks/client";
import { revokeToken } from "@/lib/quickbooks/oauth";
import { decryptSecret } from "@/lib/quickbooks/crypto";
import { runQuickbooksSync } from "@/lib/quickbooks/sync";

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

const ROLES = ["UNMAPPED", "PROPERTY", "ENTITY", "OVERHEAD", "IGNORE"] as const;

export async function setClassRole(classId: string, roleInput: string) {
  await requireUser();
  const role = z.enum(ROLES).parse(roleInput);
  const realmId = await realm();
  await prisma.qboClass.update({
    where: { id: classId },
    data: { role, autoMatched: false, ...(role === "PROPERTY" ? {} : { propertyId: null }) },
  });
  await restampClass(realmId, classId);
  revalidate();
}

export async function mapClassToProperty(classId: string, propertyId: string | null) {
  await requireUser();
  const realmId = await realm();
  await prisma.qboClass.update({
    where: { id: classId },
    data: {
      propertyId: propertyId || null,
      role: propertyId ? "PROPERTY" : "UNMAPPED",
      autoMatched: false,
    },
  });
  await restampClass(realmId, classId);
  revalidate();
}

export async function setClassEntity(classId: string, entityId: string | null) {
  await requireUser();
  const realmId = await realm();
  await prisma.qboClass.update({
    where: { id: classId },
    data: { entityId: entityId || null, autoMatched: false },
  });
  await restampClass(realmId, classId);
  revalidate();
}

const CATEGORIES = [
  "RENT", "OTHER_INCOME", "TAXES", "INSURANCE", "REPAIRS", "UTILITIES", "MANAGEMENT",
  "LEGAL_PROFESSIONAL", "LEASING_COMMISSION", "BANK_FEES", "SOFTWARE", "TRAVEL", "OTHER_OPEX",
  "DEBT_INTEREST", "UNCATEGORIZED", "CAPEX", "INTERCOMPANY", "OWNER_EQUITY", "SUSPENSE",
  "EXCLUDED", "OTHER",
] as const;

export async function setAccountCategory(accountId: string, categoryInput: string) {
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
}

export async function setAccountingMethod(method: "CASH" | "ACCRUAL") {
  await requireUser();
  z.enum(["CASH", "ACCRUAL"]).parse(method);
  await prisma.quickbooksConnection.update({
    where: { realmId: await realm() },
    data: { accountingMethod: method },
  });
  revalidate();
}

export async function syncNow() {
  await requireUser();
  const result = await runQuickbooksSync({ trigger: "MANUAL" });
  revalidate();
  return result;
}

export async function disconnectQuickbooks(forget: boolean) {
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
}
