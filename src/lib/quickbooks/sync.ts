import "server-only";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { QboAccount, QboClass, QboSyncTrigger, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeAddress } from "@/lib/normalize";
import { logError } from "@/lib/log";
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
  PNL_DETAIL_COLUMNS,
} from "./report-parse";
import { computeNoi, type ComputeLine } from "./compute";
import { checkReconciliation } from "./reconcile";
import { centsToDecimalString, type LedgerLineInput } from "./types";
import { currentMonth, monthBounds, planMonths, type SyncScope } from "./months";
import { query, report, requireActiveConnection, withFreshToken, QboReconnectRequired } from "./client";
import { buildDataQuality } from "./data-quality";

/**
 * The QuickBooks → LedgerLine sync.
 *
 * Shape of a run (see months.ts for which months):
 *   1. master data (entities, classes, accounts, vendors) — one read + one
 *      transaction per table, not a query per row
 *   2. for each planned month × basis: fetch ProfitAndLossDetail, resolve
 *      every line, then delete+insert that (realm, basis, month) slice in
 *      ONE transaction — so a wall-budget hit keeps the months already done
 *   3. reconcile each basis against QuickBooks' own P&L (by class + plain),
 *      reading the ledger sums back from the database
 *   4. data-quality punch list, stats, timestamps
 *
 * Status: SUCCESS when every planned month was written and reconciliation
 * ties; PARTIAL when the budget stopped the run early or reconciliation is
 * off; FAILED when nothing usable happened (reconnect needed, API error).
 */

const STALE_LOCK_MS = 10 * 60_000;
const BASES = ["CASH", "ACCRUAL"] as const;

export interface SyncSummary {
  runId: string | null;
  skipped?: boolean;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  monthsProcessed: number;
  monthsPlanned?: number;
  lineCount: number;
  error?: string;
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
  await prisma.$transaction(
    QBO_ENTITY_SEED.map((e) =>
      prisma.qboEntity.upsert({
        where: { realmId_code: { realmId, code: e.code } },
        create: { realmId, ...e },
        update: { name: e.name, llcOwnerNames: e.llcOwnerNames, isJointVenture: e.isJointVenture, sortOrder: e.sortOrder },
      }),
    ),
  );
  const entities = await prisma.qboEntity.findMany({ where: { realmId } });
  const entityByCode = new Map(entities.map((e) => [e.code, e.id]));

  // 2. classes — human-edited mappings (autoMatched = false) keep their role/property
  const [classRows, properties, existingClasses] = await Promise.all([
    query<QboClassRow>(realmId, "Class", accessToken),
    prisma.property.findMany({ select: { id: true, address: true } }),
    prisma.qboClass.findMany({ where: { realmId } }),
  ]);
  const propIndex = buildPropertyIndex(properties);
  const classById = new Map(existingClasses.map((c) => [c.qboId, c]));
  const classWrites: Prisma.PrismaPromise<unknown>[] = [];
  const classCreates: Prisma.QboClassCreateManyInput[] = [];
  for (const c of classRows) {
    const fqn = c.FullyQualifiedName || c.Name;
    const base = {
      name: c.Name,
      fullyQualifiedName: fqn,
      parentQboId: c.ParentRef?.value ?? null,
      isSubClass: !!c.SubClass,
      active: c.Active ?? true,
    };
    const existing = classById.get(c.Id);
    if (existing && !existing.autoMatched) {
      classWrites.push(prisma.qboClass.update({ where: { id: existing.id }, data: base }));
      continue;
    }
    const match = autoMatchClass(fqn, propIndex);
    const matched = {
      role: match.role,
      propertyId: match.propertyId,
      entityId: match.entityCode ? (entityByCode.get(match.entityCode) ?? null) : null,
      autoMatched: true,
      autoMatchNote: match.note,
    };
    if (existing) classWrites.push(prisma.qboClass.update({ where: { id: existing.id }, data: { ...base, ...matched } }));
    else classCreates.push({ realmId, qboId: c.Id, ...base, ...matched });
  }
  if (classCreates.length) classWrites.push(prisma.qboClass.createMany({ data: classCreates }));
  if (classWrites.length) await prisma.$transaction(classWrites);

