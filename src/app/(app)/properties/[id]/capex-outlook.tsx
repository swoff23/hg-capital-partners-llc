"use client";
import { useState } from "react";
import { Section, Table, Td, Th, textLinkClass } from "@/components/ui";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import {
  capexForecast,
  capexUndatedNote,
  type BuildingCapexData,
  type CapexRules,
  type PropertyUnit,
} from "@/lib/property-types";
import { fmtAge, ForecastYearBars, grandTotalCell } from "../capex-ui";

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
  const undatedNote = capexUndatedNote(f.unknownCount);
  const lastYear = f.fromYear + f.horizonYears - 1;

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const toggleYear = (year: number) => setSelectedYear((cur) => (cur === year ? null : year));

  // The table always shows every item, in a fixed order, so it never reflows on click.
  // Selecting a year just emphasises the matching rows and swaps the footer total.
  const allRows = f.years.flatMap((y) => y.items);
  const selectedTotal =
    selectedYear == null ? f.total : (f.years.find((y) => y.year === selectedYear)?.total ?? 0);
  const totalLabel = selectedYear == null ? `${f.horizonYears}-year total` : `${selectedYear} total`;

  return (
    <Section
      as="h3"
      title="5-year CapEx forecast"
      actions={
        // As tall as an Edit button, so this heading lines up with the rail's beside it.
        <span className="num flex h-8 items-center text-meta text-fg-3">
          {f.fromYear} to {lastYear}
        </span>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Money value={f.total} className="text-figure-m text-fg-1" />
            {f.dueNowCount > 0 && (
              <span className="text-meta text-danger">
                <Money value={f.dueNowTotal} /> due soon
              </span>
            )}
          </div>
          {undatedNote && <p className="mt-1 text-meta text-fg-3">{undatedNote}</p>}
        </div>

        {/* Year by year: pick one to spotlight its items below. */}
        <ForecastYearBars
          years={f.years.map((y) => ({ year: y.year, total: y.total, count: y.count }))}
          selected={selectedYear}
          onSelect={toggleYear}
          showCount
        />

        {/* Line items: the full list, always. Selecting a year emphasises its rows. */}
        {allRows.length > 0 && (
          <div className="space-y-1">
            <div className="flex min-h-5 items-center gap-2 text-meta text-fg-3">
              {selectedYear == null ? (
                <span>All {f.horizonYears} years</span>
              ) : (
                <>
                  <span>
                    Highlighting <span className="num text-fg-1">{selectedYear}</span>
                  </span>
                  <button type="button" onClick={() => setSelectedYear(null)} className={textLinkClass}>
                    clear
                  </button>
                </>
              )}
            </div>
            {/* Below 480 the location moves under the asset and the age drops, so cost stays on screen. */}
            <Table>
              <thead>
                <tr>
                  <Th className="pl-0 max-[480px]:hidden">Location</Th>
                  <Th className="max-[480px]:pl-0">Asset</Th>
                  <Th className="max-[480px]:hidden">Age</Th>
                  <Th>Due</Th>
                  <Th numeric className="pr-0">
                    Cost
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {allRows.map((l, idx) => {
                  const dimmed = selectedYear != null && l.dueYear !== selectedYear;
                  const dueNow = l.dueYear === f.fromYear;
                  const where = l.scope === "building" ? "text-fg-1" : "text-fg-2";
                  return (
                    <tr key={idx} className={cn("transition-opacity duration-fast", dimmed && "opacity-30")}>
                      <Td className={cn("pl-0 max-[480px]:hidden", where)}>{l.unitLabel}</Td>
                      <Td className="text-fg-1 max-[480px]:pl-0">
                        {l.type}
                        <span className={cn("block text-meta min-[480px]:hidden", where)}>{l.unitLabel}</span>
                      </Td>
                      <Td className="num whitespace-nowrap text-fg-2 max-[480px]:hidden">{fmtAge(l.age)}</Td>
                      <Td className={cn("num whitespace-nowrap", dueNow ? "text-danger" : "text-fg-2")}>
                        {dueNow ? "Due soon" : l.dueYear}
                      </Td>
                      <Td numeric className="pr-0">
                        <Money value={l.cost} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {/* One cell per column, so the hidden ones drop out of the row the same way. */}
                <tr>
                  <Td className={cn("whitespace-nowrap pl-0 max-[480px]:hidden", grandTotalCell)}>{totalLabel}</Td>
                  <Td className={cn("max-[480px]:pl-0", grandTotalCell)}>
                    <span className="whitespace-nowrap min-[480px]:hidden">{totalLabel}</span>
                  </Td>
                  <Td className={cn("max-[480px]:hidden", grandTotalCell)} />
                  <Td className={grandTotalCell} />
                  <Td numeric className={cn("pr-0", grandTotalCell)}>
                    <Money value={selectedTotal} />
                  </Td>
                </tr>
              </tfoot>
            </Table>
          </div>
        )}
      </div>
    </Section>
  );
}
