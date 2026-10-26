import test from "node:test";
import assert from "node:assert/strict";
import { matchesSearch } from "./text-match";

test("matchesSearch: no words matches everything", () => {
  assert.equal(matchesSearch("", "Utilities"), true);
  assert.equal(matchesSearch("  ", "Utilities"), true);
  assert.equal(matchesSearch(" - ", "Utilities"), true, "punctuation alone isn't a word");
});

test("matchesSearch: every word must be somewhere, in any order, across fields", () => {
  assert.equal(matchesSearch("util", "Utilities:Gas and Electric", "Expense"), true);
  assert.equal(matchesSearch("gas util", "Utilities:Gas and Electric"), true);
  assert.equal(matchesSearch("gas water", "Utilities:Gas and Electric"), false);
  assert.equal(matchesSearch("expense gas", "Utilities:Gas and Electric", "Expense"), true);
});

test("matchesSearch: reads street words the way the server's search does", () => {
  assert.equal(matchesSearch("Prospect Avenue", "767 Prospect Ave."), true);
  assert.equal(matchesSearch("oxford road", "15 Oxford Rd"), true);
});

test("matchesSearch: case doesn't matter, and an empty field is skipped", () => {
  assert.equal(matchesSearch("TAXES", "Taxes & licenses", null, undefined), true);
  assert.equal(matchesSearch("zzz", null, undefined), false);
});
