import test from "node:test";
import assert from "node:assert/strict";
import {
  SUGGEST_LIMIT,
  addressFromListingLink,
  answerAddresses,
  duplicateSentence,
  liveFirst,
  findAddressMatch,
  looksLikeLink,
  parseAddressParams,
  runAddresses,
  savesAs,
  splitAddress,
  suggestAddresses,
  tidyAddress,
  withScheme,
  type AddressDb,
  type AddressRecord,
} from "./address-suggestions";
import { sameStreetAddress, shortAddress, streetKey } from "./normalize";

test("tidyAddress: the form an address saves in, Saves as 767 Prospect Ave, Buffalo, NY 14209", () => {
  assert.equal(tidyAddress("767 prospect avenue buffalo ny 14209"), "767 Prospect Ave, Buffalo, NY 14209");
  assert.equal(tidyAddress("767 Prospect Avenue, Buffalo, NY 14213"), "767 Prospect Ave, Buffalo, NY 14213");
  assert.equal(tidyAddress("  118   Congress St.  Buffalo, NY 14213 "), "118 Congress St, Buffalo, NY 14213");
  assert.equal(tidyAddress("1404 payne avenue,  north tonawanda, ny 14120"), "1404 Payne Ave, North Tonawanda, NY 14120");
  assert.equal(tidyAddress("877 Prospect Ave, Buffalo NY"), "877 Prospect Ave, Buffalo, NY");
  assert.equal(tidyAddress("767 PROSPECT AVE"), "767 Prospect Ave");
  assert.equal(tidyAddress("421 w delavan ave"), "421 W Delavan Ave");
  assert.equal(tidyAddress("45 virgil"), "45 Virgil");
  assert.equal(tidyAddress(""), "");
});

test("tidyAddress leaves what's already right, and words typed with their own capitals", () => {
  assert.equal(tidyAddress("767 Prospect Ave, Buffalo, NY 14209"), "767 Prospect Ave, Buffalo, NY 14209");
  assert.equal(tidyAddress("5 O'Brien St"), "5 O'Brien St");
  assert.equal(tidyAddress("765/767 Prospect Ave"), "765/767 Prospect Ave");
  assert.equal(tidyAddress("Lot on Main Street"), "Lot on Main St");
  // A letter after the street is the street's, not a town: no comma goes in front of it.
  assert.equal(tidyAddress("10 Avenue D"), "10 Ave D");
  assert.equal(tidyAddress("12 elm st apt 2"), "12 Elm St Apt 2");
});

test("tidyAddress keeps every word's case once the person chose capitals of their own", () => {
  // The tester's 'Use "..." as typed' picks, which saved as "QA Test Oct27 Portfolio 1 Apt 4b" and "</Script>".
  assert.equal(tidyAddress("QA test Oct27 portfolio 1 apt 4b"), "QA test Oct27 portfolio 1 apt 4b");
  assert.equal(tidyAddress("QA test Oct27 portfolio 1 <script>alert(1)</script>"), "QA test Oct27 portfolio 1 <script>alert(1)</script>");
  assert.equal(tidyAddress("12 McDonald Ave apt 4b"), "12 McDonald Ave apt 4b");
  // The house style still applies: the street word, the state and the commas.
  assert.equal(tidyAddress("12 McDonald Avenue buffalo ny 14209"), "12 McDonald Ave, buffalo, NY 14209");
  // The state and a shouted word aren't chosen capitals.
  assert.equal(tidyAddress("767 prospect ave buffalo NY 14209"), "767 Prospect Ave, Buffalo, NY 14209");
  assert.equal(tidyAddress("767 PROSPECT ave"), "767 Prospect Ave");
  // Typed all in lower case, a name gets its Mc and O' capitals, and a slash starts no capital.
  assert.equal(tidyAddress("12 mcdonald st"), "12 McDonald St");
  assert.equal(tidyAddress("5 o'brien st"), "5 O'Brien St");
  assert.equal(tidyAddress("10 mckinley pkwy"), "10 McKinley Pkwy");
  assert.equal(tidyAddress("1 a/b st"), "1 A/b St");
});

