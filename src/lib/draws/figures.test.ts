import test from "node:test";
import assert from "node:assert/strict";
import {
  currentDraw,
  daysInStage,
  drawFee,
  drawLine,
  isStuck,
  lineFigures,
  nextNumber,
  openDraft,
  portfolioDraws,
  rehabFigures,
  unitGroups,
  type DrawIn,
  type LineIn,
} from "./figures";

const line = (id: string, position: number, original: number, changeOrder = 0, unitLabel: string | null = null, unitId: string | null = null): LineIn => ({
  id,
  position,
  unitId,
  unitLabel,
  name: id,
  original,
  changeOrder,
});

const draw = (over: Partial<DrawIn> & Pick<DrawIn, "number" | "stage" | "lines">): DrawIn => ({
  id: `d${over.number}`,
  stageChangedAt: "2026-11-10T15:00:00Z",
  sentOn: null,
  sentAmount: null,
  approvedOn: null,
  approvedAmount: null,
  fundedOn: null,
  fundedAmount: null,
  waitingOnUs: false,
  waitingNote: null,
  ...over,
});

const LINES = [line("demo", 1, 10000), line("plumbing", 2, 2000, 3000), line("contingency", 3, 3000, -3000), line("appliances", 4, 1500.45)];
const DRAWS = [
  draw({ number: 1, stage: "FUNDED", lines: [{ lineId: "demo", amount: 6000 }], approvedAmount: 6000, fundedAmount: 5800 }),
  draw({ number: 2, stage: "INSPECTION", lines: [{ lineId: "demo", amount: 4000 }, { lineId: "plumbing", amount: 3000 }], sentAmount: 7000 }),
  draw({ number: 3, stage: "DRAFT", lines: [{ lineId: "plumbing", amount: 2500 }, { lineId: "appliances", amount: 700.25 }] }),
];

test("each line: revised, funded, at the lender, draft and what's left", () => {
  const f = lineFigures(LINES, DRAWS);
  assert.deepEqual(
    f.map((l) => [l.id, l.revised, l.funded, l.atLender, l.draft, l.left, l.over]),
    [
      ["demo", 10000, 6000, 4000, 0, 0, 0],
      ["plumbing", 5000, 0, 3000, 2500, -500, 500],
      ["contingency", 0, 0, 0, 0, 0, 0],
      ["appliances", 1500.45, 0, 0, 700.25, 800.2, 0],
    ],
  );
});

test("the rehab: holdback, at the lender by draw, ready from the draft, undrawn", () => {
  const f = rehabFigures(16500.45, lineFigures(LINES, DRAWS), DRAWS);
  assert.deepEqual(f, {
    holdback: 16500.45,
    revised: 16500.45,
    funded: 6000,
    atLender: 7000,
    ready: 3200.25,
    left: 300.2,
    undrawn: 10500.45,
    holdbackGap: 0,
    offHoldback: false,
  });
});

test("an approved amount below what was sent is what the lender holds", () => {
  const draws = [draw({ number: 1, stage: "APPROVED", lines: [{ lineId: "demo", amount: 5000 }], sentAmount: 5000, approvedAmount: 4200 })];
  assert.equal(rehabFigures(null, lineFigures(LINES, draws), draws).atLender, 4200);
});

test("with no holdback entered the lines' original total stands in and nothing is flagged; an entered one is", () => {
  const lines = [line("a", 1, 1000, 250)];
  const f = rehabFigures(null, lineFigures(lines, []), []);
  assert.equal(f.holdback, 1000);
  assert.equal(f.revised, 1250);
  assert.equal(f.holdbackGap, null);
  assert.equal(f.offHoldback, false);
  const g = rehabFigures(1000, lineFigures(lines, []), []);
  assert.equal(g.holdbackGap, 250);
  assert.equal(g.offHoldback, true);
});

test("lines group by unit in the order units appear; a plain budget is one unlabelled group", () => {
  const split = lineFigures([line("u1a", 1, 100, 0, "Unit 1"), line("u2a", 3, 50, 0, "Unit 2"), line("u1b", 2, 25, 0, "Unit 1")], []);
  assert.deepEqual(
    unitGroups(split).map((g) => [g.unitLabel, g.lines.map((l) => l.id), g.revised]),
    [
      ["Unit 1", ["u1a", "u1b"], 125],
      ["Unit 2", ["u2a"], 50],
    ],
  );
  assert.deepEqual(unitGroups(lineFigures(LINES, [])).map((g) => g.unitLabel), [null]);
  // Two properties' units with the same label stay apart by id.
  const two = lineFigures([line("a", 1, 10, 0, "Upper", "u765"), line("b", 2, 20, 0, "Upper", "u767")], []);
  assert.deepEqual(unitGroups(two).map((g) => [g.unitId, g.revised]), [["u765", 10], ["u767", 20]]);
});

test("the draft, the draw longest with the lender, and the next number", () => {
  assert.equal(openDraft(DRAWS)?.number, 3);
  assert.equal(currentDraw(DRAWS)?.number, 2);
  assert.equal(currentDraw([DRAWS[0]]), null);
  assert.equal(nextNumber(DRAWS), 4);
  assert.equal(nextNumber([]), 1);
});

test("days in a stage count Buffalo days, and 10 without a move is stuck unless it's waiting on us", () => {
  const d = draw({ number: 2, stage: "SENT", lines: [], stageChangedAt: "2026-11-06T03:00:00Z" }); // Nov 5 in Buffalo
  assert.equal(daysInStage(d, "2026-11-14"), 9);
  assert.equal(isStuck(d, "2026-11-14"), false);
  assert.equal(isStuck(d, "2026-11-15"), true);
  assert.equal(isStuck({ ...d, waitingOnUs: true }, "2026-11-20"), false);
  assert.equal(isStuck({ ...d, stage: "FUNDED" }, "2026-11-20"), false);
});

test("the current draw's words", () => {
  const d = draw({ number: 4, stage: "INSPECTION", lines: [], stageChangedAt: "2026-11-14T15:00:00Z" });
  assert.equal(drawLine(d, "2026-11-20"), "Draw 4 · Inspection · 6 days");
  assert.equal(drawLine({ ...d, stageChangedAt: "2026-11-19T15:00:00Z" }, "2026-11-20"), "Draw 4 · Inspection · 1 day");
  assert.equal(drawLine({ ...d, waitingOnUs: true }, "2026-11-20"), "Draw 4 · Waiting on us");
  assert.equal(drawLine(null), null);
});

test("the fee is approved less funded, once both are known", () => {
  assert.equal(drawFee({ approvedAmount: 14725.45, fundedAmount: 14525.45 }), 200);
  assert.equal(drawFee({ approvedAmount: 14725.45, fundedAmount: null }), null);
});

test("the Draws strip adds every open rehab to the cent", () => {
  const a = rehabFigures(null, lineFigures(LINES, DRAWS), DRAWS);
  assert.deepEqual(portfolioDraws([a, a]), { ready: 6400.5, atLender: 14000, funded: 12000, left: 600.4 });
});
