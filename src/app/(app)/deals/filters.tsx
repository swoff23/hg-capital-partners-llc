"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = ["all", "Active", "Under Contract", "Pass"] as const;

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
    if (value && value !== "all" && value !== "next") next.set(key, value);
    else next.delete(key);
    router.push(`/deals?${next.toString()}`);
  }

  const totalAll = Object.values(statusCounts).reduce((a, b) => a + b, 0);

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
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => set("status", t)}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-xs font-medium",
                current.status === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-muted hover:text-foreground",
              )}
            >
              {t === "all" ? "All" : t}
              <span className="ml-1 opacity-70">{t === "all" ? totalAll : (statusCounts[t] ?? 0)}</span>
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