test("tidying never changes which building an address is", () => {
  const typed = ["767 prospect avenue buffalo ny 14209", "118 Congress St. Buffalo, NY 14213", "421 w delavan ave", "1404 payne avenue,  north tonawanda, ny 14120"];
  for (const t of typed) {
    assert.equal(streetKey(tidyAddress(t)), streetKey(t), t);
    assert.equal(sameStreetAddress(tidyAddress(t), t), true, t);
  }
});

// The Saint-street bug (found Nov 14, live on New property, New deal and every rename): "34 St James Pl Buffalo, NY
// 14222" saved as "34 St, James Pl Buffalo, NY 14222", and the record then showed as "34 St". The cause was
// splitAddress ending the street at the first street-type word after the house number, which on a Saint street is
// the name's own "St".

test("a Saint street keeps its name: no comma after St, and the record's short name is the whole street", () => {
  assert.equal(tidyAddress("34 St James Pl Buffalo, NY 14222"), "34 St James Pl, Buffalo, NY 14222");
  assert.equal(shortAddress(tidyAddress("34 St James Pl Buffalo, NY 14222")), "34 St James Pl");
  assert.equal(tidyAddress("34 st james pl buffalo ny 14222"), "34 St James Pl, Buffalo, NY 14222");
  assert.equal(tidyAddress("34 ST JAMES PL BUFFALO NY 14222"), "34 St James Pl, Buffalo, NY 14222");
  assert.equal(tidyAddress("34 St James Pl, Buffalo, NY 14222"), "34 St James Pl, Buffalo, NY 14222", "already right stays");
  assert.deepEqual(splitAddress("12-14 St James Pl Buffalo"), { street: "12-14 St James Pl", place: "Buffalo" });
  assert.equal(tidyAddress("77 St Marks Ave Buffalo NY 14214"), "77 St Marks Ave, Buffalo, NY 14214");
  assert.equal(tidyAddress("77 st marks avenue"), "77 St Marks Ave");
  assert.equal(tidyAddress("210 St Paul St Buffalo, NY 14209"), "210 St Paul St, Buffalo, NY 14209");
  assert.equal(tidyAddress("210 st paul street buffalo ny"), "210 St Paul St, Buffalo, NY");
  // With no street type typed, the comma that was typed still sets the town apart.
  assert.equal(tidyAddress("34 st james, buffalo ny"), "34 St James, Buffalo, NY");
  assert.equal(tidyAddress("34 St James"), "34 St James");
  // While it is being typed.
  assert.equal(tidyAddress("34 st"), "34 St");
  assert.equal(savesAs("34 st james pl buffalo ny 14222"), "34 St James Pl, Buffalo, NY 14222");
});

test("St. with a period is the same Saint street, and the period goes as it does everywhere", () => {
  assert.equal(tidyAddress("34 St. James Pl Buffalo, NY 14222"), "34 St James Pl, Buffalo, NY 14222");
  assert.equal(tidyAddress("210 St. Paul St. Buffalo NY 14209"), "210 St Paul St, Buffalo, NY 14209");
  // A stored address keeps its words in the two suggestion lines.
  assert.deepEqual(splitAddress("34 St. James Pl, Buffalo, NY 14222"), { street: "34 St. James Pl", place: "Buffalo, NY 14222" });
});

