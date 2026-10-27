import { DEAL_FIELD_LABEL } from "@/lib/config";
import { daysUntil, todayYmdEastern, toYmd, type Ymd } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { firstName } from "@/lib/names";
import {
  changesPhrase,
  isNoopLine,
  parseLegacyChange,
  readChange,
  sameValue,
  showValue,
  type DealChange,
  type DealChangeField,
} from "./log-core";
import { parseNoteAuthor } from "./note-author";

/**
 * A deal's record log (docs/specs/activity-comments.md 2.9, choice 3.3 A):
 * the `DealNote` rows shaped into what the page draws, newest first. Pure,
 * so record-log.test.ts runs it without a database; deal-activity.tsx loads
 * the rows and deal-log.tsx draws these.
 *
 * Notes are comment cards with their author. Change rows are system lines:
 * one person's back-to-back edits within 30 minutes fold into one sentence
 * ("Pieter changed the asking price and 2 other fields") that opens into a
 * row per field, a field edited twice in a burst shows its first and last
 * value, and a field that ended where it started shows nothing (activity
 * 2.3). Rows saved before a change carried data are read from their text; an
 * old line that recorded nothing ("Next action: — → —") is left out.
 */

/** A burst ends 30 minutes after its first edit (activity 2.3). */
export const BURST_MS = 30 * 60_000;

/** Rows older than this many days group by month once the log is opened (activity 2.3, rule 8). */
export const MONTH_AFTER_DAYS = 60;

/** The newest rows the log shows before "Show N older updates". */
export const LOG_SHOWN = 15;

/** A `DealNote` row as the log reads it, with its author's name when it has one. */
export interface LogSourceRow {
  id: string;
  source: string;
  body: string;
  noteDate: Date | null;
  createdAt: Date;
  authorUserId: string | null;
  /** The author's name, or the part of their email before the @. */
  authorName: string | null;
  editedAt: Date | null;
  data: unknown;
}

/** One field of a change, as its opened row shows it. */
export interface FieldRow {
  field: DealChangeField;
  /** "Asking price", "Stage". */
  label: string;
  /** What it was and what it is, as words ("High"); null for empty. */
  from: string | null;
  to: string | null;
  /** The amounts, for a price that reads as one number (the row draws these with Money). */
  fromAmount: number | null;
  toAmount: number | null;
}

interface Base {
  id: string;
  /** The day it sits under (Buffalo's for what was typed here; the sheet's date for an imported line); null when undated. */
  day: Ymd | null;
  /** The instant, for the time slot; null for an imported line, which has only a day. */
  at: string | null;
}

export interface NoteEntry extends Base {
  type: "note";
  /** The author's name, or the initials an old note was signed with; null when the text names nobody. */
  author: string | null;
  /** The signed-in author's id, for "your own" (menu: Edit, Delete). Null when the row has none. */
  authorUserId: string | null;
  text: string;
  editedAt: string | null;
  /** From the spreadsheet import, not typed here. */
  imported: boolean;
  /** The id the note was sent with from the note box, so the box can tell its own send has landed. */
  clientId: string | null;
}

export interface ChangeEntry extends Base {
  type: "change";
  by: string | null;
  /** "Pieter changed the stage to High". */
  sentence: string;
  /** One row per field; two or more fold behind the sentence. */
  fields: FieldRow[];
}

/** A line that isn't a field edit: "Deal created (stage High)", "Task added: …". */
export interface LineEntry extends Base {
  type: "line";
  by: string | null;
  text: string;
}

export type LogEntry = NoteEntry | ChangeEntry | LineEntry;

const isMigration = (r: LogSourceRow) => r.source === "migration";

/** The `clientId` a note was sent with, when its data holds one. */
function clientIdOf(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const id = (data as Record<string, unknown>).clientId;
  return typeof id === "string" && id ? id : null;
}

/** The instant a row sorts at; imported lines sort by their sheet date, undated ones last. */
function sortMs(r: LogSourceRow): number {
  if (isMigration(r)) return r.noteDate ? r.noteDate.getTime() : Number.NEGATIVE_INFINITY;
  return (r.noteDate ?? r.createdAt).getTime();
}

/** -1, 0 or 1; unlike a subtraction it is defined for the undated rows' -Infinity. */
const cmp = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);

function dayAndAt(r: LogSourceRow): { day: Ymd | null; at: string | null } {
  if (isMigration(r)) return { day: r.noteDate ? toYmd(r.noteDate) : null, at: null };
  const when = r.noteDate ?? r.createdAt;
  return { day: todayYmdEastern(when), at: when.toISOString() };
}

const namePart = (name: string | null | undefined) => (name ? firstName(name) || name : null);

function fieldRow(c: DealChange): FieldRow {
  const price = c.field === "theirPrice" || c.field === "ourPrice";
  return {
    field: c.field,
    label: DEAL_FIELD_LABEL[c.field],
    from: c.from === null ? null : showValue(c.field, c.from),
    to: c.to === null ? null : showValue(c.field, c.to),
    fromAmount: price && c.from !== null ? parseAmount(c.from) : null,
    toAmount: price && c.to !== null ? parseAmount(c.to) : null,
  };
}

