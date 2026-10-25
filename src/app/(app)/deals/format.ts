import { fmtDay, todayYmdEastern } from "@/lib/dates";

/*
 * Deal dates, worked out on the server so the list and the deal page print
 * the same day in every browser, and a client row never hydrates with a
 * different date than the server drew. "Oct 20", with the year only when it
 * isn't this year (docs/brand-guidelines.md, section 3).
 */

/** The Buffalo day an instant fell on (an update, a note typed or logged here). */
export function easternDay(at: Date, today = todayYmdEastern()): string {
  return fmtDay(todayYmdEastern(at), { year: "auto", now: today });
}

/**
 * A note's day. A line imported from the spreadsheet carries a calendar date
 * (stored at UTC midnight), which reading it in Buffalo time would move to the
 * day before; anything typed or logged in the app is an instant.
 */
export function noteDay(note: { noteDate: Date; source: string }, today = todayYmdEastern()): string {
  return note.source === "migration"
    ? fmtDay(note.noteDate, { year: "auto", now: today })
    : easternDay(note.noteDate, today);
}
