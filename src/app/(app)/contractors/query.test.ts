import test from "node:test";
import assert from "node:assert/strict";
import { ACCOUNT_STATUSES } from "@/lib/contractors/onboarding";
import type { PortalAccessFacts } from "@/lib/portal/access-state";
import {
  accountStatusOf,
  contractorQuery,
  contractorsWhere,
  contractorsCount,
  emptyContractors,
  isNarrowed,
  matchesNeedsW9,
  matchesStatus,
  matchesTrades,
  parseContractorFilters,
  resolveTradePicks,
  statusOf,
  tradeOptions,
  type AccountRow,
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
    if ("not" in f && f.not === null) return value !== null && value !== undefined;
    if ("is" in f) return value != null && matches(value as Row, f.is as Row);
    if ("none" in f) return !Array.isArray(value) || !value.some((v) => matches(v as Row, f.none as Row));
    if ("some" in f) return Array.isArray(value) && value.some((v) => matches(v as Row, f.some as Row));
    if ("contains" in f) return typeof value === "string" && value.toLowerCase().includes(String(f.contains).toLowerCase());
    return value != null && matches(value as Row, f);
  });
}

const TRADES = {
  plumbing: { id: "t-plumb", name: "Plumbing" },
  hvac: { id: "t-hvac", name: "HVAC" },
  electric: { id: "t-elec", name: "Electric" },
  electrical: { id: "t-elecl", name: "Electrical" },
};
const links = (...t: { id: string; name: string }[]) => t.map((trade) => ({ trade }));

const CONTACTS: Row[] = [
  { id: "zack", fullName: "Zack Reading", company: "Reading Plumbing", tradeLinks: links(TRADES.plumbing, TRADES.hvac), w9Url: "https://x/w9.pdf", comments: null, portalAccount: { status: "ACTIVE" } },
  { id: "luis", fullName: "Luis Ortega", company: null, tradeLinks: links(TRADES.electric), w9Url: null, comments: "W-9 on file: ortega-w9.pdf", portalAccount: null },
  { id: "dana", fullName: "Dana Fox", company: "Fox Electrical", tradeLinks: links(TRADES.electrical), w9Url: null, comments: "Prefers texts", portalAccount: { status: "INVITED" } },
  { id: "pat", fullName: "Pat Lee", company: null, tradeLinks: [], w9Url: null, comments: null, portalAccount: { status: "ACTIVE" }, phoneE164: "+17165550142", email: "pat@leeroofing.com" },
  // Uploaded a W-9 in setup: no link and no note, but on file.
  { id: "uma", fullName: "Uma Cole", company: null, tradeLinks: [], w9Url: null, comments: null, portalAccount: null, documents: [{ kind: "W9" }] },
  // An insurance upload alone is not a W-9.
  { id: "ivy", fullName: "Ivy Park", company: null, tradeLinks: [], w9Url: null, comments: null, portalAccount: null, documents: [{ kind: "INSURANCE" }] },
  // Archived: only the Archived chip shows them.
  { id: "old", fullName: "Olga Plumb", company: "Old Plumbing", tradeLinks: links(TRADES.plumbing), w9Url: null, comments: null, portalAccount: null, archivedAt: new Date("2026-10-27T14:00:00Z") },
];
const none: ContractorFilters = { q: "", trades: [], status: [], hasLogin: false, needsW9: false, archived: false };
const row = (c: Row) => c as { w9Url: string | null; comments: string | null; documents?: { kind: string }[] };
const found = (f: Partial<ContractorFilters>) =>
  CONTACTS.filter((c) => matches(c, contractorsWhere({ ...none, ...f }) as Row))
    .filter((c) => matchesNeedsW9(row(c), { ...none, ...f }))
    .map((c) => c.id);

test("parseContractorFilters: everything off by default", () => {
  assert.deepEqual(parseContractorFilters({}), none);
  assert.deepEqual(parseContractorFilters({ q: " luis ", trade: "Plumbing,HVAC", login: "1", w9: "1", archived: "1" }), {
    q: "luis",
    trades: ["Plumbing", "HVAC"],
    status: [],
    hasLogin: true,
    needsW9: true,
    archived: true,
  });
  assert.equal(parseContractorFilters({ login: "0" }).hasLogin, false);
});

test("Archived swaps the list for the archived contractors, whom nothing else shows", () => {
  assert.deepEqual(found({}), ["zack", "luis", "dana", "pat", "uma", "ivy"]);
  assert.deepEqual(found({ q: "plumb" }), ["zack"], "a search never reaches an archived one");
  assert.deepEqual(found({ archived: true }), ["old"]);
  assert.deepEqual(found({ archived: true, q: "olga" }), ["old"], "the search runs inside Archived");
  assert.deepEqual(found({ archived: true, hasLogin: true }), []);
  assert.equal(isNarrowed({ ...none, archived: true }), false, "a different list, not a narrowing");
  assert.equal(contractorQuery({ ...none, archived: true }), "archived=1");
  assert.deepEqual(emptyContractors({ ...none, archived: true }, 0), { line: "No archived contractors.", clear: "filters" });
});

