"use client";
import { useState } from "react";
import { grandTotalRow, Section, Table, Td, Th, TextLink, textLinkClass } from "@/components/ui";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import { shortAddress } from "@/lib/normalize";
import {
  capexUndatedNote,
  portfolioCapexForecast,
  type CapexRules,
  type PortfolioCapexProperty,
} from "@/lib/property-types";
import { BreakdownValue, type BreakdownLine } from "./properties/capex-breakdown";
import { ForecastYearBars } from "./properties/capex-ui";

/**
 * The portfolio's 5-year CapEx forecast (charts 2.5): the total, spend by
 * year, and a property by year table that totals like a statement. Picking
 * a year filters the table to the properties with spend that year and swaps
 * the figure to "$13,000 · 2026 spend · All 5 years"; its column header
 * turns --fg-1 and nothing dims. Each figure opens what it's made of (a
 * Popover with a mouse, a Sheet on touch). Red means late only: the total
 * names how much is past its replacement age. Below sm the table keeps two
 * columns, Property and the picked year (or the 5-year total with nothing
 * picked), and the year bars above are the switch, so it never scrolls
 * sideways on a phone. Lives on /properties, under the property table, at
 * #capex.
 */
export function PortfolioCapexForecastCard({
  properties,
  rules,
  id,
  className,
}: {
  properties: PortfolioCapexProperty[];
  rules: CapexRules;
  /** The section's anchor ("capex", so Home can link to /properties#capex). */
  id?: string;
  className?: string;
}) {
  const f = portfolioCapexForecast(properties, { years: 5, rules });
  const undatedNote = capexUndatedNote(f.unknownCount);
  const lastYear = f.years[f.years.length - 1];

  const [selYear, setSelYear] = useState<number | null>(null);
  const selIdx = selYear == null ? -1 : f.years.indexOf(selYear);
  // A pick filters the rows to the properties with spend that year.
  const rows = f.rows.filter((r) => (selIdx >= 0 ? r.perYear[selIdx] > 0 : r.total > 0));
  // The total row sums the rows on show, so the table adds up with a year picked too.
  const shownPerYear = f.years.map((_, i) => rows.reduce((s, r) => s + r.perYear[i], 0));
  const shownTotal = rows.reduce((s, r) => s + r.total, 0);
  // Below sm: the picked year's column, or the 5-year total with nothing picked. The picked year
  // ends the row there, so it sits flush right like the 5-yr column does.
  const yearCol = (i: number) => (i === selIdx ? "max-sm:pr-0" : "max-sm:hidden");
  const totalCol = selIdx >= 0 ? "max-sm:hidden" : undefined;

  const linesOf = (items: PortfolioRowItems, place?: string): BreakdownLine[] => items.map((item) => ({ item, place }));
  const allYears = (
    <button type="button" onClick={() => setSelYear(null)} className={cn(textLinkClass, "pointer-coarse:min-h-11")}>
      All {f.horizonYears} years
    </button>
  );

  return (
    <div id={id} className={cn("scroll-mt-[calc(var(--app-bar-h)+1.5rem)]", className)}>
      <Section
        title="5-year CapEx forecast"
        actions={
          <span className="num text-meta text-fg-3">
            {f.fromYear} to {lastYear}
          </span>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Money
                key={selIdx}
                value={selIdx >= 0 ? f.perYear[selIdx] : f.total}
                className="animate-fade-in text-figure-m text-fg-1"
              />
              {selIdx >= 0 ? (
                <span className="text-meta text-fg-3">
                  · <span className="num">{selYear}</span> spend · {allYears}
                </span>
              ) : (
                f.overdueTotal > 0 && (
                  <span className="text-meta text-danger">
                    <Money value={f.overdueTotal} /> past due
                  </span>
                )
              )}
            </div>
            {undatedNote && <p className="mt-1 text-meta text-fg-3">{undatedNote}</p>}
          </div>

          <ForecastYearBars
            years={f.years.map((year, i) => ({ year, total: f.perYear[i] }))}
            selected={selYear}
            onSelect={(year) => setSelYear((cur) => (cur === year ? null : year))}
            onClear={() => setSelYear(null)}
          />

          {rows.length > 0 ? (
            <Table className="sm:min-w-140">
              <thead>
                <tr>
                  <Th className="pl-0">Property</Th>
                  {f.years.map((y, i) => (
                    <Th key={y} numeric className={cn(yearCol(i), y === selYear && "text-fg-1")}>
                      {y}
                    </Th>
                  ))}
                  <Th numeric className={cn("pr-0", totalCol)}>
                    5-yr
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const name = shortAddress(r.address) || r.address;
                  return (
                    <tr key={r.id}>
                      <Td className="max-w-56 truncate pl-0">
                        <TextLink href={`/properties/${r.id}`}>{name}</TextLink>
                      </Td>
                      {r.perYear.map((v, i) => {
                        const year = f.years[i];
                        const items = r.items.filter((it) => it.dueYear === year);
                        return (
                          <Td key={i} numeric className={cn(yearCol(i), v === 0 ? "text-fg-3" : "text-fg-1")}>
                            <BreakdownValue title={`${name} · ${year}`} lines={linesOf(items)} showYear={false}>
                              {v ? <Money value={v} /> : "—"}
                            </BreakdownValue>
                          </Td>
                        );
                      })}
                      <Td numeric className={cn("pr-0", totalCol)}>
                        <BreakdownValue title={`${name} · ${f.fromYear} to ${lastYear}`} lines={linesOf(r.items)} showYear>
                          <Money value={r.total} />
                        </BreakdownValue>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={grandTotalRow}>
                  <Td className="pl-0">Total</Td>
                  {shownPerYear.map((v, i) => {
                    const year = f.years[i];
                    const lines = rows.flatMap((r) =>
                      linesOf(
                        r.items.filter((it) => it.dueYear === year),
                        shortAddress(r.address) || r.address,
                      ),
                    );
                    return (
                      <Td key={i} numeric className={yearCol(i)}>
                        <BreakdownValue title={`Portfolio · ${year}`} lines={lines} showYear={false}>
                          {/* An empty year is the dash in fg-3, not the total row's fg-1 at 600 (section 3). */}
                          {v ? <Money value={v} /> : <span className="font-normal text-fg-3">—</span>}
                        </BreakdownValue>
                      </Td>
                    );
                  })}
                  <Td numeric className={cn("pr-0", totalCol)}>
                    <BreakdownValue
                      title={`Portfolio · ${f.fromYear} to ${lastYear}`}
                      lines={rows.flatMap((r) => linesOf(r.items, shortAddress(r.address) || r.address))}
                      showYear
                    >
                      <Money value={shownTotal} />
                    </BreakdownValue>
                  </Td>
                </tr>
              </tfoot>
            </Table>
          ) : (
            <p className="text-body text-fg-3">
              No projected CapEx in the next 5 years. Add install years to unit equipment and building systems to
              build the forecast.
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}

type PortfolioRowItems = ReturnType<typeof portfolioCapexForecast>["rows"][number]["items"];
