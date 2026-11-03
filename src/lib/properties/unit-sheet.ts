import { readNumber } from "@/lib/money";
import { isPlaceholderUnitId, type UnitEquipment } from "@/lib/property-types";

/**
 * The pure parts of a unit's sheet (edit-units.tsx, forms 4.2): what it asks
 * on the way out, and what Save checks in the equipment rows. Pure; see
 * unit-sheet.test.ts.
 */

/**
 * The sheet's two questions. The discard question names the unit as it now
 * reads ("Discard changes to Unit 2A?"), since it only shows when asked. The
 * leave question is held on the page's LeaveGuard while the sheet is dirty,
 * so it names the unit as the sheet opened: built from the typed name, it
 * re-set that hold on every keystroke of the Name field, and fast typing of a
 * long name ran React past its update limit (error #185) and dropped letters.
 */
export function unitSheetWords(isNew: boolean, openedTitle: string, label: string): { discardTitle: string; leaveTitle: string } {
  return {
    discardTitle: isNew ? "Discard the new unit?" : `Discard changes to ${label}?`,
    leaveTitle: isNew ? "Leave the new unit?" : `Leave ${openedTitle}?`,
  };
}

/**
 * Where a sheet's unit is in the page's list now, or -1 when it's gone: by
 * its id, so a unit added or deleted elsewhere never moves the sheet onto
 * another one. A unit saved before ids existed opened under a placeholder
 * ("unit-at-1"), which any units save meanwhile swaps for a lasting id; it
 * is found at its place, as the service reads a placeholder, and only while
 * the unit there still has its name, so a unit added or deleted ahead of it
 * can't put a Save or a Delete onto its neighbour.
 */
export function sheetUnitAt(
  units: readonly { id?: string | null; label?: string | null }[],
  sheet: { unitId: string | null; at: number | null; label: string | null | undefined },
): number {
  if (sheet.unitId === null || sheet.at === null) return -1;
  const byId = units.findIndex((u) => u.id === sheet.unitId);
  if (byId >= 0 || !isPlaceholderUnitId(sheet.unitId)) return byId;
  const there = units[sheet.at];
  return there && (there.label ?? "").trim() === (sheet.label ?? "").trim() ? sheet.at : -1;
}

/** One equipment row's problems, keyed by field. */
export type EquipmentProblem = { type?: string; year?: string };
export type EquipmentProblems = Record<number, EquipmentProblem>;

/**
 * The line under an equipment row's Year. Shorter than the kit's "Enter a
 * year, like 2014.", which the table's 88px Year column cut to "Enter a
 * year, l...".
 */
export const EQUIPMENT_YEAR_MESSAGE = "Enter a year.";

/** The sheet's line above Save when a row needs fixing. The rows are above it in every layout. */
export const EQUIPMENT_FOOTER = "Check the equipment above.";

/**
 * What Save checks in the equipment rows: a used row needs a type, and a year
 * that was typed over must read as one (1900 to next year). A year already
 * stored is left as it is ("~2004"). `stored` is each row's year as the
 * sheet loaded it.
 */
export function equipmentProblems(equipment: readonly UnitEquipment[], stored: ReadonlyMap<number, string>): EquipmentProblems {
  const found: EquipmentProblems = {};
  equipment.forEach((e, j) => {
    const used = !!(e.model?.trim() || e.installYear?.trim() || e.comment?.trim());
    const row: EquipmentProblem = {};
    if (used && !e.type.trim()) row.type = "Choose a type.";
    const year = e.installYear?.trim() ?? "";
    if (year && year !== stored.get(j) && !readNumber("year", year).ok) row.year = EQUIPMENT_YEAR_MESSAGE;
    if (row.type || row.year) found[j] = row;
  });
  return found;
}

/**
 * The lines Save showed that still hold, once the rows have been edited: a
 * fixed year clears as it's typed, where it used to stay until the next
 * Save. Nothing new turns red before the next Save.
 */
export function stillFailing(shown: EquipmentProblems, now: EquipmentProblems): EquipmentProblems {
  const out: EquipmentProblems = {};
  for (const [key, row] of Object.entries(shown)) {
    const j = Number(key);
    const cur = now[j];
    if (!cur) continue;
    const kept: EquipmentProblem = {};
    if (row.type && cur.type) kept.type = cur.type;
    if (row.year && cur.year) kept.year = cur.year;
    if (kept.type || kept.year) out[j] = kept;
  }
  return out;
}

/** The first line among the rows, for the line above Save. */
export function firstEquipmentProblem(problems: EquipmentProblems | null): string | undefined {
  if (!problems) return undefined;
  return Object.values(problems)
    .flatMap((p) => [p.type, p.year])
    .find(Boolean);
}
