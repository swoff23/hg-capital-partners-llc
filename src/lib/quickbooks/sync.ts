import "server-only";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { QboSyncTrigger, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeAddress } from "@/lib/normalize";
import { qbo } from "./config";
import { QBO_ENTITY_SEED } from "./entities";
import { seedCategory, treatmentForCategory } from "./categorize";
import { classifyLine } from "./classify-line";
import { autoMatchClass, buildPropertyIndex, propertyTokens } from "./mapping";
import {
  classKeyOf,
  parsePlainProfitAndLoss,
  parseProfitAndLossByClass,
  parseProfitAndLossDetail,
} from "./report-parse";
import { computeNoi } from "./compute";
import { checkReconciliation } from "./reconcile";
import { centsToDecimalString, type LedgerLineInput } from "./types";
import {
  query,
  report,
  requireActiveConnection,
  withFreshToken,
  QboReconnectRequired,
} from "./client";
import { buildDataQuality } from "./data-quality";

const STALE_LOCK_MS = 10 * 60_000;
const BASES = ["CASH", "ACCRUAL"] as const;

class SyncBudgetExceeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncBudgetExceeded";
  }
}

export interface SyncSummary {
  runId: string | null;
  skipped?: boolean;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  monthsProcessed: number;
  lineCount: number;
  error?: string;
}

// --- month helpers -------------------------------------------------------

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthRange(startYm: string, endYm: string): string[] {
  const out: string[] = [];
  let [y, m] = startYm.split("-").map(Number);
  const [ey, em] = endYm.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
function monthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // day 0 of next month = last day
  return { start, end };
}

// --- master data --------------------------------------------------------

interface QboClassRow {
  Id: string;
  Name: string;
  FullyQualifiedName?: string;
  ParentRef?: { value: string };
  SubClass?: boolean;
  Active?: boolean;
}
interface QboAccountRow {
  Id: string;
  Name: string;
  FullyQualifiedName?: string;
  AccountType?: string;
  AccountSubType?: string;
  Classification?: string;
  Active?: boolean;
  ParentRef?: { value: string };
}
interface QboVendorRow {
  Id: string;
  DisplayName: string;
  Active?: boolean;
}

