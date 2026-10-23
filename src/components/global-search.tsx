"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Result = { type: string; id: string; label: string; href: string };

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    const t = setTimeout(async () => {
      if (term.length < 2) {
        setResults([]);
        return;
      }
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      if (res.ok) setResults((await res.json()).results ?? []);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // On a phone the header leaves the box narrow, so the results hang from the
  // header (fixed, so it's their containing block) across the page gutters,
  // and names keep their room. From sm up they sit under the box.
  return (
    <div ref={boxRef} className="w-full sm:relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search addresses, contractors, tasks…"
        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-lg max-sm:inset-x-4 max-sm:top-full sm:w-full">
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => {
                router.push(r.href);
                setOpen(false);
                setQ("");
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-background",
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
