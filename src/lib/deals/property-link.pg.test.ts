import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { scratchRows } from "@/lib/scratch-rows";
import { linkClosedDeal, linkProperty } from "./property-link";

/**
 * The automatic deal-to-property link on a real Postgres through the app's
 * driver (db-client.ts makeClient), which the fake transaction in
 * property-link.test.ts can't show: the case-insensitive address filter,
 * the unique `convertedPropertyId`, and two links racing for one pair.
 * Opt-in like job-batch.pg.test.ts, by the same guard: `npm test` skips it
 * unless HG_SCRATCH_DATABASE_URL names a local scratch database (its name
 * must contain "scratch"); it writes rows there and deletes them when it finishes
 * (scratch-rows.ts).
 *
 *   createdb -h localhost hg_link_scratch
 *   DATABASE_URL=postgresql://<you>@localhost:5432/hg_link_scratch npx prisma migrate deploy
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_link_scratch npx tsx --test src/lib/deals/property-link.pg.test.ts
 *   dropdb -h localhost hg_link_scratch
 */

const URL_ENV = process.env.HG_SCRATCH_DATABASE_URL ?? "";

/** A database on this machine whose name says scratch, parsed whole (job-batch.pg.test.ts's rule). */
function isLocalScratch(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "postgresql:" &&
    url.username !== "" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    (url.port === "" || url.port === "5432") &&
    /^\/[a-z0-9_]*scratch[a-z0-9_]*$/.test(url.pathname) &&
    url.search === "" &&
    url.hash === ""
  );
}
const skip = isLocalScratch(URL_ENV) ? false : "set HG_SCRATCH_DATABASE_URL to a local scratch database to run this";
const timeout = 30_000;

let prisma: PrismaClient;
/** What this run makes, deleted when it finishes so the scratch database stays as it was (scratch-rows.ts). */
const made = scratchRows(() => prisma);
let connor: { id: string };
let pieter: { id: string };
const run = randomUUID().replace(/-/g, "").slice(0, 8);
let streets = 0;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  await made.takeTurn(URL_ENV);
  connor = await made.user({ email: `connor-${run}@example.test`, name: "Connor", passwordHash: "scrypt$x" });
  pieter = await made.user({ email: `pieter-${run}@example.test`, name: "Pieter", passwordHash: "scrypt$x" });
});

after(async () => {
  if (skip) return;
  await made.remove();
  await prisma.$disconnect();
});

/** A street no other test (or run) uses, so each case sees only its own rows: "Zq3f9a1c2b7 St". */
const street = () => `Zq${run}${++streets}`;

const closedDeal = (address: string, data: { status?: string; archivedAt?: Date } = {}) =>
  made.deal({ address, status: "CLOSED!", updatedByUserId: pieter.id, ...data });
const property = (address: string, data: { archivedAt?: Date } = {}) => made.property({ address, ...data });

const linkOf = async (dealId: string) => (await prisma.deal.findUniqueOrThrow({ where: { id: dealId }, select: { convertedPropertyId: true } })).convertedPropertyId;
const linesOf = (dealId: string) => prisma.dealNote.findMany({ where: { dealId }, select: { body: true, source: true, authorUserId: true, data: true } });

