"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FieldError, NUMBER_TOO_BIG, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { todayYmdEastern } from "@/lib/dates";
import { NUMBER_MESSAGE, parseAmount, readNumber } from "@/lib/money";
import { withResult } from "@/lib/server-action";
import * as draws from "@/lib/draws/service";
import { WorksheetError, readWorksheet, type WorksheetRead } from "@/lib/draws/worksheet";

/**
 * Draws' writes (docs/specs/rehab-draws.md). Authenticate, check the shape,
 * read the money, call the draws service; the rules live in
 * src/lib/draws/core.ts and come back as a FieldError, which withResult turns
 * into the result the sheet or toast shows. Partners only: requireUser admits
 * staff logins, never a contractor's portal account.
 */

const id = z.string().min(1).max(64);
const text = z.string().max(20_000).nullable();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const raw = z.string().max(40).nullable();

const MAX = 9_999_999_999.99;
// Next's server actions take a 1 MB body; Vontive's worksheets run 90 to 300 KB.
const MAX_WORKSHEET_BYTES = 1024 * 1024;

/** A money field's text as dollars: blank is null; negatives only where `signed` (a change order). */
function amount(field: string, value: string | null | undefined, opts: { signed?: boolean; required?: string } = {}): number | null {
  const s = (value ?? "").trim();
  let n: number | null;
  if (opts.signed) {
    n = s === "" ? null : parseAmount(s);
    if (s !== "" && n == null) throw new FieldError({ [field]: NUMBER_MESSAGE.money });
  } else {
    const read = readNumber("money", s);
    if (!read.ok) throw new FieldError({ [field]: read.message });
    n = read.value;
  }
  if (n == null) {
    if (opts.required) throw new FieldError({ [field]: opts.required });
    return null;
  }
  if (Math.abs(n) > MAX) throw new FieldError({ [field]: NUMBER_TOO_BIG });
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Rehabs
// ---------------------------------------------------------------------------

// The property may be blank, so the service can say "Pick the property." beside the holdback's own line.
// `propertyIds` instead is the "More than one property" switch.
const newRehab = z
  .object({ propertyId: z.string().max(64), propertyIds: z.array(id).max(20), holdback: raw, lender: z.string().max(200).nullable() })
  .partial({ propertyId: true, propertyIds: true })
  .strict()
  .refine((r) => (r.propertyId === undefined) !== (r.propertyIds === undefined), "Send the property or the properties.");

/** New rehab (L4): the property (or several, for a shared loan), the holdback and the lender. The rehab page opens next. */
export async function createRehabAction(input: z.input<typeof newRehab>): Promise<ActionResult<{ id: string }>> {
  return withResult("createRehab", async () => {
    const user = await requireUser();
    const p = newRehab.parse(input);
    const where = p.propertyIds !== undefined ? { propertyIds: p.propertyIds } : { propertyId: p.propertyId ?? "" };
    return draws.createRehab({ ...where, holdback: amount("holdback", p.holdback), lender: p.lender }, { id: user.id });
  });
}

const rehabPatch = z
  .object({ name: z.string().max(200), lender: text, holdback: raw, notes: text, propertyIds: z.array(id).min(1).max(20) })
  .partial()
  .strict();

/** The rehab's own facts from its Details rail: name, lender, holdback, notes, properties. */
export async function saveRehabAction(rehabId: string, patch: z.input<typeof rehabPatch>): Promise<ActionResult> {
  return withResult("saveRehab", async () => {
    await requireUser();
    const p = rehabPatch.parse(patch);
    await draws.patchRehab(id.parse(rehabId), {
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.lender !== undefined ? { lender: p.lender } : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
      ...(p.propertyIds !== undefined ? { propertyIds: p.propertyIds } : {}),
      ...(p.holdback !== undefined ? { holdback: amount("holdback", p.holdback) } : {}),
    });
  });
}

export async function setRehabDoneAction(rehabId: string, done: boolean): Promise<ActionResult> {
  return withResult("setRehabDone", async () => {
    await requireUser();
    await draws.setDone(id.parse(rehabId), z.boolean().parse(done));
  });
}

/** Deletes a rehab set up by mistake, then goes back to Draws. */
export async function deleteRehabAction(rehabId: string): Promise<ActionResult> {
  const result = await withResult("deleteRehab", async () => {
    await requireUser();
    await draws.deleteRehab(id.parse(rehabId));
  });
  if (result.ok) redirect("/draws");
  return result;
}

// ---------------------------------------------------------------------------
// The worksheet upload (L4): read it, show what it found, then bring it in
// ---------------------------------------------------------------------------

/** Reads an uploaded .xlsx and returns what it found. Nothing saves until importWorksheetAction. */
export async function readWorksheetAction(form: FormData): Promise<ActionResult<WorksheetRead>> {
  return withResult("readWorksheet", async () => {
    await requireUser();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new FieldError({ file: "Pick the worksheet file." });
    if (file.size > MAX_WORKSHEET_BYTES) throw new FieldError({ file: "That file is over 1 MB. Upload the worksheet Vontive sent." });
    try {
      return await readWorksheet(await file.arrayBuffer());
    } catch (err) {
      if (err instanceof WorksheetError) throw new FieldError({ file: err.message });
      throw err;
    }
  });
}

const dollars = z.number().finite().min(-MAX).max(MAX);
const worksheetRead = z
  .object({
    holdback: dollars.nullable(),
    units: z.array(z.string().max(40)).max(50),
    lines: z
      .array(z.object({ unitLabel: z.string().max(40).nullable(), name: z.string().min(1).max(200), original: dollars, changeOrder: dollars }).strict())
      .min(1)
      .max(500),
    draws: z.array(z.object({ number: z.number().int().min(1).max(99), amounts: z.array(dollars).max(500) }).strict()).max(60),
  })
  .strict()
  .refine((r) => r.draws.every((d) => d.amounts.length === r.lines.length), "Each draw needs one amount per line.");

/** A unit picker's value, "<propertyId>|<unitId>", as the service takes it; null for none. */
const unitValue = z.string().max(200).nullable();
function unitPick(value: string | null | undefined): draws.UnitPick | null {
  if (!value) return null;
  const [propertyId, unitId] = value.split("|");
  if (!propertyId || !unitId) throw new FieldError({ unit: "Pick a unit from the list." });
  return { propertyId, unitId };
}

/**
 * Brings the checked worksheet into an empty rehab. `units` matches each of the worksheet's units ("Unit 1")
 * to one of the properties' units by the picker's value; a worksheet unit left unmatched keeps its own words.
 */
export async function importWorksheetAction(
  rehabId: string,
  read: WorksheetRead,
  units: Record<string, string | null> = {},
): Promise<ActionResult<{ lines: number; draws: number }>> {
  return withResult("importWorksheet", async () => {
    await requireUser();
    const map = z.record(z.string().max(40), unitValue).parse(units);
    const picks = Object.fromEntries(Object.entries(map).map(([label, v]) => [label, unitPick(v)]));
    return draws.importWorksheet(id.parse(rehabId), worksheetRead.parse(read), picks);
  });
}

// ---------------------------------------------------------------------------
// Budget lines
// ---------------------------------------------------------------------------

const lineFields = z
  .object({ unit: unitValue, name: z.string().max(200), original: raw, changeOrder: raw, draft: raw })
  .partial()
  .strict();

export async function addLineAction(rehabId: string, input: z.input<typeof lineFields>): Promise<ActionResult<{ id: string }>> {
  return withResult("addLine", async () => {
    await requireUser();
    const p = lineFields.parse(input);
    return draws.addLine(id.parse(rehabId), {
      unit: unitPick(p.unit),
      name: p.name ?? "",
      original: amount("original", p.original, { required: "Enter the budget." }) ?? 0,
      changeOrder: amount("changeOrder", p.changeOrder, { signed: true }) ?? 0,
      draft: amount("draft", p.draft),
    });
  });
}

export async function saveLineAction(lineId: string, patch: z.input<typeof lineFields>): Promise<ActionResult> {
  return withResult("saveLine", async () => {
    await requireUser();
    const p = lineFields.parse(patch);
    await draws.patchLine(id.parse(lineId), {
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.unit !== undefined ? { unit: unitPick(p.unit) } : {}),
      ...(p.original !== undefined ? { original: amount("original", p.original, { required: "Enter the budget." })! } : {}),
      ...(p.changeOrder !== undefined ? { changeOrder: amount("changeOrder", p.changeOrder, { signed: true }) ?? 0 } : {}),
    });
  });
}