/** A change row's edits and who made them, or null when the row is a line, not a field edit. */
function readEdit(r: LogSourceRow): { change: DealChange; by: string | null; key: string } | null {
  const parsed = parseNoteAuthor(r.body);
  const change = readChange(r.data) ?? parseLegacyChange(parsed.text);
  if (!change) return null;
  const by = namePart(r.authorName) ?? namePart(parsed.name);
  return { change, by, key: r.authorUserId ?? `n:${parsed.name ?? ""}` };
}

interface Burst {
  key: string;
  by: string | null;
  start: number;
  last: LogSourceRow;
  fields: Map<DealChangeField, DealChange>;
}

/** A burst's net edits: each field from its first value to its last, a field back where it started dropped. */
function netChanges(burst: Burst): DealChange[] {
  return [...burst.fields.values()].filter((c) => !sameValue(c.field, c.from, c.to));
}

function changeEntry(burst: Burst, changes: DealChange[]): ChangeEntry {
  const { day, at } = dayAndAt(burst.last);
  return {
    type: "change",
    id: burst.last.id,
    day,
    at,
    by: burst.by,
    sentence: `${burst.by ?? "Someone"} ${changesPhrase(changes)}`,
    fields: changes.map(fieldRow),
  };
}

/**
 * The log, newest first. `rows` are the deal's notes that aren't deleted, in
 * any order.
 */
export function buildDealLog(rows: readonly LogSourceRow[]): LogEntry[] {
  const ordered = [...rows].sort((a, b) => cmp(sortMs(a), sortMs(b)) || cmp(a.createdAt.getTime(), b.createdAt.getTime()) || a.id.localeCompare(b.id));
  const out: { ms: number; created: number; entry: LogEntry }[] = [];
  // The burst being built; a holder, so the closure's writes are seen by the loop below.
  const open: { burst: Burst | null } = { burst: null };

  const flush = () => {
    const burst = open.burst;
    if (!burst) return;
    open.burst = null;
    const changes = netChanges(burst);
    if (changes.length > 0) out.push({ ms: sortMs(burst.last), created: burst.last.createdAt.getTime(), entry: changeEntry(burst, changes) });
  };

  for (const r of ordered) {
    if (r.source !== "change") {
      flush();
      const { day, at } = dayAndAt(r);
      const parsed = parseNoteAuthor(r.body);
      // A note with an author on its row is shown as typed; an old one is shown without the name or initials pasted into it.
      const text = r.authorUserId ? r.body.trim() : parsed.text;
      out.push({
        ms: sortMs(r),
        created: r.createdAt.getTime(),
        entry: {
          type: "note",
          id: r.id,
          day,
          at,
          author: r.authorName ?? parsed.name ?? parsed.initials,
          authorUserId: r.authorUserId,
          text,
          editedAt: r.editedAt ? r.editedAt.toISOString() : null,
          imported: isMigration(r),
          clientId: clientIdOf(r.data),
        },
      });
      continue;
    }

    const edit = readEdit(r);
    if (!edit) {
      flush();
      const parsed = parseNoteAuthor(r.body);
      // An old line that recorded nothing is left out.
      if (isNoopLine(parsed.text)) continue;
      const { day, at } = dayAndAt(r);
      out.push({
        ms: sortMs(r),
        created: r.createdAt.getTime(),
        entry: { type: "line", id: r.id, day, at, by: namePart(r.authorName) ?? namePart(parsed.name), text: parsed.text },
      });
      continue;
    }

    const ms = sortMs(r);
    if (open.burst && (open.burst.key !== edit.key || ms - open.burst.start > BURST_MS)) flush();
    const burst = (open.burst ??= { key: edit.key, by: edit.by, start: ms, last: r, fields: new Map() });
    burst.last = r;
    const seen = burst.fields.get(edit.change.field);
    burst.fields.set(edit.change.field, seen ? { ...seen, to: edit.change.to } : edit.change);
  }
  flush();

  return out.sort((a, b) => cmp(b.ms, a.ms) || cmp(b.created, a.created)).map((o) => o.entry);
}

/** A heading's worth of entries. */
export interface LogGroup {
  /** Stable across renders: the day, the month, or "undated". */
  key: string;
  kind: "day" | "month" | "undated";
  /** The day (or any day of the month) it heads; null for undated. */
  day: Ymd | null;
  entries: LogEntry[];
}

/**
 * Groups entries (already newest first) under day headings, and undated
 * imported lines last under "Undated". With `months` (the log opened past its
 * newest 15), rows older than 60 days sit under month headings instead, and
 * their time slot reads the day, so `kind` tells the caller which to draw.
 */
export function groupLog(entries: readonly LogEntry[], today: Ymd, opts: { months?: boolean } = {}): LogGroup[] {
  const months = opts.months ?? true;
  const groups: LogGroup[] = [];
  for (const entry of entries) {
    let kind: LogGroup["kind"] = "day";
    let key = entry.day ?? "undated";
    if (entry.day === null) {
      kind = "undated";
    } else if (months && (daysUntil(entry.day, today) ?? 0) < -MONTH_AFTER_DAYS) {
      kind = "month";
      key = entry.day.slice(0, 7);
    }
    const last = groups.at(-1);
    if (last && last.kind === kind && last.key === key) {
      last.entries.push(entry);
    } else {
      groups.push({ key, kind, day: entry.day, entries: [entry] });
    }
  }
  return groups;
}
