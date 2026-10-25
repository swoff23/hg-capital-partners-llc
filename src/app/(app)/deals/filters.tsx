"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Search, SlidersHorizontal } from "lucide-react";
import { ACTIVE_DEAL_STATUSES } from "@/lib/config";
import { SegmentedControl } from "@/components/segmented-control";
import { Sheet } from "@/components/sheet";
import { Badge, Button, Input, chromeIconClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { StatusChecklist, StatusMultiSelect, filterRowClass, useApplyStatuses } from "./status-multiselect";

const TABS = [
  { key: "all", label: "All" },
  { key: "5 - TBD", label: "TBD" },
  { key: "active", label: "Active" },
  { key: "Pass", label: "Pass" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * The deals filter bar: the address search, the quick views and the status
 * checklist, all in the URL. From sm the bar holds all three on one row; the
 * search gives up width first, so the row never wraps. Below sm the search
 * keeps the row and the views and statuses sit behind one Filters button
 * that opens a sheet, its count showing how many filters narrow the list.
 */
export function DealFilters({
  statusCounts,
  current,
}: {
  statusCounts: Record<string, number>;
  current: { status: string; statuses: string[]; q: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const applyStatuses = useApplyStatuses();
  const [sheetOpen, setSheetOpen] = useState(false);

  function set(key: string, value: string, { replace = false }: { replace?: boolean } = {}) {
    const next = new URLSearchParams(params);
    if (value && value !== "active") next.set(key, value);
    else next.delete(key);
    if (key === "status") next.delete("statuses"); // a quick view supersedes the checklist
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

  const counts: Record<TabKey, number> = {
    all: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    "5 - TBD": statusCounts["5 - TBD"] ?? 0,
    active: ACTIVE_DEAL_STATUSES.reduce((sum, s) => sum + (statusCounts[s] ?? 0), 0),
    Pass: statusCounts["Pass"] ?? 0,
  };
  const view: TabKey | null =
    current.statuses.length === 0 ? (TABS.find((t) => t.key === current.status)?.key ?? null) : null;
  const toggleStatus = (s: string) =>
    applyStatuses(current.statuses.includes(s) ? current.statuses.filter((x) => x !== s) : [...current.statuses, s]);

  // What narrows the list: each picked status, or the one view other than All
  // (the default Active view counts, since it hides TBD, Holding, Closed and Pass).
  const filterCount = current.statuses.length > 0 ? current.statuses.length : current.status === "all" ? 0 : 1;

  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-64">
        <Search
          aria-hidden="true"
          className={cn(chromeIconClass, "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3")}
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a deal"
          aria-label="Filter by address"
          className="h-8 pl-8 pointer-coarse:pl-9"
        />
      </div>

      <div className="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
        <SegmentedControl
          aria-label="Deal status"
          options={TABS.map((t) => ({ ...t, count: counts[t.key] }))}
          value={view}
          onChange={(key) => set("status", key)}
        />
        <StatusMultiSelect selected={current.statuses} />
      </div>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setSheetOpen(true)}
        className="shrink-0 sm:hidden"
      >
        <SlidersHorizontal aria-hidden="true" className={chromeIconClass} />
        Filters
        {filterCount > 0 && <Badge className="num">{filterCount}</Badge>}
      </Button>

      <Sheet title="Filters" isOpen={sheetOpen} onOpenChange={setSheetOpen}>
        {({ close }) => (
          <>
            <div className="space-y-4 p-2 pt-3">
              <section aria-labelledby="deal-filters-show">
                <h3 id="deal-filters-show" className="px-2 pb-1 text-meta font-medium text-fg-2">
                  Show
                </h3>
                <ul>
                  {TABS.map((t) => (
                    <li key={t.key}>
                      <button
                        type="button"
                        aria-pressed={view === t.key}
                        onClick={() => set("status", t.key)}
                        className={filterRowClass}
                      >
                        {t.label}
                        <span className="num text-fg-3">{counts[t.key]}</span>
                        <Check
                          aria-hidden="true"
                          className={cn(chromeIconClass, "ml-auto text-fg-1", view !== t.key && "invisible")}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-labelledby="deal-filters-statuses">
                {/* As tall as Clear on touch before Clear appears, so ticking a status never moves the list. */}
                <div className="flex min-h-6 items-center justify-between gap-3 px-2 pb-1 pointer-coarse:min-h-11">
                  <h3 id="deal-filters-statuses" className="text-meta font-medium text-fg-2">
                    Statuses
                  </h3>
                  {current.statuses.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => applyStatuses([])}>
                      Clear
                    </Button>
                  )}
                </div>
                <StatusChecklist selected={current.statuses} onToggle={toggleStatus} />
              </section>
            </div>
            <div className="sticky bottom-0 border-t border-line bg-raised p-4">
              <Button type="button" onClick={close} className="w-full">
                Done
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
