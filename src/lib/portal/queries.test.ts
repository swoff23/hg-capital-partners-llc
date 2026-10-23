import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// queries.ts talks to the database, so this reads its source instead of importing it.
const source = readFileSync(join(__dirname, "queries.ts"), "utf8");

/** The text of a top-level `const name = ...` up to the next top-level declaration. */
function declaration(name: string): string {
  const start = source.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `queries.ts declares ${name}`);
  const next = source.slice(start + 1).search(/\n(?:export |const |function |async function |\/\*\*)/);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

test("the portal's timeline and file filters both keep staff replies with the contractor they were written to", () => {
  // G2B-IV01: drop audienceContactId from either and a reassigned job shows the
  // next contractor what staff said to the last one, with npm test still green otherwise.
  for (const name of ["portalEvents", "visibleFile"]) {
    assert.match(declaration(name), /audienceContactId/, `${name} filters on audienceContactId`);
  }
});
