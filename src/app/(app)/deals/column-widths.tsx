"use client";
import { createContext, useContext, useRef, useSyncExternalStore, type ReactNode } from "react";
import { COLUMN_DROP, DEFAULT_COLUMN_WIDTHS, type ColumnKey } from "./columns";

/* v2: v1 saved every column whenever one was dragged, which pinned the old
   defaults for anyone who had resized anything. v2 saves only the columns
   someone dragged, so a change to the defaults reaches everyone else. */
const STORAGE_KEY = "hgos-deals-col-widths-v2";
const MIN_WIDTH = 60;

type Widths = Record<ColumnKey, number>;

/* ------------------------------------------------------------------ *
 * Module-level store, read via useSyncExternalStore: the server (and the
 * client's first hydration pass) always see DEFAULT_COLUMN_WIDTHS, so
 * there's no hydration mismatch. The saved widths swap in right after,
 * once getSnapshot is free to touch localStorage.
 * ------------------------------------------------------------------ */
let saved: Partial<Widths> = {};
let widths: Widths = DEFAULT_COLUMN_WIDTHS;
let loaded = false;
const listeners = new Set<() => void>();

function getSnapshot(): Widths {
  if (!loaded) {
    loaded = true;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
      for (const key of Object.keys(DEFAULT_COLUMN_WIDTHS) as ColumnKey[]) {
        const w = stored[key];
        if (typeof w === "number" && Number.isFinite(w)) saved[key] = Math.max(MIN_WIDTH, Math.round(w));
      }
      widths = { ...DEFAULT_COLUMN_WIDTHS, ...saved };
    } catch {}
  }
  return widths;
}

function getServerSnapshot(): Widths {
  return DEFAULT_COLUMN_WIDTHS;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Sets a column's width; null goes back to its default. Only dragged columns are saved. */
function setWidth(key: ColumnKey, width: number | null) {
  saved = { ...saved, [key]: width === null ? undefined : Math.max(MIN_WIDTH, Math.round(width)) };
  if (width === null) delete saved[key];
  widths = { ...DEFAULT_COLUMN_WIDTHS, ...saved };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {}
  listeners.forEach((l) => l());
}

const ColumnWidthsContext = createContext<{
  widths: Widths;
  setWidth: (key: ColumnKey, width: number | null) => void;
} | null>(null);

/** Column widths, drag-resized and remembered per browser (see ResizeHandle). */
export function ColumnWidthsProvider({ children }: { children: ReactNode }) {
  const widths = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return <ColumnWidthsContext.Provider value={{ widths, setWidth }}>{children}</ColumnWidthsContext.Provider>;
}

function useColumnWidths() {
  const ctx = useContext(ColumnWidthsContext);
  if (!ctx) throw new Error("useColumnWidths must be used inside ColumnWidthsProvider");
  return ctx;
}

/**
 * Drives each column's actual rendered width; the table needs `style={{ tableLayout: "fixed" }}`.
 * A dropped column's col drops with it, so the widths stay on the columns that show.
 */
export function Cols() {
  const { widths } = useColumnWidths();
  return (
    <colgroup>
      {(Object.keys(DEFAULT_COLUMN_WIDTHS) as ColumnKey[]).map((key) => (
        <col key={key} className={COLUMN_DROP[key] || undefined} style={{ width: widths[key] }} />
      ))}
    </colgroup>
  );
}

/** Drag handle for a column's right edge. Place inside a positioned header cell (thClass is sticky). */
export function ResizeHandle({ columnKey }: { columnKey: ColumnKey }) {
  const { widths, setWidth } = useColumnWidths();
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { startX: e.clientX, startWidth: widths[columnKey] };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: PointerEvent) {
      if (!drag.current) return;
      setWidth(columnKey, drag.current.startWidth + (ev.clientX - drag.current.startX));
    }
    function onUp() {
      drag.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <span
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setWidth(columnKey, null);
      }}
      title="Drag to resize · double-click to reset"
      className="group absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none select-none"
    >
      {/* Translate only this cosmetic line onto the border; translating the hit-box itself gets it shadowed by the next th. */}
      <span className="mx-auto block h-full w-px translate-x-1/2 bg-transparent group-hover:bg-line-control group-active:bg-act" />
    </span>
  );
}
