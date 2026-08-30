"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { TASK_BUCKETS } from "@/lib/config";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
] as const;

export function TaskFilters({
  current,
  properties,
}: {
  current: { status: string; assignee: string; bucket: string; q: string; property: string };
  properties: { id: string; address: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    const isDefault =
      (key === "status" && value === "open") ||
      (key === "assignee" && value === "all") ||
      (key === "bucket" && value === "all") ||
      !value;
    if (isDefault) next.delete(key);
    else next.set(key, value);
    router.push(`/tasks?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        defaultValue={current.q}
        onKeyDown={(e) => {
          if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value);
        }}
        placeholder="Filter by title…  (Enter)"
        className="h-8 w-64 rounded-lg border border-border bg-surface px-2.5 text-xs outline-none focus:border-primary"
      />

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5">
          {STATUS_TABS.map((t) => (
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
            </button>
          ))}
        </div>

        <button
          onClick={() => set("assignee", current.assignee === "me" ? "all" : "me")}
          className={cn(
            "rounded-lg px-2.5 py-1.5 text-xs font-medium",
            current.assignee === "me"
              ? "bg-primary text-primary-foreground"
              : "bg-surface text-muted hover:text-foreground",
          )}
        >
          Mine
        </button>

        <select
          value={current.bucket}
          onChange={(e) => set("bucket", e.target.value)}
          className="h-8 rounded-lg border border-border bg-surface px-2 text-xs"
        >
          <option value="all">All buckets</option>
          {TASK_BUCKETS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <select
          value={current.property}
          onChange={(e) => set("property", e.target.value)}
          className="h-8 max-w-[180px] rounded-lg border border-border bg-surface px-2 text-xs"
        >
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.address.split(",")[0]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
