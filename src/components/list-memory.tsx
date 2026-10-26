"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { listCookieString, listHref, plainListHrefs, type ListHrefs, type ListKey } from "@/lib/list-memory";

/**
 * Remembered lists, on the client (docs/specs/selectors.md 3.7, IA-036). The
 * layout reads each list's cookie on the server and hands `AppShell` the
 * hrefs, so the sidebar's links are right on first paint. The layout doesn't
 * render again on a client navigation, so the shell keeps those hrefs here:
 * when a list's filter bar changes its query it writes the cookie and the
 * sidebar's link for that list follows at once.
 *
 *   const remember = useRememberList();
 *   remember("tasks", "status=done");   // the cookie, and the sidebar's Tasks link
 *   remember("tasks", "");              // Clear filters writes the default
 */

type Memory = { hrefs: ListHrefs; remember: (list: ListKey, query: string) => void };

const MemoryContext = createContext<Memory>({ hrefs: plainListHrefs(), remember: () => {} });

export function ListMemoryProvider({ initial, children }: { initial: ListHrefs; children: ReactNode }) {
  const [hrefs, setHrefs] = useState(initial);
  const remember = useCallback((list: ListKey, query: string) => {
    try {
      document.cookie = listCookieString(list, query);
    } catch {}
    setHrefs((h) => ({ ...h, [list]: listHref(list, query) }));
  }, []);
  const value = useMemo(() => ({ hrefs, remember }), [hrefs, remember]);
  return <MemoryContext value={value}>{children}</MemoryContext>;
}

/** Each list's href, with its remembered query: what the sidebar links to. */
export function useListHrefs(): ListHrefs {
  return useContext(MemoryContext).hrefs;
}

/** Keeps a list's query: writes its cookie and moves the sidebar's link. */
export function useRememberList(): (list: ListKey, query: string) => void {
  return useContext(MemoryContext).remember;
}
