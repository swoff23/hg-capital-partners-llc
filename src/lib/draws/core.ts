import type { DrawStage, Prisma, PrismaClient } from "@prisma/client";
import { FieldError } from "@/lib/action-result";
import { ymdToDate, type Ymd } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { ensureUnitIds, rentableUnits } from "@/lib/tenants/core";
import { fmtMoney } from "@/lib/utils";
import { STAGE_LABEL, atLender, nextNumber } from "./figures";
import type { WorksheetRead } from "./worksheet";

/**
 * The rules every rehab and draw write keeps (docs/specs/rehab-draws.md), on
 * whatever client the caller hands in: the app's, through service.ts, or a
 * test's. Each write is one transaction, and a refusal is a FieldError keyed
 * by the field it's about, so a sheet marks that field and anything else
 * becomes the toast. Money arrives as dollars with at most two decimals.
 */

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;
export type By = { id: string } | null;

export const PICK_PROPERTY = "Pick at least one property.";
export const PROPERTY_GONE = "That property is gone. Pick another.";
export const NAME_NEEDED = "Give it a name.";
export const LINE_NAME_NEEDED = "Name the line.";
export const ALREADY_SET_UP = "This rehab already has its budget. Edit the lines here instead.";
export const LINE_ON_A_DRAW = "This line is on a draw already sent, so it stays. Set its budget instead.";
export const DRAFT_EMPTY = "The draft has no amounts yet. Add one to a line first.";
export const APPROVED_NEEDED = "Enter the approved amount.";
export const FUNDED_NEEDED = "Enter what landed.";
export const DAY_NEEDED = "Pick the day.";
export const REHAB_DONE = "This rehab is marked done. Reopen it to change it.";
export const NOT_FOUND = "That rehab is gone. Reload the page.";
export const UNIT_GONE = "That unit isn't on this property anymore. Pick another.";
export const UNIT_NOT_HERE = "Pick a unit at one of this rehab's properties.";

/** A unit picked for a line: the property and its unit's id (a lasting one, or a "unit-at-<n>" placeholder). */
export interface UnitPick {
  propertyId: string;
  unitId: string;
}

/**
 * The picked unit as a line stores it (R8, Connor Nov 20: units come from the property, not free text). The
 * property must be one of the rehab's; a placeholder id becomes the unit's lasting one, as a lease's does.
 */
async function resolveUnit(tx: Tx, rehabId: string, pick: UnitPick | null): Promise<{ unitId: string | null; unitLabel: string | null }> {
  if (!pick) return { unitId: null, unitLabel: null };
  const on = await tx.rehabProperty.findUnique({ where: { rehabId_propertyId: { rehabId, propertyId: pick.propertyId } }, select: { propertyId: true } });
  if (!on) throw new FieldError({ unit: UNIT_NOT_HERE });
  const ensured = await ensureUnitIds(tx, pick.propertyId, pick.unitId);
  const unit = ensured && rentableUnits(ensured.units).find((u) => u.id === ensured.picked);
  if (!unit?.id) throw new FieldError({ unit: UNIT_GONE });
  return { unitId: unit.id, unitLabel: unit.label?.trim() || null };
}

/** "23 Sherwood already has an open rehab." */
export function alreadyOpenMessage(street: string): string {
  return `${street} already has an open rehab.`;
}

const money = (n: number): string => n.toFixed(2);

/**
 * A rehab's first name, from its properties' streets: "765 and 767 Prospect Avenue"
 * when they share a street, "23 Sherwood Dr. and 58 Mariner Street" when they don't.
 */
export function rehabName(addresses: readonly string[]): string {
  const streets = addresses.map((a) => shortAddress(a) || a.trim()).filter(Boolean);
  if (streets.length === 0) return "Rehab";
  const parts = streets.map((s) => /^(\d+[A-Za-z]?)\s+(.+)$/.exec(s));
  const rest = parts[0]?.[2];
  if (streets.length > 1 && parts.every((p) => p && p[2] === rest)) {
    const numbers = parts.map((p) => p![1]);
    return `${joinWords(numbers)} ${rest}`;
  }
  return joinWords(streets);
}

