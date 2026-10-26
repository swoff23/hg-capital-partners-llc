"use client";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  DRAFT_MAX_AGE_DAYS,
  decodeDraft,
  draftStorageKey,
  encodeDraft,
  stableJson,
  trackDraft,
  type DraftEntry,
  type DraftTrack,
} from "@/lib/drafts";

/*
 * Drafts live in localStorage, with memory behind it for when storage is off
 * (a private window, blocked site data): the page works without it, and a
 * draft still survives moving between pages in this tab. Every read and
 * write sits in try/catch.
 */
const memory = new Map<string, string>();
/** The draft each key opened with, read once per mount, so `restored` doesn't follow the person's typing. */
const opened = new Map<string, DraftEntry<unknown> | null>();
const listeners = new Set<() => void>();

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(draftStorageKey(key));
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeRaw(key: string, raw: string) {
  memory.set(key, raw);
  try {
    localStorage.setItem(draftStorageKey(key), raw);
  } catch {}
}

function removeRaw(key: string) {
  memory.delete(key);
  try {
    localStorage.removeItem(draftStorageKey(key));
  } catch {}
}

function openDraft(key: string, maxAgeDays: number): DraftEntry<unknown> | null {
  if (!opened.has(key)) {
    const raw = readRaw(key);
    const entry = decodeDraft<unknown>(raw, Date.now(), maxAgeDays);
    // An expired or unreadable draft is thrown away on sight.
    if (raw && !entry) removeRaw(key);
    opened.set(key, entry);
  }
  return opened.get(key) ?? null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const notify = () => listeners.forEach((l) => l());

export type UseDraft<T> = {
  /**
   * The draft found when the editor opened, or null: put it back into the
   * editor's state. It stays the same while the person types, until
   * `clear`. Null through the server render and hydration, so a page
   * editor sees it arrive just after; an editor that mounts later (a sheet
   * opening) has it on its first render.
   */
  restored: T | null;
  /** When the restored draft was written: "Draft from 2:10 PM". Null with nothing restored. */
  savedAt: Date | null;
  /** Throws the draft away: on success, on Discard and on Start over. `restored` goes back to null. */
  clear: () => void;
};

/**
 * Keeps an editor's unsaved work in this browser (forms 2.11), so a reload, a
 * back swipe or a closed tab doesn't lose it. Pass the editor's current
 * value on every render; the hook writes it down whenever it differs from
 * what the editor opened with, and lets it go when it's changed back. It
 * clears itself after `maxAgeDays` (7 by default).
 *
 *   const { restored, savedAt, clear } = useDraft(`new-task:${propertyId ?? "none"}`, values);
 *
 * The key holds the editor, the record and the version it opened with, so a
 * draft never lands on a newer version; pass null to keep nothing. What to
 * do with `restored` is the editor's: a page editor toasts "Your unsaved
 * changes are back" with Discard, a create sheet shows "Draft from 2:10 PM"
 * with Clear, the public move-in report asks in a sheet. The value must be
 * JSON (strings, numbers, booleans, arrays, plain objects).
 */
export function useDraft<T>(
  key: string | null,
  value: T,
  { maxAgeDays = DRAFT_MAX_AGE_DAYS }: { maxAgeDays?: number } = {},
): UseDraft<T> {
  const entry = useSyncExternalStore(
    subscribe,
    () => (key ? openDraft(key, maxAgeDays) : null),
    () => null,
  ) as DraftEntry<T> | null;

  const json = stableJson(value);
  const track = useRef<DraftTrack | null>(null);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });

  useEffect(() => {
    if (!key) {
      track.current = null;
      return;
    }
    const next = trackDraft(track.current, key, json);
    track.current = next.track;
    if (next.action === "write") writeRaw(key, encodeDraft(latest.current, Date.now()));
    else if (next.action === "remove") removeRaw(key);
  }, [key, json]);

  // The next time this editor opens, it reads the draft afresh.
  useEffect(() => {
    if (!key) return;
    return () => {
      opened.delete(key);
    };
  }, [key]);

  const clear = useCallback(() => {
    if (!key) return;
    removeRaw(key);
    opened.set(key, null);
    if (track.current?.key === key) track.current = { ...track.current, touched: false };
    notify();
  }, [key]);

  return { restored: entry?.value ?? null, savedAt: entry?.savedAt ?? null, clear };
}
