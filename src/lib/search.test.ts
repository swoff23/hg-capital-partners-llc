import test from "node:test";
import assert from "node:assert/strict";
import {
  everyTermMatches,
  foldAccents,
  looksLikeAddress,
  matchQuality,
  matchRanges,
  rankRows,
  searchTerms,
  type TextMatch,
} from "./search";

test("foldAccents drops accents and keeps everything else", () => {
  assert.equal(foldAccents("José Ñuñez"), "Jose Nunez");
  assert.equal(foldAccents("118 Congress St."), "118 Congress St.");
});

test("searchTerms: one term per word, street words in their short form", () => {
  assert.deepEqual(searchTerms("647 Prospect Avenue"), [["647"], ["prospect"], ["ave"]]);
  assert.deepEqual(searchTerms("118 Congress Street"), [["118"], ["congress"], ["st"]]);
  assert.deepEqual(searchTerms("23 Sherwood Dr."), [["23"], ["sherwood"], ["dr"]]);
  assert.deepEqual(searchTerms("  framing   mariner "), [["framing"], ["mariner"]]);
});

test("searchTerms: Road and Rd find each other, since 'rd' isn't inside 'road'", () => {
  assert.deepEqual(searchTerms("Oxford Road"), [["oxford"], ["road", "rd"]]);
  assert.deepEqual(searchTerms("Oxford Rd."), [["oxford"], ["rd", "road"]]);
  assert.deepEqual(searchTerms("3rd"), [["3rd"]]);
});

test("searchTerms: an accented word also matches without the accent", () => {
  assert.deepEqual(searchTerms("José"), [["josé", "jose"]]);
  assert.deepEqual(searchTerms("Jose"), [["jose"]]);
});

test("searchTerms: punctuation, repeats and long queries", () => {
  assert.deepEqual(searchTerms("Tyler - quote"), [["tyler"], ["quote"]]);
  assert.deepEqual(searchTerms("St. street st"), [["st"]]);
  assert.deepEqual(searchTerms("#2, apt"), [["2"], ["apt"]]);
  assert.deepEqual(searchTerms(" - , . "), []);
  assert.equal(searchTerms("a b c d e f g h").length, 6);
});

test("everyTermMatches: AND across words, OR across spellings and fields", () => {
  const where = everyTermMatches(searchTerms("José roof"), (t) => [{ title: t }, { property: { address: t } }]);
  const m = (s: string): TextMatch => ({ contains: s, mode: "insensitive" });
  assert.deepEqual(where, {
    AND: [
      { OR: [{ title: m("josé") }, { property: { address: m("josé") } }, { title: m("jose") }, { property: { address: m("jose") } }] },
      { OR: [{ title: m("roof") }, { property: { address: m("roof") } }] },
    ],
  });
});

// A stand-in for Postgres ILIKE '%x%' over the where clause, to check what the
// review found broken now comes back.
type Row = Record<string, unknown>;
function matches(row: Row, cond: Record<string, unknown>): boolean {
  if ("AND" in cond) return (cond.AND as Row[]).every((c) => matches(row, c));
  if ("OR" in cond) return (cond.OR as Row[]).some((c) => matches(row, c));
  const [field, filter] = Object.entries(cond)[0] as [string, Row];
  const value = row[field];
  if ("contains" in filter) return typeof value === "string" && value.toLowerCase().includes(String(filter.contains).toLowerCase());
  return value != null && matches(value as Row, filter);
}

test("search finds abbreviated addresses, words in any order and linked records", () => {
  const property = { address: "647 Prospect Ave. Buffalo, NY 14213" };
  const find = (q: string, row: Row, fields: (t: TextMatch) => Row[]) =>
    matches(row, everyTermMatches(searchTerms(q), fields));
  const byAddress = (t: TextMatch) => [{ address: t }];

  assert.ok(find("647 Prospect Avenue", property, byAddress));
  assert.ok(find("118 Congress Street", { address: "118 Congress St." }, byAddress));
  assert.ok(find("Oxford Rd", { address: "15 Oxford Road" }, byAddress));
  assert.ok(!find("648 Prospect Avenue", property, byAddress));

  const task = { title: "Tyler - quote for roof", property: { address: "118 Congress St." }, assigneeContact: null };
  const taskFields = (t: TextMatch) => [{ title: t }, { property: { address: t } }, { assigneeContact: { fullName: t } }];
  assert.ok(find("congress roof", task, taskFields));
  assert.ok(find("roof 118", task, taskFields));
  assert.ok(!find("congress gutter", task, taskFields));

  const framing = { title: "Mariner framing inspection", property: null, assigneeContact: null };
  assert.ok(find("framing mariner", framing, taskFields));

  const contact = { fullName: "Jose Alvarez", company: null, trades: "Roofing" };
  const contactFields = (t: TextMatch) => [{ fullName: t }, { company: t }, { trades: t }];
  assert.ok(find("José", contact, contactFields));
  assert.ok(find("alvarez roofing", contact, contactFields));
});

