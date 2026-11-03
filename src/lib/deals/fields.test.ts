import test from "node:test";
import assert from "node:assert/strict";
import { toFailure } from "@/lib/action-result";
import { readFileSync } from "node:fs";
import { DEAL_MESSAGES, MAX_DEAL_AMOUNT, NOTE_MAX, dealFieldsSchema, dealPriceProblem, dealUnitsProblem, newDealSchema, parseDealPatch } from "./fields";

/** The line each field shows for a refused New deal form or deal edit, as `withResult` hands it back. */
function lines(schema: { parse: (v: unknown) => unknown }, input: unknown) {
  try {
    schema.parse(input);
  } catch (err) {
    const f = toFailure(err);
    return { error: f.error, fields: f.fieldErrors ?? {} };
  }
  return null;
}

const both = [
  ["New deal", newDealSchema],
  ["the deal page", dealFieldsSchema],
] as const;

test("a negative price is refused on New deal and the deal page alike (it saved as -$5)", () => {
  for (const [name, schema] of both) {
    const r = lines(schema, { address: "767 Prospect Ave", ourPriceRaw: "-5" });
    assert.deepEqual(r?.fields, { ourPriceRaw: DEAL_MESSAGES.amount }, name);
  }
  // Text that isn't one number stays text, dash and all.
  assert.equal(dealPriceProblem("400-450k"), null);
  assert.equal(dealPriceProblem("low 400s"), null);
});

test("a price over the column's size is a field line, not Postgres's overflow", () => {
  for (const [name, schema] of both) {
    const r = lines(schema, { address: "767 Prospect Ave", theirPriceRaw: "20000M" });
    assert.deepEqual(r?.fields, { theirPriceRaw: "Enter an amount under $10 billion." }, name);
    assert.equal(r?.error, "Enter an amount under $10 billion.", name);
  }
  assert.equal(dealPriceProblem("9,999,999,999.99"), null);
  assert.equal(dealPriceProblem(String(MAX_DEAL_AMOUNT)), DEAL_MESSAGES.amountTooBig);
  // Rounds to the cents the column keeps before it's checked.
  assert.equal(dealPriceProblem("9999999999.999"), DEAL_MESSAGES.amountTooBig);
});

test("New deal caps units at 10,000 like the deal page (3,000,000,000 overflowed INT4)", () => {
  assert.deepEqual(lines(newDealSchema, { address: "767 Prospect Ave", units: "3000000000" })?.fields, { units: "Enter a smaller number." });
  assert.deepEqual(lines(newDealSchema, { address: "767 Prospect Ave", units: "1,200" }), null);
  assert.equal((newDealSchema.parse({ address: "767 Prospect Ave", units: "1,200" }) as { units: number }).units, 1200);
  assert.deepEqual(lines(dealFieldsSchema, { units: 3_000_000_000 })?.fields, { units: "Enter a smaller number." });
  // The deal page says the same before anything is sent.
  assert.equal(dealUnitsProblem("3,000,000,000"), "Enter a smaller number.");
  assert.equal(dealUnitsProblem("0"), "Enter 1 or more.");
  assert.equal(dealUnitsProblem("10,000"), null);
  assert.equal(dealUnitsProblem(""), null);
});

test("over-long text says how long it may be, in plain words", () => {
  const long = (n: number) => "x".repeat(n);
  assert.deepEqual(lines(dealFieldsSchema, { nextAction: long(301) })?.fields, { nextAction: "Use 300 characters or fewer." });
  assert.equal(lines(dealFieldsSchema, { nextAction: long(301) })?.error, "Use 300 characters or fewer.");
  assert.deepEqual(lines(dealFieldsSchema, { theirPriceRaw: long(110) })?.fields, { theirPriceRaw: "Use 100 characters or fewer." });
  assert.deepEqual(lines(dealFieldsSchema, { sourceUrl: `https://x.com/${long(2000)}` })?.fields, { sourceUrl: "Use 2,000 characters or fewer." });
  // New deal used to take these, and then the deal page couldn't save the deal again.
  assert.deepEqual(lines(newDealSchema, { address: `1 ${long(300)} St` })?.fields, { address: "Use 300 characters or fewer." });
  assert.deepEqual(lines(newDealSchema, { address: "767 Prospect Ave", theirPriceRaw: long(110) })?.fields, {
    theirPriceRaw: "Use 100 characters or fewer.",
  });
});

test("an address that tidies to nothing is refused, not saved blank", () => {
  for (const [name, schema] of both) {
    assert.deepEqual(lines(schema, { address: "....." })?.fields, { address: DEAL_MESSAGES.addressShort }, name);
    assert.deepEqual(lines(schema, { address: " , , ." })?.fields, { address: DEAL_MESSAGES.addressShort }, name);
    assert.deepEqual(lines(schema, { address: "https://www.google.com/maps/search/2" })?.fields, { address: DEAL_MESSAGES.addressLink }, name);
  }
  // The edit keeps the text as sent, so Undo puts back exactly what was there.
  assert.equal(parseDealPatch({ address: " 767 PROSPECT AVE " }).address, "767 PROSPECT AVE");
});

test("one rule for the listing link: https://, http:// or www., saved with its scheme", () => {
  for (const [name, schema] of both) {
    const ok = schema.parse({ address: "767 Prospect Ave", sourceUrl: "www.zillow.com/qa-test-oct27" }) as { sourceUrl: string };
    assert.equal(ok.sourceUrl, "https://www.zillow.com/qa-test-oct27", name);
    for (const bad of ["zillow.com/homes/1", "javascript:alert(1)", "data:text/html,hi", "https://"]) {
      assert.deepEqual(lines(schema, { address: "767 Prospect Ave", sourceUrl: bad })?.fields, { sourceUrl: DEAL_MESSAGES.link }, `${name}: ${bad}`);
    }
  }
  assert.equal(parseDealPatch({ sourceUrl: "" }).sourceUrl, "", "empty clears it");
  assert.equal(parseDealPatch({ sourceUrl: null }).sourceUrl, null);
});

test("the list's stage pick is parsed like the deal page: a direct call can't store what the page refuses", () => {
  assert.deepEqual(parseDealPatch({ status: "6 - Holding" }), { status: "6 - Holding" });
  assert.throws(() => parseDealPatch({ address: "a" }));
  assert.throws(() => parseDealPatch({ units: "5" }));
  assert.throws(() => parseDealPatch({ nextAction: "x".repeat(5000) }));
  assert.throws(() => parseDealPatch({ sourceUrl: "javascript:alert(1)" }));
  // Only the whitelisted fields.
  assert.throws(() => parseDealPatch({ convertedPropertyId: "p1" }));
});

test("a note over the limit says the service's own line on New deal and in the note box alike", () => {
  assert.equal(DEAL_MESSAGES.note, "Keep the note under 5,000 characters.");
  assert.deepEqual(lines(newDealSchema, { address: "767 Prospect Ave", note: "x".repeat(NOTE_MAX + 1) })?.fields, { note: DEAL_MESSAGES.note });
  // The note actions' own cap (20,000) words its refusal the same way, never as zod's "Too big".
  const actions = readFileSync(new URL("../../app/(app)/deals/[id]/note-actions.ts", import.meta.url), "utf8");
  assert.match(actions, /z\.string\(\)\.max\(20_000, DEAL_MESSAGES\.note\)/);
  const notes = readFileSync(new URL("./notes.ts", import.meta.url), "utf8");
  assert.match(notes, /new NoteError\(DEAL_MESSAGES\.note\)/);
});
