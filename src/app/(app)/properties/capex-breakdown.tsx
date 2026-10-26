"use client";
import type { ReactNode } from "react";
import { Button as AriaButton, DialogTrigger } from "react-aria-components";
import { Popover } from "@/components/popover";
import { Sheet } from "@/components/sheet";
import { Money } from "@/components/money";
import { grandTotalRow } from "@/components/ui";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import type { CapexForecastItem } from "@/lib/property-types";
import { cn } from "@/lib/utils";

export type BreakdownLine = {
  item: CapexForecastItem;
  /** The property's short address, for a portfolio-level value that spans properties. */
  place?: string;
};

/**
 * A CapEx figure that opens what it's made of (charts 2.5): a Popover with a
 * mouse, a Sheet on touch (the picker pattern), on a click, never a hover,
 * since it holds a list. The title ("118 Congress St · 2026"), one line per
 * asset (type and unit, the year when the value spans years, the cost; a
 * portfolio-level value adds the property under it, and a late item reads
 * "Past due" in --danger whatever the value spans), then the total under the
 * grand-total rule. Sized to its content, at most 320px wide and its list
 * 320px tall, scrolling inside. Esc closes it and focus goes back to the figure.
 * The figure keeps its dotted --line-strong underline (ruling 12), lighter
 * than a link's, which would underline every figure in the matrix. With no
 * assets behind it, the figure is plain text.
 */
export function BreakdownValue({
  title,
  lines,
  showYear,
  children,
}: {
  title: string;
  lines: BreakdownLine[];
  /** Prefix each line with its year, for a value that spans years. A late item reads "Past due" either way. */
  showYear: boolean;
  children: ReactNode;
}) {
  const coarse = useCoarsePointer();
  if (lines.length === 0) return <>{children}</>;
  const body = <BreakdownList lines={lines} showYear={showYear} />;
  const popoverBody = <BreakdownList lines={lines} showYear={showYear} capped />;
  return (
    <DialogTrigger>
      <AriaButton
        className={cn(
          "relative -mx-1 rounded-sm px-1 underline decoration-line-strong decoration-dotted underline-offset-3 outline-none",
          "data-focus-visible:outline-2 data-focus-visible:outline-act",
          // A 44px hit area on touch without the row growing.
          "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3",
        )}
      >
        {children}
      </AriaButton>
      {coarse ? (
        <Sheet title={title}>
          <div className="p-4 md:w-96">{body}</div>
        </Sheet>
      ) : (
        <Popover aria-label={title} motion="none" className="w-max max-w-[min(20rem,calc(100vw-2rem))] p-3 text-meta">
          <p className="mb-2 font-semibold">{title}</p>
          {popoverBody}
        </Popover>
      )}
    </DialogTrigger>
  );
}

function BreakdownList({ lines, showYear, capped = false }: { lines: BreakdownLine[]; showYear: boolean; capped?: boolean }) {
  const sorted = [...lines].sort((a, b) => a.item.dueYear - b.item.dueYear || b.item.cost - a.item.cost);
  return (
    <div className="text-meta text-fg-1">
      {/* The popover caps its list at the shared 320px and scrolls inside it, the total staying in view;
          the touch sheet scrolls as a whole. A scrolling list takes focus so keys can reach the rest. */}
      <ul tabIndex={capped ? 0 : undefined} className={cn("space-y-1.5", capped && "max-h-80 overflow-y-auto")}>
        {sorted.map(({ item, place }, i) => (
          <li key={i} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block">
                {/* Late items say so wherever they are listed; the year prefix is for a value spanning years. */}
                {(item.pastDue || showYear) && (
                  <span className={cn("num mr-1", item.pastDue ? "text-danger" : "text-fg-3")}>
                    {item.pastDue ? "Past due" : item.dueYear}
                  </span>
                )}
                <span className="font-medium">{item.type}</span>
                <span className="text-fg-3"> · {item.unitLabel}</span>
              </span>
              {place && <span className="block text-fg-3">{place}</span>}
            </span>
            <Money value={item.cost} className="shrink-0" />
          </li>
        ))}
      </ul>
      <div className={cn("mt-2 flex items-baseline justify-between gap-3 pt-1.5", grandTotalRow)}>
        <span>Total</span>
        <Money value={lines.reduce((s, l) => s + l.item.cost, 0)} />
      </div>
    </div>
  );
}
