import ExcelJS from "exceljs";

/**
 * Reads Vontive's Renovation Draw Worksheet (docs/specs/rehab-draws.md, R7
 * and section 3): numbered Scope of Work lines with Original Budget, Change
 * Order and a column per draw, plus the loan overview's Initial Rehab
 * Holdback. Two layouts exist. One sheet holds the whole budget ("Scope of
 * Work", as on 765 and 767 Prospect), or a Combined sheet adds up one sheet
 * per unit ("Unit (1)", "Unit (2)", as on 23 Sherwood), where the unit sheets
 * are the source and Combined is skipped. Headers are found by their words,
 * not their cells, so a moved column still reads. The worksheet has no dates.
 */

export const NOT_A_WORKSHEET =
  "That file doesn't look like Vontive's draw worksheet. Upload the .xlsx Vontive sent, or add the lines by hand.";
export const NO_LINES = "That worksheet has no budget lines to bring in.";

export class WorksheetError extends Error {}

export interface WorksheetLine {
  unitLabel: string | null;
  name: string;
  original: number;
  changeOrder: number;
}

export interface WorksheetDraw {
  number: number;
  /** One amount per line, in the same order as `lines`; 0 where the draw took nothing. */
  amounts: number[];
}

export interface WorksheetRead {
  holdback: number | null;
  lines: WorksheetLine[];
  draws: WorksheetDraw[];
  /** The unit labels, in order, when the budget is split by unit; empty otherwise. */
  units: string[];
}

/** Coerce any ExcelJS cell value to a trimmed string, or null. Formulas read as their result. */
export function cellText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) return (v.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("").trim() || null;
    if ("result" in v) return cellText(v.result);
    if ("text" in v) return cellText(v.text);
  }
  return null;
}

/** A cell's number in cents-exact dollars, or null when it holds none. Formulas read as their result. */
export function cellNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  if (typeof value === "string") {
    const n = Number(value.replace(/[$,\s]/g, ""));
    return value.trim() && Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  if (typeof value === "object" && "result" in (value as object)) return cellNumber((value as { result: unknown }).result);
  return null;
}

function formulaOf(value: unknown): string | null {
  if (value && typeof value === "object") {
    const v = value as { formula?: string; sharedFormula?: string };
    return v.formula ?? v.sharedFormula ?? null;
  }
  return null;
}

const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

interface Columns {
  headerRow: number;
  name: number;
  original: number;
  changeOrder: number | null;
  draws: { col: number; number: number }[];
}

/** The header row and its columns, or null when the sheet has none. */
function findColumns(ws: ExcelJS.Worksheet): Columns | null {
  const last = Math.min(ws.rowCount, 40);
  for (let r = 1; r <= last; r++) {
    const row = ws.getRow(r);
    const heads = new Map<number, string>();
    row.eachCell({ includeEmpty: false }, (cell, col) => heads.set(col, norm(cellText(cell.value))));
    const original = [...heads].find(([, h]) => h === "original budget")?.[0];
    if (!original) continue;
    const lineItems = [...heads].filter(([, h]) => h === "line item").map(([c]) => c);
    const changeOrder = [...heads].find(([, h]) => h === "change order")?.[0] ?? null;
    const draws = [...heads]
      .map(([col, h]) => ({ col, m: /^draw (\d+)$/.exec(h) }))
      .filter((d): d is { col: number; m: RegExpExecArray } => d.m != null)
      .map(({ col, m }) => ({ col, number: Number(m[1]) }));
    // Two "Line Item" headers sit over the number and the name; the name is the one that holds words.
    const name =
      lineItems.find((c) => {
        const v = ws.getRow(r + 1).getCell(c).value;
        return typeof cellText(v) === "string" && cellNumber(v) == null;
      }) ?? lineItems[lineItems.length - 1];
    if (!name) continue;
    return { headerRow: r, name, original, changeOrder, draws };
  }
  return null;
}

interface SheetRead {
  lines: WorksheetLine[];
  /** Per draw number, one amount per line of this sheet. */
  draws: Map<number, number[]>;
}