/* ---------------- rankRows ---------------- */

const at = (day: number) => new Date(Date.UTC(2026, 9, day));

test("matchQuality: exact, starts with, word starts, contains, other field", () => {
  assert.equal(matchQuality("767 Prospect Ave", "767 prospect avenue"), 0);
  assert.equal(matchQuality("767 Prospect Ave", "767 pro"), 1);
  assert.equal(matchQuality("Fix porch light", "light"), 2);
  assert.equal(matchQuality("Fix porch light", "ight"), 3);
  assert.equal(matchQuality("Fix porch light", "elmwood"), 4);
  assert.equal(matchQuality("Fix porch light", "  "), 4);
});

test("matchQuality: every typed word counts, accents fold, street words read both ways", () => {
  assert.equal(matchQuality("Coordinate closing time", "closing coord"), 2);
  assert.equal(matchQuality("Coordinate closing time", "closing zzz"), 4);
  assert.equal(matchQuality("Jose Alvarez", "josé"), 1);
  assert.equal(matchQuality("15 Oxford Rd", "oxford road"), 2);
});

test("rankRows: live before finished, whatever the title says", () => {
  const rows = [
    { id: "done", title: "Replace smoke detectors", live: 1, updatedAt: at(20) },
    { id: "open", title: "Replace smoke detectors", live: 0, updatedAt: at(1) },
    { id: "canceled", title: "Replace smoke detectors", live: 2, updatedAt: at(25) },
  ];
  assert.deepEqual(rankRows(rows, "smoke").map((r) => r.id), ["open", "done", "canceled"]);
});

test("rankRows: then the better match on the title", () => {
  const rows = [
    { id: "contains", title: "Re-roof the porch", live: 0, updatedAt: at(25) },
    { id: "other", title: "Gutters", live: 0, updatedAt: at(24) },
    { id: "word", title: "Porch light", live: 0, updatedAt: at(2) },
    { id: "exact-1", title: "Porch", live: 0, updatedAt: at(1) },
    { id: "exact-2", title: "porch", live: 0, updatedAt: at(1) },
  ];
  // "Porch" and "porch" read the same: the earlier of two equal matches comes first.
  assert.deepEqual(rankRows(rows, "porch").map((r) => r.id), ["exact-1", "exact-2", "word", "contains", "other"]);
});

test("rankRows: then the most recently updated, then the order given", () => {
  const rows = [
    { id: "old", title: "Prospect", live: 0, updatedAt: at(1) },
    { id: "new", title: "Prospect", live: 0, updatedAt: at(9) },
    { id: "same-a", title: "Prospect", live: 0, updatedAt: at(5).getTime() },
    { id: "same-b", title: "Prospect", live: 0, updatedAt: at(5) },
  ];
  assert.deepEqual(rankRows(rows, "prospect").map((r) => r.id), ["new", "same-a", "same-b", "old"]);
});

test("rankRows: a new array, the input untouched", () => {
  const rows = [
    { id: "b", title: "B", live: 1, updatedAt: at(1) },
    { id: "a", title: "A", live: 0, updatedAt: at(1) },
  ];
  const ranked = rankRows(rows, "a");
  assert.notEqual(ranked, rows);
  assert.deepEqual(rows.map((r) => r.id), ["b", "a"]);
});

/* ---------------- matchRanges ---------------- */

const marked = (title: string, q: string) => matchRanges(title, q).map(([a, b]) => title.slice(a, b));

test("matchRanges: the typed words, joined across a space", () => {
  assert.deepEqual(marked("767 Prospect Ave", "767 pro"), ["767 Pro"]);
  assert.deepEqual(marked("Fix porch light", "porch"), ["porch"]);
  assert.deepEqual(marked("Fix porch light", "light fix"), ["Fix", "light"]);
  assert.deepEqual(marked("Fix porch light", "zzz"), []);
});

test("matchRanges: a match at the start of a word wins, accents and street words read as typed", () => {
  assert.deepEqual(marked("Replace the place", "pla"), ["pla"]);
  assert.equal(matchRanges("Replace the place", "pla")[0][0], 12);
  assert.deepEqual(marked("José Alvarez", "jose"), ["José"]);
  assert.deepEqual(marked("647 Prospect Ave", "avenue"), ["Ave"]);
});

test("matchRanges: offsets stay in the title when folding changes a letter's length", () => {
  const title = "ﬁsh market";
  const [[a, b]] = matchRanges(title, "market");
  assert.equal(title.slice(a, b), "market");
});

test("looksLikeAddress: a house number, then a word", () => {
  assert.ok(looksLikeAddress("12 Elmwood Ter"));
  assert.ok(looksLikeAddress(" 647b prospect"));
  assert.ok(!looksLikeAddress("elmwood"));
  assert.ok(!looksLikeAddress("12"));
  assert.ok(!looksLikeAddress("12 "));
});
