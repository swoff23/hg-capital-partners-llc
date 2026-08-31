"use client";
import { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { fmtMoney } from "@/lib/utils";
import {
  capexForecast,
  type BuildingCapexData,
  type CapexRules,
  type PropertyUnit,
} from "@/lib/property-types";

const fmtAge = (n: number | null) => (n == null ? "—" : `${n} yr${n === 1 ? "" : "s"}`);

export function CapexForecastCard({
  units,
  building,
  rules,
}: {
  units: PropertyUnit[];
  building?: BuildingCapexData;
  rules: CapexRules;
}) {
  const f = capexForecast(units, { years: 5, building, rules });
  const maxYear = Math.max(1, ...f.years.map((y) => y.total));
  const lastYear = f.fromYear + f.horizonYears - 1;

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const toggleYear = (year: number) =>
    setSelectedYear((cur) => (cur === year ? null : year));

  // The table always shows every item, in a fixed order, so it never reflows on click.
  // Selecting a year just emphasises the matching rows and swaps the footer total.
  const allRows = f.years.flatMap((y) => y.items);
  const selectedTotal =
    selectedYear == null
      ? f.total
      : (f.years.find((y) => y.year === selectedYear)?.total ?? 0);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>5-year CapEx forecast</CardTitle>
        <span className="text-xs text-muted">
          {f.fromYear}–{lastYear}
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold tabular-nums">{fmtMoney(f.total)}</span>
          {f.dueNowCount > 0 && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              {fmtMoney(f.dueNowTotal)} due soon
            </span>
          )}
        </div>

        {/* Year-by-year bars — click to filter the list below */}
        <div className="space-y-1">
          {f.years.map((y) => {
            const active = selectedYear === y.year;
            const clickable = y.count > 0;
            return (
              <button
                key={y.year}
                type="button"
                disabled={!clickable}
                onClick={() => toggleYear(y.year)}
                aria-pressed={active}
                className={
                  "flex w-full items-center gap-3 rounded-md px-2 py-1 text-left text-xs transition-all " +
                  (clickable ? "hover:bg-background " : "cursor-default ") +
                  (active
                    ? "bg-primary/10 ring-2 ring-inset ring-primary "
                    : selectedYear != null
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
                  {y.year}
                </span>
                <span className="h-4 flex-1 overflow-hidden rounded bg-background">
                  <span
                    className={
                      "block h-full rounded " +
                      (active
                        ? "bg-primary"
                        : y.year === f.fromYear
                          ? "bg-red-500/70 dark:bg-red-500/60"
                          : "bg-primary/50")
                    }
                    style={{ width: `${(y.total / maxYear) * 100}%` }}
                  />
                </span>
                <span
                  className={
                    "w-16 shrink-0 text-right tabular-nums " +
                    (active ? "font-semibold text-primary" : "font-medium")
                  }
                >
                  {y.total ? fmtMoney(y.total) : "—"}
                </span>
                <span
                  className={
                    "w-14 shrink-0 text-right " +
                    (active ? "font-semibold text-primary" : "text-muted")
                  }
                >
                  {y.count ? `${y.count} item${y.count === 1 ? "" : "s"}` : ""}
                </span>
              </button>
            );
          })}
        </div>

        {/* Line items — full list, always. Selecting a year emphasises its rows. */}
        {allRows.length > 0 && (
          <div className="space-y-1">
            <div className="flex h-4 items-center gap-2 text-xs text-muted">
              {selectedYear == null ? (
                <span>All {f.horizonYears} years</span>
              ) : (
                <>
                  <span>
                    Highlighting <span className="font-medium text-foreground">{selectedYear}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedYear(null)}
                    className="font-medium text-primary hover:underline"
                  >
                    clear
                  </button>
                </>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-xs">
                <thead>
                  <tr className="text-left text-muted [&>th]:pb-1 [&>th]:pr-3 [&>th]:font-medium">
                    <th>Location</th>
                    <th>Asset</th>
                    <th>Age</th>
                    <th>Due</th>
                    <th className="text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="[&>tr>td]:py-0.5 [&>tr>td]:pr-3">
                  {allRows.map((l, idx) => {
                    const dimmed = selectedYear != null && l.dueYear !== selectedYear;
                    return (
                      <tr key={idx} className={dimmed ? "opacity-30" : ""}>
                        <td className={l.scope === "building" ? "font-medium" : "text-muted"}>
                          {l.unitLabel}
                        </td>
                        <td className="font-medium">{l.type}</td>
                        <td className="tabular-nums">{fmtAge(l.age)}</td>
                        <td
                          className={
                            "tabular-nums " +
                            (l.dueYear === f.fromYear
                              ? "font-medium text-red-600 dark:text-red-400"
                              : "text-muted")
                          }
                        >
                          {l.dueYear === f.fromYear ? "Due soon" : l.dueYear}
                        </td>
                        <td className="!pr-0 text-right font-medium tabular-nums">{fmtMoney(l.cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-semibold [&>td]:pt-1">
                    <td colSpan={4}>
                      {selectedYear == null ? `${f.horizonYears}-year total` : `${selectedYear} total`}
                    </td>
                    <td className="!pr-0 text-right tabular-nums">{fmtMoney(selectedTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