function joinWords(words: readonly string[]): string {
  if (words.length <= 2) return words.join(" and ");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

async function openRehab(tx: Tx, rehabId: string): Promise<{ id: string }> {
  const r = await tx.rehab.findUnique({ where: { id: rehabId }, select: { id: true, doneAt: true } });
  if (!r) throw new FieldError({ rehab: NOT_FOUND });
  if (r.doneAt) throw new FieldError({ rehab: REHAB_DONE });
  return r;
}

/** Properties for a rehab: every one must exist, and none may already sit in another open rehab. */
async function checkProperties(tx: Tx, propertyIds: readonly string[], except: string | null): Promise<void> {
  if (propertyIds.length === 0) throw new FieldError({ propertyIds: PICK_PROPERTY });
  const found = await tx.property.findMany({ where: { id: { in: [...propertyIds] } }, select: { id: true, address: true } });
  if (found.length !== new Set(propertyIds).size) throw new FieldError({ propertyIds: PROPERTY_GONE });
  const busy = await tx.rehabProperty.findFirst({
    where: { propertyId: { in: [...propertyIds] }, rehab: { doneAt: null, ...(except ? { id: { not: except } } : {}) } },
    select: { property: { select: { address: true } } },
  });
  if (busy) throw new FieldError({ propertyIds: alreadyOpenMessage(shortAddress(busy.property.address) || busy.property.address) });
}

// ---------------------------------------------------------------------------
// Rehabs
// ---------------------------------------------------------------------------

export interface NewRehab {
  propertyIds: string[];
  lender: string | null;
}

export async function createRehab(db: Db, input: NewRehab, by: By): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    const ids = [...new Set(input.propertyIds)];
    await checkProperties(tx, ids, null);
    const properties = await tx.property.findMany({ where: { id: { in: ids } }, select: { id: true, address: true }, orderBy: { address: "asc" } });
    const rehab = await tx.rehab.create({
      data: {
        name: rehabName(properties.map((p) => p.address)),
        lender: input.lender?.trim() || null,
        createdByUserId: by?.id ?? null,
        properties: { create: ids.map((propertyId) => ({ propertyId })) },
      },
      select: { id: true },
    });
    return rehab;
  });
}

export interface RehabPatch {
  name?: string;
  lender?: string | null;
  holdback?: number | null;
  notes?: string | null;
  propertyIds?: string[];
}

export async function patchRehab(db: Db, rehabId: string, patch: RehabPatch): Promise<void> {
  await db.$transaction(async (tx) => {
    await openRehab(tx, rehabId);
    if (patch.name !== undefined && !patch.name.trim()) throw new FieldError({ name: NAME_NEEDED });
    if (patch.propertyIds) {
      const ids = [...new Set(patch.propertyIds)];
      await checkProperties(tx, ids, rehabId);
      await tx.rehabProperty.deleteMany({ where: { rehabId, propertyId: { notIn: ids } } });
      await tx.rehabProperty.createMany({ data: ids.map((propertyId) => ({ rehabId, propertyId })), skipDuplicates: true });
    }
    await tx.rehab.update({
      where: { id: rehabId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.lender !== undefined ? { lender: patch.lender?.trim() || null } : {}),
        ...(patch.holdback !== undefined ? { holdback: patch.holdback == null ? null : money(patch.holdback) } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
      },
    });
  });
}

/** Done after the last draw or the refi (R2 defaults); reopening puts it back on the property page. */
export async function setDone(db: Db, rehabId: string, done: boolean): Promise<void> {
  await db.$transaction(async (tx) => {
    const r = await tx.rehab.findUnique({ where: { id: rehabId }, select: { id: true, properties: { select: { propertyId: true } } } });
    if (!r) throw new FieldError({ rehab: NOT_FOUND });
    if (!done) await checkProperties(tx, r.properties.map((p) => p.propertyId), rehabId);
    await tx.rehab.update({ where: { id: rehabId }, data: { doneAt: done ? new Date() : null } });
  });
}

export async function deleteRehab(db: Db, rehabId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.drawLine.deleteMany({ where: { draw: { rehabId } } });
    await tx.rehab.delete({ where: { id: rehabId } });
  });
}

/**
 * Brings a Vontive worksheet into a rehab with no budget yet (R7): its lines,
 * the holdback when none is entered, and every past draw as Funded with no
 * dates, since the worksheet has none.
 */