test("a deal that moved to Closed links to its one property, and a second run changes nothing", { skip, timeout }, async () => {
  const s = street();
  // Typed two ways, as the import and the app each store them.
  const deal = await closedDeal(`118 ${s} Street   Buffalo ,  NY   14213`);
  const prop = await property(`118 ${s} St. Buffalo, NY 14213`);
  const stamped = await prisma.property.findUniqueOrThrow({ where: { id: prop.id }, select: { updatedAt: true } });

  const linked = await prisma.$transaction((tx) => linkClosedDeal(tx, deal.id, connor));
  assert.deepEqual(linked, { dealId: deal.id, propertyId: prop.id, line: `Linked to 118 ${s} St.` });
  const row = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
  assert.equal(row.convertedPropertyId, prop.id);
  assert.equal(row.updatedByUserId, connor.id, "the last editor is who triggered it");
  assert.deepEqual(await linesOf(deal.id), [{ body: `Linked to 118 ${s} St.`, source: "change", authorUserId: connor.id, data: { event: "linked", propertyId: prop.id } }]);
  // The property's row is not written, so its open sheets keep their version.
  assert.equal((await prisma.property.findUniqueOrThrow({ where: { id: prop.id } })).updatedAt.getTime(), stamped.updatedAt.getTime());

  // Again from the deal, and from the property: nothing changes and no second line.
  assert.equal(await prisma.$transaction((tx) => linkClosedDeal(tx, deal.id, pieter)), null);
  assert.equal(await prisma.$transaction((tx) => linkProperty(tx, prop.id, pieter)), null);
  const again = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
  assert.equal(again.convertedPropertyId, prop.id);
  assert.equal(again.updatedByUserId, connor.id);
  assert.equal(again.updatedAt.getTime(), row.updatedAt.getTime());
  assert.equal((await linesOf(deal.id)).length, 1, "the history line is written once");
});

test("a property just added links to its one Closed deal", { skip, timeout }, async () => {
  const s = street();
  const deal = await closedDeal(`1067 ${s} St Buffalo, NY 14207 (with Josh, flip)`);
  const prop = await property(`1067 ${s} St, Buffalo, NY 14207`);
  assert.deepEqual(await prisma.$transaction((tx) => linkProperty(tx, prop.id, connor)), { dealId: deal.id, propertyId: prop.id, line: `Linked to 1067 ${s} St` });
  assert.equal(await linkOf(deal.id), prop.id);
  assert.equal((await linesOf(deal.id)).length, 1);
});

test("two candidates link to none: two Closed deals on the building, or two properties", { skip, timeout }, async () => {
  const a = street();
  const first = await closedDeal(`45 ${a} Street Buffalo, NY 14201`);
  const second = await closedDeal(`45 ${a} St, Buffalo NY 14201 (second closing)`);
  const prop = await property(`45 ${a} St, Buffalo, NY 14201`);
  assert.equal(await prisma.$transaction((tx) => linkClosedDeal(tx, first.id, connor)), null);
  assert.equal(await prisma.$transaction((tx) => linkClosedDeal(tx, second.id, connor)), null);
  assert.equal(await prisma.$transaction((tx) => linkProperty(tx, prop.id, connor)), null);
  assert.equal(await linkOf(first.id), null);
  assert.equal(await linkOf(second.id), null);

  const b = street();
  const deal = await closedDeal(`46 ${b} St, Buffalo, NY 14201`);
  const one = await property(`46 ${b} St, Buffalo, NY 14201`);
  await property(`46 ${b} Street Buffalo NY`);
  assert.equal(await prisma.$transaction((tx) => linkClosedDeal(tx, deal.id, connor)), null);
  assert.equal(await prisma.$transaction((tx) => linkProperty(tx, one.id, connor)), null);
  assert.equal(await linkOf(deal.id), null);
  assert.equal((await linesOf(deal.id)).length, 0);
});

test("an archived deal or property does not link, and does not count as a second candidate", { skip, timeout }, async () => {
  const a = street();
  const archivedDeal = await closedDeal(`12 ${a} St, Buffalo, NY 14201`, { archivedAt: new Date() });
  const prop = await property(`12 ${a} St, Buffalo, NY 14201`);
  assert.equal(await prisma.$transaction((tx) => linkClosedDeal(tx, archivedDeal.id, connor)), null);
  assert.equal(await prisma.$transaction((tx) => linkProperty(tx, prop.id, connor)), null);
  assert.equal(await linkOf(archivedDeal.id), null);

  const b = street();
  const deal = await closedDeal(`13 ${b} St, Buffalo, NY 14201`);
  const archivedProp = await property(`13 ${b} St, Buffalo, NY 14201`, { archivedAt: new Date() });
  assert.equal(await prisma.$transaction((tx) => linkClosedDeal(tx, deal.id, connor)), null);
  assert.equal(await prisma.$transaction((tx) => linkProperty(tx, archivedProp.id, connor)), null);
  assert.equal(await linkOf(deal.id), null);

  // A live pair links past an archived deal and an archived property at the same address.
  const live = await property(`13 ${b} Street Buffalo, NY 14201`);
  await closedDeal(`13 ${b} St Buffalo NY 14201 (old)`, { archivedAt: new Date() });
  assert.deepEqual(await prisma.$transaction((tx) => linkClosedDeal(tx, deal.id, connor)), { dealId: deal.id, propertyId: live.id, line: `Linked to 13 ${b} Street` });
  assert.equal((await linesOf(archivedDeal.id)).length, 0);
});

