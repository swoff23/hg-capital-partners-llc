import type { TaskEventKind, TaskStatus, Visibility } from "@prisma/client";
import { HG_TIME_ZONE, daysUntil, toYmd, todayYmdEastern, type Ymd } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { STATUS_LABEL } from "@/lib/task-scope";
import { describeRepeat, parseRepeatRule } from "./repeat";

/**
 * The staff task page's Activity: one oldest-first timeline from TaskEvent
 * rows. Comments stay comments; every other event becomes one plain line
 * ("Connor set status to In progress"); a run of due-date moves becomes one
 * line ("Due moved 6× · now Thu, Oct 30"). The page shows the latest few
 * and folds the rest behind "Show N earlier updates", with a separator per
 * Buffalo calendar day. Pure; see activity.test.ts.
 */

export interface ActivityEvent {
  id: string;
  kind: TaskEventKind;
  visibility: Visibility;
  actorLabel: string;
  actorUserId: string | null;
  actorContactId: string | null;
  body: string | null;
  data: unknown;
  createdAt: Date;
}

/** Names for the ids events carry. */
export interface ActivityNames {
  users?: Readonly<Record<string, string>>;
  contacts?: Readonly<Record<string, string>>;
  properties?: Readonly<Record<string, string>>;
}

export type ActivityEntry<E extends ActivityEvent = ActivityEvent> =
  | { type: "comment"; id: string; at: Date; event: E }
  | { type: "line"; id: string; at: Date; event: E; text: string; href?: string }
  | { type: "due-run"; id: string; at: Date; events: E[]; text: string };

