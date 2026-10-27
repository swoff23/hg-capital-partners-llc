/**
 * Who a deal note says wrote it, pasted into its text. Four forms are in the
 * data (DEALS-044, DATA-I13):
 *
 *   - "seeing tomorrow (CS)": a note typed in the app, signed with the
 *     author's initials (addDealNote in service.ts, until notes carry an author);
 *   - "going to see it tomorrow", a blank line, then an em dash and the name
 *     ("\n\n\u2014 Connor Swofford"): a note from the first version of the app;
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

/** The first version's signature: a blank line, an em dash, a space and the name, ending the note. */
const DASHED = /\n\n\u2014 ([^\n]{1,60})\s*$/;

export function parseNoteAuthor(body: string): ParsedNote {
  const signed = SIGNED.exec(body);
  if (signed) return { text: body.slice(0, signed.index).trim(), initials: signed[1], name: null };

  const dashed = DASHED.exec(body);
  if (dashed) return { text: body.slice(0, dashed.index).trim(), initials: null, name: dashed[1].trim() };

  const at = body.lastIndexOf(DOT);
  if (at >= 0) {
    const label = body.slice(at + DOT.length).trim();
    // A dot with nothing after it, or with a sentence after it, isn't a signature.
    if (label && label.length <= 60 && !label.includes("\n")) return { text: body.slice(0, at).trim(), initials: null, name: label };
  }
  return { text: body.trim(), initials: null, name: null };
}
