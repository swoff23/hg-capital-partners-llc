/**
 * Who a deal note says wrote it, pasted into its text. Three forms are in the
 * data (DEALS-044, DATA-I13):
 *
 *   - "seeing tomorrow (CS)": a note typed in the app, signed with the
 *     author's initials (addDealNote in service.ts, until notes carry an author);
 *   - "Status: 1 - High → Pass  ·  Connor Swofford": a change line, a double
 *     space, a middle dot and a double space, then the name;
 *   - the same with any other label after the dot ("  ·  Pieter Louw").
 *
 * `parseNoteAuthor` splits the author off, so the Deals list shows the note
 * without it and the backfill can read it. Pure; see note-author.test.ts.
 */

export interface ParsedNote {
  /** The note without its author, trimmed. */
  text: string;
  /** The signing initials, "CS", from the first form. */
  initials: string | null;
  /** The label after the dot, "Connor Swofford", from the second and third. */
  name: string | null;
}

/** The dot that separates a change line from who made it: two spaces, a middle dot, two spaces. */
const DOT = "  ·  ";

/** Two or three capitals in brackets at the very end, after a space: "(CS)". "(ASAP)" is a word, not initials. */
const SIGNED = /\s\(([A-Z]{2,3})\)\s*$/;

export function parseNoteAuthor(body: string): ParsedNote {
  const signed = SIGNED.exec(body);
  if (signed) return { text: body.slice(0, signed.index).trim(), initials: signed[1], name: null };

  const at = body.lastIndexOf(DOT);
  if (at >= 0) {
    const label = body.slice(at + DOT.length).trim();
    // A dot with nothing after it, or with a sentence after it, isn't a signature.
    if (label && label.length <= 60 && !label.includes("\n")) return { text: body.slice(0, at).trim(), initials: null, name: label };
  }
  return { text: body.trim(), initials: null, name: null };
}
