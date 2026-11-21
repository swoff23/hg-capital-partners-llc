import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type { Ymd } from "@/lib/dates";
import * as core from "./core";
import type { WorksheetRead } from "./worksheet";

/**
 * Rehab draws (docs/specs/rehab-draws.md): the app's one way to write them.
 * Server actions authenticate and parse, then call in; the rules live in
 * core.ts. Each write refreshes the pages that show a rehab: Draws, the
 * rehab's page, the property pages' Rehab section and Home's Needs you.
 */

function revalidateRehab(rehabId?: string): void {
  revalidatePath("/draws", "layout");
  if (rehabId) revalidatePath(`/draws/${rehabId}`);
  revalidatePath("/properties/[id]", "page");
  revalidatePath("/");
}

export type { By, DrawPatch, LineInput, LineSnapshot, NewRehab, RehabPatch, StageSnapshot, UnitPick } from "./core";

export async function createRehab(input: core.NewRehab, by: core.By): Promise<{ id: string }> {
  const r = await core.createRehab(prisma, input, by);
  revalidateRehab(r.id);
  return r;
}

export async function patchRehab(rehabId: string, patch: core.RehabPatch): Promise<void> {
  await core.patchRehab(prisma, rehabId, patch);
  revalidateRehab(rehabId);
}

export async function setDone(rehabId: string, done: boolean): Promise<void> {
  await core.setDone(prisma, rehabId, done);
  revalidateRehab(rehabId);
}

export async function deleteRehab(rehabId: string): Promise<void> {
  await core.deleteRehab(prisma, rehabId);
  revalidateRehab();
}

export async function importWorksheet(rehabId: string, read: WorksheetRead, units: Record<string, core.UnitPick | null> = {}): Promise<{ lines: number; draws: number }> {
  const r = await core.importWorksheet(prisma, rehabId, read, units);
  revalidateRehab(rehabId);
  return r;
}

export async function addLine(rehabId: string, input: core.LineInput & { draft?: number | null }): Promise<{ id: string }> {
  const r = await core.addLine(prisma, rehabId, input);
  revalidateRehab(rehabId);
  return r;
}

export async function patchLine(lineId: string, patch: Partial<core.LineInput>): Promise<void> {
  const { rehabId } = await core.patchLine(prisma, lineId, patch);
  revalidateRehab(rehabId);
}

export async function deleteLine(lineId: string): Promise<core.LineSnapshot> {
  const s = await core.deleteLine(prisma, lineId);
  revalidateRehab(s.rehabId);
  return s;
}

export async function restoreLine(s: core.LineSnapshot): Promise<void> {
  await core.restoreLine(prisma, s);
  revalidateRehab(s.rehabId);
}

export async function setDraftAmount(lineId: string, amount: number | null): Promise<void> {
  const { rehabId } = await core.setDraftAmount(prisma, lineId, amount);
  revalidateRehab(rehabId);
}

export async function sendDraft(rehabId: string, sentOn: Ymd): Promise<{ drawId: string; number: number; sentAmount: number }> {
  const r = await core.sendDraft(prisma, rehabId, sentOn);
  revalidateRehab(rehabId);
  return r;
}

export async function unsendDraw(drawId: string): Promise<void> {
  const { rehabId } = await core.unsendDraw(prisma, drawId);
  revalidateRehab(rehabId);
}

export async function updateDraw(drawId: string, patch: core.DrawPatch, today: Ymd): Promise<void> {
  const { rehabId } = await core.updateDraw(prisma, drawId, patch, today);
  revalidateRehab(rehabId);
}

export async function setDrawLineAmount(drawId: string, lineId: string, amount: number | null): Promise<void> {
  const { rehabId } = await core.setDrawLineAmount(prisma, drawId, lineId, amount);
  revalidateRehab(rehabId);
}

export async function deleteDraw(drawId: string): Promise<void> {
  const { rehabId } = await core.deleteDraw(prisma, drawId);
  revalidateRehab(rehabId);
}

export async function advanceDraw(drawId: string, amount: number | null, today: Ymd): ReturnType<typeof core.advanceDraw> {
  const r = await core.advanceDraw(prisma, drawId, amount, today);
  revalidateRehab(r.rehabId);
  return r;
}

export async function restoreDrawStage(drawId: string, before: core.StageSnapshot): Promise<void> {
  const { rehabId } = await core.restoreDrawStage(prisma, drawId, before);
  revalidateRehab(rehabId);
}

export async function startDraft(rehabId: string): Promise<{ drawId: string; number: number }> {
  const r = await core.startDraft(prisma, rehabId);
  revalidateRehab(rehabId);
  return r;
}

