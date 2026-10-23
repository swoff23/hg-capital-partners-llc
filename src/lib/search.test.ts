import test from "node:test";
import assert from "node:assert/strict";
import { everyTermMatches, foldAccents, searchTerms, type TextMatch } from "./search";

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
