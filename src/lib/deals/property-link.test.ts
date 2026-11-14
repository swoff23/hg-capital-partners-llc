import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDealLog } from "./record-log";
import {
  CLOSED_STAGE,
  closedDealLink,
  linkClosedDeal,
  linkProperty,
  linkedLine,
  propertyLink,
  type LinkDeal,
  type LinkProperty,
  type LinkTx,
} from "./property-link";

/**
 * The automatic link from a Closed deal to its property: the rule with no
 * database, the writes on a fake transaction, and where the services and the
 * two pages call it (read from the source, as page-wiring.test.ts does).
 * property-link.pg.test.ts runs the same cases on a real Postgres.
 */

const deal = (id: string, address: string, convertedPropertyId: string | null = null): LinkDeal => ({ id, address, convertedPropertyId });
const property = (id: string, address: string): LinkProperty => ({ id, address });
const NONE: ReadonlySet<string> = new Set();

/* ---------------- The rule ---------------- */

test("one Closed deal and one property at the address link, however each was typed", () => {
  const d = deal("d1", "58 Mariner Street Buffalo, NY 14201 (buying with Brandon)");
  const p = property("p1", "58 Mariner Street, Buffalo, NY 14201");
  assert.deepEqual(closedDealLink(d, [d], [p], NONE), { deal: d, property: p });
  assert.deepEqual(propertyLink(p, [d], [p], NONE), { deal: d, property: p });
  // "Avenue" or "Ave.", spacing and a missing comma don't count against, as in the duplicate check.
  const d2 = deal("d2", "933 Lafayette Avenue   Buffalo ,  NY   14209");
  const p2 = property("p2", "933 Lafayette Ave. Buffalo, NY 14209");
  assert.deepEqual(closedDealLink(d2, [d, d2], [p, p2], NONE), { deal: d2, property: p2 });
  assert.deepEqual(propertyLink(p2, [d, d2], [p, p2], NONE), { deal: d2, property: p2 });
});

test("no property at the address links to none, and so does one the duplicate check reads as another building", () => {
  const d = deal("d1", "1067 Tonawanda St Buffalo, NY 14207 (with Josh, flip)");
  assert.equal(closedDealLink(d, [d], [property("p1", "58 Mariner Street, Buffalo, NY 14201")], NONE), "none");
  assert.equal(propertyLink(property("p1", "58 Mariner Street, Buffalo, NY 14201"), [d], [], NONE), "none");
  // Words typed after the street read as a town that isn't Buffalo, so the app is not sure and does nothing.
  const under = deal("d2", "118 Congress Street  UNDER CONTRACT");
  const congress = property("p2", "118 Congress St. Buffalo, NY 14213");
  assert.equal(closedDealLink(under, [under], [congress], NONE), "none");
  assert.equal(propertyLink(congress, [under], [congress], NONE), "none");
  // The street type and the ZIP disagree.
  assert.equal(closedDealLink(deal("d3", "12 Main St, Buffalo, NY 14201"), [], [property("p3", "12 Main Ave, Buffalo, NY 14201")], NONE), "none");
  assert.equal(closedDealLink(deal("d4", "12 Main St, Buffalo, NY 14201"), [], [property("p4", "12 Main St, Buffalo, NY 14213")], NONE), "none");
});

test("two candidates on either side link to none", () => {
  const p = property("p1", "45 Elm St, Buffalo, NY 14201");
  const a = deal("d1", "45 Elm Street Buffalo, NY 14201");
  const b = deal("d2", "45 Elm St, Buffalo NY 14201 (second closing)");
  // Two Closed deals on one building.
  assert.equal(closedDealLink(a, [a, b], [p], NONE), "several");
  assert.equal(closedDealLink(b, [a, b], [p], NONE), "several");
  assert.equal(propertyLink(p, [a, b], [p], NONE), "several");
  // Two properties on one deal's address.
  const q = property("p2", "45 Elm St Buffalo NY");
  assert.equal(closedDealLink(a, [a], [p, q], NONE), "several");
  assert.equal(propertyLink(p, [a], [p, q], NONE), "several");
});

