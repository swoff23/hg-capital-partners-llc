import test from "node:test";
import assert from "node:assert/strict";
import { DEAL_SORT_CHOICES, DEFAULT_DEAL_SORT, dealSortPhrase, easternDay, noteDay } from "./format";

// Whatever TZ the test process runs in, the days below are Buffalo's.
const today = "2026-10-25";

test("easternDay: an instant is read on Buffalo's calendar", () => {
  // 10:30pm on Oct 25 in Buffalo is already Oct 26 in UTC.
  assert.equal(easternDay(new Date("2026-10-26T02:30:00Z"), today), "Oct 25");
  assert.equal(easternDay(new Date("2026-10-25T14:00:00Z"), today), "Oct 25");
});

test("easternDay: the year shows only when it isn't this year", () => {
  assert.equal(easternDay(new Date("2025-03-01T15:00:00Z"), today), "Mar 1, 2025");
  assert.equal(easternDay(new Date("2026-03-01T15:00:00Z"), today), "Mar 1");
});

test("noteDay: an imported line keeps its calendar date", () => {
  // Stored at UTC midnight, which is the evening before in Buffalo.
  const noteDate = new Date("2026-10-20T00:00:00Z");
  assert.equal(noteDay({ noteDate, source: "migration" }, today), "Oct 20");
  assert.equal(noteDay({ noteDate, source: "manual" }, today), "Oct 19");
  assert.equal(noteDay({ noteDate, source: "change" }, today), "Oct 19");
});

test("dealSortPhrase: every sortable column reads as a sentence in both directions", () => {
  assert.equal(dealSortPhrase("status"), "Stage");
  assert.equal(dealSortPhrase("-updated"), "Newest update first");
  assert.equal(dealSortPhrase("updated"), "Oldest update first");
  assert.equal(dealSortPhrase("-theirPrice"), "Asking price, high to low");
  assert.equal(dealSortPhrase("theirPrice"), "Asking price, low to high");
  assert.equal(dealSortPhrase("-ourPrice"), "Target offer, high to low");
  assert.equal(dealSortPhrase("-units"), "Most units");
  assert.equal(dealSortPhrase("units"), "Fewest units");
  assert.equal(dealSortPhrase("address"), "Address A to Z");
  assert.equal(dealSortPhrase("-address"), "Address Z to A");
  assert.equal(dealSortPhrase("nextAction"), "Next action A to Z");
  assert.equal(dealSortPhrase("-status"), "Stage, last first");
});

test("dealSortPhrase: the prices use the deal words, never 'Their price' or 'Our price'", () => {
  for (const sort of ["theirPrice", "-theirPrice", "ourPrice", "-ourPrice"]) {
    assert.doesNotMatch(dealSortPhrase(sort)!, /their|our price|max offer/i);
  }
});

test("dealSortPhrase: a column the list doesn't sort by has no phrase", () => {
  assert.equal(dealSortPhrase(""), null);
  assert.equal(dealSortPhrase("-latestNote"), null);
  assert.equal(dealSortPhrase("notAColumn"), null);
});

test("the phone's sorts: the default first, then the five phrases the spec lists", () => {
  assert.equal(DEAL_SORT_CHOICES[0].value, DEFAULT_DEAL_SORT);
  assert.deepEqual(
    DEAL_SORT_CHOICES.map((c) => c.label),
    ["Stage", "Newest update first", "Asking price, high to low", "Asking price, low to high", "Most units"],
  );
  assert.equal(new Set(DEAL_SORT_CHOICES.map((c) => c.value)).size, DEAL_SORT_CHOICES.length);
});