  // 3. accounts — categoryLocked rows keep their category/treatment
  const [acctRows, existingAccounts] = await Promise.all([
    query<QboAccountRow>(realmId, "Account", accessToken),
    prisma.qboAccount.findMany({ where: { realmId } }),
  ]);
  const acctById = new Map(existingAccounts.map((a) => [a.qboId, a]));
  const acctWrites: Prisma.PrismaPromise<unknown>[] = [];
  const acctCreates: Prisma.QboAccountCreateManyInput[] = [];
  for (const a of acctRows) {
    const fqn = a.FullyQualifiedName || a.Name;
    const classification = a.Classification ?? "";
    const base = {
      name: a.Name,
      fullyQualifiedName: fqn,
      acctType: a.AccountType ?? "",
      acctSubType: a.AccountSubType ?? null,
      classification,
      active: a.Active ?? true,
      parentQboId: a.ParentRef?.value ?? null,
    };
    const existing = acctById.get(a.Id);
    if (existing?.categoryLocked) {
      acctWrites.push(prisma.qboAccount.update({ where: { id: existing.id }, data: base }));
      continue;
    }
    const seeded = seedCategory({
      fullyQualifiedName: fqn,
      name: a.Name,
      acctType: a.AccountType ?? "",
      acctSubType: a.AccountSubType ?? null,
      classification: classification || null,
    });
    const cat = { category: seeded.category, treatment: seeded.treatment, categoryLocked: seeded.locked };
    if (existing) acctWrites.push(prisma.qboAccount.update({ where: { id: existing.id }, data: { ...base, ...cat } }));
    else acctCreates.push({ realmId, qboId: a.Id, ...base, ...cat });
  }
  if (acctCreates.length) acctWrites.push(prisma.qboAccount.createMany({ data: acctCreates }));
  if (acctWrites.length) await prisma.$transaction(acctWrites);

