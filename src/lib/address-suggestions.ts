import type { PrismaClient } from "@prisma/client";
import { sameStreetAddress, streetKey } from "@/lib/normalize";
import { everyTermMatches, matchQuality, searchTerms } from "@/lib/search";
import { SIGNED_OUT, type Answer, type Viewer } from "@/lib/search-results";
import { matchesSearch } from "@/lib/text-match";

/**
 * What `AddressCombobox` offers while someone types an address (forms 2.6),
 * answered by GET /api/addresses. Phase 1 suggests from HG's own properties
 * and deals, the same records the duplicate check reads; an address
 * provider (Google Places, Mapbox or Smarty) waits for Connor's pick and key
 * (phase 2, build plan section 6), and would go through src/lib/env.ts.
 *
 * Two answers per keystroke: `suggestions`, up to six records whose address
 * holds every typed word, and `match`, the record the typed address already
 * is (`sameStreetAddress`), for the "767 Prospect Ave is already a property.
 * Open it" line. The pure parts are tested in address-suggestions.test.ts;
 * `answerAddresses` takes the database and the viewer, so it runs in tests
 * with neither.
 *
 * Client code imports only the types from here.
 */

/** What's being made or renamed: a property's address or a deal's. */
export type AddressKind = "property" | "deal";

export const ADDRESS_KINDS: readonly AddressKind[] = ["property", "deal"];

/** Suggestions start at this many typed characters. */
export const SUGGEST_FROM = 3;

/** At most this many suggestion rows. */
export const SUGGEST_LIMIT = 6;

/** Candidates read per table before ranking. */
const READ_LIMIT = 40;

/** One record as the matcher sees it. */
export type AddressRecord = { kind: AddressKind; id: string; address: string; updatedAt: Date | number; stage?: string | null };

/** A suggestion row: the street over "Buffalo, NY 14209 · Property". `address` is what a pick fills in. */
export type AddressSuggestion = {
  kind: AddressKind;
  id: string;
  address: string;
  street: string;
  place: string;
  href: string;
};

/** The record a typed address already is. `stage` is a deal's stage as stored. */
export type AddressMatch = { kind: AddressKind; id: string; address: string; street: string; href: string; stage?: string };

export type AddressAnswer = { suggestions: AddressSuggestion[]; match: AddressMatch | null };

export type AddressDb = Pick<PrismaClient, "property" | "deal">;

const hrefOf = (kind: AddressKind, id: string) => (kind === "property" ? `/properties/${id}` : `/deals/${id}`);

// Street-type words, long and short, as people type them. Matched after
// lowercasing and dropping a trailing period.
const STREET_TYPE_WORDS = new Set([
  "avenue", "ave", "av", "street", "st", "drive", "dr", "road", "rd", "boulevard", "blvd", "parkway", "pkwy", "pky",
  "place", "pl", "court", "ct", "lane", "ln", "terrace", "ter", "way", "circle", "cir", "highway", "hwy", "square", "sq",
  "trail", "trl", "alley", "aly", "row", "expressway", "expy",
]);

const tidy = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,+/g, ",")
    .replace(/^[\s,]+|[\s,.]+$/g, "")
    .trim();

/**
 * Splits a stored address into its two suggestion lines: the street ("767
 * Prospect Avenue") and the place ("Buffalo, NY 14213"). The street runs to
 * the first street-type word after the house number (two in a row stay
 * together, "Baynes St Street"), or to the first comma when there's none.
 * Spacing and stray commas are tidied; the words are kept as stored.
 */
export function splitAddress(raw: string): { street: string; place: string } {
  const text = raw.replace(/\n/g, " ").trim();
  const words = text.split(/\s+/);
  let end = -1;
  for (let i = 1; i < words.length; i++) {
    const w = words[i].toLowerCase().replace(/[.,]+$/, "");
    if (STREET_TYPE_WORDS.has(w)) {
      end = i;
      while (end + 1 < words.length && STREET_TYPE_WORDS.has(words[end + 1].toLowerCase().replace(/[.,]+$/, ""))) end++;
      break;
    }
    // A comma ends the street before any type word.
    if (words[i].endsWith(",")) break;
  }
  if (end === -1) {
    const comma = text.indexOf(",");
    if (comma === -1) return { street: tidy(text), place: "" };
    return { street: tidy(text.slice(0, comma)), place: tidy(text.slice(comma + 1)) };
  }
  return { street: tidy(words.slice(0, end + 1).join(" ")), place: tidy(words.slice(end + 1).join(" ")) };
}

