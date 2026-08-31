"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type SortField = "task" | "address" | "owner" | "due";

const TH_BASE =
  "sticky top-0 z-10 whitespace-nowrap border-b border-border bg-background px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted";

/** A clickable table header: 1st click sorts ascending, 2nd descending, 3rd clears. */
export function SortHeader({
  label,
  field,
  className,
}: {
  label: string;
  field: SortField;
  className?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const raw = params.get("sort") || "due"; // due is the default sort
  const desc = raw.startsWith("-");
  const active = (desc ? raw.slice(1) : raw) === field;

  function toggle() {
    const next = new URLSearchParams(params);
    if (!active) next.set("sort", field);
    else if (!desc) next.set("sort", `-${field}`);
    else next.delete("sort");
    router.push(`/tasks?${next.toString()}`);
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
      className={cn(TH_BASE, "text-left", className)}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "group inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        {caret}
      </button>
    </th>
  );
}