  // 4. vendors — matched to Contact best-effort, stored, not surfaced in v1
  const [vendorRows, contacts, existingVendors] = await Promise.all([
    query<QboVendorRow>(realmId, "Vendor", accessToken),
    prisma.contact.findMany({ select: { id: true, fullName: true, company: true } }),
    prisma.qboVendor.findMany({ where: { realmId }, select: { id: true, qboId: true } }),
  ]);
  const contactByName = new Map<string, string>();
  for (const ct of contacts) {
    for (const n of [ct.fullName, ct.company]) {
      const k = normalizeAddress(n);
      if (k && !contactByName.has(k)) contactByName.set(k, ct.id);
    }
  }
  const vendorById = new Map(existingVendors.map((v) => [v.qboId, v.id]));
  const vendorWrites: Prisma.PrismaPromise<unknown>[] = [];
  const vendorCreates: Prisma.QboVendorCreateManyInput[] = [];
  for (const v of vendorRows) {
    const id = vendorById.get(v.Id);
    if (id) vendorWrites.push(prisma.qboVendor.update({ where: { id }, data: { displayName: v.DisplayName, active: v.Active ?? true } }));
    else
      vendorCreates.push({
        realmId,
        qboId: v.Id,
        displayName: v.DisplayName,
        active: v.Active ?? true,
        contactId: contactByName.get(normalizeAddress(v.DisplayName)) ?? null,
      });
  }
  if (vendorCreates.length) vendorWrites.push(prisma.qboVendor.createMany({ data: vendorCreates }));
  if (vendorWrites.length) await prisma.$transaction(vendorWrites);

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

interface Lookups {
  classByQboId: Map<string, QboClass>;
  acctByQboId: Map<string, QboAccount>;
  acctByName: Map<string, QboAccount>;
}

/** Fetch + resolve one (month, basis) slice into ready-to-insert lines. */
async function fetchMonth(
  realmId: string,
  accessToken: string,
  ym: string,
  basis: (typeof BASES)[number],
  lk: Lookups,
): Promise<LedgerLineInput[]> {
  const { start, end } = monthBounds(ym);
  const json = await report(
    realmId,
    "ProfitAndLossDetail",
    {
      start_date: start,
      end_date: end,
      accounting_method: basis === "CASH" ? "Cash" : "Accrual",
      columns: PNL_DETAIL_COLUMNS.join(","),
      sort_by: "tx_date",
    },
    accessToken,
  );
  const raw = parseProfitAndLossDetail(json, ym, basis);
  const ordinals = new Map<string, number>();
  const out: LedgerLineInput[] = [];
  for (const r of raw) {
    const acct = (r.accountQboId && lk.acctByQboId.get(r.accountQboId)) || lk.acctByName.get(r.accountName);
    const classification = acct?.classification ?? "";
    const baseCategory = acct?.category ?? "OTHER";
    const baseTreatment = acct?.treatment ?? treatmentForCategory(baseCategory, classification || null);
    const refined = classifyLine({
      category: baseCategory,
      treatment: baseTreatment,
      classification: classification || null,
      amountCents: r.amountCents,
      name: r.name,
      memo: r.memo,
      txnType: r.txnType,
    });

    const klass = r.classQboId ? lk.classByQboId.get(r.classQboId) : undefined;
    const classKey = classKeyOf(r.classQboId);
    const qboTxnId = r.qboTxnId ?? synthTxnId([r.txnType, r.txnDate, r.docNumber, r.name, r.amountCents]);
    const oKey = `${qboTxnId}:${r.accountQboId ?? "?"}:${classKey}:${r.amountCents}`;
    const ordinal = ordinals.get(oKey) ?? 0;
    ordinals.set(oKey, ordinal + 1);

    out.push({
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
  return out;
}

/** Replace one (realm, basis, month) slice atomically. */
async function writeMonth(realmId: string, basis: (typeof BASES)[number], ym: string, lines: LedgerLineInput[], runId: string) {
  await prisma.$transaction([
    prisma.ledgerLine.deleteMany({ where: { realmId, basis, periodMonth: ym } }),
    ...(lines.length
      ? [
          prisma.ledgerLine.createMany({
            data: lines.map((l) => ({
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
              syncRunId: runId,
            })),
          }),
        ]
      : []),
  ]);
}

// --- reconciliation (from the database) ---------------------------------

const d2c = (v: unknown): number => (v == null ? 0 : Math.round(Number(v) * 100));

async function reconcileBasis(realmId: string, basis: (typeof BASES)[number], firstMonth: string, lastMonth: string, accessToken: string) {
  const range = {
    start_date: monthBounds(firstMonth).start,
    end_date: monthBounds(lastMonth).end,
    accounting_method: basis === "CASH" ? "Cash" : "Accrual",
  };
  const [byClassJson, plainJson, cellRows, lineRows] = await Promise.all([
    report(realmId, "ProfitAndLoss", { ...range, summarize_column_by: "Classes" }, accessToken),
    report(realmId, "ProfitAndLoss", range, accessToken),
    prisma.ledgerLine.groupBy({ by: ["accountQboId", "classKey"], where: { realmId, basis }, _sum: { amount: true } }),
    prisma.ledgerLine.findMany({
      where: { realmId, basis },
      select: { treatment: true, category: true, amount: true, lineTags: true, periodMonth: true },
    }),
  ]);
  const ledgerCellSums = new Map<string, number>();
  for (const r of cellRows) ledgerCellSums.set(`${r.accountQboId || "?"}::${r.classKey}`, d2c(r._sum.amount));
  const lines: ComputeLine[] = lineRows.map((r) => ({
    treatment: r.treatment,
    category: r.category,
    amountCents: d2c(r.amount),
    lineTags: r.lineTags,
    periodMonth: r.periodMonth,
  }));
  const plain = parsePlainProfitAndLoss(plainJson);
  return checkReconciliation({
    byClassCells: parseProfitAndLossByClass(byClassJson),
    plainNetIncomeCents: plain.netIncomeCents ?? 0,
    qboNetOperatingIncomeCents: plain.netOperatingIncomeCents,
    ledgerCellSums,
    noi: computeNoi(lines, { currentMonth: currentMonth() }),
  });
}

// --- the sync ---------------------------------------------------------

export async function runQuickbooksSync(opts: { trigger: QboSyncTrigger; scope?: SyncScope }): Promise<SyncSummary> {
  // claim the lock (a TOCTOU race here only risks two identical rebuilds of the same months — each slice is atomic)
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

  const scope: SyncScope = opts.scope ?? (opts.trigger === "CRON" ? "incremental" : "full");
  const lastRun = await prisma.qboSyncRun.findFirst({
    where: { realmId: conn.realmId, status: { in: ["SUCCESS", "PARTIAL"] } },
    orderBy: { startedAt: "desc" },
    select: { stats: true },
  });
  const prevCursor =
    lastRun && typeof lastRun.stats === "object" && lastRun.stats && "sweepCursor" in lastRun.stats
      ? ((lastRun.stats as { sweepCursor?: unknown }).sweepCursor as string | null)
      : null;
  const plan = planMonths(conn.historyStart || "2026-01", currentMonth(), scope, prevCursor ?? null);

  const run = await prisma.qboSyncRun.create({
    data: { realmId: conn.realmId, trigger: opts.trigger, status: "RUNNING" },
  });
  const startedAt = Date.now();
  const overBudget = () => Date.now() - startedAt > qbo.syncBudgetMs;
  const bump = () => prisma.qboSyncRun.update({ where: { id: run.id }, data: { heartbeatAt: new Date() } });
  const warnings: string[] = [];

  try {
    const fresh = await withFreshToken(conn);
    const accessToken = fresh.accessToken;
    const realmId = conn.realmId;

    const { classes, accounts, propertyTokens: propTokens } = await syncMasterData(realmId, accessToken);
    const lk: Lookups = {
      classByQboId: new Map(classes.map((c) => [c.qboId, c])),
      acctByQboId: new Map(accounts.map((a) => [a.qboId, a])),
      acctByName: new Map(accounts.map((a) => [a.name, a])),
    };
    await bump();

    // 2. month × basis slices, each written on its own
    let monthsProcessed = 0;
    let lineCount = 0;
    let stoppedEarly = false;
    for (const ym of plan.months) {
      if (overBudget()) {
        stoppedEarly = true;
        warnings.push(`wall budget hit before ${ym}; ${monthsProcessed}/${plan.months.length} months written`);
        break;
      }
      for (const basis of BASES) {
        const lines = await fetchMonth(realmId, accessToken, ym, basis, lk);
        await writeMonth(realmId, basis, ym, lines, run.id);
        lineCount += lines.length;
      }
      monthsProcessed += 1;
      await bump();
    }

    // 3. reconcile — only when the whole plan was written and there is time left
    const reconciliation: Record<string, unknown> = {};
    let reconciled = false;
    let allOk = false;
    const history = planMonths(conn.historyStart || "2026-01", currentMonth(), "full", null).months;
    if (!stoppedEarly && !overBudget() && history.length > 0) {
      allOk = true;
      for (const basis of BASES) {
        const rc = await reconcileBasis(realmId, basis, history[0], history[history.length - 1], accessToken);
        reconciliation[basis] = rc;
        if (!rc.ok) allOk = false;
      }
      reconciled = true;
      await bump();
    } else if (!stoppedEarly) {
      warnings.push("reconciliation skipped — wall budget exhausted after writing");
    }

    const dataQuality = await buildDataQuality(realmId, propTokens);

    const status = !stoppedEarly && reconciled && allOk ? "SUCCESS" : "PARTIAL";
    const sweepCursor = stoppedEarly ? (prevCursor ?? null) : plan.nextSweepCursor;
    await prisma.qboSyncRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt: new Date(),
        monthsProcessed,
        stats: JSON.parse(
          JSON.stringify({ scope, monthsPlanned: plan.months.length, months: plan.months, sweepCursor, reconciliation, dataQuality, lineCount, warnings }),
        ) as Prisma.InputJsonValue,
      },
    });
    await prisma.quickbooksConnection.update({
      where: { id: conn.id },
      data: {
        lastSyncAt: new Date(),
        lastSuccessfulSyncAt: monthsProcessed > 0 ? new Date() : conn.lastSuccessfulSyncAt,
        lastReconciledAt: reconciled && allOk ? new Date() : conn.lastReconciledAt,
      },
    });

    revalidatePath("/financials");
    revalidatePath("/financials/settings");
    revalidatePath("/financials/rent-roll");
    revalidatePath("/properties");

    return { runId: run.id, status, monthsProcessed, monthsPlanned: plan.months.length, lineCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError("qbo:sync", err, { runId: run.id, trigger: opts.trigger, scope });
    await prisma.qboSyncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message.slice(0, 4000) },
    });
    await prisma.quickbooksConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date() } });
    if (err instanceof QboReconnectRequired) {
      return { runId: run.id, status: "FAILED", monthsProcessed: 0, lineCount: 0, error: message };
    }
    throw err;
  }
}
