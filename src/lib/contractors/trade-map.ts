/**
 * Contractor trades as names (docs/specs/contractor-trades.md 3.2): the 17
 * trades the directory started with, the old free-text spellings that fold
 * into each, and the rules a new trade's name follows. Pure; see
 * trade-map.test.ts.
 *
 * Three things read the map: the migration that built the Trade list
 * (prisma/migrations/20261114180000_contractor_trades, whose VALUES the test
 * holds to this table), the prod dry run (scripts/trades-dry-run.ts) and the
 * spreadsheet import (scripts/migrate/02-contractors.ts), which still brings
 * trades in as "Plumbing / HVAC" text.
 */

/** Each trade, and every old spelling that becomes it (matched ignoring case and spacing). */
export const TRADE_MAP: Readonly<Record<string, readonly string[]>> = {
  Cleaning: ["Property Cleaning", "House Cleaner"],
  Cleanouts: ["Bulk Cleaning", "Trash clean up"],
  Demo: ["Demo"],
  Drywall: ["Drywall"],
  Electric: ["Electric"],
  Flooring: ["Flooring", "Floor install", "Floor Install only"],
  Framing: ["Framing"],
  Handyman: ["General", "Everything", "Misc."],
  HVAC: ["HVAC", "minor HVAC"],
  Landscaping: ["Landscaping"],
  Notary: ["Notary"],
  Painting: ["Paint", "Painting"],
  "Pest control": ["Bees", "Rats", "Pests"],
  Plumbing: ["Plumbing", "Plumber", "Exterior Plumbing"],
  "Snow removal": ["Plowing", "Snow Shoveling"],
  Tile: ["Tile", "Tile Install"],
  Trim: ["Trim"],
};

/** The longest trade name. */
export const TRADE_NAME_MAX = 40;

/** How a name is compared: lowercase, single spaces, no commas. "Pest  Control" and "pest control" are one trade. */
export function tradeKey(name: string): string {
  return tidy(name).toLowerCase();
}

/** Commas out (they separate trades on screen), spaces collapsed, ends trimmed, cut to the limit. */
function tidy(raw: string): string {
  return raw.replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, TRADE_NAME_MAX).trim();
}

/**
 * A trade's name as it's stored: tidied, with the first letter capitalized
 * and the rest as typed ("roofing" is "Roofing", "HVAC" stays). Null when
 * nothing is left.
 */
export function tradeName(raw: string): string | null {
  const t = tidy(raw);
  return t ? t[0].toUpperCase() + t.slice(1) : null;
}

const BY_SPELLING = new Map<string, string>(
  Object.entries(TRADE_MAP).flatMap(([trade, spellings]) => [[tradeKey(trade), trade] as const, ...spellings.map((s) => [tradeKey(s), trade] as const)]),
);

/** The trade an old spelling becomes, or null when the map doesn't cover it. */
export function mappedTrade(spelling: string): string | null {
  return BY_SPELLING.get(tradeKey(spelling)) ?? null;
}

/** The pieces of the old free text, once each: "Plumber/minor HVAC / Plumbing" is three. */
export function oldTradeSpellings(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of (text ?? "").split("/")) {
    const t = tidy(piece);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

/**
 * The trades old free text becomes, once each, A to Z: mapped where the map
 * covers a spelling, and otherwise the spelling itself as a trade name, so
 * nothing is lost.
 */
export function tradesFromText(text: string | null | undefined): string[] {
  const names = oldTradeSpellings(text).map((s) => mappedTrade(s) ?? tradeName(s)!);
  return sortTrades(names);
}

/** Names once each (ignoring case, the first spelling kept), A to Z. */
export function sortTrades(names: readonly string[]): string[] {
  const byKey = new Map<string, string>();
  for (const n of names) {
    const k = tradeKey(n);
    if (k && !byKey.has(k)) byKey.set(k, n);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

/** The one-line form: "HVAC, Plumbing". What a phone row, search and the assignee picker show, and what a save sends. */
export function joinTrades(names: readonly string[]): string {
  return sortTrades(names).join(", ");
}

/** The names in a one-line form, as `joinTrades` wrote them. */
export function splitTrades(text: string): string[] {
  return sortTrades(text.split(",").map((t) => t.trim()).filter(Boolean));
}
