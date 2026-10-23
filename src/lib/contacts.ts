/**
 * How a contractor's contact details read and link on the Contractors pages.
 * Pure; see contacts.test.ts. Writes to Contact rows aren't here.
 */

/** "tel:7165551234" for a phone number with 10 to 15 digits (a leading + kept), or null. */
export function telHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  return /^\+?\d{10,15}$/.test(digits) ? `tel:${digits}` : null;
}

/** "mailto:zack@example.com" for something shaped like one address, or null. */
export function mailtoHref(email: string | null | undefined): string | null {
  const e = (email ?? "").trim();
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e) ? `mailto:${e}` : null;
}

/**
 * The file the import recorded as on file without a link: the importer
 * (scripts/migrate/02-contractors.ts) writes "W-9 on file: <filename>" and
 * "Insurance on file: <filename>" into the notes when the sheet held a
 * filename instead of a URL. Null when the notes say nothing.
 */
export function docOnFile(comments: string | null | undefined, doc: "W-9" | "Insurance"): string | null {
  for (const line of (comments ?? "").split("\n")) {
    const m = new RegExp(`^\\s*${doc} on file:\\s*(.+?)\\s*$`, "i").exec(line);
    if (m) return m[1];
  }
  return null;
}

/**
 * Trades with the repeats the import's merge left in ("HVAC / HVAC",
 * "Demo/Framing/Trim / Framing/General/Tile/Drywall/Trim"): split on "/",
 * keep the first spelling of each trade (case-insensitive), joined with
 * " / ". A value with no repeats comes back exactly as stored.
 */
export function cleanTrades(trades: string | null | undefined): string | null {
  const raw = trades?.trim();
  if (!raw) return null;
  const parts = raw
    .split("/")
    .map((t) => t.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique = parts.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.length === parts.length ? raw : unique.join(" / ");
}

/** One contact's fix in scripts/cleanup-contacts.ts: only the fields that change. */
export interface ContactFix {
  id: string;
  fullName: string;
  /** The name after, when it changes. */
  name?: string;
  /** The trades before and after, when they change. */
  trades?: { from: string; to: string | null };
}

/**
 * What scripts/cleanup-contacts.ts would change (ADMIN-023): repeated trades
 * and all-lowercase name words. Company, notes and anything else are left
 * for Connor. Contacts that need nothing aren't listed.
 */
export function planContactFixes(contacts: readonly { id: string; fullName: string; trades: string | null }[]): ContactFix[] {
  const out: ContactFix[] = [];
  for (const c of contacts) {
    const fix: ContactFix = { id: c.id, fullName: c.fullName };
    const name = capitalizedName(c.fullName);
    if (name) fix.name = name;
    // cleanTrades keeps a value with no repeats as it is (trimmed), so this only lists repeats.
    const trades = cleanTrades(c.trades);
    if (c.trades !== null && trades !== c.trades.trim()) fix.trades = { from: c.trades, to: trades };
    if (fix.name || fix.trades) out.push(fix);
  }
  return out;
}

/** Lowercase name particles that stay lowercase inside a name ("Ana de la Cruz"). */
const PARTICLES = new Set(["da", "das", "de", "del", "della", "der", "di", "do", "dos", "du", "la", "le", "van", "von", "y"]);

/**
 * A name with each all-lowercase word capitalized: "John detzler" to "John
 * Detzler", "Jacob (Jake) hoak" to "Jacob (Jake) Hoak". Words that already
 * have a capital ("McDonald", "DeSantis") are left alone, and so are name
 * particles after the first word ("Ana de la Cruz"). Null when nothing
 * changes, so callers only touch names that need it.
 */
export function capitalizedName(name: string | null | undefined): string | null {
  const raw = name ?? "";
  let first = true;
  const out = raw.replace(/[\p{L}][\p{L}'’-]*/gu, (word) => {
    const isFirst = first;
    first = false;
    if (word !== word.toLowerCase()) return word;
    if (!isFirst && PARTICLES.has(word)) return word;
    return word.replace(/(^|[-'’])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  });
  return out === raw ? null : out;
}
