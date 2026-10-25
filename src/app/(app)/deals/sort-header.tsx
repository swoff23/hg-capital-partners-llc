"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronUp } from "lucide-react";
import { thClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ResizeHandle } from "./column-widths";
import type { ColumnKey } from "./columns";

export type SortField = "address" | "status" | "units" | "theirPrice" | "ourPrice" | "nextAction" | "updated";

// No ?sort param means "grouped by pipeline status", the same default as the DB query in page.tsx.
const DEFAULT_SORT = "status";

/**
 * A clickable table header on the Th look (thClass): 1st click sorts
 * ascending, 2nd descending, 3rd clears. `numeric` right-aligns it over a
 * money or count column, with the caret ahead of the label so the label's
 * end lines up with the figures under it. There the caret hangs outside the
 * label's box, into the room the column leaves (or the cell's padding), so a
 * hidden caret never costs the label its width ("Units" in 72px) and the
 * label sets the button's baseline, level with the other headers. The label
 * sits 12px in from the cell's edge, as a plain cell's text and a field
 * cell's text do (deal-row.tsx).
 */
export function SortHeader({
  label,
  field,
  className,
  numeric = false,
  resizeKey,
}: {
  label: string;
  field: SortField;
  className?: string;
  numeric?: boolean;
  resizeKey?: ColumnKey;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const raw = params.get("sort") || DEFAULT_SORT;
  const desc = raw.startsWith("-");
  const active = (desc ? raw.slice(1) : raw) === field;

  function toggle() {
    const next = new URLSearchParams(params);
    if (!active) next.set("sort", field);
    else if (!desc) next.set("sort", `-${field}`);
    else next.delete("sort");
    router.push(`/deals?${next.toString()}`);
  }

  return (
    <th
      aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
      className={cn(thClass, numeric && "text-right", className)}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "group relative inline-flex max-w-full items-center gap-1 transition-colors hover:text-fg-1",
          // A 44px target on touch without growing the header row.
          "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3",
          active && "text-fg-1",
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronUp
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 transition-opacity",
            numeric && "absolute right-full top-1/2 mr-1 -translate-y-1/2",
            active ? "opacity-100" : "opacity-0 group-hover:opacity-60",
            desc && "rotate-180",
          )}
        />
      </button>
      {resizeKey && <ResizeHandle columnKey={resizeKey} />}
    </th>
  );
}
