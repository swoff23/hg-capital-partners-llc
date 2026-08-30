"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

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
  current: { status: string; q: string; sort: string };
}) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value && value !== "active" && value !== "next") next.set(key, value);
    else next.delete(key);
    router.push(`/deals?${next.toString()}`);
  }

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
        defaultValue={current.q}
        onKeyDown={(e) => {
          if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value);
        }}
        placeholder="Filter by address…  (Enter)"
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
                current.status === t.key
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              {t.label}
              <span className="ml-1 opacity-60">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <select
          value={current.sort}
          onChange={(e) => set("sort", e.target.value)}
          className="h-8 rounded-lg border border-border bg-surface px-2 text-xs"
        >
          <option value="next">Sort: next action due</option>
          <option value="activity">Sort: recently updated</option>
        </select>
      </div>
    </div>
  );
}
