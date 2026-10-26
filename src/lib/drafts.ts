/**
 * The rules behind `useDraft` (components/use-draft.ts, forms 2.11): how a
 * draft is stored in this browser, when it has expired, and when a change to
 * an editor's value is worth writing down. Pure, so drafts.test.ts can run
 * them without a browser.
 *
 * A draft is stored as `{ v: 1, at, value }` under "hg-draft:<key>". The key
 * names the editor, the record and the version it opened with
 * ("unit:prop_1:2026-10-26T14:02:11.000Z:unit-2"), so a draft typed against
 * an older version never lands on a newer one.
 */

import { HG_TIME_ZONE, fmtDay, todayYmdEastern } from "./dates";

/** Where drafts live in localStorage. The task composer keeps its own "hgos-task-draft:" entries. */
export const DRAFT_PREFIX = "hg-draft:";

/** How long a draft is kept unless the hook says otherwise. */
export const DRAFT_MAX_AGE_DAYS = 7;

const DAY_MS = 86_400_000;

export function draftStorageKey(key: string): string {
  return DRAFT_PREFIX + key;
}

/** A draft as it comes back: the value and when it was written. */
export type DraftEntry<T> = { value: T; savedAt: Date };

/**
 * The line a create sheet shows over a restored draft (forms 2.11), in
 * Buffalo time: "Draft from 2:10 PM" for one written today, "Draft from Oct
 * 24" for an older one.
 */
export function draftLabel(savedAt: Date, now: Date = new Date()): string {
  const day = todayYmdEastern(savedAt);
  if (day === todayYmdEastern(now)) {
    return `Draft from ${savedAt.toLocaleTimeString("en-US", { timeZone: HG_TIME_ZONE, hour: "numeric", minute: "2-digit" })}`;
  }
  return `Draft from ${fmtDay(day, { year: "auto", now })}`;
}

/** Older than `maxAgeDays`: thrown away on read. */
export function isDraftExpired(at: number, now: number, maxAgeDays: number = DRAFT_MAX_AGE_DAYS): boolean {
  return now - at > maxAgeDays * DAY_MS;
}

/**
 * Whether a stored draft is past `maxAgeDays`, read from the raw text without
 * deciding anything else about it. For the sweep of drafts nobody opens any
 * more (an editor's version moved on, so its old key is never read again):
 * unreadable text and other formats are left alone, since only an editor that
 * knows them can say they're worthless.
 */
export function isStoredDraftExpired(raw: string | null | undefined, now: number, maxAgeDays: number = DRAFT_MAX_AGE_DAYS): boolean {
  if (!raw) return false;
  try {
    const at = (JSON.parse(raw) as { at?: unknown } | null)?.at;
    return typeof at === "number" && Number.isFinite(at) && isDraftExpired(at, now, maxAgeDays);
  } catch {
    return false;
  }
}

/**
 * When a draft being written was typed. The draft the editor opened with,
 * written again unchanged (opening it puts the restored value back, which
 * counts as a change), keeps its own time; otherwise opening it would restart
 * the 7 days and "Draft from 2:10 PM" would say when it was last opened.
 */
export function draftWrittenAt(opened: { json: string; at: number } | null, json: string, now: number): number {
  return opened && opened.json === json ? opened.at : now;
}

export function encodeDraft(value: unknown, at: number): string {
  return JSON.stringify({ v: 1, at, value });
}

/**
 * The stored draft, or null when there's none, it doesn't parse, it's from
 * another version of this format, or it has expired.
 */
export function decodeDraft<T>(raw: string | null | undefined, now: number, maxAgeDays: number = DRAFT_MAX_AGE_DAYS): DraftEntry<T> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { v, at, value } = parsed as { v?: unknown; at?: unknown; value?: unknown };
  if (v !== 1 || typeof at !== "number" || !Number.isFinite(at) || value === undefined) return null;
  if (isDraftExpired(at, now, maxAgeDays)) return null;
  return { value: value as T, savedAt: new Date(at) };
}

/**
 * JSON with object keys sorted, so two values that hold the same thing
 * compare equal however their objects were built. Arrays keep their order.
 */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  ) ?? "undefined";
}

/**
 * What the hook remembers about one editor's value: the key it's for, the
 * value it opened with (`baseline`), the last value it saw, and whether the
 * person has changed anything since it opened.
 */
export type DraftTrack = { key: string; baseline: string; last: string; touched: boolean };

/**
 * Decides what a new value means for the stored draft:
 *  - a new key (or the first value seen) is the editor opening: remember it, write nothing;
 *  - the same value as last time: nothing;
 *  - back to what it opened with, after a change: the draft goes ("remove");
 *  - anything else is unsaved work: write it.
 * Nothing is removed on open, so a draft waiting to be restored survives the
 * editor's first render with its loaded values.
 */
export function trackDraft(
  prev: DraftTrack | null,
  key: string,
  json: string,
): { track: DraftTrack; action: "write" | "remove" | "none" } {
  if (!prev || prev.key !== key) return { track: { key, baseline: json, last: json, touched: false }, action: "none" };
  if (json === prev.last) return { track: prev, action: "none" };
  if (json === prev.baseline) return { track: { ...prev, last: json }, action: prev.touched ? "remove" : "none" };
  return { track: { ...prev, last: json, touched: true }, action: "write" };
}