test("the match has to hold from both sides, because the test isn't transitive", () => {
  // "12 Main" names no street type, so it is the same building as both "12 Main St" and "12 Main Ave".
  const p = property("p1", "12 Main, Buffalo, NY");
  const st = deal("d1", "12 Main St, Buffalo, NY");
  const ave = deal("d2", "12 Main Ave, Buffalo, NY");
  // From the St deal alone the property is its one match; the property has two deals.
  assert.equal(closedDealLink(st, [st, ave], [p], NONE), "several");
  assert.equal(propertyLink(p, [st, ave], [p], NONE), "several");
  // And a property that has one deal, whose deal has two properties.
  const bare = deal("d3", "30 Oak, Buffalo, NY");
  const oakSt = property("p2", "30 Oak St, Buffalo, NY");
  const oakAve = property("p3", "30 Oak Ave, Buffalo, NY");
  assert.equal(propertyLink(oakSt, [bare], [oakSt, oakAve], NONE), "several");
});

test("a deal or a property that is already linked is left alone", () => {
  const p = property("p1", "767 Prospect Avenue, Buffalo, NY 14213");
  const linked = deal("d1", "767 Prospect Avenue, Buffalo, NY 14213", "p1");
  assert.equal(closedDealLink(linked, [linked], [p], new Set(["p1"])), "linked");
  assert.equal(propertyLink(p, [linked], [p], new Set(["p1"])), "linked");
  // The property is taken by a deal that is no longer Closed (or is archived), so it isn't among the candidates.
  const fresh = deal("d2", "767 Prospect Ave Buffalo NY 14213");
  assert.equal(closedDealLink(fresh, [fresh], [p], new Set(["p1"])), "linked");
});

test("the history line carries the short address", () => {
  assert.equal(linkedLine("118 Congress St. Buffalo, NY 14213"), "Linked to 118 Congress St.");
  assert.equal(linkedLine("767 Prospect Avenue, Buffalo, NY 14213"), "Linked to 767 Prospect Avenue");
  assert.equal(linkedLine("1067 Tonawanda St, Buffalo, NY 14207"), "Linked to 1067 Tonawanda St");
});

test("the log draws it as a line by whoever triggered it, never as a field change", () => {
  const at = new Date("2026-11-14T15:00:00Z");
  const [entry] = buildDealLog([
    { id: "n1", source: "change", body: linkedLine("118 Congress St. Buffalo, NY 14213"), noteDate: at, createdAt: at, authorUserId: "u1", authorName: "Connor Swofford", editedAt: null, data: { event: "linked", propertyId: "p1" } },
  ]);
  assert.deepEqual(entry, { type: "line", id: "n1", day: "2026-11-14", at: at.toISOString(), by: "Connor", text: "Linked to 118 Congress St." });
});

/* ---------------- The writes, on a fake transaction ---------------- */

type Row = Record<string, unknown>;
type Call = [model: string, op: string, args: unknown];

/** Whether a row passes the parts of a Prisma `where` the link uses. */
function passes(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, want]) => {
    const have = row[key] ?? null;
    if (want !== null && typeof want === "object") {
      const w = want as { contains?: string; in?: unknown[] };
      if (typeof w.contains === "string") return String(have).toLowerCase().includes(w.contains.toLowerCase());
      if (Array.isArray(w.in)) return w.in.includes(have);
      throw new Error(`fakeTx: unknown filter on ${key}`);
    }
    return have === want;
  });
}

function fakeTx(rows: { deal: Row[]; property: Row[] }) {
  const calls: Call[] = [];
  const tables: Record<string, Row[]> = { deal: rows.deal, property: rows.property, dealNote: [] };
  const model = (name: string) => ({
    async findUnique(args: { where: Row }) {
      return tables[name].find((r) => r.id === args.where.id) ?? null;
    },
    async findMany(args: { where: Row }) {
      return tables[name].filter((r) => passes(r, args.where));
    },
    async updateMany(args: { where: Row; data: Row }) {
      calls.push([name, "updateMany", args]);
      const hit = tables[name].filter((r) => passes(r, args.where));
      for (const r of hit) Object.assign(r, args.data);
      return { count: hit.length };
    },
    async create(args: { data: Row }) {
      calls.push([name, "create", args]);
      tables[name].push(args.data);
      return args.data;
    },
  });
  const tx = { deal: model("deal"), property: model("property"), dealNote: model("dealNote") };
  return { tx: tx as unknown as LinkTx, calls, tables };
}

const NOW = new Date("2026-11-14T15:00:00Z");
const BY = { id: "u-connor" };
const dealRow = (id: string, address: string, extra: Row = {}): Row => ({ id, address, status: CLOSED_STAGE, archivedAt: null, convertedPropertyId: null, ...extra });
const propertyRow = (id: string, address: string, extra: Row = {}): Row => ({ id, address, archivedAt: null, ...extra });