/** The house style's short street words, as `normalizeAddress` writes them for matching, capitalised for display. */
const SHORT_STREET: Record<string, string> = { avenue: "Ave", street: "St", drive: "Dr", road: "Rd" };

/** Small words that stay lower case inside an address ("Lot on Main St"). */
const SMALL_WORDS = new Set(["and", "of", "on", "at", "the"]);

/** Words that start a unit after the street ("Apt 2"), which no comma sets apart from it. */
const UNIT_WORDS = new Set(["apt", "apartment", "unit", "ste", "suite", "fl", "floor", "rm", "room", "bldg", "building", "upper", "lower", "rear", "front", "basement"]);

/** A word to capitalise: all lower case, or all capitals longer than three letters ("PROSPECT"). */
function capitalise(word: string, first: boolean): string {
  const letters = word.replace(/[^A-Za-z]/g, "");
  if (!letters) return word;
  const lower = letters === letters.toLowerCase();
  const shouting = letters === letters.toUpperCase() && letters.length > 3;
  if (!lower && !shouting) return word;
  if (lower && !first && SMALL_WORDS.has(word)) return word;
  return word.toLowerCase().replace(/(^|[-/])([a-z])/g, (_m, edge: string, c: string) => edge + c.toUpperCase());
}

/**
 * An address as it saves (forms 2.6, "Saves as 767 Prospect Ave, Buffalo, NY
 * 14209"): spacing and stray commas tidied, words typed all lower case or all
 * capitals given a capital, "Avenue", "Street", "Drive" and "Road" written as
 * Ave, St, Dr and Rd, a comma after the street and before the state, and NY
 * in capitals. Words typed with their own mix of cases stay as typed, and so
 * does everything else. It changes only how the address looks, never what
 * `sameStreetAddress` and `streetKey` make of it.
 */
export function tidyAddress(raw: string): string {
  let flat = raw
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/(, )+/g, ", ")
    .replace(/^[\s,]+|[\s,.]+$/g, "");
  if (!flat) return "";
  // Typed in capitals throughout: read it as lower case, so "AVE" and "PROSPECT" are words like the rest.
  if (flat === flat.toUpperCase() && /[A-Z]{2}/.test(flat)) flat = flat.toLowerCase();
  const words = flat.split(" ").map((w, i, all) => {
    const comma = w.endsWith(",") ? "," : "";
    const bare = comma ? w.slice(0, -1) : w;
    const unpointed = bare.replace(/\.$/, "");
    const short = SHORT_STREET[unpointed.toLowerCase()];
    // The state: two letters ahead of a ZIP, or the NY every address here is in.
    const state = /^ny$/i.test(unpointed) || (/^[A-Za-z]{2}$/.test(unpointed) && /^\d{5}(-\d{4})?$/.test(all[i + 1] ?? ""));
    if (state) return unpointed.toUpperCase() + comma;
    if (short && i > 0) return short + comma;
    return capitalise(unpointed, i === 0) + comma;
  });
  const joined = words.join(" ");
  const { street, place } = splitAddress(joined);
  // A town starts with a word of three letters or more; "D" in "10 Avenue D" and "Apt 2" belong to the street.
  const town = place.split(" ")[0] ?? "";
  if (!place || town.replace(/[^A-Za-z]/g, "").length < 3 || UNIT_WORDS.has(town.toLowerCase().replace(/[.,]+$/, ""))) return joined;
  // A comma after the street, and before the state, when they were left out ("767 Prospect Ave Buffalo NY 14209").
  const rest = place.replace(/^,\s*/, "").replace(/\s+(NY)(\s+\d{5}(?:-\d{4})?)?$/, (_m, st: string, zip: string | undefined) => `, ${st}${zip ?? ""}`);
  return `${street}, ${rest}`.replace(/,\s*,/g, ",").trim();
}

