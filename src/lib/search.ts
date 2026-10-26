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

/* ---------------- Ranking (search 2.10) ---------------- */

/** What `rankRows` needs from a candidate row. */
export type Rankable = {
  /** The title the typed words are compared with. */
  title: string;
  /** 0 for a live record, higher for a finished one: an open task before a Done one before a Canceled one. */
  live: number;
  /** When it last changed, for the last tie-break. */
  updatedAt: Date | number;
};

/** How well a title matches what was typed: 0 is best. */
export type MatchQuality = 0 | 1 | 2 | 3 | 4;

/**
 * 0 the title is the query, 1 it starts with it, 2 every typed word starts a
 * word of the title, 3 every typed word is somewhere in the title, 4 the
 * title doesn't show them (the record matched on another field). Street words
 * and accents read the way the matcher reads them, so "767 prospect avenue"
 * is an exact match for "767 Prospect Ave".
 */
export function matchQuality(title: string, query: string): MatchQuality {
  const terms = searchTerms(query);
  if (terms.length === 0) return 4;
  const plain = foldAccents(title.toLowerCase());
  const norm = normalizeAddress(plain);
  const typed = normalizeAddress(foldAccents(query.toLowerCase()));
  if (norm === typed) return 0;
  if (norm.startsWith(typed)) return 1;
  const words = norm.split(" ");
  if (terms.every((spellings) => spellings.some((s) => words.some((w) => w.startsWith(s))))) return 2;
  if (terms.every((spellings) => spellings.some((s) => plain.includes(s) || norm.includes(s)))) return 3;
  return 4;
}

const time = (d: Date | number) => (typeof d === "number" ? d : d.getTime());

/**
 * Orders candidate rows for a typed query: live before finished, then the
 * title's match quality, then the most recently updated. Rows that tie on all
 * three keep the order they came in. Returns a new array.
 */
export function rankRows<T extends Rankable>(rows: readonly T[], query: string): T[] {
  return rows
    .map((row, index) => ({ row, index, quality: matchQuality(row.title, query) }))
    .sort(
      (a, b) =>
        a.row.live - b.row.live ||
        a.quality - b.quality ||
        time(b.row.updatedAt) - time(a.row.updatedAt) ||
        a.index - b.index,
    )
    .map((x) => x.row);
}

/* ---------------- Marking the typed words (search choice 4 B) ---------------- */

/**
 * The stretches of `title` the typed words match, as [start, end) offsets into
 * the title, for the weight-600 emphasis in a result row. Each word marks its
 * first match, preferring one at the start of a word; neighbours, and ranges
 * with only spaces between them, join, so "767 pro" marks "767 Pro" as one.
 * Accents and street words read as the matcher reads them.
 */
export function matchRanges(title: string, query: string): [number, number][] {
  const terms = searchTerms(query);
  if (terms.length === 0 || !title) return [];
  // The title folded one character at a time, so an offset in it is an offset in the title.
  let folded = "";
  const origin: number[] = [];
  for (let i = 0; i < title.length; i++) {
    const piece = foldAccents(title[i]).toLowerCase();
    for (let j = 0; j < piece.length; j++) origin.push(i);
    folded += piece;
  }
  const wordStart = (at: number) => at === 0 || /[^\p{L}\p{N}]/u.test(folded[at - 1]);

  const found: [number, number][] = [];
  for (const spellings of terms) {
    let best: [number, number] | null = null;
    for (const s of spellings) {
      for (let at = folded.indexOf(s); at !== -1; at = folded.indexOf(s, at + 1)) {
        if (!best || (wordStart(at) && !wordStart(best[0]))) best = [at, at + s.length];
        if (wordStart(at)) break;
      }
    }
    if (best) found.push([origin[best[0]], origin[best[1] - 1] + 1]);
  }

  found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const range of found) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else if (last && title.slice(last[1], range[0]).trim() === "") last[1] = range[1];
    else merged.push([...range]);
  }
  return merged;
}

/** Whether a typed query reads as a street address: a house number, then a word ("12 Elmwood Ter"). */
export function looksLikeAddress(q: string): boolean {
  return /^\d+[a-z]?\s+\p{L}/iu.test(q.trim());
}
