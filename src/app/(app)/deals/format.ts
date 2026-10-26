import { DEAL_FIELD_LABEL } from "@/lib/config";
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

/*
 * Sort phrases (selectors 3.6): below sm the table's headers are gone, so the
 * Filters sheet lists the sorts as sentences with a Check. The URL's `sort`
 * is a column and a direction ("-theirPrice" is the price, high to low);
 * these are what each reads as.
 */

/** The sort a list opens in: grouped by stage. */
export const DEFAULT_DEAL_SORT = "status";

type SortWords = { asc: string; desc: string };

const SORT_WORDS: Record<string, SortWords> = {
  status: { asc: DEAL_FIELD_LABEL.status, desc: `${DEAL_FIELD_LABEL.status}, last first` },
  address: { asc: `${DEAL_FIELD_LABEL.address} A to Z`, desc: `${DEAL_FIELD_LABEL.address} Z to A` },
  units: { asc: "Fewest units", desc: "Most units" },
  theirPrice: {
    asc: `${DEAL_FIELD_LABEL.theirPrice}, low to high`,
    desc: `${DEAL_FIELD_LABEL.theirPrice}, high to low`,
  },
  ourPrice: { asc: `${DEAL_FIELD_LABEL.ourPrice}, low to high`, desc: `${DEAL_FIELD_LABEL.ourPrice}, high to low` },
  nextAction: { asc: `${DEAL_FIELD_LABEL.nextAction} A to Z`, desc: `${DEAL_FIELD_LABEL.nextAction} Z to A` },
  updated: { asc: "Oldest update first", desc: "Newest update first" },
};

/** What a `sort` value reads as, or null for a column the list doesn't sort by. */
export function dealSortPhrase(sort: string): string | null {
  const desc = sort.startsWith("-");
  const words = SORT_WORDS[desc ? sort.slice(1) : sort];
  return words ? (desc ? words.desc : words.asc) : null;
}

/** The sorts the phone's Filters sheet offers, the default first. Any other sort in the URL shows as its own row there. */
export const DEAL_SORT_CHOICES: readonly { value: string; label: string }[] = [
  DEFAULT_DEAL_SORT,
  "-updated",
  "-theirPrice",
  "theirPrice",
  "-units",
].map((value) => ({ value, label: dealSortPhrase(value)! }));