type Data = Record<string, unknown>;
const dataOf = (e: ActivityEvent): Data => (e.data && typeof e.data === "object" ? (e.data as Data) : {});
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** "Thu, Oct 30", with the year when it isn't this one. */
export function fmtShortDay(v: Ymd | null | undefined, today: Ymd): string {
  const y = toYmd(v);
  if (!y) return "";
  const [yy, mm, dd] = y.split("-").map(Number);
  const sameYear = y.slice(0, 4) === today.slice(0, 4);
  return new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** The heading over one day's updates: "Today", "Yesterday", "Mon, Oct 20". */
export function dayLabel(day: Ymd, today: Ymd): string {
  const d = daysUntil(day, today);
  if (d === 0) return "Today";
  if (d === -1) return "Yesterday";
  return fmtShortDay(day, today);
}

/** The Buffalo calendar day an instant falls on. */
export const easternDay = (at: Date): Ymd => todayYmdEastern(at);

/** "now", "5m", "2h" within a day; after that the time of day ("2:14 PM"), since the day heading has the date. */
export function fmtAgo(at: Date, now: Date): string {
  const sec = Math.max(0, (now.getTime() - at.getTime()) / 1000);
  if (sec < 60) return "now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h`;
  return at.toLocaleTimeString("en-US", { timeZone: HG_TIME_ZONE, hour: "numeric", minute: "2-digit" });
}

/** People by first name; automated writers ("Property reminder", "Repeats") by their label. */
function who(e: ActivityEvent): string {
  return e.actorUserId || e.actorContactId ? firstName(e.actorLabel) || e.actorLabel : e.actorLabel;
}

function quoted(t: string | null): string {
  return t ? `“${t}”` : "";
}

function statusLine(e: ActivityEvent, d: Data, today: Ymd): string {
  const a = who(e);
  const to = s(d.to) as TaskStatus | null;
  const from = s(d.from) as TaskStatus | null;
  if (!to || !(to in STATUS_LABEL)) return `${a} changed the status`;
  if (to === "REVIEW") return `${a} marked this done`;
  if (from === "REVIEW" && to === "DONE") return `${a} approved this`;
  if (from === "REVIEW" && to === "IN_PROGRESS") return `${a} sent this back`;
  const waiting = s(d.waitingOn);
  if (to === "WAITING" && waiting) return `${a} set status to Waiting on ${waiting}`;
  const visit = s(d.scheduledFor);
  if (to === "SCHEDULED" && visit) return `${a} set status to Scheduled for ${fmtShortDay(visit, today)}`;
  return `${a} set status to ${STATUS_LABEL[to]}`;
}

function assigneeName(to: unknown, names: ActivityNames): string | null {
  if (!to || typeof to !== "object") return null;
  const t = to as Data;
  const userId = s(t.userId);
  const contactId = s(t.contactId);
  return (
    (userId && names.users?.[userId]) || (contactId && names.contacts?.[contactId]) || s(t.name) || (userId || contactId ? "someone" : null)
  );
}

function propertyLine(e: ActivityEvent, d: Data, names: ActivityNames): string {
  const a = who(e);
  if ("unitTo" in d || "unitFrom" in d) {
    const unit = s(d.unitTo);
    return unit ? `${a} set the unit to ${unit}` : `${a} cleared the unit`;
  }
  const to = s(d.to);
  const place = (to && names.properties?.[to]) || s(d.toSection);
  if (place) return `${a} moved this to ${place}`;
  return to ? `${a} moved this to another property` : `${a} removed the property`;
}

/** One system event as a sentence. Comments aren't lines. */
export function eventLine(e: ActivityEvent, names: ActivityNames, today: Ymd): { text: string; href?: string } {
  const d = dataOf(e);
  const a = who(e);
  switch (e.kind) {
    case "CREATED":
      return { text: d.repeatOf ? "Created as the next repeat" : `${a} created this task` };
    case "ASSIGNED": {
      const name = assigneeName(d.to, names);
      return { text: name ? `${a} assigned ${name}` : `${a} unassigned this` };
    }
    case "STATUS":
      return { text: statusLine(e, d, today) };
    case "DUE": {
      const to = s(d.to);
      if (!to) return { text: `${a} cleared the due date` };
      return { text: `${a} ${s(d.from) ? "moved" : "set"} the due date to ${fmtShortDay(to, today)}` };
    }
    case "SCHEDULED": {
      const to = s(d.to);
      return { text: to ? `${a} moved the visit to ${fmtShortDay(to, today)}` : `${a} cleared the visit date` };
    }
    case "PROPERTY":
      return { text: propertyLine(e, d, names) };
    case "TITLE": {
      const from = s(d.from);
      return { text: from ? `${a} renamed this from ${quoted(from)}` : `${a} renamed this` };
    }
    case "NOTES":
      return { text: `${a} edited the notes` };
    case "ATTACHMENT": {
      const name = s(d.filename);
      // A posted file taken off the task leaves its own line (deleteTaskAttachment; uploads 2.4).
      if (d.removed === true) return { text: name ? `${a} removed ${name}` : `${a} removed a file` };
      return { text: name ? `${a} added ${name}` : `${a} added a file` };
    }
    case "CHECKLIST": {
      const title = quoted(s(d.title));
      // The edits to the list itself name their action; a tick carries `done`.
      if (d.action === "renamed") {
        const from = quoted(s(d.from));
        const to = quoted(s(d.to));
        return { text: from && to ? `${a} renamed ${from} to ${to}` : `${a} renamed ${title || "an item"}` };
      }
      if (d.action === "removed") return { text: `${a} removed ${title || "an item"}` };
      if (d.action === "restored") return { text: `${a} put back ${title || "an item"}` };
      if (d.done === true) return { text: `${a} checked ${title || "an item"}` };
      if (d.done === false) return { text: `${a} unchecked ${title || "an item"}` };
      return { text: `${a} updated ${title || "the checklist"}` };
    }
    case "ACCESS":
      return { text: `${a} changed who can see this` };
    case "REPEAT_CREATED": {
      const due = s(d.due);
      const next = s(d.next);
      return {
        text: due ? `Next repeat created, due ${fmtShortDay(due, today)}` : "Next repeat created",
        ...(next ? { href: `/tasks/${next}` } : {}),
      };
    }
    case "REPEAT": {
      // Turning repeats on, changing them or turning them off (activity 2.3 rule 9): `to` is the rule now, null when off.
      if (d.to == null) return { text: `${a} turned off repeats` };
      const rule = parseRepeatRule(d.to);
      return { text: rule ? `${a} set this to repeat ${describeRepeat(rule).replace(/^Every/, "every")}` : `${a} changed how this repeats` };
    }
    case "CONFLICT":
      return { text: e.body ? `Asana sync conflict: ${e.body}` : "Asana and the app disagreed on a change" };
    case "COMMENT":
      return { text: e.body ?? "" };
  }
}

/**
 * Events (any order) into timeline entries, oldest first. Back-to-back due
 * date changes fold into one line; a single one stays a normal line.
 */
export function buildActivity<E extends ActivityEvent>(events: readonly E[], names: ActivityNames, today: Ymd): ActivityEntry<E>[] {
  const sorted = [...events].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || x.id.localeCompare(y.id));
  const out: ActivityEntry<E>[] = [];
  let run: E[] = [];

  const flush = () => {
    if (run.length === 0) return;
    if (run.length === 1) {
      const e = run[0];
      out.push({ type: "line", id: e.id, at: e.createdAt, event: e, text: eventLine(e, names, today).text });
    } else {
      const last = run[run.length - 1];
      const to = s(dataOf(last).to);
      out.push({
        type: "due-run",
        id: last.id,
        at: last.createdAt,
        events: run,
        text: `Due moved ${run.length}× · ${to ? `now ${fmtShortDay(to, today)}` : "cleared"}`,
      });
    }
    run = [];
  };

  for (const e of sorted) {
    if (e.kind === "DUE") {
      run.push(e);
      continue;
    }
    flush();
    if (e.kind === "COMMENT") out.push({ type: "comment", id: e.id, at: e.createdAt, event: e });
    else out.push({ type: "line", id: e.id, at: e.createdAt, event: e, ...eventLine(e, names, today) });
  }
  flush();
  return out;
}

/** The latest `shown` entries, and how many earlier ones are folded away. */
export function splitEarlier<T>(entries: readonly T[], shown = 15): { earlier: T[]; latest: T[] } {
  const cut = Math.max(0, entries.length - shown);
  return { earlier: entries.slice(0, cut), latest: entries.slice(cut) };
}

/** Entries grouped under their day, in order. `dayOf` gives each entry's day. */
export function groupByDay<T>(entries: readonly T[], dayOf: (t: T) => Ymd): { day: Ymd; entries: T[] }[] {
  const groups: { day: Ymd; entries: T[] }[] = [];
  for (const t of entries) {
    const day = dayOf(t);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(t);
    else groups.push({ day, entries: [t] });
  }
  return groups;
}