test("a street really ending in St is unchanged: the comma still goes after it", () => {
  assert.equal(tidyAddress("12 Main St"), "12 Main St");
  assert.equal(tidyAddress("12 main st buffalo ny 14201"), "12 Main St, Buffalo, NY 14201");
  assert.equal(tidyAddress("12 Main St. Buffalo, NY 14201"), "12 Main St, Buffalo, NY 14201");
  assert.equal(tidyAddress("12 main street buffalo ny"), "12 Main St, Buffalo, NY");
  assert.deepEqual(splitAddress("12 Main St Buffalo, NY 14201"), { street: "12 Main St", place: "Buffalo, NY 14201" });
  // A street named for a type word, then its type: the pair stays together as it always did.
  assert.equal(tidyAddress("12 court st buffalo ny 14202"), "12 Court St, Buffalo, NY 14202");
  assert.deepEqual(splitAddress("12 Court St Buffalo, NY 14202"), { street: "12 Court St", place: "Buffalo, NY 14202" });
  // No house number: the first type word still ends the street.
  assert.deepEqual(splitAddress("Main St Buffalo, NY"), { street: "Main St", place: "Buffalo, NY" });
  assert.equal(tidyAddress("lot on main street buffalo ny"), "Lot on Main St, Buffalo, NY");
  // A comma right after the word closes the street there, as typed.
  assert.deepEqual(splitAddress("34 St, Buffalo, NY"), { street: "34 St", place: "Buffalo, NY" });
});

test("splitAddress: a Saint street's two lines are the street and the place", () => {
  assert.deepEqual(splitAddress("34 St James Pl Buffalo, NY 14222"), { street: "34 St James Pl", place: "Buffalo, NY 14222" });
  assert.deepEqual(splitAddress("34 St James Pl, Buffalo, NY 14222"), { street: "34 St James Pl", place: "Buffalo, NY 14222" });
  assert.deepEqual(splitAddress("77 St Marks Ave"), { street: "77 St Marks Ave", place: "" });
  assert.deepEqual(splitAddress("210 St Paul St Buffalo NY 14209"), { street: "210 St Paul St", place: "Buffalo NY 14209" });
  assert.deepEqual(splitAddress("765/767 St James Pl, Buffalo"), { street: "765/767 St James Pl", place: "Buffalo" });
  assert.deepEqual(splitAddress("34A St James Pl Buffalo"), { street: "34A St James Pl", place: "Buffalo" });
});

test("a Saint street tidies once and stays: a second tidy changes nothing, and the building it is never changes", () => {
  const typed = [
    "34 St James Pl Buffalo, NY 14222",
    "34 st. james pl buffalo ny 14222",
    "77 St Marks Ave Buffalo NY 14214",
    "210 St Paul St Buffalo, NY 14209",
    "34 st james, buffalo ny",
    "12 Main St Buffalo NY 14201",
    "12 court st buffalo ny 14202",
    "10 Avenue D",
  ];
  for (const t of typed) {
    const once = tidyAddress(t);
    assert.equal(tidyAddress(once), once, t);
    assert.equal(streetKey(once), streetKey(t), t);
    assert.equal(sameStreetAddress(once, t), true, t);
  }
  assert.equal(streetKey(tidyAddress("34 St James Pl Buffalo, NY 14222")), "34 st james");
});

test("savesAs: the line under the field, only when saving would change the typing", () => {
  assert.equal(savesAs("767 prospect avenue buffalo ny 14209"), "767 Prospect Ave, Buffalo, NY 14209");
  assert.equal(savesAs("767 Prospect Ave, Buffalo, NY 14209"), null);
  // Stray spaces alone aren't worth a line: they were never going to be kept.
  assert.equal(savesAs("  767   Prospect Ave "), null);
  // Text that isn't an address yet says nothing.
  assert.equal(savesAs("pro"), null);
  assert.equal(savesAs("Lot on Main Street"), null);
  assert.equal(savesAs("12"), null);
});

test("a pasted link is no address", () => {
  assert.equal(looksLikeLink("https://www.zillow.com/homedetails/767-Prospect-Ave-Buffalo-NY-14213/2084530018_zpid/"), true);
  assert.equal(looksLikeLink(" http://x.test/a "), true);
  assert.equal(looksLikeLink("www.zillow.com/homedetails/1"), true);
  assert.equal(looksLikeLink("767 Prospect Ave"), false);
  assert.equal(looksLikeLink("see https://x.test"), false);
  assert.equal(withScheme("www.zillow.com/x"), "https://www.zillow.com/x");
  assert.equal(withScheme("http://a.test"), "http://a.test");
});