export async function importWorksheet(
  db: Db,
  rehabId: string,
  read: WorksheetRead,
  units: Readonly<Record<string, UnitPick | null>> = {},
): Promise<{ lines: number; draws: number }> {
  return db.$transaction(async (tx) => {
    await openRehab(tx, rehabId);
    const has = await tx.rehabLine.count({ where: { rehabId } });
    const drawn = await tx.draw.count({ where: { rehabId } });
    if (has > 0 || drawn > 0) throw new FieldError({ file: ALREADY_SET_UP });
    // Each worksheet unit ("Unit 1") matched to one of the properties' units; an unmatched one keeps its words.
    const matched = new Map<string, { unitId: string | null; unitLabel: string | null }>();
    for (const label of read.units) {
      const pick = units[label];
      matched.set(label, pick ? await resolveUnit(tx, rehabId, pick) : { unitId: null, unitLabel: label });
    }
    const ids: string[] = [];
    for (const [i, l] of read.lines.entries()) {
      const unit = l.unitLabel ? (matched.get(l.unitLabel) ?? { unitId: null, unitLabel: l.unitLabel }) : { unitId: null, unitLabel: null };
      const row = await tx.rehabLine.create({
        data: { rehabId, position: i + 1, ...unit, name: l.name, original: money(l.original), changeOrder: money(l.changeOrder) },
        select: { id: true },
      });
      ids.push(row.id);
    }
    for (const d of read.draws) {
      const amounts = d.amounts.map((amount, i) => ({ lineId: ids[i], amount })).filter((a) => a.amount !== 0);
      const total = amounts.reduce((s, a) => s + Math.round(a.amount * 100), 0) / 100;
      await tx.draw.create({
        data: {
          rehabId,
          number: d.number,
          stage: "FUNDED",
          approvedAmount: money(total),
          lines: { create: amounts.map((a) => ({ lineId: a.lineId, amount: money(a.amount) })) },
        },
      });
    }
    const rehab = await tx.rehab.findUnique({ where: { id: rehabId }, select: { holdback: true } });
    await tx.rehab.update({
      where: { id: rehabId },
      data: { source: "WORKSHEET", ...(rehab?.holdback == null && read.holdback != null ? { holdback: money(read.holdback) } : {}) },
    });
    return { lines: ids.length, draws: read.draws.length };
  });
}

// ---------------------------------------------------------------------------
// Budget lines
// ---------------------------------------------------------------------------

export interface LineInput {
  /** The unit picked from the rehab's properties, or null for none. */
  unit: UnitPick | null;
  name: string;
  original: number;
  changeOrder: number;
}

/**
 * Adds a line, with its first draft amount when one is given. Both save in one transaction, so a draft past the
 * line's budget refuses the whole add and nothing is left behind for a second try to duplicate.
 */
export async function addLine(db: Db, rehabId: string, input: LineInput & { draft?: number | null }): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    await openRehab(tx, rehabId);
    if (!input.name.trim()) throw new FieldError({ name: LINE_NAME_NEEDED });
    const last = await tx.rehabLine.aggregate({ where: { rehabId }, _max: { position: true } });
    const unit = await resolveUnit(tx, rehabId, input.unit);
    const row = await tx.rehabLine.create({
      data: {
        rehabId,
        position: (last._max.position ?? 0) + 1,
        ...unit,
        name: input.name.trim(),
        original: money(input.original),
        changeOrder: money(input.changeOrder),
      },
      select: { id: true },
    });
    if (input.draft) {
      const draft = await tx.draw.findFirst({ where: { rehabId, stage: "DRAFT" }, select: { id: true } });
      await checkAvailable(tx, row.id, draft?.id ?? null, input.draft, "draft");
      await writeDraftAmount(tx, rehabId, row.id, input.draft);
    }
    return row;
  });
}

export async function patchLine(db: Db, lineId: string, patch: Partial<LineInput>): Promise<{ rehabId: string }> {
  return db.$transaction(async (tx) => {
    const line = await tx.rehabLine.findUnique({ where: { id: lineId }, select: { rehabId: true } });
    if (!line) throw new FieldError({ line: NOT_FOUND });
    await openRehab(tx, line.rehabId);
    if (patch.name !== undefined && !patch.name.trim()) throw new FieldError({ name: LINE_NAME_NEEDED });
    const unit = patch.unit !== undefined ? await resolveUnit(tx, line.rehabId, patch.unit) : null;
    await tx.rehabLine.update({
      where: { id: lineId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(unit ? unit : {}),
        ...(patch.original !== undefined ? { original: money(patch.original) } : {}),
        ...(patch.changeOrder !== undefined ? { changeOrder: money(patch.changeOrder) } : {}),
      },
    });
    return { rehabId: line.rehabId };
  });
}

