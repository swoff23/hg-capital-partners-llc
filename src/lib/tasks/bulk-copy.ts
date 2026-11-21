import type { TaskStatus } from "@prisma/client";
import type { Ymd } from "@/lib/dates";
import { STATUS_LABEL } from "@/lib/task-scope";
import type { BulkSkip, BulkSkips } from "./bulk-core";
import { toastDay } from "./list";

/**
 * What the Tasks list's bulk edits say (docs/specs/bulk-edit.md, section 6).
 * A toast is one line that truncates: about 40 characters beside Undo on a
 * laptop and 33 on a 375 phone, 30 under 375 (lib/toast-line.ts). So the news
 * leads and counts what changed ("Moved 2 of 3 tasks to Fri Nov 20"), and why
 * the rest didn't is the toast's `detail` ("1 is closed"), the clause it cuts
 * first. Under 375px the news is shorter still (`phoneMessage`). Pure; see
 * bulk-copy.test.ts.
 */

export interface BulkLine {
  message: string;
  phoneMessage?: string;
  /** Why some didn't change, after " · ". */
  detail?: string;
}

/** "1 task", "3 tasks". */
export const tasksCount = (n: number) => `${n} ${n === 1 ? "task" : "tasks"}`;

const REASONS: Record<BulkSkip, [one: string, many: string]> = {
  closed: ["is closed", "are closed"],
  changed: ["changed since", "changed since"],
  gone: ["was deleted", "were deleted"],
  needsDate: ["needs a visit date", "need a visit date"],
  refused: ["couldn't change", "couldn't change"],
};
const ORDER: BulkSkip[] = ["closed", "changed", "needsDate", "gone", "refused"];

/** How many were skipped, in all. */
export const skippedCount = (skips: BulkSkips) => ORDER.reduce((n, k) => n + (skips[k] ?? 0), 0);

/** "1 is closed", "2 are closed, 1 changed since". */
export function skipDetail(skips: BulkSkips): string {
  return ORDER.filter((k) => skips[k])
    .map((k) => `${skips[k]} ${REASONS[k][skips[k] === 1 ? 0 : 1]}`)
    .join(", ");
}

/**
 * A change's line. `main` names what happened to its count ("3 tasks", or
 * "2 of 3 tasks" when some were skipped), `short` the same for a phone with a
 * bare count. Nothing done says so, with why.
 */
function line(done: number, skips: BulkSkips, main: (count: string) => string, short: (count: string) => string): BulkLine {
  const skipped = skippedCount(skips);
  if (done === 0) return { message: "Nothing changed", detail: skipDetail(skips) };
  if (!skipped) return fit({ message: main(tasksCount(done)), phoneMessage: short(String(done)) });
  const total = done + skipped;
  return fit({ message: main(`${done} of ${tasksCount(total)}`), phoneMessage: short(`${done} of ${total}`), detail: skipDetail(skips) });
}

/** Drops the phone line when the news already fits a phone. */
function fit(l: BulkLine): BulkLine {
  if (l.message.length > 30 || !l.phoneMessage) return l;
  return l.detail ? { message: l.message, detail: l.detail } : { message: l.message };
}

export function statusLine(done: number, to: TaskStatus, skips: BulkSkips = {}): BulkLine {
  const label = STATUS_LABEL[to];
  return line(done, skips, (n) => `${n} set to ${label}`, (n) => `${n} set to ${label}`);
}

/** `who` is the first name, "you", or null for nobody. */
export function assignLine(done: number, who: string | null, skips: BulkSkips = {}): BulkLine {
  return who
    ? line(done, skips, (n) => `Assigned ${n} to ${who}`, (n) => `Assigned ${n} to ${who}`)
    : line(done, skips, (n) => `Unassigned ${n}`, (n) => `Unassigned ${n}`);
}

/** The second clause after an assign that emailed: "Zack gets 3 emails". */
export function emailsDetail(firstName: string, emails: number): string {
  return `${firstName} gets ${emails === 1 ? "an email" : `${emails} emails`}`;
}

export function dueLine(done: number, to: Ymd | null, skips: BulkSkips = {}): BulkLine {
  return to
    ? line(done, skips, (n) => `Moved ${n} to ${toastDay(to)}`, (n) => `Moved ${n} to ${toastDay(to)}`)
    : // The single-task toast's own words ("Date removed").
      line(done, skips, (n) => `Date removed from ${n}`, (n) => `Date removed from ${n}`);
}

/** `place` is the property's short address, or null for none. */
export function propertyLine(done: number, place: string | null, skips: BulkSkips = {}): BulkLine {
  return place
    ? line(done, skips, (n) => `Moved ${n} to ${place}`, (n) => `Moved ${n} to ${place}`)
    : // The task page's own words ("Property removed").
      line(done, skips, (n) => `Property removed from ${n}`, (n) => `No property on ${n}`);
}

/** After an Undo: nothing when everything went back; otherwise what did and why the rest didn't. */
export function undoLine(done: number, skips: BulkSkips): BulkLine | null {
  const skipped = skippedCount(skips);
  if (!skipped) return null;
  if (!done) return { message: skipped === 1 ? "Couldn't put it back" : "Couldn't put them back", detail: skipDetail(skips) };
  return fit({ message: `Put back ${done} of ${tasksCount(done + skipped)}`, phoneMessage: `Put back ${done} of ${done + skipped}`, detail: skipDetail(skips) });
}

/** Delete's confirmation title and body (the task page's own words), and its toast. */
export const deleteTitle = (n: number) => `Delete ${tasksCount(n)}?`;
export const deleteBody = (n: number) =>
  n === 1 ? "It goes for good, with its notes, checklist, activity and files." : "They go for good, with their notes, checklists, activity and files.";

export function deletedLine(deleted: number, failed: number): BulkLine {
  if (!failed) return { message: `Deleted ${tasksCount(deleted)}` };
  if (!deleted) {
    return { message: failed === 1 ? "Couldn't delete that task. Try again." : "Couldn't delete those tasks. Try again.", phoneMessage: "Couldn't delete. Try again." };
  }
  return { message: `Deleted ${deleted} of ${tasksCount(deleted + failed)}`, detail: failed === 1 ? "Try the other one again" : `Try the other ${failed} again` };
}