test("a Zillow link's slug fills the address; any other link says nothing", () => {
  assert.equal(
    addressFromListingLink("https://www.zillow.com/homedetails/767-Prospect-Ave-Buffalo-NY-14213/2084530018_zpid/"),
    "767 Prospect Ave, Buffalo, NY 14213",
  );
  assert.equal(addressFromListingLink("www.zillow.com/homedetails/118-Congress-St-Buffalo-NY-14213/123_zpid"), "118 Congress St, Buffalo, NY 14213");
  assert.equal(addressFromListingLink("https://www.zillow.com/buffalo-ny/"), null);
  assert.equal(addressFromListingLink("https://example.com/homedetails/767-Prospect-Ave/1/"), null);
  assert.equal(addressFromListingLink("https://www.zillow.com/homedetails/Some-Listing/1_zpid/"), null);
  assert.equal(addressFromListingLink("not a link"), null);
});

test("splitAddress: the street over the place, tidied", () => {
  assert.deepEqual(splitAddress("767 Prospect Avenue, Buffalo, NY 14213"), { street: "767 Prospect Avenue", place: "Buffalo, NY 14213" });
  assert.deepEqual(splitAddress("15 Oxford Ave. Buffalo, NY 14209"), { street: "15 Oxford Ave", place: "Buffalo, NY 14209" });
  assert.deepEqual(splitAddress("545 Niagara Street   Buffalo ,  NY   14201"), { street: "545 Niagara Street", place: "Buffalo, NY 14201" });
  assert.deepEqual(splitAddress("1404 Payne Avenue,  North Tonawanda, NY 14120"), {
    street: "1404 Payne Avenue",
    place: "North Tonawanda, NY 14120",
  });
  // Two street words in a row stay with the street.
  assert.deepEqual(splitAddress("398 Baynes St Street Buffalo, NY 14213"), { street: "398 Baynes St Street", place: "Buffalo, NY 14213" });
  // No street word: up to the first comma, or all of it.
  assert.deepEqual(splitAddress("12 Elmwood, Buffalo"), { street: "12 Elmwood", place: "Buffalo" });
  assert.deepEqual(splitAddress("312 Dewitt Street"), { street: "312 Dewitt Street", place: "" });
  assert.deepEqual(splitAddress("45 Virgil"), { street: "45 Virgil", place: "" });
});

const at = (day: number) => Date.UTC(2026, 9, day);
const records: AddressRecord[] = [
  { kind: "property", id: "p767", address: "767 Prospect Avenue, Buffalo, NY 14213", updatedAt: at(1) },
  { kind: "property", id: "p765", address: "765 Prospect Avenue, Buffalo, NY 14213", updatedAt: at(2) },
  { kind: "deal", id: "d767", address: "767 Prospect Ave Buffalo, NY 14213", updatedAt: at(20), stage: "CLOSED!" },
  { kind: "deal", id: "d877", address: "877 Prospect Avenue   Buffalo ,  NY   14213", updatedAt: at(10), stage: "6 - Holding" },
  { kind: "deal", id: "d877-old", address: "877 Prospect Ave, Buffalo NY", updatedAt: at(3), stage: "Pass" },
  { kind: "deal", id: "d118", address: "118 Congress Street Buffalo, NY 14213", updatedAt: at(5), stage: "Pass" },
  { kind: "property", id: "p118", address: "118 Congress St. Buffalo, NY 14213", updatedAt: at(4) },
  { kind: "deal", id: "d1201", address: "1201 Payne Avenue,  North Tonawanda, NY 14120", updatedAt: at(6), stage: "Pass" },
];

test("nothing is suggested under three characters", () => {
  assert.deepEqual(suggestAddresses("76", records), []);
  assert.deepEqual(suggestAddresses("  7 ", records), []);
});

