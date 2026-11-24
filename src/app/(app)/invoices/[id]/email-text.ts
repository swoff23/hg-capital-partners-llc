/**
 * The email an invoice came in, as the page shows it (docs/contractor-invoices-plan.md, section 6, item 2): who it
 * was from, and its words with the web links kept as links. Pure; see email-text.test.ts.
 */

/** "Zack Reading <zack@example.com>" is "Zack Reading"; a bare address is its own name. */
export function senderName(from: string | null | undefined): string {
  const s = (from ?? "").trim();
  const named = /^"?([^"<]+?)"?\s*<[^>]+>$/.exec(s);
  if (named) return named[1].trim();
  return s.replace(/^<|>$/g, "");
}

export type TextPart = { type: "text"; text: string } | { type: "link"; text: string; href: string };

const URL_PATTERN = /https?:\/\/[^\s<>"]+/gi;
/** Punctuation that ends a sentence after a link, not part of it. */
const TRAILING = /[.,;:!?)\]}'"]+$/;

/**
 * The text split into words and web links. Only http and https become links, so a stray "javascript:" stays text,
 * and the full stop after a link isn't part of it.
 */
export function linkParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const m of text.matchAll(URL_PATTERN)) {
    const start = m.index ?? 0;
    const raw = m[0];
    const href = raw.replace(TRAILING, "");
    if (start > at) parts.push({ type: "text", text: text.slice(at, start) });
    parts.push({ type: "link", text: href, href });
    at = start + href.length;
  }
  if (at < text.length) parts.push({ type: "text", text: text.slice(at) });
  return parts;
}