/** What a deleted line held, for Undo. */
export interface LineSnapshot {
  rehabId: string;
  position: number;
  unitId: string | null;
  unitLabel: string | null;
  name: string;
  original: number;
  changeOrder: number;
  draft: number | null;
}

/** Deletes a line that's on no sent draw; its draft amount goes with it, and comes back on Undo. */
export async function deleteLine(db: Db, lineId: string): Promise<LineSnapshot> {
  return db.$transaction(async (tx) => {
    const line = await tx.rehabLine.findUnique({
      where: { id: lineId },
      select: { rehabId: true, position: true, unitId: true, unitLabel: true, name: true, original: true, changeOrder: true, amounts: { select: { amount: true, draw: { select: { stage: true } } } } },
    });
    if (!line) throw new FieldError({ line: NOT_FOUND });
    await openRehab(tx, line.rehabId);
    if (line.amounts.some((a) => a.draw.stage !== "DRAFT")) throw new FieldError({ line: LINE_ON_A_DRAW });
    const draft = line.amounts.find((a) => a.draw.stage === "DRAFT");
    await tx.drawLine.deleteMany({ where: { lineId } });
    await tx.rehabLine.delete({ where: { id: lineId } });
    return {
      rehabId: line.rehabId,
      position: line.position,
      unitId: line.unitId,
      unitLabel: line.unitLabel,
      name: line.name,
      original: Number(line.original),
      changeOrder: Number(line.changeOrder),
      draft: draft ? Number(draft.amount) : null,
    };
  });
}

export async function restoreLine(db: Db, s: LineSnapshot): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    await openRehab(tx, s.rehabId);
    const row = await tx.rehabLine.create({
      data: { rehabId: s.rehabId, position: s.position, unitId: s.unitId, unitLabel: s.unitLabel, name: s.name, original: money(s.original), changeOrder: money(s.changeOrder) },
      select: { id: true },
    });
    if (s.draft) await writeDraftAmount(tx, s.rehabId, row.id, s.draft);
    return row;
  });
}

// ---------------------------------------------------------------------------
// The draft and the draws
// ---------------------------------------------------------------------------

async function writeDraftAmount(tx: Tx, rehabId: string, lineId: string, amount: number | null): Promise<void> {
  let draft = await tx.draw.findFirst({ where: { rehabId, stage: "DRAFT" }, select: { id: true } });
  if (!amount) {
    if (draft) await tx.drawLine.deleteMany({ where: { drawId: draft.id, lineId } });
    return;
  }
  if (!draft) {
    const numbers = await tx.draw.findMany({ where: { rehabId }, select: { number: true } });
    draft = await tx.draw.create({ data: { rehabId, number: nextNumber(numbers) }, select: { id: true } });
  }
  await tx.drawLine.upsert({
    where: { drawId_lineId: { drawId: draft.id, lineId } },
    create: { drawId: draft.id, lineId, amount: money(amount) },
    update: { amount: money(amount) },
  });
}

/** "Only $4,000 is left on Framing.", or "Nothing is left on Demo." */
export function overLineMessage(name: string, available: number): string {
  return available > 0 ? `Only ${fmtMoney(available)} is left on ${name}.` : `Nothing is left on ${name}.`;
}

/**
 * A line can't be asked for past what's left on it (Connor, Nov 20: "dont allow me to try and pull more than
 * what I have remaining available"): its revised budget less its amounts on every other draw, funded, at the
 * lender or the draft. Throws on `field` when `amount` is more than that.
 */
async function checkAvailable(tx: Tx, lineId: string, exceptDrawId: string | null, amount: number | null, field: string): Promise<void> {
  if (!amount || amount <= 0) return;
  const line = await tx.rehabLine.findUniqueOrThrow({
    where: { id: lineId },
    select: { name: true, original: true, changeOrder: true, amounts: { select: { drawId: true, amount: true } } },
  });
  const c = (v: Prisma.Decimal | number) => Math.round(Number(v.toString()) * 100);
  const taken = line.amounts.filter((a) => a.drawId !== exceptDrawId).reduce((sum, a) => sum + c(a.amount), 0);
  const available = c(line.original) + c(line.changeOrder) - taken;
  if (Math.round(amount * 100) > available) throw new FieldError({ [field]: overLineMessage(line.name, available / 100) });
}