test("suggestions hold every typed word, one row per building, a property over a deal", () => {
  const rows = suggestAddresses("prospect", records);
  assert.deepEqual(
    rows.map((r) => r.id),
    // Properties first, then deals, newest first; 767's deal folds into its property and 877's older deal into its newer one.
    ["p765", "p767", "d877"],
  );
  assert.deepEqual(rows[1], {
    kind: "property",
    id: "p767",
    address: "767 Prospect Avenue, Buffalo, NY 14213",
    street: "767 Prospect Avenue",
    place: "Buffalo, NY 14213",
    href: "/properties/p767",
  });
  assert.equal(rows[2].href, "/deals/d877");
  // The deal's stored spacing is tidied in what a pick fills in.
  assert.equal(rows[2].address, "877 Prospect Avenue Buffalo , NY 14213");
});

test("a form for deals keeps a building's deal row over its property row", () => {
  const rows = suggestAddresses("prospect", records, { prefer: "deal" });
  assert.deepEqual(
    rows.map((r) => r.id),
    ["p765", "d767", "d877"],
  );
});

test("street words read either way, and the best match leads", () => {
  assert.deepEqual(
    suggestAddresses("767 prospect avenue", records).map((r) => r.id),
    ["p767"],
  );
  assert.deepEqual(
    suggestAddresses("118 congress st", records).map((r) => r.id),
    ["p118"],
  );
  // "Payne" starts the street of the North Tonawanda deal, and nothing else has it.
  assert.deepEqual(
    suggestAddresses("payne", records).map((r) => r.id),
    ["d1201"],
  );
  // A typed word that starts a word of the street beats one buried inside a word, however recent.
  const ordered = suggestAddresses("elm", [
    { kind: "deal", id: "helm", address: "12 Helm St", updatedAt: at(9) },
    { kind: "deal", id: "elm", address: "40 Elm St", updatedAt: at(1) },
  ]).map((r) => r.id);
  assert.deepEqual(ordered, ["elm", "helm"]);
});

test("suggestions stop at six and leave out the record being renamed", () => {
  const many: AddressRecord[] = Array.from({ length: 10 }, (_, i) => ({
    kind: "deal",
    id: `d${i}`,
    address: `${10 + i} Elmwood Ave, Buffalo, NY 14222`,
    updatedAt: at(i + 1),
  }));
  assert.equal(SUGGEST_LIMIT, 6);
  assert.equal(suggestAddresses("elmwood", many).length, 6);
  assert.equal(
    suggestAddresses("767 prospect", records, { excludeId: "p767" }).some((r) => r.id === "p767"),
    false,
  );
});

test("the match: a property is a property's duplicate", () => {
  const m = findAddressMatch("767 Prospect Ave", "property", records);
  assert.deepEqual(m, {
    kind: "property",
    id: "p767",
    address: "767 Prospect Avenue, Buffalo, NY 14213",
    street: "767 Prospect Avenue",
    href: "/properties/p767",
  });
  // A deal at an address isn't a reason to refuse the property.
  assert.equal(findAddressMatch("877 Prospect Ave", "property", records), null);
});

test("the match for a deal: an existing deal first, the newest, then a property", () => {
  assert.equal(findAddressMatch("767 Prospect Avenue Buffalo NY 14213", "deal", records)?.id, "d767");
  const holding = findAddressMatch("877 prospect", "deal", records);
  assert.equal(holding?.id, "d877");
  assert.equal(holding?.stage, "6 - Holding");
  assert.equal(findAddressMatch("765 Prospect Ave", "deal", records)?.id, "p765");
  // Renaming the deal itself: the property it became still counts.
  assert.equal(findAddressMatch("767 Prospect Ave", "deal", records, "d767")?.id, "p767");
});

test("the match needs the same building, not just a start of one", () => {
  assert.equal(findAddressMatch("767 Pros", "property", records), null);
  assert.equal(findAddressMatch("767 Prospect St", "property", records), null);
  assert.equal(findAddressMatch("767 Prospect Ave, Buffalo, NY 14209", "property", records), null);
  assert.equal(findAddressMatch("Prospect Ave", "property", records), null);
  assert.equal(findAddressMatch("", "deal", records), null);
});

