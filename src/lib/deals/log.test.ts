import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  changePhrase,
  changeText,
  changesPhrase,
  diffDealChanges,
  isNoopLine,
  normalizeValue,
  parseLegacyChange,
  readChange,
  sameValue,
  type DealSnapshot,
} from "./log-core";

const deal: DealSnapshot = {
  address: "56 Tamarack St",
  status: "2 - Medium",
  priority: null,
  passReason: null,
  units: 4,
  theirPriceRaw: "$425,000",
  ourPriceRaw: null,
  nextAction: "Call the agent",
  sourceUrl: null,
};

test("an edit records each field that moved as { field, from, to }", () => {
  const changes = diffDealChanges(deal, { status: "1 - High", ourPriceRaw: "$400,000", nextAction: "Walk it Friday" });
  assert.deepEqual(changes, [
    { field: "status", from: "2 - Medium", to: "1 - High" },
    { field: "ourPrice", from: null, to: "$400,000" },
    { field: "nextAction", from: "Call the agent", to: "Walk it Friday" },
  ]);
});

test("the prices are keyed by the field's name, not the column the raw text lives in", () => {
  const [c] = diffDealChanges(deal, { theirPriceRaw: "$410,000", theirPrice: "410000" });
  assert.equal(c.field, "theirPrice");
  assert.deepEqual(c, { field: "theirPrice", from: "$425,000", to: "$410,000" });
});

test("a key that is absent is no change, and neither is one that kept its value", () => {
  assert.deepEqual(diffDealChanges(deal, {}), []);
  assert.deepEqual(diffDealChanges(deal, { nextAction: "Call the agent", units: 4, status: "2 - Medium" }), []);
});

test("no-op edits are skipped: trimmed, normalized values compare equal", () => {
  assert.deepEqual(diffDealChanges(deal, { nextAction: "  Call   the agent " }), [], "spacing is not an edit");
  assert.deepEqual(diffDealChanges(deal, { priority: "", passReason: "   ", sourceUrl: null }), [], "empty over empty");
  assert.deepEqual(diffDealChanges(deal, { theirPriceRaw: "425000" }), [], "the same amount retyped");
  assert.deepEqual(diffDealChanges(deal, { theirPriceRaw: "425k" }), [], "the same amount in shorthand");
});

test("a price that reads differently is a change, and text that isn't an amount compares as text", () => {
  assert.equal(diffDealChanges(deal, { theirPriceRaw: "$425,001" }).length, 1);
  assert.equal(sameValue("ourPrice", "call agent", "call agent "), true);
  assert.equal(sameValue("ourPrice", "call agent", "$400,000"), false);
  assert.equal(sameValue("nextAction", "Call", "call"), false, "case is a change in text");
});

test("a cleared value is a change to nothing", () => {
  assert.deepEqual(diffDealChanges(deal, { nextAction: null }), [{ field: "nextAction", from: "Call the agent", to: null }]);
  assert.deepEqual(diffDealChanges({ ...deal, sourceUrl: "https://x.test/a" }, { sourceUrl: null }), [
    { field: "sourceUrl", from: "https://x.test/a", to: null },
  ]);
});

test("normalizeValue trims, collapses and turns nothing into null", () => {
  assert.equal(normalizeValue("  a   b "), "a b");
  assert.equal(normalizeValue(""), null);
  assert.equal(normalizeValue(undefined), null);
  assert.equal(normalizeValue(8), "8");
  assert.equal(normalizeValue({}), null);
});

test("the stored line reads in the deal's words: Stage, never Status, and no prefix on the stage", () => {
  assert.equal(changeText({ field: "status", from: "2 - Medium", to: "CLOSED!" }), "Stage: Medium → Closed");
  assert.equal(changeText({ field: "ourPrice", from: null, to: "$400,000" }), "Target offer: — → $400,000");
  assert.equal(changeText({ field: "sourceUrl", from: null, to: "https://x.test" }), "Listing link added");
  assert.equal(changeText({ field: "sourceUrl", from: "https://x.test", to: null }), "Listing link removed");
});

