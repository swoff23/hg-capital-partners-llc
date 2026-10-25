"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { Popover, PopoverTrigger } from "@/components/popover";
import { Checkbox, buttonClass, chromeIconClass } from "@/components/ui";
import { DEAL_STATUSES } from "@/lib/config";
import { cn } from "@/lib/utils";
import { DealStageMark } from "./stage-select";

/**
 * Writes the multi-pick to the URL as a comma-joined `statuses` param. It
 * supersedes the quick views (All, TBD, Active, Pass); none picked goes back
 * to the default view.
 */
export function useApplyStatuses() {
  const router = useRouter();
  const params = useSearchParams();
  return (next: string[]) => {
    const sp = new URLSearchParams(params);
    if (next.length > 0) sp.set("statuses", next.join(","));
    else sp.delete("statuses");
    sp.delete("status");
    router.push(`/deals?${sp.toString()}`);
  };
}

/**
 * A row in the popover or the Filters sheet, like a menu item: 32px with a
 * mouse, 44px on touch, --fill-2 under the pointer and under keyboard focus.
 */
export const filterRowClass = cn(
  "flex h-8 w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-left text-body text-fg-1 pointer-coarse:h-11",
  "hover:bg-fill-2 focus-visible:bg-fill-2 focus-visible:outline-none has-[:focus-visible]:bg-fill-2",
);

/**
 * One row per stage: a checkbox and the stage as a Tag (no fill, a
 * --line-strong edge), since the row's --fill-2 hover would swallow a filled
 * badge (docs/brand-guidelines.md, section 9, Tags). The stage's ring rides
 * in the tag, as in the list's Status column. Shared by the popover and the
 * phone's Filters sheet.
 */
export function StatusChecklist({ selected, onToggle }: { selected: string[]; onToggle: (stage: string) => void }) {
  return (
    <ul>
      {DEAL_STATUSES.map((s) => (
        <li key={s}>
          <label className={filterRowClass}>
            <Checkbox checked={selected.includes(s)} onChange={() => onToggle(s)} />
            <span className="inline-flex h-5.5 items-center gap-1 whitespace-nowrap rounded-sm border border-line-strong px-2 text-micro text-fg-2">
              <DealStageMark stage={s} />
              {s}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/**
 * The status filter from sm up: a button naming the pick that opens the
 * checklist in a Popover, which stays on screen wherever the bar puts it.
 * Below sm the same checklist lives in the Filters sheet (filters.tsx).
 */
export function StatusMultiSelect({ selected }: { selected: string[] }) {
  const apply = useApplyStatuses();
  const toggle = (s: string) => apply(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);

  const label =
    selected.length === 0 ? "All statuses" : selected.length === 1 ? selected[0] : `${selected.length} statuses`;

  return (
    <PopoverTrigger>
      <AriaButton className={cn(buttonClass({ variant: "secondary", size: "sm" }), "max-w-45")}>
        <span className="truncate">{label}</span>
        <ChevronDown aria-hidden="true" className={cn(chromeIconClass, "text-fg-3")} />
      </AriaButton>
      <Popover aria-label="Statuses" placement="bottom end" offset={4} className="p-1">
        {selected.length > 0 && (
          <>
            <button type="button" onClick={() => apply([])} className={filterRowClass}>
              Clear
            </button>
            <div className="-mx-1 my-1 border-t border-line" />
          </>
        )}
        <StatusChecklist selected={selected} onToggle={toggle} />
      </Popover>
    </PopoverTrigger>
  );
}
