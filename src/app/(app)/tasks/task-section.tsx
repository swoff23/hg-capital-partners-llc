"use client";
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Section } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * A titled group of rows: "Overdue 2 [Move all to today]", "Zack Reading 3".
 * A Section: the heading and its count in --fg-3 over a hairline, the rows
 * flat under it. `collapsible` sections start closed and open from the
 * heading (No date). Rows go in as <li>s.
 */
export function TaskSection({
  title,
  count,
  icon,
  action,
  collapsible = false,
  children,
}: {
  title: string;
  count: number;
  /** Before the title, e.g. a contractor's avatar. */
  icon?: ReactNode;
  /** At the header's end, e.g. "Move all to today". */
  action?: ReactNode;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsible);
  const heading = (
    <>
      {icon}
      <span className="truncate">{title}</span>
      <span className="font-normal tabular-nums text-fg-3">{count}</span>
    </>
  );

  return (
    <Section
      as="h3"
      // Closed, the rows' slot is empty: drop it so no gap hangs under the rule.
      className="[&>div:empty]:hidden"
      actions={action}
      title={
        collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="-ml-1.5 flex min-h-8 min-w-0 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-fill-1 pointer-coarse:min-h-11"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn("size-4 shrink-0 text-fg-3 transition-transform motion-reduce:transition-none", open && "rotate-90")}
            />
            {heading}
          </button>
        ) : (
          <span className="flex min-w-0 items-center gap-2">{heading}</span>
        )
      }
    >
      {open && <ul className="@container divide-y divide-line">{children}</ul>}
    </Section>
  );
}