test("parseAddressParams reads q, kind and exclude", () => {
  assert.deepEqual(parseAddressParams(new URLSearchParams("q=%20767%20Pro%20&kind=deal&exclude=d1")), {
    q: "767 Pro",
    kind: "deal",
    excludeId: "d1",
  });
  assert.deepEqual(parseAddressParams(new URLSearchParams("q=767")), { q: "767", kind: "property", excludeId: undefined });
  assert.deepEqual(parseAddressParams(new URLSearchParams("q=767&kind=task")), { error: "kind" });
});

/* ---------------- Against an in-memory database ---------------- */

type Row = { id: string; address: string; updatedAt: Date; status?: string; archivedAt?: Date | null };
type Where = Record<string, unknown>;

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (value as Where[]).every((w) => matches(row, w));
    if (key === "OR") return (value as Where[]).some((w) => matches(row, w));
    const filter = value as { contains: string };
    const have = row[key as keyof Row];
    return typeof have === "string" && have.toLowerCase().includes(filter.contains.toLowerCase());
  });
}

function table(rows: Row[]) {
  return {
    findMany: async ({ where, take }: { where: Where; take: number }) =>
      rows
        .filter((r) => matches(r, where))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, take),
  };
}

const rowsOf = (kind: "property" | "deal") =>
  records
    .filter((r) => r.kind === kind)
    .map((r) => ({ id: r.id, address: r.address, updatedAt: new Date(r.updatedAt), status: r.stage ?? undefined }));

const db = { property: table(rowsOf("property")), deal: table(rowsOf("deal")) } as unknown as AddressDb;

test("runAddresses answers suggestions and the match from both tables", async () => {
  const answer = await runAddresses(db, { q: "767 Prospect Avenue", kind: "deal" });
  // New deal keeps the deal's row for a building that is both, so the pick agrees with the line under it.
  assert.deepEqual(
    answer.suggestions.map((s) => s.id),
    ["d767"],
  );
  assert.equal(answer.match?.id, "d767");
  const asProperty = await runAddresses(db, { q: "767 Prospect Avenue", kind: "property" });
  assert.deepEqual(
    asProperty.suggestions.map((s) => s.id),
    ["p767"],
  );
  assert.equal(answer.match?.stage, "CLOSED!");
  // Typed with a different street word than stored, the house number still finds the building.
  const typedLong = await runAddresses(db, { q: "118 Congress Street", kind: "property" });
  assert.equal(typedLong.match?.id, "p118");
  assert.deepEqual(await runAddresses(db, { q: "76", kind: "deal" }), { suggestions: [], match: null });
  assert.deepEqual(await runAddresses(db, { q: "...", kind: "deal" }), { suggestions: [], match: null });
});

test("runAddresses takes a typed % or _ as typed, in the words and in the house number", async () => {
  const seen: Where[] = [];
  const spy = {
    findMany: async ({ where }: { where: Where }) => {
      seen.push(where);
      return [];
    },
  };
  await runAddresses({ property: spy, deal: spy } as unknown as AddressDb, { q: "1%a Ma_n", kind: "deal" });
  const filters = JSON.stringify(seen);
  // Unescaped, Postgres reads % as any run of characters and _ as any one.
  assert.doesNotMatch(filters, /"contains":"1%a"/);
  assert.match(filters, /"contains":"1\\\\%a"/);
  assert.match(filters, /"contains":"ma\\\\_n"/);
});

test("answerAddresses is staff only, checks its params and hides a failure", async () => {
  assert.equal((await answerAddresses(null, new URLSearchParams("q=767"), db)).status, 401);
  assert.equal((await answerAddresses({ id: "u1" }, new URLSearchParams("q=767&kind=task"), db)).status, 400);
  const ok = await answerAddresses({ id: "u1" }, new URLSearchParams("q=prospect&kind=property"), db);
  assert.equal(ok.status, 200);
  let logged: unknown = null;
  const broken = { property: { findMany: async () => Promise.reject(new Error("db down")) }, deal: table([]) } as unknown as AddressDb;
  const failed = await answerAddresses({ id: "u1" }, new URLSearchParams("q=prospect"), broken, (err) => (logged = err));
  assert.deepEqual(failed, { status: 500, body: { error: "failed" } });
  assert.ok(logged instanceof Error);
});

