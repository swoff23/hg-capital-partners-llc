"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { thClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ResizeHandle, type ColumnKey } from "./column-widths";

export type SortField = "address" | "status" | "units" | "theirPrice" | "ourPrice" | "nextAction" | "updated";

// No ?sort param means "grouped by pipeline status" — same default as the DB query in page.tsx.
const DEFAULT_SORT = "status";


/** A clickable table header: 1st click sorts ascending, 2nd descending, 3rd clears. */
export function SortHeader({
  label,
  field,
  className,
  align = "left",
  resizeKey,
}: {
  label: string;
  field: SortField;
  className?: string;
  align?: "left" | "right";
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

  const caret = (
    <svg
      viewBox="0 0 12 12"
      className={cn(
        "h-3 w-3 transition-opacity",
        active ? "opacity-100" : "opacity-0 group-hover:opacity-40",
        desc && "rotate-180",
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path d="M3 7.5l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <th
      aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
      className={cn(thClass, align === "right" ? "text-right" : "text-left", className)}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "group inline-flex items-center gap-1 transition-colors hover:text-fg-1",
          active && "text-fg-1",
        )}
      >
        {label}
        {caret}
      </button>
      {resizeKey && <ResizeHandle columnKey={resizeKey} />}
    </th>
  );
}