test("a deal that moved to Closed links to its one property, stamped and logged once", async () => {
  const { tx, calls, tables } = fakeTx({
    deal: [dealRow("d1", "58 Mariner Street Buffalo, NY 14201 (buying with Brandon)"), dealRow("d9", "58 Maple St, Buffalo, NY 14201")],
    property: [propertyRow("p1", "58 Mariner Street, Buffalo, NY 14201"), propertyRow("p9", "158 Mariner Street, Buffalo, NY 14201")],
  });
  assert.deepEqual(await linkClosedDeal(tx, "d1", BY, NOW), { dealId: "d1", propertyId: "p1", line: "Linked to 58 Mariner Street" });
  assert.equal(tables.deal[0].convertedPropertyId, "p1");
  assert.equal(tables.deal[0].updatedByUserId, "u-connor");
  // Only a deal still Closed, live and unlinked is written.
  assert.deepEqual((calls[0][2] as { where: Row }).where, { id: "d1", status: "CLOSED!", archivedAt: null, convertedPropertyId: null });
  assert.deepEqual(tables.dealNote, [
    { dealId: "d1", body: "Linked to 58 Mariner Street", noteDate: NOW, source: "change", authorUserId: "u-connor", data: { event: "linked", propertyId: "p1" } },
  ]);
  // A second run, from either side, changes nothing and adds no second line.
  assert.equal(await linkClosedDeal(tx, "d1", BY, NOW), null);
  assert.equal(await linkProperty(tx, "p1", BY, NOW), null);
  assert.equal(tables.dealNote.length, 1);
  assert.equal(calls.filter(([m, op]) => m === "deal" && op === "updateMany").length, 1);
});

test("a link write that changed no row (a lost race) adds no history line", async () => {
  const { tx, tables } = fakeTx({
    deal: [dealRow("d1", "58 Mariner Street Buffalo, NY 14201")],
    property: [propertyRow("p1", "58 Mariner Street, Buffalo, NY 14201")],
  });
  (tx as unknown as { deal: { updateMany: () => Promise<{ count: number }> } }).deal.updateMany = async () => ({ count: 0 });
  assert.equal(await linkClosedDeal(tx, "d1", BY, NOW), null);
  assert.deepEqual(tables.dealNote, []);
});

test("a deal already linked to another property is never offered a second link", () => {
  const d = deal("d1", "767 Prospect Ave Buffalo NY 14213", "p-other");
  assert.equal(closedDealLink(d, [d], [property("p1", "767 Prospect Avenue, Buffalo, NY 14213")], NONE), "linked");
});

test("a property just added links to its one Closed deal", async () => {
  const { tx, tables } = fakeTx({
    deal: [dealRow("d1", "1067 Tonawanda St Buffalo, NY 14207 (with Josh, flip)")],
    property: [propertyRow("p1", "1067 Tonawanda St, Buffalo, NY 14207")],
  });
  assert.deepEqual(await linkProperty(tx, "p1", BY, NOW), { dealId: "d1", propertyId: "p1", line: "Linked to 1067 Tonawanda St" });
  assert.equal(tables.deal[0].convertedPropertyId, "p1");
  assert.equal(tables.dealNote.length, 1);
});

test("nothing links a deal that isn't Closed, an archived record, two candidates or no match", async () => {
  const cases: { name: string; deal: Row[]; property: Row[] }[] = [
    { name: "not Closed", deal: [dealRow("d1", "58 Mariner St, Buffalo, NY", { status: "6 - Holding" })], property: [propertyRow("p1", "58 Mariner St, Buffalo, NY")] },
    { name: "archived deal", deal: [dealRow("d1", "58 Mariner St, Buffalo, NY", { archivedAt: NOW })], property: [propertyRow("p1", "58 Mariner St, Buffalo, NY")] },
    { name: "archived property", deal: [dealRow("d1", "58 Mariner St, Buffalo, NY")], property: [propertyRow("p1", "58 Mariner St, Buffalo, NY", { archivedAt: NOW })] },
    { name: "two Closed deals", deal: [dealRow("d1", "58 Mariner St, Buffalo, NY"), dealRow("d2", "58 Mariner Street Buffalo NY")], property: [propertyRow("p1", "58 Mariner St, Buffalo, NY")] },
    { name: "two properties", deal: [dealRow("d1", "58 Mariner St, Buffalo, NY")], property: [propertyRow("p1", "58 Mariner St, Buffalo, NY"), propertyRow("p2", "58 Mariner Street Buffalo")] },
    { name: "no match", deal: [dealRow("d1", "58 Mariner St, Buffalo, NY")], property: [propertyRow("p1", "60 Mariner St, Buffalo, NY")] },
    { name: "property taken by a deal that left Closed", deal: [dealRow("d1", "58 Mariner St, Buffalo, NY"), dealRow("d0", "9 Other St", { status: "Pass", convertedPropertyId: "p1" })], property: [propertyRow("p1", "58 Mariner St, Buffalo, NY")] },
  ];
  for (const c of cases) {
    const { tx, calls, tables } = fakeTx({ deal: c.deal, property: c.property });
    assert.equal(await linkClosedDeal(tx, "d1", BY, NOW), null, c.name);
    assert.equal(await linkProperty(tx, "p1", BY, NOW), null, c.name);
    assert.equal(tables.deal[0].convertedPropertyId, null, c.name);
    assert.deepEqual(calls, [], `${c.name}: nothing written`);
  }
});