/* ---------------- Archived records (call 21) ---------------- */

test("duplicateSentence says archived for an archived record, in the line and in the save's refusal", () => {
  assert.equal(duplicateSentence("deal", "118 Congress St", true), "118 Congress St is an archived deal.");
  assert.equal(duplicateSentence("property", "767 Prospect Ave", true), "767 Prospect Ave is an archived property.");
  assert.equal(duplicateSentence("property", "767 Prospect Ave"), "767 Prospect Ave is already a property.");
  assert.equal(duplicateSentence("deal", "118 Congress St", false), "118 Congress St is already a deal.");
});

test("the save's refusal names a live record before a newer archived one at the same address", () => {
  const archivedNewer = { id: "archived", archivedAt: new Date() };
  const live = { id: "live", archivedAt: null };
  assert.equal(liveFirst([archivedNewer, live])?.id, "live");
  assert.equal(liveFirst([archivedNewer])?.id, "archived");
  assert.equal(liveFirst([]), null);
});

test("an archived record leaves the suggestion rows but still is the match", () => {
  const archived: AddressRecord[] = [
    { kind: "deal", id: "d118", address: "118 Congress St, Buffalo, NY 14213", updatedAt: at(5), archived: true },
    { kind: "property", id: "p400", address: "400 Elmwood Ave, Buffalo, NY 14222", updatedAt: at(4) },
  ];
  assert.deepEqual(suggestAddresses("118 congress", archived), []);
  assert.deepEqual(suggestAddresses("elmwood", archived).map((r) => r.id), ["p400"]);
  const match = findAddressMatch("118 Congress St", "deal", archived);
  assert.equal(match?.id, "d118");
  assert.equal(match?.archived, true);
  // A live record's match carries no flag.
  assert.equal("archived" in (findAddressMatch("400 Elmwood Ave", "property", archived) ?? {}), false);
});

test("an archived twin never hides the live row at its address, and a live match wins within a kind", () => {
  const twins: AddressRecord[] = [
    { kind: "deal", id: "old", address: "118 Congress St, Buffalo, NY 14213", updatedAt: at(9), archived: true },
    { kind: "deal", id: "live", address: "118 Congress Street, Buffalo, NY 14213", updatedAt: at(1) },
  ];
  assert.deepEqual(suggestAddresses("118 congress", twins).map((r) => r.id), ["live"]);
  const match = findAddressMatch("118 Congress St", "deal", twins);
  assert.equal(match?.id, "live");
  assert.equal(match?.archived, undefined);
});

test("runAddresses reads archived rows for the match and drops them from the rows", async () => {
  const row = (id: string, address: string, archivedAt: Date | null) => ({ id, address, updatedAt: new Date(at(3)), archivedAt });
  const archivedDb = {
    property: table([row("pa", "767 Prospect Ave, Buffalo, NY 14213", new Date(at(2)))]),
    deal: table([row("da", "118 Congress St, Buffalo, NY 14213", new Date(at(2)))]),
  } as unknown as AddressDb;
  const deal = await runAddresses(archivedDb, { q: "118 Congress St", kind: "deal" });
  assert.deepEqual(deal.suggestions, []);
  assert.equal(deal.match?.id, "da");
  assert.equal(deal.match?.archived, true);
  const property = await runAddresses(archivedDb, { q: "767 Prospect Ave", kind: "property" });
  assert.deepEqual(property.suggestions, []);
  assert.equal(property.match?.archived, true);
  // The read asks for archivedAt, or every row would read as live.
  const seen: unknown[] = [];
  const spy = { findMany: async (args: unknown) => (seen.push(args), []) };
  await runAddresses({ property: spy, deal: spy } as unknown as AddressDb, { q: "118 Congress", kind: "deal" });
  assert.match(JSON.stringify(seen), /"archivedAt":true/);
});