/**
 * One line's amount on the running draft (R3). Empty or 0 takes the line off it; the draft opens on its first
 * amount. It can't go past what's left on the line.
 */
export async function setDraftAmount(db: Db, lineId: string, amount: number | null): Promise<{ rehabId: string }> {
  return db.$transaction(async (tx) => {
    const line = await tx.rehabLine.findUnique({ where: { id: lineId }, select: { rehabId: true } });
    if (!line) throw new FieldError({ line: NOT_FOUND });
    await openRehab(tx, line.rehabId);
    const draft = await tx.draw.findFirst({ where: { rehabId: line.rehabId, stage: "DRAFT" }, select: { id: true } });
    await checkAvailable(tx, lineId, draft?.id ?? null, amount, "draft");
    await writeDraftAmount(tx, line.rehabId, lineId, amount);
    return { rehabId: line.rehabId };
  });
}

/** Marks the draft sent (R4): it records the day and the draft's total as the amount sent. */
export async function sendDraft(db: Db, rehabId: string, sentOn: Ymd): Promise<{ drawId: string; number: number; sentAmount: number }> {
  return db.$transaction(async (tx) => {
    await openRehab(tx, rehabId);
    const day = ymdToDate(sentOn);
    if (!day) throw new FieldError({ sentOn: DAY_NEEDED });
    const draft = await tx.draw.findFirst({ where: { rehabId, stage: "DRAFT" }, select: { id: true, number: true, lines: { select: { amount: true } } } });
    const total = draft?.lines.reduce((s, l) => s + Math.round(Number(l.amount) * 100), 0) ?? 0;
    if (!draft || total <= 0) throw new FieldError({ draft: DRAFT_EMPTY });
    await tx.draw.update({
      where: { id: draft.id },
      data: { stage: "SENT", stageChangedAt: new Date(), sentOn: day, sentAmount: money(total / 100) },
    });
    return { drawId: draft.id, number: draft.number, sentAmount: total / 100 };
  });
}

/** Undo of Mark sent: back to the draft, while no newer draft has opened. */
export async function unsendDraw(db: Db, drawId: string): Promise<{ rehabId: string }> {
  return db.$transaction(async (tx) => {
    const d = await tx.draw.findUnique({ where: { id: drawId }, select: { rehabId: true, stage: true } });
    if (!d) throw new FieldError({ draw: NOT_FOUND });
    if (d.stage !== "SENT") return { rehabId: d.rehabId };
    const other = await tx.draw.findFirst({ where: { rehabId: d.rehabId, stage: "DRAFT" }, select: { id: true } });
    if (other) throw new FieldError({ draw: "A new draft is open, so this one stays sent." });
    await tx.draw.update({ where: { id: drawId }, data: { stage: "DRAFT", stageChangedAt: new Date(), sentOn: null, sentAmount: null } });
    return { rehabId: d.rehabId };
  });
}

export interface DrawPatch {
  stage?: Exclude<DrawStage, "DRAFT">;
  sentOn?: Ymd | null;
  sentAmount?: number | null;
  approvedOn?: Ymd | null;
  approvedAmount?: number | null;
  fundedOn?: Ymd | null;
  fundedAmount?: number | null;
  waitingOnUs?: boolean;
  waitingNote?: string | null;
}

/**
 * A sent draw's stage, dates, amounts and Waiting on us flag (R4, R5). Moving
 * to Approved needs the approved amount and to Funded what landed, each with
 * its day (today unless picked). A move resets its days-in-stage count; the
 * flag doesn't. Funded clears the flag.
 */
