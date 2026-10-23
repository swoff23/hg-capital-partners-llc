"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Button as AriaButton } from "react-aria-components";
import { Popover, PopoverTrigger } from "@/components/popover";
import { DEAL_STATUSES, dealStatusTone, toneClass } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Multi-pick status filter: a checklist popover writing a comma-joined
 * `statuses` param. Built on Popover, so it stays on screen wherever the
 * filter row puts the button (on a phone the row wraps it to the left edge).
 */
export function StatusMultiSelect({ selected }: { selected: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

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
    <PopoverTrigger>
      <AriaButton
        className={cn(
          "h-8 max-w-[180px] truncate rounded-lg border border-border bg-surface px-2 text-left text-xs",
          selected.length === 0 && "text-muted",
        )}
      >
        {label}
      </AriaButton>
      <Popover aria-label="Statuses" placement="bottom end" offset={4} className="p-1.5">
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
      </Popover>
    </PopoverTrigger>
  );
}