async function syncMasterData(realmId: string, accessToken: string) {
  // 1. entities (seeded)
  for (const e of QBO_ENTITY_SEED) {
    await prisma.qboEntity.upsert({
      where: { realmId_code: { realmId, code: e.code } },
      create: { realmId, ...e },
      update: { name: e.name, llcOwnerNames: e.llcOwnerNames, isJointVenture: e.isJointVenture, sortOrder: e.sortOrder },
    });
  }
  const entities = await prisma.qboEntity.findMany({ where: { realmId } });
  const entityByCode = new Map(entities.map((e) => [e.code, e.id]));

  // 2. classes
  const classRows = await query<QboClassRow>(
    realmId,
    "Class",
    "Id, Name, FullyQualifiedName, ParentRef, SubClass, Active",
    accessToken,
  );
  const properties = await prisma.property.findMany({ select: { id: true, address: true } });
  const propIndex = buildPropertyIndex(properties);

  for (const c of classRows) {
    const fqn = c.FullyQualifiedName || c.Name;
    const existing = await prisma.qboClass.findUnique({
      where: { realmId_qboId: { realmId, qboId: c.Id } },
    });
    const base = {
      name: c.Name,
      fullyQualifiedName: fqn,
      parentQboId: c.ParentRef?.value ?? null,
      isSubClass: !!c.SubClass,
      active: c.Active ?? true,
    };
    if (existing && !existing.autoMatched) {
      await prisma.qboClass.update({ where: { id: existing.id }, data: base });
      continue;
    }
    const match = autoMatchClass(fqn, propIndex);
    await prisma.qboClass.upsert({
      where: { realmId_qboId: { realmId, qboId: c.Id } },
      create: {
        realmId,
        qboId: c.Id,
        ...base,
        role: match.role,
        propertyId: match.propertyId,
        entityId: match.entityCode ? (entityByCode.get(match.entityCode) ?? null) : null,
        autoMatched: true,
        autoMatchNote: match.note,
      },
      update: {
        ...base,
        role: match.role,
        propertyId: match.propertyId,
        entityId: match.entityCode ? (entityByCode.get(match.entityCode) ?? null) : null,
        autoMatched: true,
        autoMatchNote: match.note,
      },
    });
  }

  // 3. accounts
  const acctRows = await query<QboAccountRow>(
    realmId,
    "Account",
    "Id, Name, FullyQualifiedName, AccountType, AccountSubType, Classification, Active, ParentRef",
    accessToken,
  );
  for (const a of acctRows) {
    const fqn = a.FullyQualifiedName || a.Name;
    const classification = a.Classification ?? "";
    const existing = await prisma.qboAccount.findUnique({
      where: { realmId_qboId: { realmId, qboId: a.Id } },
    });
    const base = {
      name: a.Name,
      fullyQualifiedName: fqn,
      acctType: a.AccountType ?? "",
      acctSubType: a.AccountSubType ?? null,
      classification,
      active: a.Active ?? true,
      parentQboId: a.ParentRef?.value ?? null,
    };
    if (existing?.categoryLocked) {
      // category/treatment pinned by the seed or a human — refresh only the facts
      await prisma.qboAccount.update({ where: { id: existing.id }, data: base });
      continue;
    }
    const seeded = seedCategory({
      fullyQualifiedName: fqn,
      name: a.Name,
      acctType: a.AccountType ?? "",
      acctSubType: a.AccountSubType ?? null,
      classification: classification || null,
    });
    await prisma.qboAccount.upsert({
      where: { realmId_qboId: { realmId, qboId: a.Id } },
      create: {
        realmId,
        qboId: a.Id,
        ...base,
        category: seeded.category,
        treatment: seeded.treatment,
        categoryLocked: seeded.locked,
      },
      update: {
        ...base,
        category: seeded.category,
        treatment: seeded.treatment,
        categoryLocked: seeded.locked,
      },
    });
  }

  // 4. vendors — matched to Contact best-effort, stored, not surfaced in v1
  const vendorRows = await query<QboVendorRow>(
    realmId,
    "Vendor",
    "Id, DisplayName, Active",
    accessToken,
  );
  const contacts = await prisma.contact.findMany({ select: { id: true, fullName: true, company: true } });
  const contactByName = new Map<string, string>();
  for (const ct of contacts) {
    for (const n of [ct.fullName, ct.company]) {
      const k = normalizeAddress(n);
      if (k && !contactByName.has(k)) contactByName.set(k, ct.id);
    }
  }
  for (const v of vendorRows) {
    await prisma.qboVendor.upsert({
      where: { realmId_qboId: { realmId, qboId: v.Id } },
      create: {
        realmId,
        qboId: v.Id,
        displayName: v.DisplayName,
        active: v.Active ?? true,
        contactId: contactByName.get(normalizeAddress(v.DisplayName)) ?? null,
      },
      update: { displayName: v.DisplayName, active: v.Active ?? true },
    });
  }

  return {
    classes: await prisma.qboClass.findMany({ where: { realmId } }),
    accounts: await prisma.qboAccount.findMany({ where: { realmId } }),
    propertyTokens: propertyTokens(properties),
  };
}

// --- line resolution ---------------------------------------------------

function synthTxnId(parts: (string | number | null)[]): string {
  return "syn_" + createHash("sha1").update(parts.map((p) => p ?? "").join("|")).digest("hex").slice(0, 20);
}

// --- the sync ---------------------------------------------------------