test("the search reads the name, the company and the trades, in any word order", () => {
  assert.deepEqual(found({ q: "luis" }), ["luis"]);
  assert.deepEqual(found({ q: "reading plumbing" }), ["zack"], "a name and a company");
  assert.deepEqual(found({ q: "hvac" }), ["zack"], "a trade");
  assert.deepEqual(found({ q: "fox electrical" }), ["dana"]);
  assert.deepEqual(found({ q: "zzzz" }), []);
});

test("the search reads the phone's digits, typed any way, and the email, as the palette does", () => {
  for (const q of ["(716) 555-0142", "716-555-0142", "555-0142"]) assert.deepEqual(found({ q }), ["pat"], q);
  assert.deepEqual(found({ q: "leeroofing" }), ["pat"]);
  assert.deepEqual(found({ q: "716" }), [], "three digits are too few to read as a phone");
});

test("Has login is an active portal account", () => {
  assert.deepEqual(found({ hasLogin: true }), ["zack", "pat"], "an invite not yet accepted isn't a login");
});

test("Needs W-9 is no W-9 on file: no link, no upload, and none named in the notes", () => {
  assert.deepEqual(found({ needsW9: true }), ["dana", "pat", "ivy"], "Luis has one on file by name, Uma by upload; an insurance upload isn't a W-9");
});

test("Needs W-9 reads the notes the way the Docs column does", () => {
  const needs = { needsW9: true };
  assert.equal(matchesNeedsW9({ w9Url: null, comments: "W-9 on file:" }, needs), true, "an empty line names nothing");
  assert.equal(matchesNeedsW9({ w9Url: null, comments: "Said the W-9 on file is old" }, needs), true, "a mention mid-sentence isn't the import's line");
  assert.equal(matchesNeedsW9({ w9Url: null, comments: "Prefers texts\nW-9 on file: w9.pdf" }, needs), false);
  assert.equal(matchesNeedsW9({ w9Url: "https://x/w9.pdf", comments: null }, needs), false);
  assert.equal(matchesNeedsW9({ w9Url: null, comments: null }, { needsW9: false }), true, "off keeps everyone");
  assert.equal(matchesNeedsW9({ w9Url: null, comments: null, documents: [{ kind: "W9" }] }, needs), false, "an uploaded W-9 is on file");
  assert.equal(matchesNeedsW9({ w9Url: null, comments: null, documents: [{ kind: "INSURANCE" }] }, needs), true);
});

/** A login sign-in lets in: their own password, signed in. */
const login = (over: Partial<PortalAccessFacts> = {}): AccountRow["portalAccount"] => ({
  id: "a",
  status: "ACTIVE",
  mustChangePassword: false,
  lastSignInAt: new Date(),
  lastSeenAt: null,
  ...over,
});

const accountRow = (over: Partial<AccountRow> = {}): AccountRow => ({
  signupSource: "INVITE",
  needsReview: false,
  setupDoneAt: null,
  active: true,
  portalAccount: null,
  portalInvites: [{ openedAt: null }],
  ...over,
});

test("the Status filter reads the same status the rows show", () => {
  const invited = accountRow();
  const opened = accountRow({ portalInvites: [{ openedAt: new Date() }] });
  const onboarding = accountRow({ portalAccount: login() });
  const isNew = accountRow({ signupSource: "LINK", needsReview: true, portalInvites: [], portalAccount: login() });
  const active = accountRow({ portalAccount: login(), setupDoneAt: new Date() });
  const staff = accountRow({ signupSource: "STAFF", portalInvites: [] });
  const rows = [invited, opened, onboarding, isNew, active, staff];
  assert.deepEqual(rows.map(statusOf), ["invited", "opened", "onboarding", "new", null, null], "the onboarding badge alone");
  assert.deepEqual(rows.map(accountStatusOf), ["invited", "opened", "onboarding", "new", "active", null]);
  assert.equal(matchesStatus(invited, []), true, "no picks keeps everyone");
  assert.equal(matchesStatus(staff, []), true);
  assert.equal(matchesStatus(invited, ["invited", "opened"]), true);
  assert.equal(matchesStatus(opened, ["invited"]), false);
  assert.equal(matchesStatus(active, ["onboarding"]), false);
  assert.equal(matchesStatus(active, ["active"]), true, "done with setup reads Active");
  assert.equal(matchesStatus(staff, ACCOUNT_STATUSES), false, "no login and never in setup matches no pick");
});