export async function deleteLineAction(lineId: string): Promise<ActionResult<draws.LineSnapshot>> {
  return withResult("deleteLine", async () => {
    await requireUser();
    return draws.deleteLine(id.parse(lineId));
  });
}

const snapshot = z
  .object({
    rehabId: id,
    position: z.number().int(),
    unitId: z.string().max(100).nullable(),
    unitLabel: z.string().max(200).nullable(),
    name: z.string().min(1).max(200),
    original: dollars,
    changeOrder: dollars,
    draft: dollars.nullable(),
  })
  .strict();

export async function restoreLineAction(s: draws.LineSnapshot): Promise<ActionResult> {
  return withResult("restoreLine", async () => {
    await requireUser();
    await draws.restoreLine(snapshot.parse(s));
  });
}

// ---------------------------------------------------------------------------
// The draft and the draws
// ---------------------------------------------------------------------------

/** One line's amount on the running draft; blank takes it off. */
export async function setDraftAmountAction(lineId: string, value: string | null): Promise<ActionResult> {
  return withResult("setDraftAmount", async () => {
    await requireUser();
    await draws.setDraftAmount(id.parse(lineId), amount("draft", raw.parse(value)));
  });
}

/** Mark sent: records the day (today unless picked) and the draft's total. */
export async function sendDraftAction(rehabId: string, sentOn: string | null): Promise<ActionResult<{ drawId: string; number: number; sentAmount: number }>> {
  return withResult("sendDraft", async () => {
    await requireUser();
    return draws.sendDraft(id.parse(rehabId), day.parse(sentOn) ?? todayYmdEastern());
  });
}

