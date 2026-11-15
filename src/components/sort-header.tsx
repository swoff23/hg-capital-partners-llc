"use client";
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useFilterScope } from "@/components/filter-bar";
import { thClass } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * A sortable table header on the Th look (docs/specs/selectors.md 3.6).
 * Every sortable header shows `ChevronsUpDown` in --muted-foreground at rest, so
 * sortability needs no hover and works on touch; the active column turns
 * --foreground with one `ChevronUp` or `ChevronDown`. A click picks the column or
 * flips its direction: a text column starts A to Z (`first="asc"`), money, a
 * count or a date starts with the most or the newest (`first="desc"`). There's
 * no hidden "clear" click: the list's default order is a column like any other
 * (Stage on deals, Address on properties), and picking it takes `sort` out of
 * the URL.
 *
 * The sort is the `sort` param, `field` ascending or `-field` descending,
 * changed with `replace` in a transition (the rows dim while it loads), so it
 * adds no history entry. `defaultSort` is what the list opens in. Must sit
 * inside a `FilterScope`.
 *
 * `numeric` right-aligns it over a money or count column, with the caret ahead
 * of the label so the label's end lines up with the figures under it. There the
 * caret hangs outside the label's box, into the room the column leaves (or the
 * cell's padding), so it never costs the label its width ("Units" in 72px) and
 * the label sets the button's baseline, level with the other headers. The label
 * sits 12px in from the cell's edge, as a plain cell's text does. `trailing`
 * sits after the button inside the cell: the deals table's column resize handle.
 *
 * `cell="div"` heads a list that isn't a table (the Tasks list,
 * docs/specs/task-list-sort.md): the same label, caret and click on a plain
 * div with `listHeadClass`, no padding of its own and no rule (the header row
 * draws one under every column), and the sort said in words for a screen
 * reader, since a div can't carry `aria-sort`.
 */
export function SortHeader({
  label,
  field,
  defaultSort,
  first = "asc",
  numeric = false,
  className,
  trailing,
  cell = "th",
}: {
  label: string;
  field: string;
  /** The sort the list opens in: "status", or "-updated". */
  defaultSort: string;
  first?: "asc" | "desc";
  numeric?: boolean;
  className?: string;
  trailing?: ReactNode;
  /** "div" over a list that isn't a table. */
  cell?: "th" | "div";
}) {
  const { query, update } = useFilterScope();
  const raw = query.get("sort") || defaultSort;
  const desc = raw.startsWith("-");
  const active = (desc ? raw.slice(1) : raw) === field;

  function toggle() {
    const next = !active ? (first === "desc" ? `-${field}` : field) : desc ? field : `-${field}`;
    update({ sort: next === defaultSort ? null : next });
  }

  const Caret = !active ? ChevronsUpDown : desc ? ChevronDown : ChevronUp;
  const Cell = cell;
  return (
    <Cell
      aria-sort={cell === "th" ? (active ? (desc ? "descending" : "ascending") : "none") : undefined}
      className={cn(cell === "th" ? thClass : listHeadClass, numeric && "text-right", className)}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "relative -my-2 inline-flex max-w-full items-center gap-1 py-2 transition-colors hover:text-foreground",
          // The button fills the header cell's height (34px) and, on touch, reaches 44 without growing the row.
          "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1.5",
          active && "text-foreground",
        )}
      >
        <span className="truncate">{label}</span>
        {cell === "div" && active && <span className="sr-only">{desc ? ", sorted descending" : ", sorted ascending"}</span>}
        <Caret
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0",
            numeric && "absolute right-full top-1/2 mr-1 -translate-y-1/2",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        />
      </button>
      {trailing}
    </Cell>
  );
}

/** A list's column label (`cell="div"`, and the plain labels beside it): the header look without a table cell's padding, stickiness or rule. */
export const listHeadClass = "whitespace-nowrap text-left text-meta font-medium text-muted-foreground";