test("a single change is a sentence; a cleared value is 'removed'", () => {
  assert.equal(changePhrase({ field: "status", from: "2 - Medium", to: "1 - High" }), "changed the stage to High");
  assert.equal(changePhrase({ field: "theirPrice", from: "$425,000", to: "$410,000" }), "changed the asking price to $410,000");
  assert.equal(changePhrase({ field: "sourceUrl", from: "https://x.test", to: null }), "removed the listing link");
  assert.equal(changePhrase({ field: "sourceUrl", from: null, to: "https://x.test" }), "added the listing link");
  assert.equal(changePhrase({ field: "nextAction", from: "Call", to: null }), "removed the next action");
});

test("several changes fold to the first field and a count", () => {
  const a = { field: "theirPrice", from: "1", to: "2" } as const;
  const b = { field: "units", from: "1", to: "2" } as const;
  const c = { field: "nextAction", from: null, to: "x" } as const;
  assert.equal(changesPhrase([a, b]), "changed the asking price and 1 other field");
  assert.equal(changesPhrase([a, b, c]), "changed the asking price and 2 other fields");
});

test("a long value is cut in the sentence and whole in the opened row", () => {
  const long = "Call the listing agent about the roof, the boiler and the unit three tenant before Friday at noon";
  assert.match(changePhrase({ field: "nextAction", from: null, to: long }), /…$/);
});

test("data written to a row reads back; anything else reads as no change", () => {
  assert.deepEqual(readChange({ field: "ourPrice", from: null, to: "$400,000" }), { field: "ourPrice", from: null, to: "$400,000" });
  assert.equal(readChange({}), null);
  assert.equal(readChange(null), null);
  assert.equal(readChange({ field: "bogus", from: "a", to: "b" }), null);
  assert.equal(readChange({ clientId: "abc" }), null, "a note's data is not a change");
});

test("an old change line is read back by its label, and the dash is empty", () => {
  assert.deepEqual(parseLegacyChange("Status: 1 - High → Pass"), { field: "status", from: "1 - High", to: "Pass" });
  assert.deepEqual(parseLegacyChange("Next action: — → Call Friday"), { field: "nextAction", from: null, to: "Call Friday" });
  assert.deepEqual(parseLegacyChange("Asking price: $425,000 → $410,000"), { field: "theirPrice", from: "$425,000", to: "$410,000" });
  assert.equal(parseLegacyChange("Deal created (status High)"), null);
  assert.equal(parseLegacyChange("Task added: Replace porch light"), null);
  assert.equal(parseLegacyChange("Call: Friday works → good"), null, "an unknown label is not a field");
});

test("existing no-op lines are recognized so they can be hidden at read", () => {
  assert.equal(isNoopLine("Next action: — → —"), true);
  assert.equal(isNoopLine("Units: 8 → 8"), true);
  assert.equal(isNoopLine("Asking price: $425,000 → 425000"), true);
  assert.equal(isNoopLine("Units: 8 → 9"), false);
  assert.equal(isNoopLine("Deal created (status High)"), false);
});

// log.ts talks to the database, so this reads its source for what a row must carry.
const source = readFileSync(join(__dirname, "log.ts"), "utf8");

test("change rows are written with their author and their data", () => {
  assert.match(source, /authorUserId: user\.id \?\? null/, "the row names who made it");
  assert.match(source, /data: changeData\(r\.data\)/, "an edit's row holds { field, from, to }");
  assert.match(source, /user\.id \? r\.body : `\$\{r\.body\}  ·  \$\{who\}`/, "only a row with no author is signed in its text");
});

test("recordDealChanges writes only what diffDealChanges found", () => {
  assert.match(source, /diffDealChanges\(before, data\)/);
});
