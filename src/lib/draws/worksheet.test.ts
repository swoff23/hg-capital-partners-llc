import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { NOT_A_WORKSHEET, WorksheetError, readWorkbook, readWorksheet } from "./worksheet";

// Made-up budgets in the two layouts Vontive sends (docs/specs/rehab-draws.md,
// section 3). Never a real worksheet: those carry HG Capital's loan figures.

const HEAD = ["", "Line Item", "Line Item", "Original Budget", "Change Order", "Revised Budget", "Remaining Balance", "% Done", "Draw 1", "Draw 2", "Draw 3"];

function scopeSheet(ws: ExcelJS.Worksheet, rows: (string | number | null)[][], headerAt = 2) {
  ws.getRow(headerAt).values = HEAD;
  rows.forEach((r, i) => (ws.getRow(headerAt + 1 + i).values = ["", ...r]));
  const total = headerAt + rows.length + 1;
  ws.getCell(total, 4).value = { formula: `SUM(D${headerAt + 1}:D${total - 1})`, result: 0 } as ExcelJS.CellFormulaValue;
  ws.getCell(total + 3, 2).value = "The renovation draw worksheet is aligned with the underwritten scope of work for the project.";
  ws.getCell(total + 3, 3).value = "The renovation draw worksheet is aligned with the underwritten scope of work for the project.";
}

function overview(wb: ExcelJS.Workbook, holdback: number) {
  const ws = wb.addWorksheet("Outstanding Balance");
  ws.getRow(2).values = ["", "Loan Overview", "Loan Overview"];
  ws.getRow(6).values = ["", "Initial Rehab Holdback", holdback];
}

test("one Scope of Work sheet: lines, change orders, draws and the holdback", () => {
  const wb = new ExcelJS.Workbook();
  scopeSheet(wb.addWorksheet("Scope of Work"), [
    [1, "Demo", 10000, null, { formula: "D3+E3", result: 10000 } as never, null, null, 6000, 4000],
    [2, "plumbing rough-ins", 2000, 3000, null, null, null, null, 5000],
    [3, "**Contingency", 3000, -3000],
    [4, null, null, null, { formula: "F3", result: 0 } as never],
    [5, "Appliances", 1500.5, null, null, null, null, null, null, 700.25],
  ]);
  overview(wb, 16500.5);

  const r = readWorkbook(wb);
  assert.deepEqual(r.units, []);
  assert.equal(r.holdback, 16500.5);
  assert.deepEqual(
    r.lines.map((l) => [l.unitLabel, l.name, l.original, l.changeOrder]),
    [
      [null, "Demo", 10000, 0],
      [null, "plumbing rough-ins", 2000, 3000],
      [null, "Contingency", 3000, -3000],
      [null, "Appliances", 1500.5, 0],
    ],
  );
  assert.deepEqual(r.draws, [
    { number: 1, amounts: [6000, 0, 0, 0] },
    { number: 2, amounts: [4000, 5000, 0, 0] },
    { number: 3, amounts: [0, 0, 0, 700.25] },
  ]);
});

test("a Combined sheet over unit sheets: the unit sheets are the source, labelled by unit", () => {
  const wb = new ExcelJS.Workbook();
  scopeSheet(wb.addWorksheet("Combined"), [[1, "Demolition", { formula: "SUM('Unit (1)'!D5,'Unit (2)'!D5)", result: 8000 } as never]], 4);
  scopeSheet(wb.addWorksheet("Unit (2)"), [[1, "Demolition", 4000, null, null, null, null, 2000, 2000]], 4);
  scopeSheet(wb.addWorksheet("Unit (1)"), [
    [1, "Demolition", 4000, null, null, null, null, 4000],
    [2, "Flooring", 500, 1000],
  ], 4);
  overview(wb, 8500);

  const r = readWorkbook(wb);
  assert.deepEqual(r.units, ["Unit 1", "Unit 2"]);
  assert.deepEqual(
    r.lines.map((l) => [l.unitLabel, l.name, l.original, l.changeOrder]),
    [
      ["Unit 1", "Demolition", 4000, 0],
      ["Unit 1", "Flooring", 500, 1000],
      ["Unit 2", "Demolition", 4000, 0],
    ],
  );
  assert.deepEqual(r.draws, [
    { number: 1, amounts: [4000, 0, 2000] },
    { number: 2, amounts: [0, 0, 2000] },
  ]);
});

test("cents round to the cent: a float like 500.00000000000006 reads as 500", () => {
  const wb = new ExcelJS.Workbook();
  scopeSheet(wb.addWorksheet("Scope of Work"), [[1, "Bathroom Finishes", 1000, 0.45, null, null, null, { formula: "x", result: 500.00000000000006 } as never]]);
  const r = readWorkbook(wb);
  assert.equal(r.lines[0].changeOrder, 0.45);
  assert.deepEqual(r.draws, [{ number: 1, amounts: [500] }]);
  assert.equal(r.holdback, null);
});

test("a workbook with no budget header is refused in plain words", () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Sheet1").getRow(1).values = ["", "Name", "Amount"];
  assert.throws(() => readWorkbook(wb), (e: unknown) => e instanceof WorksheetError && e.message === NOT_A_WORKSHEET);
});

test("a file that isn't a workbook at all is refused the same way", async () => {
  await assert.rejects(readWorksheet(new TextEncoder().encode("not a spreadsheet").buffer as ArrayBuffer), (e: unknown) => e instanceof WorksheetError && e.message === NOT_A_WORKSHEET);
});
