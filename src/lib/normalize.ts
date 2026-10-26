/** Street words and the short form normalizeAddress writes them as. */
export const STREET_WORDS = [
  ["avenue", "ave"],
  ["street", "st"],
  ["drive", "dr"],
  ["road", "rd"],
] as const;

export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.toString().toLowerCase().replace(/\n/g, " ");
  for (const [long, short] of STREET_WORDS) s = s.replace(new RegExp(`\\b${long}\\b`, "g"), short);
  return s
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

// Street-type words as they read after normalizeAddress (which already turns
// avenue, street, drive and road into ave, st, dr and rd), each mapped to one
// spelling so "Parkway" and "Pkwy" agree.
const STREET_TYPES = new Map<string, string>([
  ["ave", "ave"], ["av", "ave"], ["st", "st"], ["dr", "dr"], ["rd", "rd"],
  ["blvd", "blvd"], ["boulevard", "blvd"], ["pkwy", "pkwy"], ["parkway", "pkwy"], ["pky", "pkwy"],
  ["pl", "pl"], ["place", "pl"], ["ct", "ct"], ["court", "ct"], ["ln", "ln"], ["lane", "ln"],
  ["ter", "ter"], ["terrace", "ter"], ["way", "way"], ["cir", "cir"], ["circle", "cir"],
  ["hwy", "hwy"], ["highway", "hwy"], ["sq", "sq"], ["square", "sq"], ["trl", "trl"], ["trail", "trl"],
  ["aly", "aly"], ["alley", "aly"], ["row", "row"], ["expy", "expy"],
]);

// Unit words that take an identifier after them ("apt 2", "unit b"), and ones
// that stand alone ("upper"). Neither is part of the town.
const UNIT_WORDS = new Set(["apt", "apartment", "unit", "ste", "suite", "fl", "floor", "rm", "room", "bldg", "building"]);
const UNIT_SPOTS = new Set(["upper", "lower", "upr", "lwr", "rear", "front", "basement"]);

/** The town words left over after the street: no units, numbers, state or ZIP. */
function townName(words: string[]): string | null {
  const kept: string[] = [];
  for (let j = 0; j < words.length; j++) {
    const w = words[j];
    if (UNIT_WORDS.has(w)) {
      j++;
      continue;
    }
    const next = words[j + 1];
    if ((w === "new" && next === "york") || (w === "n" && next === "y")) {
      j++;
      continue;
    }
    if (/\d/.test(w) || UNIT_SPOTS.has(w) || w === "ny" || w === "usa") continue;
    const d = direction(w);
    if (w.length === 1 && !d) continue;
    kept.push(d ?? w);
  }
  return kept.length ? kept.join(" ") : null;
}

interface StreetParts {
  key: string;
  /** The street type in one spelling, when the address names one. */
  type: string | null;
  /** The town, when the address names one. */
  town: string | null;
}

function streetParts(raw: string | null | undefined): StreetParts {
  const n = normalizeAddress(raw);
  const whole = { key: n, type: null, town: null };
  // Words tagged with the comma-separated part they came from, so a town after
  // a comma reads as a town even when the street has no type.
  const words = (raw ?? "")
    .toString()
    .split(/[,\n]/)
    .flatMap((p, part) => normalizeAddress(p).split(" ").filter(Boolean).map((word) => ({ word, part })));
  const tokens = words.map((w) => w.word);
  const num = tokens[0]?.match(/^(\d+[a-z]?)(?:[/-]\d+[a-z]?)?$/);
  if (!num) return whole;
  let i = 1;
  let dir = "";
  // "West" is a direction in "West Delavan Ave" and the name in "West Ave".
  const lead = direction(tokens[1]);
  if (lead && tokens[2] && !STREET_TYPES.has(tokens[2])) {
    dir = lead[0];
    i = 2;
  }
  if (!tokens[i]) return whole;
  const name = [direction(tokens[i]) ?? tokens[i]];
  const end = tokens.findIndex((t, j) => j > i && STREET_TYPES.has(t));
  if (end > 0) name.push(...tokens.slice(i + 1, end));
  const rest = end > 0 ? words.slice(end + 1) : words.filter((w) => w.part > words[i].part);
  return {
    key: [num[1], dir, ...name].filter(Boolean).join(" "),
    type: end > 0 ? (STREET_TYPES.get(tokens[end]) ?? null) : null,
    town: townName(rest.map((w) => w.word)),
  };
}

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
  return streetParts(raw).key;
}

const streetCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Street name (with any direction after it), house number and its letter, for compareStreet. */
function streetSortParts(raw: string | null | undefined): { street: string; num: number; suffix: string } {
  const [first = "", ...rest] = streetParts(raw).key.split(" ");
  const num = first.match(/^(\d+)([a-z]?)$/);
  if (!num) return { street: [first, ...rest].join(" "), num: Number.POSITIVE_INFINITY, suffix: "" };
  // streetParts writes a direction as one letter before the name ("421 w delavan").
  // It sorts after the name, so West Delavan sits beside Delavan.
  const dir = rest.length > 1 && /^[nsew]$/.test(rest[0]) ? rest.shift()! : "";
  return { street: [...rest, dir].filter(Boolean).join(" "), num: Number(num[1]), suffix: num[2] };
}

/**
 * Orders addresses as a street list reads: by street name, then by house
 * number as a number, so 15 Oxford comes before 118 Oxford and Congress St
 * before Oxford Ave (a plain string sort gives "118, 15, 23"). "Ave", "Avenue",
 * the town and the ZIP don't count; an address with no house number sorts by
 * its text. For every property picker and filter (docs/specs/selectors.md 3.3).
 *
 *   properties.sort((a, b) => compareStreet(a.address, b.address))
 */
export function compareStreet(a: string | null | undefined, b: string | null | undefined): number {
  const pa = streetSortParts(a);
  const pb = streetSortParts(b);
  const byNumber = pa.num === pb.num ? 0 : pa.num < pb.num ? -1 : 1;
  return (
    streetCollator.compare(pa.street, pb.street) ||
    byNumber ||
    streetCollator.compare(pa.suffix, pb.suffix) ||
    streetCollator.compare(normalizeAddress(a), normalizeAddress(b))
  );
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
 * Whether two typed addresses are the same building: the same streetKey, and
 * nothing that both name disagrees. Two street types must match ("Pkwy" is
 * "Parkway", St isn't Ave). Two ZIPs decide on their own; without two ZIPs,
 * two named towns must match. "Avenue" or "Ave", punctuation, units, and a
 * missing type, town, state or ZIP don't count against.
 */
export function sameStreetAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = streetParts(a);
  const pb = streetParts(b);
  if (!pa.key || pa.key !== pb.key) return false;
  if (pa.type && pb.type && pa.type !== pb.type) return false;
  const za = zipCode(a);
  const zb = zipCode(b);
  if (za && zb) return za === zb;
  return !pa.town || !pb.town || pa.town === pb.town;
}
