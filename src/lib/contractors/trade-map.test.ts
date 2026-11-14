import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { TRADE_MAP, joinTrades, mappedTrade, oldTradeSpellings, splitTrades, tradeKey, tradeName, tradesFromText } from "./trade-map";

test("every spelling in the local import lands on the trade the spec says", () => {
  const cases: [string, string][] = [
    ["Property Cleaning", "Cleaning"],
    ["House Cleaner", "Cleaning"],
    ["Bulk Cleaning", "Cleanouts"],
    ["Trash clean up", "Cleanouts"],
    ["Floor Install only", "Flooring"],
    ["Floor install", "Flooring"],
    ["General", "Handyman"],
    ["Everything", "Handyman"],
    ["Misc.", "Handyman"],
    ["minor HVAC", "HVAC"],
    ["Paint", "Painting"],
    ["Bees", "Pest control"],
    ["Rats", "Pest control"],
    ["Pests", "Pest control"],
    ["Plumber", "Plumbing"],
    ["Exterior Plumbing", "Plumbing"],
    ["Plowing", "Snow removal"],
    ["Snow Shoveling", "Snow removal"],
    ["Tile Install", "Tile"],
    ["Notary", "Notary"],
  ];
  for (const [from, to] of cases) assert.equal(mappedTrade(from), to, from);
  assert.equal(mappedTrade("  paint "), "Painting", "case and spaces don't matter");
  assert.equal(Object.keys(TRADE_MAP).length, 17);
});

test("old text splits on the slash, folds repeats, and keeps what the map doesn't know", () => {
  assert.deepEqual(oldTradeSpellings("Plumber/minor HVAC / Plumbing"), ["Plumber", "minor HVAC", "Plumbing"]);
  assert.deepEqual(oldTradeSpellings("HVAC / HVAC"), ["HVAC"]);
  assert.deepEqual(oldTradeSpellings(null), []);
  assert.deepEqual(tradesFromText("Plumber/minor HVAC / Plumbing"), ["HVAC", "Plumbing"]);
  assert.deepEqual(tradesFromText("Everything / Framing/General/Tile/Drywall/Trim"), ["Drywall", "Framing", "Handyman", "Tile", "Trim"]);
  assert.deepEqual(tradesFromText("roofing / Paint"), ["Painting", "Roofing"], "an unknown spelling becomes its own trade");
});

test("a new trade's name: tidied, first letter capitalized, no commas, 40 at most", () => {
  assert.equal(tradeName("  roofing  "), "Roofing");
  assert.equal(tradeName("HVAC"), "HVAC");
  assert.equal(tradeName("doors,  windows"), "Doors windows");
  assert.equal(tradeName("   "), null);
  assert.equal(tradeName("x".repeat(50))?.length, 40);
  assert.equal(tradeKey("Pest  Control"), tradeKey("pest control"));
});

test("the one-line form sorts A to Z and reads back", () => {
  assert.equal(joinTrades(["Plumbing", "HVAC", "hvac"]), "HVAC, Plumbing");
  assert.deepEqual(splitTrades("Plumbing, HVAC,"), ["HVAC", "Plumbing"]);
  assert.deepEqual(splitTrades(""), []);
});

test("the migration's map is this map", () => {
  const dir = path.join(process.cwd(), "prisma", "migrations", "20261114180000_contractor_trades");
  const sql = fs.readFileSync(path.join(dir, "migration.sql"), "utf8");
  const block = sql.slice(sql.indexOf('INSERT INTO "_trade_map"'), sql.indexOf(";", sql.indexOf('INSERT INTO "_trade_map"')));
  const rows = [...block.matchAll(/\('([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]] as const);
  const fromSql = new Map(rows);
  const fromCode = new Map(Object.entries(TRADE_MAP).flatMap(([t, spellings]) => [[tradeKey(t), t] as const, ...spellings.map((s) => [tradeKey(s), t] as const)]));
  assert.equal(rows.length, fromSql.size, "no spelling twice");
  assert.deepEqual(Object.fromEntries([...fromSql].sort()), Object.fromEntries([...fromCode].sort()));
});
