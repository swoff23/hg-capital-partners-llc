import assert from "node:assert/strict";
import { test } from "node:test";
import { nextLine, pastLine, vacantNextLine } from "./tenants-lines";

test("the next line names who and when, with the year only when it isn't this year", () => {
  assert.equal(nextLine(["Ana Ruiz"], "2026-12-01", "2026-11-20"), "Next: Ana Ruiz from Dec 1");
  assert.equal(nextLine(["Ana Ruiz", "Bo Ruiz"], "2027-02-01", "2026-11-20"), "Next: Ana Ruiz, Bo Ruiz from Feb 1, 2027");
  assert.equal(nextLine(["Ana Ruiz"], null, "2026-11-20"), "Next: Ana Ruiz");
});

test("a vacant unit's row reads who and moves in", () => {
  assert.equal(vacantNextLine(["Ana Ruiz"], "2026-12-01", "2026-11-20"), "Ana Ruiz · moves in Dec 1");
  assert.equal(vacantNextLine(["Ana Ruiz"], null, "2026-11-20"), "Ana Ruiz");
});

test("a past line joins names, unit, months and rent", () => {
  assert.equal(
    pastLine({ names: ["Amy Chen", "Bo Chen"], unitLabel: "Front", movesIn: "2023-03-01", movesOut: "2025-02-28", rent: 1750 }),
    "Amy Chen, Bo Chen · Front · Mar 2023 to Feb 2025 · $1,750",
  );
  assert.equal(pastLine({ names: ["Cy Dow"], unitLabel: null, movesIn: null, movesOut: "2025-02-28", rent: null }), "Cy Dow · Moved out Feb 2025");
});