test("a deal that is not Closed does not link, until it is", { skip, timeout }, async () => {
  const s = street();
  const deal = await closedDeal(`77 ${s} Ave, Buffalo, NY 14209`, { status: "6 - Holding" });
  const prop = await property(`77 ${s} Avenue, Buffalo, NY 14209`);
  assert.equal(await prisma.$transaction((tx) => linkClosedDeal(tx, deal.id, connor)), null);
  assert.equal(await prisma.$transaction((tx) => linkProperty(tx, prop.id, connor)), null);
  assert.equal(await linkOf(deal.id), null);
  assert.equal((await linesOf(deal.id)).length, 0);
  await prisma.deal.update({ where: { id: deal.id }, data: { status: "CLOSED!" } });
  assert.ok(await prisma.$transaction((tx) => linkClosedDeal(tx, deal.id, connor)));
  assert.equal(await linkOf(deal.id), prop.id);
  // The link stays when the stage moves back, and moving to Closed again adds nothing.
  await prisma.deal.update({ where: { id: deal.id }, data: { status: "6 - Holding" } });
  await prisma.deal.update({ where: { id: deal.id }, data: { status: "CLOSED!" } });
  assert.equal(await prisma.$transaction((tx) => linkClosedDeal(tx, deal.id, connor)), null);
  assert.equal((await linesOf(deal.id)).length, 1);
});

test("a property another deal already points at is left alone, so the unique link is never hit", { skip, timeout }, async () => {
  const s = street();
  const prop = await property(`90 ${s} St, Buffalo, NY 14213`);
  // Linked, then moved out of Closed: no longer a candidate, still the property's deal.
  const old = await made.deal({ address: `90 ${s} St (first try)`, status: "Pass", convertedPropertyId: prop.id });
  const deal = await closedDeal(`90 ${s} Street, Buffalo, NY 14213`);
  assert.equal(await prisma.$transaction((tx) => linkClosedDeal(tx, deal.id, connor)), null);
  assert.equal(await prisma.$transaction((tx) => linkProperty(tx, prop.id, connor)), null);
  assert.equal(await linkOf(deal.id), null);
  assert.equal(await linkOf(old.id), prop.id);
});

test("an address the duplicate check reads as another town does not link", { skip, timeout }, async () => {
  const s = street();
  const deal = await closedDeal(`118 ${s} Street  UNDER CONTRACT`);
  const prop = await property(`118 ${s} St. Buffalo, NY 14213`);
  assert.equal(await prisma.$transaction((tx) => linkClosedDeal(tx, deal.id, connor)), null);
  assert.equal(await prisma.$transaction((tx) => linkProperty(tx, prop.id, connor)), null);
  assert.equal(await linkOf(deal.id), null);
});

test("the stage change and the new property racing for one pair write one link and one line", { skip, timeout }, async () => {
  for (let i = 0; i < 5; i++) {
    const s = street();
    const deal = await closedDeal(`200 ${s} St, Buffalo, NY 14213`);
    const prop = await property(`200 ${s} St, Buffalo, NY 14213`);
    const results = await Promise.allSettled([
      prisma.$transaction((tx) => linkClosedDeal(tx, deal.id, connor)),
      prisma.$transaction((tx) => linkProperty(tx, prop.id, pieter)),
    ]);
    for (const r of results) assert.equal(r.status, "fulfilled", r.status === "rejected" ? String(r.reason) : "");
    const written = results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
    assert.equal(written.length, 1, "exactly one of the two wrote it");
    assert.equal(await linkOf(deal.id), prop.id);
    assert.equal((await linesOf(deal.id)).length, 1);
  }
});