test("an archived record doesn't count as a second candidate either", async () => {
  const { tx, tables } = fakeTx({
    deal: [dealRow("d1", "58 Mariner St, Buffalo, NY"), dealRow("d2", "58 Mariner Street Buffalo NY", { archivedAt: NOW })],
    property: [propertyRow("p1", "58 Mariner St, Buffalo, NY"), propertyRow("p2", "58 Mariner Street Buffalo", { archivedAt: NOW })],
  });
  assert.deepEqual(await linkClosedDeal(tx, "d1", BY, NOW), { dealId: "d1", propertyId: "p1", line: "Linked to 58 Mariner St" });
  assert.equal(tables.deal[1].convertedPropertyId, null);
});

test("with nobody signed in the line has no author and the last editor stays", async () => {
  const { tx, tables } = fakeTx({ deal: [dealRow("d1", "58 Mariner St, Buffalo, NY", { updatedByUserId: "u-pieter" })], property: [propertyRow("p1", "58 Mariner St, Buffalo, NY")] });
  assert.ok(await linkProperty(tx, "p1", null, NOW));
  assert.equal(tables.deal[0].updatedByUserId, "u-pieter");
  assert.equal(tables.dealNote[0].authorUserId, null);
});

/* ---------------- Where it runs, and what the pages print ---------------- */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the link runs when a deal moves to Closed and when a property is added, and never fails the save", () => {
  const deals = read("./service.ts");
  // After the stage is saved and logged, only on the move into Closed.
  assert.match(deals, /await recordDealChanges\(id, actor, before, data\);\s*if \(data\.status === CLOSED_STAGE && before\.status !== CLOSED_STAGE\) await linkToProperty\(id, actor\);/);
  assert.match(deals, /try \{\s*const linked = await prisma\.\$transaction\(\(tx\) => linkClosedDeal\(tx, id, actor\)\);[\s\S]*?\} catch \(err\) \{\s*logError\("deals:link-property", err, \{ dealId: id \}\);/);
  const properties = read("../properties/service.ts");
  assert.match(properties, /const property = await prisma\.property\.create\(\{[\s\S]*?\}\);\s*await linkToDeal\(property\.id, by\);/);
  assert.match(properties, /try \{\s*const linked = await prisma\.\$transaction\(\(tx\) => linkProperty\(tx, id, by\)\);[\s\S]*?\} catch \(err\) \{\s*logError\("properties:link-deal", err, \{ propertyId: id \}\);/);
  // The link is the app's to write: the edit schema still refuses it (fields.test.ts), and nothing else sets it.
  for (const src of [deals, properties]) assert.ok(!/convertedPropertyId/.test(src));
});

test("both pages print the short address, so each line holds one line on a phone", () => {
  const dealPage = read("../../app/(app)/deals/[id]/page.tsx");
  assert.match(dealPage, /Converted to\{" "\}\s*<TextLink href=\{`\/properties\/\$\{deal\.convertedProperty\.id\}`\}>\{shortAddress\(deal\.convertedProperty\.address\) \|\| deal\.convertedProperty\.address\}<\/TextLink>/);
  const propertyPage = read("../../app/(app)/properties/[id]/page.tsx");
  assert.match(propertyPage, /From deal <TextLink href=\{`\/deals\/\$\{sourceDeal\.id\}`\}>\{shortAddress\(sourceDeal\.address\) \|\| sourceDeal\.address\}<\/TextLink>/);
});
