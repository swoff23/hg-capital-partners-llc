"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
] as const;

type Owner = { value: string; label: string };

export function TaskFilters({
  current,
  owners,
  properties,
}: {
  current: { status: string; owner: string; q: string; property: string };
  owners: { users: Owner[]; external: Owner[] };
  properties: { id: string; address: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string, { replace = false }: { replace?: boolean } = {}) {
    const next = new URLSearchParams(params);
    const isDefault = (key === "status" && value === "open") || !value;
    if (isDefault) next.delete(key);
    else next.set(key, value);
    if (key === "owner") next.delete("assignee"); // supersedes the legacy shortcut
    const url = `/tasks?${next.toString()}`;
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter by title…"
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

        <select
          value={current.owner}
          onChange={(e) => set("owner", e.target.value)}
          className="h-8 max-w-[180px] rounded-lg border border-border bg-surface px-2 text-xs"
        >
          <option value="">All owners</option>
          <option value="none">Unassigned</option>
          {owners.users.length > 0 && (
            <optgroup label="Team">
              {owners.users.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {owners.external.length > 0 && (
            <optgroup label="External">
              {owners.external.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
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
