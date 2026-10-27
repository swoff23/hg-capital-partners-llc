import { initials } from "@/lib/utils";
import { parseNoteAuthor } from "./note-author";

/**
 * The deal-note author backfill's decisions (scripts/backfill-deal-note-authors.ts,
 * docs/specs/activity-comments.md 2.9, DEALS-044): which user wrote an old
 * note, from the three ways its text names them (parseNoteAuthor), and what
 * its text is without the name. Pure, so backfill.test.ts runs it with no
 * database; the script reads the rows, prints this plan and, with --apply,
 * writes it.
 *
 * Only `manual` notes and `change` lines are read. Spreadsheet lines
 * (`migration`) are left alone. A signature that doesn't name exactly one
 * user is left in the text, so nothing is lost: the plan says why.
 */

export interface BackfillUser {
  id: string;
  name: string | null;
  email: string;
}

export interface BackfillNote {
  id: string;
  body: string;
  source: string;
  authorUserId: string | null;
}

export type SkipReason =
  /** The row already names its author. */
  | "has-author"
  /** An imported line. */
  | "not-ours"
  /** The text names nobody. */
  | "no-signature"
  /** It names someone who isn't a user ("Spreadsheet import"). */
  | "unmatched"
  /** It names two users (the same initials). */
  | "ambiguous";

export type BackfillStep =
  | { id: string; action: "set"; authorUserId: string; userName: string; via: "initials" | "name"; label: string; text: string; was: string }
  | { id: string; action: "skip"; reason: SkipReason; label: string | null };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const localPart = (email: string) => email.split("@")[0];

/** The users a signature can mean: initials by `initials()`, a name by its full name or the part of the email before the @. */
export function matchUsers(sig: { initials: string | null; name: string | null }, users: readonly BackfillUser[]): BackfillUser[] {
  if (sig.initials) return users.filter((u) => initials(u.name, u.email) === sig.initials);
  const name = sig.name;
  if (name) return users.filter((u) => (u.name ? same(u.name, name) : false) || same(localPart(u.email), name));
  return [];
}

/** What to do with one note. */
export function planNote(note: BackfillNote, users: readonly BackfillUser[]): BackfillStep {
  if (note.authorUserId) return { id: note.id, action: "skip", reason: "has-author", label: null };
  if (note.source !== "manual" && note.source !== "change") return { id: note.id, action: "skip", reason: "not-ours", label: null };
  const sig = parseNoteAuthor(note.body);
  const label = sig.initials ?? sig.name;
  if (!label) return { id: note.id, action: "skip", reason: "no-signature", label: null };
  const found = matchUsers(sig, users);
  if (found.length === 0) return { id: note.id, action: "skip", reason: "unmatched", label };
  if (found.length > 1) return { id: note.id, action: "skip", reason: "ambiguous", label };
  const [user] = found;
  return {
    id: note.id,
    action: "set",
    authorUserId: user.id,
    userName: user.name ?? user.email,
    via: sig.initials ? "initials" : "name",
    label,
    text: sig.text,
    was: note.body,
  };
}

export function planBackfill(notes: readonly BackfillNote[], users: readonly BackfillUser[]): BackfillStep[] {
  return notes.map((n) => planNote(n, users));
}

/** The counts the dry run prints: how many it would set, and why the rest stay. */
export function summarize(steps: readonly BackfillStep[]): { set: number; skipped: Record<SkipReason, number>; labels: Record<string, number> } {
  const skipped: Record<SkipReason, number> = { "has-author": 0, "not-ours": 0, "no-signature": 0, unmatched: 0, ambiguous: 0 };
  const labels: Record<string, number> = {};
  let set = 0;
  for (const s of steps) {
    if (s.action === "set") {
      set += 1;
      continue;
    }
    skipped[s.reason] += 1;
    if (s.label && (s.reason === "unmatched" || s.reason === "ambiguous")) labels[s.label] = (labels[s.label] ?? 0) + 1;
  }
  return { set, skipped, labels };
}
