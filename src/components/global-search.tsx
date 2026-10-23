"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Result = { type: string; id: string; label: string; href: string };

/**
 * Header search, built as the WAI-ARIA combobox with a listbox popup: focus
 * stays in the input while the arrows move the highlight (aria-activedescendant),
 * the first result is highlighted as results arrive, Enter opens the highlighted
 * one, Esc closes the list and a second Esc clears the text, Tab closes it.
 */
export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const showList = open && results.length > 0;
  const optionId = (i: number) => `${listId}-${i}`;

  useEffect(() => {
    const term = q.trim();
    // A slow response for an earlier query must not replace the current results.
    let stale = false;
    const t = setTimeout(async () => {
      if (term.length < 2) {
        setResults([]);
        return;
      }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        if (!res.ok || stale) return;
        const next: Result[] = (await res.json()).results ?? [];
        if (stale) return;
        setResults(next);
        setActive(0);
      } catch {
        // No connection: keep the last results rather than throw.
      }
    }, 180);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(r: Result) {
    router.push(r.href);
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    const n = results.length;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
        if (n === 0) return;
        e.preventDefault();
        if (!showList) setOpen(true);
        else setActive((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
        return;
      case "Enter":
        if (!showList) return;
        e.preventDefault();
        go(results[active] ?? results[0]);
        return;
      case "Escape":
        // One Esc closes one layer: the list first, then the text.
        if (showList) setOpen(false);
        else if (q) setQ("");
        else return;
        e.preventDefault();
        e.stopPropagation();
        return;
      case "Tab":
        setOpen(false);
    }
  }

  // On a phone the header leaves the box narrow, so the results hang from the
  // header (fixed, so it's their containing block) across the page gutters,
  // and names keep their room. From sm up they sit under the box.
  return (
    <div ref={boxRef} className="w-full sm:relative">
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-label="Search"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList ? optionId(active) : undefined}
        autoComplete="off"
        placeholder="Search addresses, contractors, tasks…"
        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {showList && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          // Keep focus in the input so the keys keep working after a click.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-lg max-sm:inset-x-4 max-sm:top-full sm:w-full"
        >
          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.id}`}
              id={optionId(i)}
              type="button"
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              onMouseMove={() => setActive(i)}
              onClick={() => go(r)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                i === active && "bg-background",
              )}
            >
              {/* Wide enough for CONTRACTOR, the longest type (81px in Geist), at every width. */}
              <span className="w-22 shrink-0 text-xs font-medium uppercase text-muted">{r.type}</span>
              <span className="truncate">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
