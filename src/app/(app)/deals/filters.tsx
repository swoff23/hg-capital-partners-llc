"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { StatusMultiSelect } from "./status-multiselect";

const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "Pass", label: "Pass" },
] as const;

export function DealFilters({
  statusCounts,
  current,
}: {
  statusCounts: Record<string, number>;
  current: { status: string; statuses: string[]; q: string };
}) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string, { replace = false }: { replace?: boolean } = {}) {
    const next = new URLSearchParams(params);
    if (value && value !== "active") next.set(key, value);
    else next.delete(key);
    if (key === "status") next.delete("statuses"); // a tab click supersedes the multiselect
    const url = `/deals?${next.toString()}`;
    if (replace) router.replace(url);
    else router.push(url);
  }

  // Live search: filter as you type, debounced, without stacking browser history.
  const [q, setQ] = useState(current.q);
  useEffect(() => {
    if (q.trim() === current.q) return;
    const id = setTimeout(() => set("q", q.trim(), { replace: true }), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, current.q]);

  const totalAll = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const passCount = statusCounts["Pass"] ?? 0;
  const counts: Record<string, number> = {
    active: totalAll - passCount - (statusCounts["CLOSED!"] ?? 0),
    all: totalAll,
    Pass: passCount,
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter by address…"
        className="h-8 w-64 rounded-lg border border-border bg-surface px-2.5 text-xs outline-none focus:border-primary"
      />
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => set("status", t.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                current.statuses.length === 0 && current.status === t.key
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              {t.label}
              <span className="ml-1 opacity-60">{counts[t.key]}</span>
            </button>
          ))}
        </div>

        <StatusMultiSelect selected={current.statuses} />
      </div>
    </div>
  );
}