test("someone staff added shows their login's state, and Access off outranks Onboarding", () => {
  const staff = (over: Partial<AccountRow>) => accountRow({ signupSource: "STAFF", portalInvites: [], ...over });
  assert.equal(accountStatusOf(staff({ portalAccount: login() })), "active");
  assert.equal(accountStatusOf(staff({ portalAccount: login({ mustChangePassword: true, lastSignInAt: null }) })), "invited", "made, never used");
  assert.equal(accountStatusOf(staff({ portalAccount: login({ status: "DISABLED" }) })), "off", "access removed");
  assert.equal(accountStatusOf(staff({ active: false, portalAccount: login() })), "off", "an inactive contact can't sign in");
  assert.equal(accountStatusOf(staff({ portalAccount: login(), archivedAt: new Date() })), null, "archived is the dash");
  assert.equal(accountStatusOf(accountRow({ portalAccount: login({ status: "DISABLED" }) })), "off", "mid-setup with access off");
  const newOff = accountRow({ signupSource: "LINK", needsReview: true, portalAccount: login({ status: "DISABLED" }) });
  assert.equal(accountStatusOf(newOff), "new", "a partner's decision still comes first");
  assert.equal(matchesStatus(staff({ portalAccount: login({ mustChangePassword: true }) }), ["invited"]), true);
});

test("the Status filter in the URL: known statuses only, and it counts as narrowing", () => {
  const f = parseContractorFilters({ status: "new,opened,bogus" });
  assert.deepEqual(f.status, ["new", "opened"]);
  assert.equal(isNarrowed(f), true);
  assert.equal(contractorQuery(f), "status=new%2Copened");
  assert.deepEqual(emptyContractors(f, 52), { line: "No contractors match these filters.", clear: "filters" });
});

test("the filters narrow together", () => {
  assert.deepEqual(found({ hasLogin: true, needsW9: true }), ["pat"]);
  assert.deepEqual(found({ q: "plumbing", hasLogin: true }), ["zack"]);
});

test("the Trade filter matches trade ids; a name from an older link finds its trade", () => {
  const zack = CONTACTS[0] as { tradeLinks: { trade: { id: string } }[] };
  const dana = CONTACTS[2] as { tradeLinks: { trade: { id: string } }[] };
  assert.equal(matchesTrades(zack, ["t-hvac"]), true);
  assert.equal(matchesTrades(dana, ["t-elec"]), false, "Electric isn't Electrical");
  assert.equal(matchesTrades({ tradeLinks: [] }, ["t-plumb"]), false);
  assert.equal(matchesTrades({ tradeLinks: [] }, []), true, "no picks keeps everyone");
  const all = Object.values(TRADES);
  assert.deepEqual(resolveTradePicks(["t-plumb", "hvac", "Roofing", "t-plumb"], all), ["t-plumb", "t-hvac"], "an id stays, a name maps, the rest drops");
});

test("trade options: every trade A to Z, counting the rows that do it, a zero kept", () => {
  const options = tradeOptions(Object.values(TRADES), CONTACTS.slice(0, 4) as { tradeLinks: { trade: { id: string } }[] }[]);
  assert.deepEqual(
    options.map((o) => [o.label, o.count]),
    [
      ["Electric", 1],
      ["Electrical", 1],
      ["HVAC", 1],
      ["Plumbing", 1],
    ],
  );
  assert.equal(tradeOptions([{ id: "t-tile", name: "Tile" }], [])[0].count, 0);
});

test("isNarrowed and the query string", () => {
  assert.equal(isNarrowed(none), false);
  assert.equal(isNarrowed({ ...none, hasLogin: true }), true);
  assert.equal(contractorQuery({ q: "luis", trades: ["Plumbing", "A, B"], status: [], hasLogin: true, needsW9: false, archived: false }), "q=luis&trade=Plumbing%2CA%252C+B&login=1");
});

test("an empty list: a miss on a search is not an empty directory", () => {
  assert.deepEqual(emptyContractors({ ...none, q: "luis" }, 52), { line: "No contractors match “luis”.", clear: "search" });
  assert.deepEqual(emptyContractors({ ...none, hasLogin: true }, 52), { line: "No contractors match these filters.", clear: "filters" });
  assert.deepEqual(emptyContractors(none, 0), { line: "No contractors yet.", clear: null });
});

test("an empty list with a search and a filter on blames neither alone, and clears both", () => {
  // /contractors?q=david&login=1 said 'No contractors match "david".' with Clear search, which led to a second empty list.
  assert.deepEqual(emptyContractors({ ...none, q: "david", hasLogin: true }, 30), { line: "No contractors match these filters.", clear: "filters" });
  assert.deepEqual(emptyContractors({ ...none, q: "david", needsW9: true }, 30), { line: "No contractors match these filters.", clear: "filters" });
  assert.deepEqual(emptyContractors({ ...none, q: "david", trades: ["Plumbing"] }, 30), { line: "No contractors match these filters.", clear: "filters" });
});

test("the header counts the whole list; the result line says how many show", () => {
  // "2 of 30 contractors" over "2 contractors · 28 hidden by filters" said the same thing twice.
  assert.equal(contractorsCount(30), "30 contractors");
  assert.equal(contractorsCount(1), "1 contractor");
  assert.equal(contractorsCount(0), "0 contractors");
  assert.equal(contractorsCount(2, true), "2 archived", "under Archived the whole is the archived ones");
  assert.equal(contractorsCount(1, true), "1 archived");
});