export async function runQuickbooksSync(opts: { trigger: QboSyncTrigger }): Promise<SyncSummary> {
  // claim the lock (see note: a TOCTOU race here only risks two identical
  // full-rebuilds, each atomic — no corruption)
  await prisma.qboSyncRun.updateMany({
    where: { status: "RUNNING", heartbeatAt: { lt: new Date(Date.now() - STALE_LOCK_MS) } },
    data: { status: "FAILED", error: "superseded — stale lock", finishedAt: new Date() },
  });
  const active = await prisma.qboSyncRun.findFirst({ where: { status: "RUNNING" } });
  if (active) return { runId: active.id, skipped: true, status: "PARTIAL", monthsProcessed: 0, lineCount: 0 };

  let conn;
  try {
    conn = await requireActiveConnection();
  } catch (e) {
    if (e instanceof QboReconnectRequired) {
      return { runId: null, status: "FAILED", monthsProcessed: 0, lineCount: 0, error: e.message };
    }
    throw e;
  }

  const run = await prisma.qboSyncRun.create({
    data: { realmId: conn.realmId, trigger: opts.trigger, status: "RUNNING" },
  });
  const startedAt = Date.now();
  const bump = () =>
    prisma.qboSyncRun.update({ where: { id: run.id }, data: { heartbeatAt: new Date() } });

  try {
    const fresh = await withFreshToken(conn);
    const accessToken = fresh.accessToken;
    const realmId = conn.realmId;

    const { classes, accounts, propertyTokens: propTokens } = await syncMasterData(realmId, accessToken);
    const classByQboId = new Map(classes.map((c) => [c.qboId, c]));
    const acctByQboId = new Map(accounts.map((a) => [a.qboId, a]));
    const acctByName = new Map(accounts.map((a) => [a.name, a]));
    await bump();

    const months = monthRange(conn.historyStart || "2026-01", currentMonth());

    // accumulate every line for every month × basis IN MEMORY, then one wipe+insert
    const allLines: LedgerLineInput[] = [];
    for (const ym of months) {
      const { start, end } = monthBounds(ym);
      for (const basis of BASES) {
        if (Date.now() - startedAt > qbo.syncBudgetMs) {
          throw new SyncBudgetExceeded(`wall-budget hit at ${ym}/${basis} — nothing written`);
        }
        const json = await report(
          realmId,
          "ProfitAndLossDetail",
          {
            start_date: start,
            end_date: end,
            accounting_method: basis === "CASH" ? "Cash" : "Accrual",
            columns:
              "tx_date,txn_type,doc_num,name,memo,account_name,split_acc,klass_name,subt_nat_amount",
            sort_by: "tx_date",
          },
          accessToken,
        );
        const raw = parseProfitAndLossDetail(json, ym, basis);
        const ordinals = new Map<string, number>();
        for (const r of raw) {
          const acct =
            (r.accountQboId && acctByQboId.get(r.accountQboId)) || acctByName.get(r.accountName);
          const classification = acct?.classification ?? "";
          const baseCategory = acct?.category ?? "OTHER";
          const baseTreatment =
            acct?.treatment ?? treatmentForCategory(baseCategory, classification || null);
          const refined = classifyLine({
            category: baseCategory,
            treatment: baseTreatment,
            classification: classification || null,
            amountCents: r.amountCents,
            name: r.name,
            memo: r.memo,
            txnType: r.txnType,
          });

          const klass = r.classQboId ? classByQboId.get(r.classQboId) : undefined;
          const classKey = classKeyOf(r.classQboId);
          const qboTxnId =
            r.qboTxnId ?? synthTxnId([r.txnType, r.txnDate, r.docNumber, r.name, r.amountCents]);
          const oKey = `${qboTxnId}:${r.accountQboId ?? "?"}:${classKey}:${r.amountCents}`;
          const ordinal = ordinals.get(oKey) ?? 0;
          ordinals.set(oKey, ordinal + 1);

          allLines.push({
            ...r,
            basis,
            lineKey: `${oKey}:${ordinal}`,
            classKey,
            classification,
            category: refined.category,
            treatment: refined.treatment,
            classRole: klass?.role ?? "UNMAPPED",
            propertyId: klass?.propertyId ?? null,
            entityId: klass?.entityId ?? null,
            lineTags: refined.lineTags,
            qboTxnId,
            vendorQboId: null,
            customerName: r.name,
          });
        }
        await bump();
      }
    }

    // one full-realm rebuild
    await prisma.$transaction([
      prisma.ledgerLine.deleteMany({ where: { realmId } }),
      prisma.ledgerLine.createMany({
        data: allLines.map((l) => ({
          realmId,
          basis: l.basis,
          periodMonth: l.periodMonth,
          txnDate: new Date(l.txnDate),
          qboTxnId: l.qboTxnId,
          txnType: l.txnType,
          lineKey: l.lineKey,
          docNumber: l.docNumber,
          name: l.name,
          memo: l.memo,
          businessName: l.businessName,
          accountQboId: l.accountQboId ?? "",
          accountName: l.accountName,
          splitAccount: l.splitAccount,
          classification: l.classification,
          category: l.category,
          treatment: l.treatment,
          classKey: l.classKey,
          className: l.className,
          propertyId: l.propertyId,
          entityId: l.entityId,
          classRole: l.classRole,
          lineTags: l.lineTags,
          vendorQboId: l.vendorQboId,
          customerName: l.customerName,
          amount: centsToDecimalString(l.amountCents),
          raw: l as unknown as Prisma.InputJsonValue,
          syncRunId: run.id,
        })),
      }),
    ]);
    await bump();

    // reconcile per basis
    const reconciliation: Record<string, unknown> = {};
    let allOk = true;
    for (const basis of BASES) {
      const [byClassJson, plainJson] = await Promise.all([
        report(
          realmId,
          "ProfitAndLoss",
          {
            start_date: monthBounds(months[0]).start,
            end_date: monthBounds(months[months.length - 1]).end,
            accounting_method: basis === "CASH" ? "Cash" : "Accrual",
            summarize_column_by: "Classes",
          },
          accessToken,
        ),
        report(
          realmId,
          "ProfitAndLoss",
          {
            start_date: monthBounds(months[0]).start,
            end_date: monthBounds(months[months.length - 1]).end,
            accounting_method: basis === "CASH" ? "Cash" : "Accrual",
          },
          accessToken,
        ),
      ]);
      const byClassCells = parseProfitAndLossByClass(byClassJson);
      const plain = parsePlainProfitAndLoss(plainJson);

      const lines = allLines.filter((l) => l.basis === basis);
      const ledgerCellSums = new Map<string, number>();
      for (const l of lines) {
        const k = `${l.accountQboId ?? "?"}::${l.classKey}`;
        ledgerCellSums.set(k, (ledgerCellSums.get(k) ?? 0) + l.amountCents);
      }
      const noi = computeNoi(
        lines.map((l) => ({
          treatment: l.treatment,
          category: l.category,
          amountCents: l.amountCents,
          lineTags: l.lineTags,
          periodMonth: l.periodMonth,
        })),
        { currentMonth: currentMonth() },
      );
      const rc = checkReconciliation({
        byClassCells,
        plainNetIncomeCents: plain.netIncomeCents ?? 0,
        qboNetOperatingIncomeCents: plain.netOperatingIncomeCents,
        ledgerCellSums,
        noi,
      });
      reconciliation[basis] = rc;
      if (!rc.ok) allOk = false;
    }
    await bump();

    const dataQuality = await buildDataQuality(realmId, propTokens);

    const status = allOk ? "SUCCESS" : "PARTIAL";
    await prisma.qboSyncRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt: new Date(),
        monthsProcessed: months.length,
        stats: JSON.parse(
          JSON.stringify({ reconciliation, dataQuality, lineCount: allLines.length }),
        ) as Prisma.InputJsonValue,
      },
    });
    await prisma.quickbooksConnection.update({
      where: { id: conn.id },
      data: {
        lastSyncAt: new Date(),
        lastSuccessfulSyncAt: new Date(),
        lastReconciledAt: allOk ? new Date() : conn.lastReconciledAt,
      },
    });

    revalidatePath("/financials");
    revalidatePath("/financials/settings");
    revalidatePath("/properties");

    return { runId: run.id, status, monthsProcessed: months.length, lineCount: allLines.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.qboSyncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message.slice(0, 4000) },
    });
    await prisma.quickbooksConnection.update({
      where: { id: conn.id },
      data: { lastSyncAt: new Date() },
    });
    if (err instanceof QboReconnectRequired || err instanceof SyncBudgetExceeded) {
      return { runId: run.id, status: "FAILED", monthsProcessed: 0, lineCount: 0, error: message };
    }
    throw err;
  }
}
