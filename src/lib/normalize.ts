export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toString()
    .toLowerCase()
    .replace(/\n/g, " ")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\broad\b/g, "rd")
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function shortAddress(a: string | null | undefined): string {
  if (!a) return "";
  return a.split(",")[0].replace(/\s+(buffalo|ny|new york)\b.*/i, "").trim();
}

/**
 * Leading "<number> <street-word>" token, for fuzzy matching where the full
 * address isn't available — e.g. a QuickBooks class name "HGC 725 Linwood" and a
 * Property.address "725 Linwood Avenue, Buffalo, NY 14209" both reduce to
 * "725 linwood". Combined addresses ("765/767 Prospect") keep the first number.
 */
export function addressKey(raw: string | null | undefined): string {
  const n = normalizeAddress(raw);
  const m = n.match(/^(\d+[a-z]?(?:\/\d+)?)\s+([a-z]+)/);
  return m ? `${m[1].split("/")[0]} ${m[2]}` : n.split(" ").slice(0, 2).join(" ");
}

const DIRECTIONS = ["north", "south", "east", "west"];
/** "w" or "west" is "west"; anything else is undefined. */
const direction = (t: string | undefined) => DIRECTIONS.find((d) => t === d || t === d[0]);

// Street-type words as they read after normalizeAddress, which already turns
// avenue, street, drive and road into ave, st, dr and rd.
const STREET_TYPES = new Set([
  "ave", "av", "st", "dr", "rd", "blvd", "boulevard", "pkwy", "parkway", "pky",
  "pl", "place", "ct", "court", "ln", "lane", "ter", "terrace", "way", "cir",
  "circle", "hwy", "highway", "sq", "square", "trl", "trail", "aly", "alley", "row", "expy",
]);

/**
 * House number, direction and street name, for catching one building typed
 * two ways: "352 Auburn Avenue Buffalo , NY 14213" and "352 Auburn Ave
 * Buffalo 14213" are both "352 auburn", and "421 West Delavan" is "421 w
 * delavan", so it never meets 421 E Delavan. The name runs up to the street
 * type ("1500 niagara falls" for Niagara Falls Blvd), or is the first word
 * when there's no street type. Combined numbers keep the first. An address
 * that doesn't start with a number keys as its whole normalized self.
 */
export function streetKey(raw: string | null | undefined): string {
  const n = normalizeAddress(raw);
  const tokens = n.split(" ");
  const num = tokens[0].match(/^(\d+[a-z]?)(?:[/-]\d+[a-z]?)?$/);
  if (!num) return n;
  let i = 1;
  let dir = "";
  // "West" is a direction in "West Delavan Ave" and the name in "West Ave".
  const lead = direction(tokens[1]);
  if (lead && tokens[2] && !STREET_TYPES.has(tokens[2])) {
    dir = lead[0];
    i = 2;
  }
  if (!tokens[i]) return n;
  const name = [direction(tokens[i]) ?? tokens[i]];
  const end = tokens.findIndex((t, j) => j > i && STREET_TYPES.has(t));
  if (end > 0) name.push(...tokens.slice(i + 1, end));
  return [num[1], dir, ...name].filter(Boolean).join(" ");
}

/** The ZIP code, when one follows the house number. */
function zipCode(raw: string | null | undefined): string | null {
  const tokens = normalizeAddress(raw).split(" ");
  for (let j = tokens.length - 1; j > 0; j--) {
    const m = tokens[j].match(/^(\d{5})(?:-\d{4})?$/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Whether two typed addresses are the same building: the same streetKey and
 * not two different ZIP codes. "Avenue" or "Ave", punctuation, and a missing
 * city, state or ZIP don't matter.
 */
export function sameStreetAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = streetKey(a);
  if (!key || key !== streetKey(b)) return false;
  const za = zipCode(a);
  const zb = zipCode(b);
  return !za || !zb || za === zb;
}
