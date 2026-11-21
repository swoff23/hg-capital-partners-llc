"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ListTask } from "@/lib/tasks/list";
import { inScope, noPicks, pickState, prunePicks, setPicks, togglePick, type PickState } from "@/lib/tasks/picks";
import { useTaskList } from "./task-list-context";

/**
 * The Tasks list's picked rows, for bulk edit (docs/specs/bulk-edit.md): Cmd-
 * click and taps (`toggle`), Shift-click ranges, a heading's Select or
 * Deselect and Select all (`setMany`), and Esc to clear. The picks stay after
 * an edit and clear when `scope` changes (the view, a filter or the search;
 * sorting and Show more keep them), for good: going back to an earlier scope
 * starts with none. A picked task that leaves the list drops out of `picked`;
 * the bar goes when it's empty. The rules are lib/tasks/picks.ts. Inside a
 * TaskListProvider; rows read it through `usePicks()`, which is null on lists
 * without bulk edit (Home's Today).
 */

export type { PickState };

export interface PicksApi {
  /** The picked rows still in the list, in list order. */
  picked: ListTask[];
  /** Every row on screen, in list order: what Select all picks. */
  all: string[];
  has: (id: string) => boolean;
  /** Any row picked: the bar is up, the headings offer Select or Deselect, and a tap picks on touch. */
  on: boolean;
  /** One row; with `range` (Shift), every row from the last one toggled to this one, in list order. */
  toggle: (id: string, opts?: { range?: boolean }) => void;
  /** These rows together: a heading's Select or Deselect, or Select all. */
  setMany: (ids: readonly string[], pick: boolean) => void;
  stateOf: (ids: readonly string[]) => PickState;
  clear: () => void;
}

const PicksContext = createContext<PicksApi | null>(null);

/** The list's picks, or null where the list has no bulk edit. */
export function usePicks(): PicksApi | null {
  return useContext(PicksContext);
}

/** Something above the list that Esc closes first: a picker, menu, sheet or dialog. */
const LAYER = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

export function TaskPicksProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const { tasks } = useTaskList();
  const [stored, setStored] = useState(() => noPicks(scope));
  // A new scope drops the old picks for good (the page stays mounted across search-param changes, so they would
  // otherwise come back with the scope).
  if (stored.scope !== scope) setStored(noPicks(scope));
  // A picked row that left the list (finished in Open, moved out of the filter, past the first page after a sort)
  // is dropped for good, so it comes back unpicked.
  const onScreen = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks]);
  const kept = prunePicks(inScope(stored, scope), onScreen);
  if (stored.scope === scope && kept !== stored) setStored(kept);
  const picks = kept;

  const picked = useMemo(() => tasks.filter((t) => picks.ids.has(t.id)), [tasks, picks.ids]);

  const api = useMemo<PicksApi>(() => {
    const order = tasks.map((t) => t.id);
    const change = (edit: (p: typeof picks) => typeof picks) => setStored((prev) => edit(inScope(prev, scope)));
    return {
      picked,
      all: order,
      has: (id) => picks.ids.has(id),
      on: picked.length > 0,
      toggle: (id, opts) => change((p) => togglePick(p, order, id, opts?.range)),
      setMany: (ids, pick) => change((p) => setPicks(p, ids, pick)),
      stateOf: (ids) => pickState(picks.ids, ids),
      clear: () => setStored(noPicks(scope)),
    };
  }, [tasks, picked, picks.ids, scope]);

  // Esc clears the picks once nothing above the list is open (one Esc, one layer), and a field keeps Esc for
  // itself. A layer counts even when focus has left it (a busy Delete dialog's disabled buttons drop focus).
  const { on, clear } = api;
  useEffect(() => {
    if (!on) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector(LAYER)) return;
      clear();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [on, clear]);

  return <PicksContext value={api}>{children}</PicksContext>;
}
