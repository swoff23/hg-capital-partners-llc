"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { fmtMoney } from "@/lib/utils";
import { shortAddress } from "@/lib/normalize";
import {
  portfolioCapexForecast,
  type CapexForecastItem,
  type CapexRules,
  type PortfolioCapexProperty,
} from "@/lib/property-types";

type Tip = {
  title: string;
  items: CapexForecastItem[];
  /** Prefix each line with its due year (for cells that span more than one year). */
  showYear: boolean;
  x: number;
  top: number;
  flip: boolean;
};

const TIP_HALF = 172; // ~half of the tooltip width, for clamping it to the viewport

export function PortfolioCapexForecastCard({
  properties,
  rules,
}: {
  properties: PortfolioCapexProperty[];
  rules: CapexRules;
}) {
  const f = portfolioCapexForecast(properties, { years: 5, rules });
  const maxYear = Math.max(1, ...f.perYear);
  const rows = f.rows.filter((r) => r.total > 0);
  const lastYear = f.years[f.years.length - 1];

  // Click a year in the chart to spotlight that year's column in the table below.
  const [selYear, setSelYear] = useState<number | null>(null);
  const selIdx = selYear == null ? -1 : f.years.indexOf(selYear);

  // Hover a table value to see the assets behind it.
  const [tip, setTip] = useState<Tip | null>(null);

  function openTip(
    e: React.MouseEvent<HTMLElement>,
    title: string,
    items: CapexForecastItem[],
    showYear: boolean,
  ) {
    if (items.length === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const flip = r.bottom + 220 > window.innerHeight;
    setTip({
      title,
      items,
      showYear,
      x: Math.min(Math.max(r.left + r.width / 2, TIP_HALF), window.innerWidth - TIP_HALF),
      top: flip ? r.top - 6 : r.bottom + 6,
      flip,
    });
  }
  const closeTip = () => setTip(null);
  const tipOn = (title: string, items: CapexForecastItem[], showYear: boolean) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => openTip(e, title, items, showYear),
    onMouseLeave: closeTip,
  });

  const itemsForYear = (year: number) =>
    f.rows.flatMap((row) => row.items.filter((it) => it.dueYear === year));
  const allItems = f.rows.flatMap((row) => row.items);

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>5-year CapEx forecast</CardTitle>
        <span className="text-xs text-muted">
          {f.fromYear}–{lastYear}
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold tabular-nums">
            {fmtMoney(selIdx >= 0 ? f.perYear[selIdx] : f.total)}
          </span>
          {selIdx >= 0 ? (
            <span className="text-xs font-medium text-muted">
              {selYear} spend ·{" "}
              <button
                type="button"
                onClick={() => setSelYear(null)}
                className="text-primary hover:underline"
              >
                show all 5 years
              </button>
            </span>
          ) : (
            f.dueNowTotal > 0 && (
              <span className="text-xs font-medium text-red-600 dark:text-red-400">
                {fmtMoney(f.dueNowTotal)} due soon
              </span>
            )
          )}
        </div>

        {/* Clickable per-year chart — selecting a year spotlights it in the table */}
        <div className="space-y-1">
          {f.years.map((year, i) => {
            const active = selYear === year;
            const clickable = f.perYear[i] > 0;
            return (
              <button
                key={year}
                type="button"
                disabled={!clickable}
                onClick={() => setSelYear((cur) => (cur === year ? null : year))}
                aria-pressed={active}
                className={
                  "flex w-full items-center gap-3 rounded-md px-2 py-1 text-left text-xs transition-all " +
                  (clickable ? "cursor-pointer hover:bg-background " : "cursor-default ") +
                  (active
                    ? "bg-primary/10 ring-2 ring-inset ring-primary "
                    : selYear != null
                      ? "opacity-40 "
                      : "")
                }
              >
                <span
                  className={
                    "w-10 shrink-0 tabular-nums " +
                    (active ? "font-semibold text-primary" : "text-muted")
                  }
                >
                  {year}
                </span>
                <span className="h-4 flex-1 overflow-hidden rounded bg-background">
                  <span
                    className={
                      "block h-full rounded " +
                      (active
                        ? "bg-primary"
                        : i === 0
                          ? "bg-red-500/70 dark:bg-red-500/60"
                          : "bg-primary/50")
                    }
                    style={{ width: `${(f.perYear[i] / maxYear) * 100}%` }}
                  />
                </span>
                <span
                  className={
                    "w-20 shrink-0 text-right tabular-nums " +
                    (active ? "font-semibold text-primary" : "font-medium")
                  }
                >
                  {f.perYear[i] ? fmtMoney(f.perYear[i]) : "—"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Property × year matrix */}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="text-left text-muted [&>th]:pb-1 [&>th]:pr-3 [&>th]:font-medium">
                  <th>Property</th>
                  {f.years.map((y) => (
                    <th
                      key={y}
                      className={
                        "text-right transition-opacity " +
                        (selYear != null && selYear !== y ? "opacity-30" : "")
                      }
                    >
                      {y}
                    </th>
                  ))}
                  <th
                    className={
                      "text-right transition-opacity " + (selYear != null ? "opacity-30" : "")
                    }
                  >
                    5-yr
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:py-0.5 [&>tr>td]:pr-3">
                {rows.map((r) => {
                  const rowActive = selIdx < 0 || r.perYear[selIdx] > 0;
                  return (
                    <tr
                      key={r.id}
                      className={"transition-opacity " + (rowActive ? "" : "opacity-30")}
                    >
                      <td className="max-w-[220px] truncate">
                        <Link href={`/properties/${r.id}`} className="hover:underline">
                          {shortAddress(r.address)}
                        </Link>
                      </td>
                      {r.perYear.map((v, i) => {
                        const year = f.years[i];
                        const items = r.items.filter((it) => it.dueYear === year);
                        const faded = selYear != null && selYear !== year;
                        const hot = selYear === year && v > 0;
                        return (
                          <td
                            key={i}
                            {...tipOn(`${shortAddress(r.address)} · ${year}`, items, false)}
                            className={
                              "text-right tabular-nums transition-opacity " +
                              (items.length > 0 ? "cursor-help " : "") +
                              (faded ? "opacity-30 " : "") +
                              (v === 0
                                ? "text-muted"
                                : hot
                                  ? "font-semibold " +
                                    (i === 0 ? "text-red-600 dark:text-red-400" : "text-primary")
                                  : i === 0
                                    ? "text-red-600 dark:text-red-400"
                                    : "")
                            }
                          >
                            {v ? fmtMoney(v) : "—"}
                          </td>
                        );
                      })}
                      <td
                        {...tipOn(
                          `${shortAddress(r.address)} · ${f.fromYear}–${lastYear}`,
                          r.items,
                          true,
                        )}
                        className={
                          "!pr-0 text-right font-medium tabular-nums transition-opacity " +
                          (r.items.length > 0 ? "cursor-help " : "") +
                          (selYear != null ? "opacity-30" : "")
                        }
                      >
                        {fmtMoney(r.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold [&>td]:pt-1 [&>td]:pr-3">
                  <td>Total</td>
                  {f.perYear.map((v, i) => {
                    const year = f.years[i];
                    const yearItems = itemsForYear(year);
                    const faded = selYear != null && selYear !== year;
                    return (
                      <td
                        key={i}
                        {...tipOn(`Portfolio · ${year}`, yearItems, false)}
                        className={
                          "text-right tabular-nums transition-opacity " +
                          (yearItems.length > 0 ? "cursor-help " : "") +
                          (faded ? "opacity-30 " : selYear === year ? "text-primary " : "")
                        }
                      >
                        {v ? fmtMoney(v) : "—"}
                      </td>
                    );
                  })}
                  <td
                    {...tipOn(`Portfolio · ${f.fromYear}–${lastYear}`, allItems, true)}
                    className={
                      "!pr-0 text-right tabular-nums transition-opacity " +
                      (allItems.length > 0 ? "cursor-help " : "") +
                      (selYear != null ? "opacity-30" : "")
                    }
                  >
                    {fmtMoney(f.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {rows.length === 0 && (
          <p className="text-sm text-muted">
            No projected CapEx in the next 5 years. Add install years to unit equipment and building
            systems to build the forecast.
          </p>
        )}
      </CardBody>

      {tip && (
        <div
          className={
            "pointer-events-none fixed z-50 w-[336px] max-w-[calc(100vw-16px)] -translate-x-1/2 rounded-lg border border-border bg-surface p-3 text-xs shadow-lg " +
            (tip.flip ? "-translate-y-full" : "")
          }
          style={{ left: tip.x, top: tip.top }}
        >
          <div className="mb-2 font-semibold">{tip.title}</div>
          <div className="space-y-1.5">
            {[...tip.items]
              .sort((a, b) => a.dueYear - b.dueYear || b.cost - a.cost)
              .map((it, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    {tip.showYear && (
                      <span
                        className={
                          "mr-1 tabular-nums " +
                          (it.overdue ? "text-red-600 dark:text-red-400" : "text-muted")
                        }
                      >
                        {it.overdue ? "now" : it.dueYear}
                      </span>
                    )}
                    <span className="font-medium">{it.type}</span>
                    <span className="text-muted"> · {it.unitLabel}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">
                    {fmtMoney(it.cost)}
                  </span>
                </div>
              ))}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-1.5 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">
              {fmtMoney(tip.items.reduce((s, it) => s + it.cost, 0))}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

