import type { Prisma } from "@prisma/client";
import { hasTradeNamed } from "@/lib/contractors/trades";
import { equipmentTarget, utilityTarget } from "@/lib/find-target";
import { UTILITY_GROUPS, parseUnits, withUnitIds, type UnitUtilities } from "@/lib/property-types";
import { containsText, everyTermMatches, foldAccents } from "@/lib/search";
import type { MatchedField } from "@/lib/search-types";

/**
 * Search by what a record keeps out of its title (docs/specs/search-deeper-fields.md):
 * equipment model numbers and types, utility account numbers, loan and policy
 * numbers and their companies, a contractor's phone and email. The rules live
 * here and are pure, so the palette's query, a row's matched line, the lists
 * and the tests share one copy. The SQL in search-results.ts
 * (`propertyKeyHits`) reads the units JSON the way `foldNumber` and
 * `typeMatches` do; search-keys.test.ts and a check against the database keep
 * them together.
 */

/** Fewest letters and digits a typed number needs before it's read against a number field. */
export const MIN_NUMBER = 4;
/** Fewest characters a typed word needs before it's read against an equipment type or a company name. */
export const MIN_WORD = 3;

/** "9258618-10" -> "925861810": lowercase a to z and digits only, as the SQL folds a stored value. */
export function foldNumber(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * What a typed word is looked for as in number fields: folded, and also
 * without its leading zeros, so "05487400" finds "Meter - 5487400". None when
 * it has no digit or is shorter than MIN_NUMBER, so "767" or "tenant" never
 * pulls in every account.
 */
export function numberKeys(word: string): string[] {
  const folded = foldNumber(word);
  if (folded.length < MIN_NUMBER || !/\d/.test(folded)) return [];
  const bare = folded.replace(/^0+/, "");
  return bare !== folded && bare.length >= MIN_NUMBER ? [folded, bare] : [folded];
}

/**
 * The whole query read as one number when it's more than one word, so
 * "(716) 555-0142" and Kenmore's "253.64722406" match although their pieces
 * are short or split apart.
 */
export function wholeNumberKeys(q: string, terms: readonly string[][]): string[] {
  return terms.length > 1 ? numberKeys(q) : [];
}

/**
 * Everyday names for stored equipment types (EQUIPMENT_TYPES in lib/config.ts).
 * "hot water tank" reads each word as a water heater. A Map, so a typed word
 * like "constructor" never finds something on Object.prototype.
 */
const EQUIPMENT_NAMES = new Map<string, string[]>([
  ["fridge", ["refrigerator"]],
  ["washer", ["washing machine"]],
  ["dryer", ["drying machine"]],
  ["stove", ["oven"]],
  ["range", ["oven"]],
  ["hot", ["water heater"]],
  ["tank", ["water heater"]],
]);

/** The spellings a typed word is looked for as in equipment types: the word, then its everyday names. None for a short word or one with more than letters. */
export function typeSpellings(word: string): string[] {
  const w = foldAccents(word.toLowerCase());
  if (w.length < MIN_WORD || !/^[a-z]+$/.test(w)) return [];
  return [w, ...(EQUIPMENT_NAMES.get(w) ?? [])];
}

/** Whether a stored type has a word that starts with the spelling: "water" and "heat" find "Water Heater", "ate" doesn't. */
export function typeMatches(type: string | null | undefined, spelling: string): boolean {
  // A spelling is letters and spaces only (typeSpellings), so it's safe inside the pattern.
  return new RegExp(`(^|[^a-z])${spelling}`).test((type ?? "").toLowerCase());
}

/* ---------------- What the property query looks for ---------------- */

/** One thing the SQL looks for: a number or an equipment type spelling, for typed word `term`, or -1 for the whole query. */
export type KeyProbe = { term: number; kind: "number" | "type"; text: string };

export function keyProbes(q: string, terms: readonly string[][]): KeyProbe[] {
  const probes: KeyProbe[] = [];
  terms.forEach((spellings, term) => {
    for (const text of numberKeys(spellings[0])) probes.push({ term, kind: "number", text });
    for (const text of typeSpellings(spellings[0])) probes.push({ term, kind: "type", text });
  });
  for (const text of wholeNumberKeys(q, terms)) probes.push({ term: -1, kind: "number", text });
  return probes;
}

/** The ids each probe found, gathered per typed word and for the whole query. */
export type KeyHits = { byTerm: Map<number, string[]>; whole: string[] };

export function gatherHits(rows: readonly { id: string; term: number }[]): KeyHits {
  const byTerm = new Map<number, string[]>();
  const whole: string[] = [];
  for (const { id, term } of rows) {
    const list = term === -1 ? whole : (byTerm.get(term) ?? byTerm.set(term, []).get(term)!);
    if (!list.includes(id)) list.push(id);
  }
  return { byTerm, whole };
}

/** Building-wide fields matched as typed words: the companies. */
const COMPANY_FIELDS = ["lender", "loanServicer", "insuranceCarrier"] as const;

/**
 * The words part of the property search: each word in the address, from
 * MIN_WORD characters in the lender, servicer or insurer, or on a property the
 * SQL found it on (`hits`); or the whole query as one number.
 */
export function propertyWordsWhere(terms: string[][], hits: KeyHits): Prisma.PropertyWhereInput {
  const words = everyTermMatches<Prisma.PropertyWhereInput>(
    terms,
    (t) => [{ address: t }],
    (spellings, i) => {
      const ids = hits.byTerm.get(i) ?? [];
      return [
        ...spellings.filter((s) => s.length >= MIN_WORD).flatMap((s) => COMPANY_FIELDS.map((f) => ({ [f]: containsText(s) }))),
        ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
      ];
    },
  );
  return hits.whole.length > 0 ? { OR: [words, { id: { in: hits.whole } }] } : words;
}

/* ---------------- Phones ---------------- */

/** Where a US number's digits sit in the shown form readPhone writes ("716-853-9547"). */
const PHONE_LAYOUT = "XXX-XXX-XXXX";
const DIGIT_AT = [...PHONE_LAYOUT].flatMap((c, i) => (c === "X" ? [i] : []));

/**
 * A typed run of digits as the phone column shows it, read from the end and
 * from the start: "8539547" is "853-9547" and "716853" is "716-853". Every
 * stored US phone has that form (readPhone, and the spreadsheet import before
 * it), and Prisma can't drop the dashes from a column, while contractors
 * imported before `phoneE164` was written have only `phone`.
 */
export function phoneSpellings(key: string): string[] {
  let digits = key;
  if (!/^\d+$/.test(digits)) return [];
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  const n = digits.length;
  if (n > DIGIT_AT.length) return [];
  const place = (at: number[]) => {
    const out = [...PHONE_LAYOUT];
    at.forEach((i, j) => (out[i] = digits[j]));
    return out.slice(at[0], at[at.length - 1] + 1).join("");
  };
  return [...new Set([place(DIGIT_AT.slice(-n)), place(DIGIT_AT.slice(0, n))])];
}

/** A number a word reads as, in `phoneE164`'s digits or the shown `phone`. */
const phoneMatches = (key: string) => [{ phoneE164: containsText(key) }, ...phoneSpellings(key).map((s) => ({ phone: containsText(s) }))];

/** Each number a typed word reads as, in a phone. */
const phoneDigits = (spellings: string[]) => numberKeys(spellings[0]).flatMap(phoneMatches);

/** The whole query as a phone number. */
const wholePhone = (q: string, terms: string[][]) => wholeNumberKeys(q, terms).flatMap(phoneMatches);

/**
 * A contractor found by name, company, trade, email (as a tenant is) or phone
 * digits, typed with any dashes, spaces or parentheses. The palette
 * and /contractors share it, so "Open in Contractors" lists what "See all"
 * counted. Words only: the caller adds what's live.
 */
export function contactSearchWhere(q: string, terms: string[][]): Prisma.ContactWhereInput {
  const words = everyTermMatches<Prisma.ContactWhereInput>(
    terms,
    (t) => [{ fullName: t }, { company: t }, hasTradeNamed(t)],
    (spellings) => [...spellings.map((s) => ({ email: containsText(s) })), ...phoneDigits(spellings)],
  );
  const whole = wholePhone(q, terms);
  return whole.length > 0 ? { OR: [words, ...whole] } : words;
}

/** The tenant search's extra reach: each word also in the phone's digits, and the whole query as one phone number. */
export function tenantPhoneWhere(q: string, terms: string[][]) {
  return { more: phoneDigits, whole: wholePhone(q, terms) };
}

/** A phone's digits, and for a 10-digit US number its +1 form too, so "17163882701" finds 716-388-2701. */
function phoneNumbers(phone: string | null | undefined): string[] {
  const digits = foldNumber(phone);
  if (!digits) return [];
  return digits.length === 10 ? [digits, `1${digits}`] : [digits];
}

/** Whether a typed word, or the whole query, is in a phone's digits: the /tenants list's filter, which reads rows in JS. */
export function phoneHasWord(phone: string | null | undefined, word: string): boolean {
  const numbers = phoneNumbers(phone);
  return numberKeys(word).some((k) => numbers.some((n) => n.includes(k)));
}

/* ---------------- The line a hit matched ---------------- */

/** One field a hit can match on, with what it shows and where it lands. */
type KeyLine = {
  unit: string | null;
  unitId: string | null;
  label: string;
  value: string;
  code: boolean;
  /** Where the property page lands for it (lib/find-target.ts); null on a contractor. */
  target: string | null;
  /** Read as numbers (numberKeys). */
  numbers: string[];
  /** Read as equipment types (typeSpellings). */
  types: string[];
  /** Read as typed words, from `textMin` characters. */
  texts: string[];
  textMin: number;
};

/** The account-number fields search reads. Autopay and LOFL never are. */
export const SEARCHED_ACCOUNTS = ["nationalGridAcct", "nationalFuelAcct", "waterAcct"] as const satisfies readonly (keyof UnitUtilities)[];

/** What the property search reads beyond the address. */
export type KeyedProperty = {
  address: string;
  units: unknown;
  loanNumber: string | null;
  lender: string | null;
  loanServicer: string | null;
  insurancePolicyNo: string | null;
  insuranceCarrier: string | null;
};

const line = (l: Partial<KeyLine> & Pick<KeyLine, "label" | "value" | "code">): KeyLine => ({
  unit: null,
  unitId: null,
  target: null,
  numbers: [],
  types: [],
  texts: [],
  textMin: MIN_WORD,
  ...l,
});

/** A property's searchable lines, in the page's order: each unit's equipment, then its accounts, then the loan and insurance. Lockbox codes are never one. */
export function propertyLines(p: KeyedProperty): KeyLine[] {
  const lines: KeyLine[] = [];
  for (const u of withUnitIds(parseUnits(p.units))) {
    const unitId = u.id as string;
    const unit = u.label?.trim() || null;
    (u.equipment ?? []).forEach((e, j) => {
      const model = e.model?.trim() ?? "";
      lines.push(
        line({
          unit,
          unitId,
          label: e.type?.trim() || "Equipment",
          value: model,
          code: model !== "",
          target: equipmentTarget(unitId, j),
          numbers: model ? [model] : [],
          types: e.type ? [e.type] : [],
        }),
      );
    });
    for (const g of UTILITY_GROUPS) {
      for (const [field] of g.fields) {
        const value = (SEARCHED_ACCOUNTS as readonly string[]).includes(field) ? u.utilities?.[field]?.trim() : "";
        if (value) lines.push(line({ unit, unitId, label: g.name, value, code: true, target: utilityTarget(unitId, field), numbers: [value] }));
      }
    }
  }
  const number = (label: string, field: "loanNumber" | "insurancePolicyNo") => {
    const value = p[field]?.trim();
    if (value) lines.push(line({ label, value, code: true, target: field, numbers: [value] }));
  };
  const company = (label: string, field: (typeof COMPANY_FIELDS)[number]) => {
    const value = p[field]?.trim();
    if (value) lines.push(line({ label, value, code: false, target: field, texts: [value] }));
  };
  number("Loan", "loanNumber");
  company("Lender", "lender");
  company("Servicer", "loanServicer");
  number("Policy", "insurancePolicyNo");
  company("Insurer", "insuranceCarrier");
  return lines;
}

/** Whether one line holds what a probe looks for: the SQL's test, in JS. */
export function lineHasProbe(l: KeyLine, probe: Pick<KeyProbe, "kind" | "text">): boolean {
  return probe.kind === "number"
    ? l.numbers.some((v) => foldNumber(v).includes(probe.text))
    : l.types.some((t) => typeMatches(t, probe.text));
}

/** Whether a line holds a typed word, read every way the search reads it. */
function lineHasWord(l: KeyLine, spellings: string[]): boolean {
  const word = spellings[0];
  return (
    numberKeys(word).some((text) => lineHasProbe(l, { kind: "number", text })) ||
    typeSpellings(word).some((text) => lineHasProbe(l, { kind: "type", text })) ||
    spellings.some((s) => s.length >= l.textMin && l.texts.some((t) => t.toLowerCase().includes(s)))
  );
}

/** A field holding several lines ("9291272-09\n(Meter #740347)") shows the one that matched. */
function shownValue(l: KeyLine, keys: string[]): string {
  const parts = l.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return l.value;
  return parts.find((part) => keys.some((k) => foldNumber(part).includes(k))) ?? parts[0];
}

/** What a row prints for the line it matched, and where its link lands. */
export type FoundLine = { matched: MatchedField; target: string | null };

/**
 * The hidden line a found record matched on, or null when every typed word is
 * in what the row already shows (`shown`). Picks the line that holds the most
 * of the words left over, the first in page order on a tie. When no one line
 * holds them all and the whole query read as one number is on a line, that
 * line wins: "GM9S960603BN AA" is the Front unit's -AA furnace, not the first
 * furnace that holds "gm9s960603bn". "2 more" counts the other units with an
 * equally good line of the same kind.
 */
function foundLine(lines: KeyLine[], q: string, terms: string[][], shown: string): FoundLine | null {
  const left = terms.filter((spellings) => !spellings.some((s) => shown.includes(s)));
  if (left.length === 0) return null;
  const scored = lines.map((l) => ({ l, score: left.filter((spellings) => lineHasWord(l, spellings)).length }));
  let best = scored.reduce<(typeof scored)[number] | null>((top, s) => (s.score > (top?.score ?? 0) ? s : top), null);
  let peers = best ? scored.filter((s) => s.score === best!.score).map((s) => s.l) : [];
  let keys = left.flatMap((spellings) => numberKeys(spellings[0]));
  if (!best || best.score < left.length) {
    const whole = wholeNumberKeys(q, terms);
    const wholePeers = lines.filter((l) => whole.some((text) => lineHasProbe(l, { kind: "number", text })));
    if (wholePeers.length > 0) {
      keys = whole;
      peers = wholePeers;
      best = { l: wholePeers[0], score: left.length };
    }
  }
  if (!best) return null;
  const { l } = best;
  const others = new Set(peers.filter((p) => p.label === l.label && p.unitId && p.unitId !== l.unitId).map((p) => p.unitId));
  return {
    matched: { unit: l.unit, label: l.label, value: shownValue(l, keys), code: l.code, more: others.size },
    target: l.target,
  };
}

/** The hidden line a found property matched on. The address is what its where reads, so a word in it never counts as hidden. */
export function propertyFoundLine(p: KeyedProperty, q: string, terms: string[][]): FoundLine | null {
  return foundLine(propertyLines(p), q, terms, p.address.toLowerCase());
}

/** What the contractor search reads beyond the row's name, trade and company. */
export type KeyedContact = { fullName: string; company: string | null; trade: string | null; phone: string | null; phoneE164: string | null; email: string | null };

/** The phone or email a found contractor matched on. */
export function contactFoundLine(c: KeyedContact, q: string, terms: string[][]): FoundLine | null {
  const lines: KeyLine[] = [];
  const phone = c.phone?.trim() || c.phoneE164 || "";
  if (phone) lines.push(line({ label: "Phone", value: phone, code: true, numbers: [c.phoneE164 ?? "", ...phoneNumbers(c.phone)] }));
  const email = c.email?.trim();
  if (email) lines.push(line({ label: "Email", value: email, code: false, texts: [email], textMin: 1 }));
  return foundLine(lines, q, terms, [c.fullName, c.company, c.trade].filter(Boolean).join(" ").toLowerCase());
}
