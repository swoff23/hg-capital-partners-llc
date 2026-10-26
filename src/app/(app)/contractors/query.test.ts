import test from "node:test";
import assert from "node:assert/strict";
import {
  contractorQuery,
  contractorsWhere,
  emptyContractors,
  isNarrowed,
  matchesNeedsW9,
  matchesTrades,
  parseContractorFilters,
  tradeOptions,
  tradeTokens,
  type ContractorFilters,
} from "./query";

type Row = Record<string, unknown>;

/** A stand-in for Postgres over the clauses query.ts builds. */
function matches(row: Row, cond: Record<string, unknown>): boolean {
  return Object.entries(cond).every(([field, filter]) => {
    if (field === "AND") return (filter as Row[]).every((c) => matches(row, c));
    if (field === "OR") return (filter as Row[]).some((c) => matches(row, c));
    if (field === "NOT") return !matches(row, filter as Row);
    const value = row[field];
    if (filter === null) return value === null || value === undefined;
    if (typeof filter !== "object") return value === filter;
    const f = filter as Row;
    if ("is" in f) return value != null && matches(value as Row, f.is as Row);
    if ("contains" in f) return typeof value === "string" && value.toLowerCase().includes(String(f.contains).toLowerCase());
    return value != null && matches(value as Row, f);
  });
}

const CONTACTS: Row[] = [
  { id: "zack", fullName: "Zack Reading", company: "Reading Plumbing", trades: "Plumbing / HVAC", w9Url: "https://x/w9.pdf", comments: null, portalAccount: { status: "ACTIVE" } },
  { id: "luis", fullName: "Luis Ortega", company: null, trades: "Electric", w9Url: null, comments: "W-9 on file: ortega-w9.pdf", portalAccount: null },
  { id: "dana", fullName: "Dana Fox", company: "Fox Electrical", trades: "Electrical", w9Url: null, comments: "Prefers texts", portalAccount: { status: "INVITED" } },
  { id: "pat", fullName: "Pat Lee", company: null, trades: null, w9Url: null, comments: null, portalAccount: { status: "ACTIVE" } },
];
const none: ContractorFilters = { q: "", trades: [], hasLogin: false, needsW9: false };
const row = (c: Row) => c as { w9Url: string | null; comments: string | null };
const found = (f: Partial<ContractorFilters>) =>
  CONTACTS.filter((c) => matches(c, contractorsWhere({ ...none, ...f }) as Row))
    .filter((c) => matchesNeedsW9(row(c), { ...none, ...f }))
    .map((c) => c.id);

test("parseContractorFilters: everything off by default", () => {
  assert.deepEqual(parseContractorFilters({}), none);
  assert.deepEqual(parseContractorFilters({ q: " luis ", trade: "Plumbing,HVAC", login: "1", w9: "1" }), {
    q: "luis",
    trades: ["Plumbing", "HVAC"],
    hasLogin: true,
    needsW9: true,
  });
  assert.equal(parseContractorFilters({ login: "0" }).hasLogin, false);
});

test("the search reads the name, the company and the trades, in any word order", () => {
  assert.deepEqual(found({ q: "luis" }), ["luis"]);
  assert.deepEqual(found({ q: "reading plumbing" }), ["zack"], "a name and a company");
  assert.deepEqual(found({ q: "hvac" }), ["zack"], "a trade");
  assert.deepEqual(found({ q: "fox electrical" }), ["dana"]);
  assert.deepEqual(found({ q: "zzzz" }), []);
});

test("Has login is an active portal account", () => {
  assert.deepEqual(found({ hasLogin: true }), ["zack", "pat"], "an invite not yet accepted isn't a login");
});

test("Needs W-9 is no W-9 on file: no link, and none named in the notes", () => {
  assert.deepEqual(found({ needsW9: true }), ["dana", "pat"], "Luis has one on file by name");
});

test("Needs W-9 reads the notes the way the Docs column does", () => {
  const needs = { needsW9: true };
  assert.equal(matchesNeedsW9({ w9Url: null, comments: "W-9 on file:" }, needs), true, "an empty line names nothing");
  assert.equal(matchesNeedsW9({ w9Url: null, comments: "Said the W-9 on file is old" }, needs), true, "a mention mid-sentence isn't the import's line");
  assert.equal(matchesNeedsW9({ w9Url: null, comments: "Prefers texts\nW-9 on file: w9.pdf" }, needs), false);
  assert.equal(matchesNeedsW9({ w9Url: "https://x/w9.pdf", comments: null }, needs), false);
  assert.equal(matchesNeedsW9({ w9Url: null, comments: null }, { needsW9: false }), true, "off keeps everyone");
});

test("the filters narrow together", () => {
  assert.deepEqual(found({ hasLogin: true, needsW9: true }), ["pat"]);
  assert.deepEqual(found({ q: "plumbing", hasLogin: true }), ["zack"]);
});

test("trades split on the slash, folded, and match whole words", () => {
  assert.deepEqual(tradeTokens("Plumbing / HVAC"), ["Plumbing", "HVAC"]);
  assert.deepEqual(tradeTokens("HVAC / HVAC"), ["HVAC"], "the import's repeats fold");
  assert.deepEqual(tradeTokens(null), []);
  assert.equal(matchesTrades("Electrical", ["Electric"]), false, "Electric isn't a piece of Electrical");
  assert.equal(matchesTrades("Plumbing / HVAC", ["hvac"]), true);
  assert.equal(matchesTrades(null, ["Plumbing"]), false);
  assert.equal(matchesTrades(null, []), true, "no picks keeps everyone");
});

test("trade options: A to Z, once each whatever the case, with how many do it", () => {
  const options = tradeOptions([{ trades: "Plumbing / HVAC" }, { trades: "plumbing" }, { trades: "Electric" }, { trades: null }]);
  assert.deepEqual(
    options.map((o) => [o.label, o.count]),
    [
      ["Electric", 1],
      ["HVAC", 1],
      ["Plumbing", 2],
    ],
  );
});

test("isNarrowed and the query string", () => {
  assert.equal(isNarrowed(none), false);
  assert.equal(isNarrowed({ ...none, hasLogin: true }), true);
  assert.equal(contractorQuery({ q: "luis", trades: ["Plumbing", "A, B"], hasLogin: true, needsW9: false }), "q=luis&trade=Plumbing%2CA%252C+B&login=1");
});

test("an empty list: a miss on a search is not an empty directory", () => {
  assert.deepEqual(emptyContractors({ ...none, q: "luis" }, 52), { line: "No contractors match “luis”.", clear: "search" });
  assert.deepEqual(emptyContractors({ ...none, hasLogin: true }, 52), { line: "No contractors match these filters.", clear: "filters" });
  assert.deepEqual(emptyContractors(none, 0), { line: "No contractors yet.", clear: null });
});