export async function unsendDrawAction(drawId: string): Promise<ActionResult> {
  return withResult("unsendDraw", async () => {
    await requireUser();
    await draws.unsendDraw(id.parse(drawId));
  });
}

const drawPatch = z
  .object({
    stage: z.enum(["SENT", "INSPECTION", "APPROVED", "FUNDED"]),
    sentOn: day,
    sentAmount: raw,
    approvedOn: day,
    approvedAmount: raw,
    fundedOn: day,
    fundedAmount: raw,
  })
  .partial()
  .strict();

/** A sent draw's stage, days and amounts (R4). */
export async function saveDrawAction(drawId: string, patch: z.input<typeof drawPatch>): Promise<ActionResult> {
  return withResult("saveDraw", async () => {
    await requireUser();
    const p = drawPatch.parse(patch);
    await draws.updateDraw(
      id.parse(drawId),
      {
        ...(p.stage !== undefined ? { stage: p.stage } : {}),
        ...(p.sentOn !== undefined ? { sentOn: p.sentOn } : {}),
        ...(p.approvedOn !== undefined ? { approvedOn: p.approvedOn } : {}),
        ...(p.fundedOn !== undefined ? { fundedOn: p.fundedOn } : {}),
        ...(p.sentAmount !== undefined ? { sentAmount: amount("sentAmount", p.sentAmount) } : {}),
        ...(p.approvedAmount !== undefined ? { approvedAmount: amount("approvedAmount", p.approvedAmount) } : {}),
        ...(p.fundedAmount !== undefined ? { fundedAmount: amount("fundedAmount", p.fundedAmount) } : {}),
      },
      todayYmdEastern(),
    );
  });
}

/** A sent or funded draw's amount on one line, to match what the lender approved. */
export async function setDrawLineAmountAction(drawId: string, lineId: string, value: string | null): Promise<ActionResult> {
  return withResult("setDrawLineAmount", async () => {
    await requireUser();
    await draws.setDrawLineAmount(id.parse(drawId), id.parse(lineId), amount("amount", raw.parse(value)));
  });
}

export async function deleteDrawAction(drawId: string): Promise<ActionResult> {
  return withResult("deleteDraw", async () => {
    await requireUser();
    await draws.deleteDraw(id.parse(drawId));
  });
}

/**
 * The next-step button: one stage on from where the draw is. Approved takes the approved amount and Funded what
 * landed (the field's text); Inspection takes none. Returns what it was, for Undo.
 */
export async function advanceDrawAction(
  drawId: string,
  value: string | null,
): Promise<ActionResult<{ number: number; stage: string; amount: number | null; before: draws.StageSnapshot }>> {
  return withResult("advanceDraw", async () => {
    await requireUser();
    const r = await draws.advanceDraw(id.parse(drawId), amount("amount", raw.parse(value)), todayYmdEastern());
    return { number: r.number, stage: r.stage, amount: r.amount, before: r.before };
  });
}

const stageSnapshot = z
  .object({
    stage: z.enum(["SENT", "INSPECTION", "APPROVED", "FUNDED"]),
    stageChangedAt: z.string().datetime(),
    approvedOn: z.string().datetime().nullable(),
    approvedAmount: dollars.nullable(),
    fundedOn: z.string().datetime().nullable(),
    fundedAmount: dollars.nullable(),
  })
  .strict();

export async function restoreDrawStageAction(drawId: string, before: draws.StageSnapshot): Promise<ActionResult> {
  return withResult("restoreDrawStage", async () => {
    await requireUser();
    await draws.restoreDrawStage(id.parse(drawId), stageSnapshot.parse(before));
  });
}

/** New draw: opens the next draw to fill in, or the one already being built. Cancel is deleteDrawAction. */
export async function startDraftAction(rehabId: string): Promise<ActionResult<{ drawId: string; number: number }>> {
  return withResult("startDraft", async () => {
    await requireUser();
    return draws.startDraft(id.parse(rehabId));
  });
}

