import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { ConflictError } from "@/lib/action-result";
import { makeClient } from "@/lib/db-client";
import { replaceContactTrades } from "./trade-links";
import { tradeKey } from "./trade-map";
import { TRADE_LINKS, tradeNames } from "./trades";

/**
 * A contractor's trades saved on a real Postgres (docs/specs/contractor-
 * trades.md 4.2): the links replaced in one transaction, a new name added to
 * the list, the refusal when they moved, and a trade left with no one taken
 * off the list. Opt-in like undo-approval.pg.test.ts, by the same guard:
 * `npm test` skips it unless HG_SCRATCH_DATABASE_URL names a local scratch
 * database (its name must contain "scratch") with the migrations applied. It
 * removes what it adds.
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/hg_trades_scratch npx tsx --test src/lib/contractors/trade-links.pg.test.ts
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

let prisma: PrismaClient;
let contactId: string;
/** Names this test makes up, so no other contact has them. */
const tag = randomUUID().slice(0, 8);
const roof = `Roofing ${tag}`;
const gutter = `Gutters ${tag}`;

const tradesOf = async (id: string) =>
  tradeNames((await prisma.contact.findUniqueOrThrow({ where: { id }, select: { tradeLinks: TRADE_LINKS } })).tradeLinks);
const tradeExists = async (name: string) => (await prisma.trade.count({ where: { key: tradeKey(name) } })) > 0;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  contactId = (await prisma.contact.create({ data: { fullName: `Trades Test ${tag}` }, select: { id: true } })).id;
});

after(async () => {
  if (skip) return;
  await prisma.contact.deleteMany({ where: { id: contactId } });
  await prisma.trade.deleteMany({ where: { key: { in: [tradeKey(roof), tradeKey(gutter)] }, contacts: { none: {} } } });
  await prisma.$disconnect();
});

test("a save sets the trades, adding a name the list doesn't have, matched ignoring case", { skip }, async () => {
  await replaceContactTrades(prisma, contactId, ["plumbing", roof.toLowerCase()], []);
  assert.deepEqual(await tradesOf(contactId), ["Plumbing", roof].sort((a, b) => a.localeCompare(b)));
  assert.equal(await prisma.trade.count({ where: { key: tradeKey("Plumbing") } }), 1, "plumbing is the Plumbing that was there");
});

test("a save made after someone else's is refused, saying what they are now", { skip }, async () => {
  await assert.rejects(
    replaceContactTrades(prisma, contactId, ["HVAC"], ["Plumbing"]),
    (e: unknown) => e instanceof ConflictError && e.theirs?.trades === [roof, "Plumbing"].sort((a, b) => a.localeCompare(b)).join(", "),
  );
  assert.deepEqual((await tradesOf(contactId)).length, 2, "nothing written");
});

test("a trade left with no one comes off the list, and Undo brings it back", { skip }, async () => {
  const now = await tradesOf(contactId);
  await replaceContactTrades(prisma, contactId, ["Plumbing", gutter], now);
  assert.equal(await tradeExists(roof), false, "only this contractor had it");
  assert.equal(await tradeExists("Plumbing"), true, "others still do Plumbing");
  // Undo: back to what it was, expecting what it is now.
  await replaceContactTrades(prisma, contactId, now, await tradesOf(contactId));
  assert.deepEqual(await tradesOf(contactId), now);
  assert.equal(await tradeExists(roof), true);
  assert.equal(await tradeExists(gutter), false);
});

test("the same set again writes nothing new; none clears them", { skip }, async () => {
  const now = await tradesOf(contactId);
  await replaceContactTrades(prisma, contactId, now, now);
  assert.deepEqual(await tradesOf(contactId), now);
  await replaceContactTrades(prisma, contactId, [], now);
  assert.deepEqual(await tradesOf(contactId), []);
});
