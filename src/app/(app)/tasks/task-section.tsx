"use client";
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A titled group of rows inside a list card: "Overdue 2 [Move all to today]",
 * "Zack Reading 3". `collapsible` sections start closed and open from the
 * header (No date). Rows go in as <li>s.
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
      <span className="font-normal tabular-nums text-muted">{count}</span>
    </>
  );

  return (
    <section className="border-t border-border first:border-t-0">
      <div className="flex min-h-11 items-center gap-2 px-4 py-1.5">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="-ml-1.5 flex min-h-8 min-w-0 items-center gap-2 rounded-md px-1.5 text-sm font-semibold outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-primary/30 pointer-coarse:min-h-11"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn("h-4 w-4 shrink-0 text-muted transition-transform motion-reduce:transition-none", open && "rotate-90")}
            />
            {heading}
          </button>
        ) : (
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">{heading}</h3>
        )}
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>
      {open && <ul className="@container divide-y divide-border border-t border-border">{children}</ul>}
    </section>
  );
}