export async function updateDraw(db: Db, drawId: string, patch: DrawPatch, today: Ymd): Promise<{ rehabId: string; stage: DrawStage }> {
  return db.$transaction(async (tx) => {
    const d = await tx.draw.findUnique({
      where: { id: drawId },
      select: { rehabId: true, stage: true, approvedAmount: true, fundedAmount: true, approvedOn: true, fundedOn: true },
    });
    if (!d) throw new FieldError({ draw: NOT_FOUND });
    await openRehab(tx, d.rehabId);
    if (d.stage === "DRAFT") throw new FieldError({ draw: "Mark the draft sent first." });
    const stage = patch.stage ?? d.stage;
    const approved = patch.approvedAmount !== undefined ? patch.approvedAmount : d.approvedAmount == null ? null : Number(d.approvedAmount);
    const funded = patch.fundedAmount !== undefined ? patch.fundedAmount : d.fundedAmount == null ? null : Number(d.fundedAmount);
    const moved = stage !== d.stage;
    // Only a move into a stage asks for its amount, so an imported Funded draw can take its dates alone.
    if (moved && (stage === "APPROVED" || stage === "FUNDED") && approved == null) throw new FieldError({ approvedAmount: APPROVED_NEEDED });
    if (moved && stage === "FUNDED" && funded == null) throw new FieldError({ fundedAmount: FUNDED_NEEDED });
    const day = (v: Ymd | null | undefined) => (v === undefined ? undefined : ymdToDate(v));
    const data: Prisma.DrawUpdateInput = {
      stage,
      ...(moved ? { stageChangedAt: new Date() } : {}),
      ...(patch.sentOn !== undefined ? { sentOn: day(patch.sentOn) } : {}),
      ...(patch.sentAmount !== undefined ? { sentAmount: patch.sentAmount == null ? null : money(patch.sentAmount) } : {}),
      ...(patch.approvedOn !== undefined ? { approvedOn: day(patch.approvedOn) } : {}),
      ...(patch.approvedAmount !== undefined ? { approvedAmount: approved == null ? null : money(approved) } : {}),
      ...(patch.fundedOn !== undefined ? { fundedOn: day(patch.fundedOn) } : {}),
      ...(patch.fundedAmount !== undefined ? { fundedAmount: funded == null ? null : money(funded) } : {}),
      ...(patch.waitingOnUs !== undefined ? { waitingOnUs: patch.waitingOnUs } : {}),
      ...(patch.waitingNote !== undefined ? { waitingNote: patch.waitingNote?.trim() || null } : {}),
    };
    if (moved && (stage === "APPROVED" || stage === "FUNDED") && d.approvedOn == null && patch.approvedOn === undefined) data.approvedOn = ymdToDate(today);
    if (moved && stage === "FUNDED" && d.fundedOn == null && patch.fundedOn === undefined) data.fundedOn = ymdToDate(today);
    if (patch.waitingOnUs === true && !atLender(stage)) {
      throw new FieldError({ waitingOnUs: `A draw that's ${STAGE_LABEL[stage].toLowerCase()} isn't waiting on anyone.` });
    }
    if (stage === "FUNDED") data.waitingOnUs = false;
    await tx.draw.update({ where: { id: drawId }, data });
    return { rehabId: d.rehabId, stage };
  });
}

/** A sent or funded draw's amount on one line, for matching what the lender approved (section 4). */
export async function setDrawLineAmount(db: Db, drawId: string, lineId: string, amount: number | null): Promise<{ rehabId: string }> {
  return db.$transaction(async (tx) => {
    const d = await tx.draw.findUnique({ where: { id: drawId }, select: { rehabId: true } });
    const line = await tx.rehabLine.findUnique({ where: { id: lineId }, select: { rehabId: true } });
    if (!d || !line || line.rehabId !== d.rehabId) throw new FieldError({ draw: NOT_FOUND });
    await openRehab(tx, d.rehabId);
    await checkAvailable(tx, lineId, drawId, amount, "amount");
    if (!amount) await tx.drawLine.deleteMany({ where: { drawId, lineId } });
    else
      await tx.drawLine.upsert({
        where: { drawId_lineId: { drawId, lineId } },
        create: { drawId, lineId, amount: money(amount) },
        update: { amount: money(amount) },
      });
    return { rehabId: d.rehabId };
  });
}

/** Deletes a draw entered by mistake, its line amounts with it. */
export async function deleteDraw(db: Db, drawId: string): Promise<{ rehabId: string }> {
  return db.$transaction(async (tx) => {
    const d = await tx.draw.findUnique({ where: { id: drawId }, select: { rehabId: true } });
    if (!d) throw new FieldError({ draw: NOT_FOUND });
    await openRehab(tx, d.rehabId);
    await tx.draw.delete({ where: { id: drawId } });
    return { rehabId: d.rehabId };
  });
}
