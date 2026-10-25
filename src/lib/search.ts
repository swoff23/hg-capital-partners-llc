import { STREET_WORDS, normalizeAddress } from "@/lib/normalize";

/** Longer queries are cut to their first words so one request stays one cheap query. */
const MAX_WORDS = 6;

/** "José" -> "Jose". */
export function foldAccents(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/**
 * Splits what someone typed into the search box into words, each with the
 * spellings that count as a match for it: as typed, without accents, and the
 * street word either way ("Avenue" finds "Ave.", "Rd" finds "Road"). A record
 * comes back when every word matches one of its fields, in any order, so
 * "congress roof" finds a roof task at 118 Congress St.
 */
export function searchTerms(q: string): string[][] {
  const terms: string[][] = [];
  const seen = new Set<string>();
  for (const word of q.toLowerCase().split(/[\s.,#]+/)) {
    if (!/[\p{L}\p{N}]/u.test(word)) continue;
    const plain = foldAccents(word);
    const short = normalizeAddress(plain);
    const long = STREET_WORDS.find(([, s]) => s === short)?.[0] ?? short;
    const spellings = narrowest([word, plain, short, long]);
    const key = [...spellings].sort().join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(spellings);
    if (terms.length === MAX_WORDS) break;
  }
  return terms;
}

/** Drops repeats and any spelling that contains another: a substring match on the shorter one already covers it. */
function narrowest(spellings: string[]): string[] {
  const unique = [...new Set(spellings)];
  return unique.filter((s) => !unique.some((other) => other !== s && s.includes(other)));
}

/** Prisma's case-insensitive substring filter for one spelling. */
export type TextMatch = { contains: string; mode: "insensitive" };

/**
 * A Prisma where clause that needs every term to match at least one field.
 * `fields` turns one spelling's filter into the field conditions to try,
 * e.g. `(t) => [{ title: t }, { property: { address: t } }]`.
 */
export function everyTermMatches<W>(terms: string[][], fields: (text: TextMatch) => W[]): { AND: { OR: W[] }[] } {
  return {
    AND: terms.map((spellings) => ({
      OR: spellings.flatMap((s) => fields({ contains: s, mode: "insensitive" })),
    })),
  };
}
