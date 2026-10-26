import test from "node:test";
import assert from "node:assert/strict";
import {
  SUGGEST_LIMIT,
  answerAddresses,
  findAddressMatch,
  parseAddressParams,
  runAddresses,
  splitAddress,
  suggestAddresses,
  type AddressDb,
  type AddressRecord,
} from "./address-suggestions";

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

type Row = { id: string; address: string; updatedAt: Date; status?: string };
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
  assert.deepEqual(
    answer.suggestions.map((s) => s.id),
    ["p767"],
  );
  assert.equal(answer.match?.id, "d767");
  assert.equal(answer.match?.stage, "CLOSED!");
  // Typed with a different street word than stored, the house number still finds the building.
  const typedLong = await runAddresses(db, { q: "118 Congress Street", kind: "property" });
  assert.equal(typedLong.match?.id, "p118");
  assert.deepEqual(await runAddresses(db, { q: "76", kind: "deal" }), { suggestions: [], match: null });
  assert.deepEqual(await runAddresses(db, { q: "...", kind: "deal" }), { suggestions: [], match: null });
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