/**
 * What the address field says it will save as, or null when that is how it
 * was typed: "Saves as 767 Prospect Ave, Buffalo, NY 14209". Nothing for text
 * that doesn't start with a house number.
 */
export function savesAs(typed: string): string | null {
  const flat = typed.replace(/\s+/g, " ").trim();
  if (flat.length < SUGGEST_FROM || !/^\d/.test(flat)) return null;
  const tidy = tidyAddress(flat);
  return tidy && tidy !== flat ? tidy : null;
}

/** A pasted link, not an address: starts with http://, https:// or www. and has no spaces. */
export function looksLikeLink(text: string): boolean {
  return /^(?:https?:\/\/|www\.)\S+$/i.test(text.trim());
}

/** A link with its scheme, so "www.zillow.com/..." saves as a link that opens. */
export function withScheme(link: string): string {
  const t = link.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/**
 * The address in a Zillow listing link, from its path ("/homedetails/767-
 * Prospect-Ave-Buffalo-NY-14213/2084530018_zpid/"), tidied; null for any
 * other link or a path that doesn't start with a house number.
 */
export function addressFromListingLink(link: string): string | null {
  let url: URL;
  try {
    url = new URL(withScheme(link));
  } catch {
    return null;
  }
  if (!/(?:^|\.)zillow\.com$/i.test(url.hostname)) return null;
  const slug = url.pathname.match(/\/homedetails\/([^/]+)\//i)?.[1];
  if (!slug) return null;
  let words: string;
  try {
    words = decodeURIComponent(slug).replace(/[-_+]+/g, " ").trim();
  } catch {
    return null;
  }
  return /^\d/.test(words) ? tidyAddress(words) : null;
}

const time = (d: Date | number) => (typeof d === "number" ? d : d.getTime());

/**
 * Up to `limit` suggestions for what's typed: records whose address holds
 * every typed word (street words read either way, "Avenue" and "Ave"), one
 * row per building with a property kept over a deal at the same address and
 * the newest deal over older ones, best match first (the street is the typed
 * text, starts with it, then every word starts a word), properties before
 * deals, then the most recently changed. Nothing under SUGGEST_FROM
 * characters.
 */
export function suggestAddresses(
  query: string,
  records: readonly AddressRecord[],
  { limit = SUGGEST_LIMIT, excludeId }: { limit?: number; excludeId?: string } = {},
): AddressSuggestion[] {
  const q = query.trim();
  if (q.length < SUGGEST_FROM) return [];
  const candidates = records
    .filter((r) => r.id !== excludeId && r.address.trim() && matchesSearch(q, r.address))
    .map((r) => ({ r, ...splitAddress(r.address) }))
    .map((c) => ({ ...c, quality: matchQuality(c.street, q) }))
    .sort(
      (a, b) =>
        a.quality - b.quality ||
        (a.r.kind === b.r.kind ? 0 : a.r.kind === "property" ? -1 : 1) ||
        time(b.r.updatedAt) - time(a.r.updatedAt),
    );
  // One row per building. Sorting put properties and newer deals first within a match quality, so
  // keep the first of a building unless a property for it comes later (a weaker match on its street).
  const kept: typeof candidates = [];
  for (const c of candidates) {
    const same = kept.findIndex((k) => sameStreetAddress(k.r.address, c.r.address));
    if (same === -1) kept.push(c);
    else if (c.r.kind === "property" && kept[same].r.kind === "deal") kept[same] = c;
  }
  return kept.slice(0, limit).map(({ r, street, place }) => ({
    kind: r.kind,
    id: r.id,
    address: r.address.replace(/\s+/g, " ").trim(),
    street,
    place,
    href: hrefOf(r.kind, r.id),
  }));
}

/**
 * The record the typed address already is, or null (forms 2.6, DEALS-038):
 * the same house number and street however it's typed, with no street type,
 * ZIP or town that disagrees (`sameStreetAddress`). For a property, an
 * existing property. For a deal, an existing deal first (a second deal at
 * one address is refused), then a property HG already owns. Newest first
 * within a kind; `excludeId` leaves out the record being renamed.
 */
export function findAddressMatch(
  query: string,
  kind: AddressKind,
  records: readonly AddressRecord[],
  excludeId?: string,
): AddressMatch | null {
  const q = query.trim();
  if (!/^\d/.test(streetKey(q))) return null;
  const order: AddressKind[] = kind === "property" ? ["property"] : ["deal", "property"];
  for (const k of order) {
    const hit = records
      .filter((r) => r.kind === k && r.id !== excludeId && sameStreetAddress(r.address, q))
      .sort((a, b) => time(b.updatedAt) - time(a.updatedAt))[0];
    if (hit) {
      return {
        kind: hit.kind,
        id: hit.id,
        address: hit.address,
        street: splitAddress(hit.address).street,
        href: hrefOf(hit.kind, hit.id),
        ...(hit.stage ? { stage: hit.stage } : {}),
      };
    }
  }
  return null;
}

/** Reads `q`, `kind` and `exclude` from a request's query string. */
export function parseAddressParams(sp: URLSearchParams): { q: string; kind: AddressKind; excludeId?: string } | { error: string } {
  const q = (sp.get("q") ?? "").trim().slice(0, 200);
  const kind = sp.get("kind") ?? "property";
  if (!ADDRESS_KINDS.includes(kind as AddressKind)) return { error: "kind" };
  const excludeId = sp.get("exclude")?.trim() || undefined;
  return { q, kind: kind as AddressKind, excludeId };
}

/** The suggestions and the match for one typed address, read from the database. */
export async function runAddresses(
  db: AddressDb,
  { q, kind, excludeId }: { q: string; kind: AddressKind; excludeId?: string },
): Promise<AddressAnswer> {
  if (q.length < SUGGEST_FROM) return { suggestions: [], match: null };
  const terms = searchTerms(q);
  // The house number narrows the rows the match is checked on, as findDuplicateDeal does.
  const lead = streetKey(q).split(" ")[0] ?? "";
  const byNumber = /^\d/.test(lead) ? { address: { contains: lead, mode: "insensitive" as const } } : null;
  // Only punctuation typed: nothing to match on.
  if (terms.length === 0 && !byNumber) return { suggestions: [], match: null };
  const where = everyTermMatches(terms, (t) => [{ address: t }]);
  const anyOf = byNumber ? { OR: [where, byNumber] } : where;

  const [properties, deals] = await Promise.all([
    db.property.findMany({
      where: anyOf,
      select: { id: true, address: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: READ_LIMIT,
    }),
    db.deal.findMany({
      where: anyOf,
      select: { id: true, address: true, updatedAt: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: READ_LIMIT,
    }),
  ]);
  const records: AddressRecord[] = [
    ...properties.map((p) => ({ kind: "property" as const, id: p.id, address: p.address, updatedAt: p.updatedAt })),
    ...deals.map((d) => ({ kind: "deal" as const, id: d.id, address: d.address, updatedAt: d.updatedAt, stage: d.status })),
  ];
  return {
    suggestions: suggestAddresses(q, records, { excludeId }),
    match: findAddressMatch(q, kind, records, excludeId),
  };
}

/** GET /api/addresses. Staff only: no signed-in staff user is a 401 before anything is read. */
export async function answerAddresses(
  viewer: Viewer,
  sp: URLSearchParams,
  db: AddressDb,
  onError: (err: unknown) => void = () => {},
): Promise<Answer<AddressAnswer>> {
  if (!viewer) return SIGNED_OUT;
  const params = parseAddressParams(sp);
  if ("error" in params) return { status: 400, body: { error: params.error } };
  try {
    return { status: 200, body: await runAddresses(db, params) };
  } catch (err) {
    onError(err);
    return { status: 500, body: { error: "failed" } };
  }
}
