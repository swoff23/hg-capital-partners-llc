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
