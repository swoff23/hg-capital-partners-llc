"use client";
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Section, textLinkClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { PickState } from "./task-picks";

/**
 * A titled group of rows: "Overdue 2 [Move all to today]", "Zack Reading 3".
 * A Section: the heading and its count in --muted-foreground over a hairline, the rows
 * flat under it. `collapsible` sections start closed and open from the
 * heading (No date). Rows go in as <li>s.
 */
export function TaskSection({
  title,
  count,
  icon,
  action,
  collapsible = false,
  as = "h3",
  pick,
  children,
}: {
  /**
   * Bulk edit (docs/specs/bulk-edit.md D7): while anything is picked, the heading ends with Select, or Deselect
   * once every row of the group on screen is, as Photos' select mode does. `name` finishes what a screen reader
   * hears: "Select all at 767 Prospect Avenue".
   */
  pick?: { state: PickState; name: string; onToggle: () => void; picking: boolean };
  title: string;
  count: number;
  /** Before the title, e.g. a contractor's avatar. */
  icon?: ReactNode;
  /** At the header's end, e.g. "Move all to today". */
  action?: ReactNode;
  collapsible?: boolean;
  /** The heading level: h3 under a column's or a building's h2 (Today, a scoped list), h2 straight under the page's h1 (the Tasks list's groups). */
  as?: "h2" | "h3";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsible);
  const heading = (
    <>
      {icon}
      <span className="truncate">{title}</span>
      <span className="font-normal tabular-nums text-muted-foreground">{count}</span>
    </>
  );

  return (
    <Section
      as={as}
      // Closed, the rows' slot is empty: drop it so no gap hangs under the rule.
      className="[&>div:empty]:hidden"
      actions={
        pick?.picking ? (
          <>
            {action}
            <button
              type="button"
              onClick={pick.onToggle}
              aria-label={`${pick.state === "all" ? "Deselect" : "Select"} all ${pick.name}`}
              className={cn(textLinkClass, "min-h-8 text-label pointer-coarse:min-h-11")}
            >
              {pick.state === "all" ? "Deselect" : "Select"}
            </button>
          </>
        ) : (
          action
        )
      }
      title={
        collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="-ml-1.5 flex min-h-8 min-w-0 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-muted pointer-coarse:min-h-11"
          >
            {/* After the count, so this title shares the left edge every other section's does. */}
            {heading}
            <ChevronRight
              aria-hidden="true"
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-90")}
            />
          </button>
        ) : (
          <span className="flex min-w-0 items-center gap-2">{heading}</span>
        )
      }
    >
      {open && <ul className="@container divide-y divide-border">{children}</ul>}
    </Section>
  );
}
