"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DEAL_STATUSES, dealStatusTone, toneClass } from "@/lib/config";
import { cn } from "@/lib/utils";

/** Multi-pick status filter — a checklist popover writing a comma-joined `statuses` param. */
export function StatusMultiSelect({ selected }: { selected: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function apply(next: string[]) {
    const sp = new URLSearchParams(params);
    if (next.length > 0) sp.set("statuses", next.join(","));
    else sp.delete("statuses");
    sp.delete("status"); // the multiselect supersedes the quick All/Active/Pass tabs
    router.push(`/deals?${sp.toString()}`);
  }

  function toggle(s: string) {
    apply(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);
  }

  const label =
    selected.length === 0 ? "All statuses" : selected.length === 1 ? selected[0] : `${selected.length} statuses`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "h-8 max-w-[180px] truncate rounded-lg border border-border bg-surface px-2 text-left text-xs",
          selected.length === 0 && "text-muted",
        )}
      >
        {label}
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-border bg-surface p-1.5 shadow-lg"
        >
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => apply([])}
              className="mb-1 w-full rounded px-2 py-1 text-left text-xs font-medium text-primary hover:bg-background"
            >
              Clear
            </button>
          )}
          {DEAL_STATUSES.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-background"
            >
              <input
                type="checkbox"
                checked={selected.includes(s)}
                onChange={() => toggle(s)}
                className="h-3.5 w-3.5 shrink-0 rounded border-border"
              />
              <span
                className={cn(
                  "truncate rounded px-1.5 py-0.5 ring-1 ring-inset",
                  toneClass(dealStatusTone(s)),
                )}
              >
                {s}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
