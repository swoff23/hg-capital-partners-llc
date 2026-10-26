"use client";
import { useRef, useState } from "react";
import { Meter } from "@/components/meter";
import { Money } from "@/components/money";
import { textLinkClass } from "@/components/ui";
import { capRows, shareBase, shareLabel } from "@/lib/chart-scale";
import { cn } from "@/lib/utils";

export type MoneyBarRow = { key: string; label: string; cents: number };

/**
 * Where money went, ranked (docs/specs/charts.md 2.4): operating expense by
 * category, account or payee. One layout at every size: the label in
 * text-body, its share in --fg-3 and the amount right-aligned on one line,
 * then a 4px Meter the row's width, scaled to the largest row. A long label
 * truncates before the share. A group whose refunds outran its spend has no
 * meter and no share, just its amount with a true minus; it sorts last, and
 * shares are of the groups that spent, so they never add past 100%.
 *
 * The top 7 show, then "Everything else" sums the rest with its share and
 * meter and says how many more. It's a button: opening it lists the rest in
 * its place, focus on the first of them, with "Show fewer" at the end.
 * Rows read label, share and amount to a screen reader; the meter is hidden.
 * Amounts are cents.
 */
export function MoneyBars({
  rows,
  emptyLabel,
  top = 7,
}: {
  rows: MoneyBarRow[];
  emptyLabel: string;
  top?: number;
}) {
  const [open, setOpen] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  const shown = rows.filter((r) => r.cents !== 0);
  if (shown.length === 0) return <p className="text-body text-fg-3">{emptyLabel}</p>;

  // Shares are of the groups that spent money, so a refund group nets out of the base.
  const whole = shareBase(shown.map((r) => r.cents));
  const { shown: head, rest } = capRows(shown, top);
  const max = Math.max(1, ...head.map((r) => r.cents), rest?.cents ?? 0);

  function expand() {
    setOpen(true);
    // The button goes; focus moves to the first row it showed.
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>("[data-first-rest]")?.focus());
  }

  function collapse() {
    setOpen(false);
    requestAnimationFrame(() => toggle.current?.focus());
  }

  return (
    <div className="@container">
      <ul ref={list} className="space-y-2 pointer-coarse:space-y-3">
        {head.map((r) => (
          <li key={r.key}>
            <BarRow label={r.label} cents={r.cents} share={shareLabel(r.cents, whole)} max={max} />
          </li>
        ))}
        {rest &&
          (open ? (
            rest.rows.map((r, i) => (
              <li key={r.key} tabIndex={i === 0 ? -1 : undefined} data-first-rest={i === 0 ? "" : undefined}>
                <BarRow label={r.label} cents={r.cents} share={shareLabel(r.cents, whole)} max={max} />
              </li>
            ))
          ) : (
            <li>
              <button
                ref={toggle}
                type="button"
                aria-expanded={false}
                onClick={expand}
                className="-mx-2 -my-1 block w-[calc(100%+1rem)] rounded-md px-2 py-1 text-left transition-colors hover:bg-fill-1 pointer-coarse:-my-2 pointer-coarse:py-2"
              >
                <BarRow
                  label="Everything else"
                  more={`${rest.rows.length} more`}
                  cents={rest.cents}
                  share={shareLabel(rest.cents, whole)}
                  max={max}
                />
              </button>
            </li>
          ))}
      </ul>
      {rest && open && (
        <button
          type="button"
          aria-expanded
          onClick={collapse}
          className={cn(textLinkClass, "mt-2 text-body pointer-coarse:mt-3 pointer-coarse:min-h-11")}
        >
          Show fewer
        </button>
      )}
    </div>
  );
}

function BarRow({
  label,
  more,
  cents,
  share,
  max,
}: {
  label: string;
  /** "9 more" after the label, on the Everything else row. */
  more?: string;
  cents: number;
  share: string | null;
  max: number;
}) {
  return (
    <span className="block">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate text-body text-fg-1">
          {label}
          {/* Drops on a narrow list rather than cutting mid-word. */}
          {more && <span className="text-fg-3 @max-[17rem]:hidden"> {more}</span>}
        </span>
        {share && <span className="num shrink-0 text-meta text-fg-3">{share}</span>}
        <span className="ml-auto shrink-0 pl-2 text-body text-fg-1">
          <Money value={cents / 100} />
        </span>
      </span>
      {cents > 0 && <Meter value={cents} max={max} className="mt-1" />}
    </span>
  );
}