function readSheet(ws: ExcelJS.Worksheet, unitLabel: string | null): SheetRead | null {
  const cols = findColumns(ws);
  if (!cols) return null;
  const lines: WorksheetLine[] = [];
  const draws = new Map<number, number[]>();
  for (let r = cols.headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const originalCell = row.getCell(cols.original).value;
    // The total row sums the column; everything under it is notes.
    if (/^sum\(/i.test(formulaOf(originalCell) ?? "")) break;
    const name = cellText(row.getCell(cols.name).value);
    if (!name || name.length > 120 || cellNumber(row.getCell(cols.name).value) != null) continue;
    const original = cellNumber(originalCell) ?? 0;
    const changeOrder = cols.changeOrder ? (cellNumber(row.getCell(cols.changeOrder).value) ?? 0) : 0;
    const amounts = cols.draws.map((d) => cellNumber(row.getCell(d.col).value) ?? 0);
    if (original === 0 && changeOrder === 0 && amounts.every((a) => a === 0)) continue;
    const index = lines.length;
    lines.push({ unitLabel, name: name.replace(/^\*+/, "").trim() || name, original, changeOrder });
    cols.draws.forEach((d, i) => {
      const list = draws.get(d.number) ?? [];
      list[index] = amounts[i];
      draws.set(d.number, list);
    });
  }
  return { lines, draws };
}

/** The loan overview's Initial Rehab Holdback, or null when the sheet or row is missing. */
function readHoldback(wb: ExcelJS.Workbook): number | null {
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(ws.rowCount, 60); r++) {
      const row = ws.getRow(r);
      let found = false;
      let value: number | null = null;
      row.eachCell({ includeEmpty: false }, (cell) => {
        const text = norm(cellText(cell.value));
        if (found && value == null) value = cellNumber(cell.value);
        if (text === "initial rehab holdback") found = true;
      });
      if (found) return value;
    }
  }
  return null;
}

const UNIT_SHEET = /^unit\s*\((\d+)\)$/i;

/** Reads a loaded workbook. Throws WorksheetError with words a partner can act on. */
export function readWorkbook(wb: ExcelJS.Workbook): WorksheetRead {
  const unitSheets = wb.worksheets
    .map((ws) => ({ ws, m: UNIT_SHEET.exec(ws.name.trim()) }))
    .filter((s): s is { ws: ExcelJS.Worksheet; m: RegExpExecArray } => s.m != null)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]));

  const parts: SheetRead[] = [];
  const units: string[] = [];
  if (unitSheets.length > 0) {
    for (const { ws, m } of unitSheets) {
      const label = `Unit ${Number(m[1])}`;
      const read = readSheet(ws, label);
      if (read && read.lines.length > 0) {
        parts.push(read);
        units.push(label);
      }
    }
  } else {
    const preferred = wb.worksheets.find((ws) => norm(ws.name) === "scope of work");
    for (const ws of preferred ? [preferred, ...wb.worksheets.filter((w) => w !== preferred)] : wb.worksheets) {
      const read = readSheet(ws, null);
      if (read && read.lines.length > 0) {
        parts.push(read);
        break;
      }
    }
  }
  if (parts.length === 0) {
    const anyHeader = wb.worksheets.some((ws) => findColumns(ws) != null);
    throw new WorksheetError(anyHeader ? NO_LINES : NOT_A_WORKSHEET);
  }

  const lines: WorksheetLine[] = [];
  const byNumber = new Map<number, number[]>();
  for (const part of parts) {
    const offset = lines.length;
    lines.push(...part.lines);
    for (const [number, amounts] of part.draws) {
      const all = byNumber.get(number) ?? [];
      part.lines.forEach((_, i) => (all[offset + i] = amounts[i] ?? 0));
      byNumber.set(number, all);
    }
  }
  const draws = [...byNumber]
    .map(([number, amounts]) => ({ number, amounts: lines.map((_, i) => amounts[i] ?? 0) }))
    .filter((d) => d.amounts.some((a) => a !== 0))
    .sort((a, b) => a.number - b.number);

  return { holdback: readHoldback(wb), lines, draws, units };
}

/** Reads an uploaded .xlsx. Anything that isn't a readable workbook is a WorksheetError. */
export async function readWorksheet(data: ArrayBuffer): Promise<WorksheetRead> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    throw new WorksheetError(NOT_A_WORKSHEET);
  }
  return readWorkbook(wb);
}
