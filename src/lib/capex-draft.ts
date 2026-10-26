import { parseAmount } from "./money";
import type { CapexRules } from "./property-types";

/**
 * The CapEx rules as the Settings editor holds them while they are a draft
 * (forms 3.4 A, 4.7): every figure is what's typed, each row has a client-only
 * `uid` so a rename or a delete never moves another row's edits, and nothing
 * leaves the browser until Save. Pure, so capex-draft.test.ts runs it without
 * a page. The server holds the same rules in its schema
 * (app/(app)/settings/actions.ts) and says the same words.
 */

/** Roof, Furnace, Boiler, HVAC and Water Heater are kept per unit, but read as building systems, so they sit under "Building systems". */
export const BUILDING_LIKE_EQUIPMENT = new Set(["Roof", "Furnace", "Boiler", "HVAC", "Water Heater"]);

export type EquipmentDraft = { uid: string; type: string; monitor: string; replace: string; cost: string };
/** `key` is null for a system just added: the server gives it a slug on Save. */
export type BuildingDraft = { uid: string; key: string | null; label: string; monitor: string; replace: string; cost: string };
export type CapexDraft = { equipment: EquipmentDraft[]; building: BuildingDraft[] };

/** A cost as it reads in its field: "6,000". */
const dollars = (n: number) => n.toLocaleString("en-US");

/** The saved rules as a draft's starting point; uids are "e0", "e1", … and "b0", … in order. */
export function toDraft(rules: CapexRules): CapexDraft {
  return {
    equipment: rules.equipment.map((r, i) => ({
      uid: `e${i}`,
      type: r.type,
      monitor: String(r.monitor),
      replace: String(r.replace),
      cost: dollars(r.cost),
    })),
    building: rules.building.map((r, i) => ({
      uid: `b${i}`,
      key: r.key,
      label: r.label,
      monitor: String(r.monitor),
      replace: String(r.replace),
      cost: dollars(r.defaultCost),
    })),
  };
}

/** What a figure's text is worth: a number, or the text itself when it isn't one, so the server can say so. */
const figure = (text: string): number | string => parseAmount(text) ?? text;

/** The draft as the server action takes it: numbers where the text reads as one. */
export function toPayload(draft: CapexDraft) {
  return {
    equipment: draft.equipment.map((r) => ({ type: r.type.trim(), monitor: figure(r.monitor), replace: figure(r.replace), cost: figure(r.cost) })),
    building: draft.building.map((r) => ({
      key: r.key,
      label: r.label.trim(),
      monitor: figure(r.monitor),
      replace: figure(r.replace),
      defaultCost: figure(r.cost),
    })),
  };
}

const num = (text: string) => parseAmount(text);

function sameFigures(a: { monitor: string; replace: string; cost: string }, b: { monitor: string; replace: string; cost: string }): boolean {
  return num(a.monitor) === num(b.monitor) && num(a.replace) === num(b.replace) && num(a.cost) === num(b.cost);
}

/**
 * How many changes are waiting for Save, for the bar's "3 unsaved changes":
 * each rule added, each rule deleted and each rule edited (however many of
 * its cells), by row. A figure typed and changed back counts for nothing.
 */
export function capexChangeCount(saved: CapexDraft, draft: CapexDraft): number {
  let n = 0;
  const count = <R extends { uid: string }>(was: readonly R[], now: readonly R[], same: (a: R, b: R) => boolean) => {
    const before = new Map(was.map((r) => [r.uid, r]));
    const after = new Set(now.map((r) => r.uid));
    for (const r of now) {
      const old = before.get(r.uid);
      if (!old || !same(old, r)) n++;
    }
    for (const r of was) if (!after.has(r.uid)) n++;
  };
  count(saved.equipment, draft.equipment, (a, b) => a.type.trim() === b.type.trim() && sameFigures(a, b));
  count(saved.building, draft.building, (a, b) => a.label.trim() === b.label.trim() && sameFigures(a, b));
  return n;
}

/** "3 unsaved changes", "1 unsaved change". */
export function changesLine(n: number): string {
  return `${n} unsaved ${n === 1 ? "change" : "changes"}`;
}

/** The short form on a phone, where the status shares the bar with two buttons: "3 changes". */
export function changesShort(n: number): string {
  return `${n} ${n === 1 ? "change" : "changes"}`;
}

const AGE_LINE = "Enter a whole number of years.";
const AGE_RANGE = "Enter 0 to 200 years.";
const COST_LINE = "Enter an amount, like 6,000.";
const COST_RANGE = "Enter an amount up to 10,000,000.";

/** What's wrong with one figure's text, in the words the server uses, or null. */
function ageProblem(text: string): string | null {
  const n = num(text);
  if (n === null || !Number.isInteger(n)) return AGE_LINE;
  return n < 0 || n > 200 ? AGE_RANGE : null;
}

function costProblem(text: string): string | null {
  const n = num(text);
  if (n === null) return COST_LINE;
  return n < 0 || n > 10_000_000 ? COST_RANGE : null;
}

/**
 * Each cell's line, keyed as the server keys them ("equipment.0.replace",
 * "building.2.label"), by the row's place in the draft. Nothing here is shown
 * before the first Save (forms 2.0, Timing); then each line stays until its
 * cell is right. "Replace comes after Monitor." sits on the Replace cell and
 * is said only once both figures are numbers.
 */
export function capexProblems(draft: CapexDraft): Record<string, string> {
  const out: Record<string, string> = {};
  const figures = (prefix: string, r: { monitor: string; replace: string; cost: string }) => {
    const monitor = ageProblem(r.monitor);
    const replace = ageProblem(r.replace);
    const cost = costProblem(r.cost);
    if (monitor) out[`${prefix}.monitor`] = monitor;
    if (replace) out[`${prefix}.replace`] = replace;
    if (cost) out[`${prefix}.${prefix.startsWith("building") ? "defaultCost" : "cost"}`] = cost;
    if (!monitor && !replace && num(r.replace)! < num(r.monitor)!) out[`${prefix}.replace`] = "Replace comes after Monitor.";
  };
  const types = new Set<string>();
  draft.equipment.forEach((r, i) => {
    const type = r.type.trim();
    if (!type) out[`equipment.${i}.type`] = "Choose a type.";
    else if (types.has(type.toLowerCase())) out[`equipment.${i}.type`] = `${type} is already listed.`;
    types.add(type.toLowerCase());
    figures(`equipment.${i}`, r);
  });
  const labels = new Set<string>();
  draft.building.forEach((r, i) => {
    const label = r.label.trim();
    if (!label) out[`building.${i}.label`] = "Name this system.";
    else if (labels.has(label.toLowerCase())) out[`building.${i}.label`] = `${label} is already listed.`;
    labels.add(label.toLowerCase());
    figures(`building.${i}`, r);
  });
  if (draft.equipment.length === 0) out["equipment"] = "Keep at least one equipment rule.";
  if (draft.building.length === 0) out["building"] = "Keep at least one building system.";
  return out;
}
