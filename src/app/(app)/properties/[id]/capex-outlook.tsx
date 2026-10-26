"use client";
import { useState } from "react";
import { grandTotalRow, Section, Table, Td, Th, textLinkClass } from "@/components/ui";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import {
  capexForecast,
  capexUndatedNote,
  type BuildingCapexData,
  type CapexRules,
  type PropertyUnit,
} from "@/lib/property-types";
import { fmtAge, ForecastYearBars } from "../capex-ui";

/**
 * A property's 5-year CapEx forecast (charts 2.5): the total, spend by year
 * and the line items. Picking a year filters the items to that year and
 * swaps the figure and the total row to its spend, with "All 5 years"
 * beside it to clear the pick; nothing dims (Copilot and Mercury iOS swap
 * the list below a pick). Red means late only: an item past its replacement
 * age before this year reads "Past due" in --danger, and the total names how
 * much is; an item due this year reads its year like the rest.
 */
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

  const allRows = f.years.flatMap((y) => y.items);
  const rows = selectedYear == null ? allRows : allRows.filter((l) => l.dueYear === selectedYear);
  const selectedTotal = selectedYear == null ? f.total : (f.years.find((y) => y.year === selectedYear)?.total ?? 0);
  const totalLabel = selectedYear == null ? `${f.horizonYears}-year total` : `${selectedYear} total`;
  const allYears = (
    <button type="button" onClick={() => setSelectedYear(null)} className={cn(textLinkClass, "pointer-coarse:min-h-11")}>
      All {f.horizonYears} years
    </button>
  );

  return (
    <Section
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
            <Money key={selectedTotal} value={selectedTotal} className="animate-fade-in text-figure-m text-fg-1" />
            {selectedYear != null ? (
              <span className="text-meta text-fg-3">
                <span className="num">{selectedYear}</span> · {allYears}
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
          years={f.years.map((y) => ({ year: y.year, total: y.total, count: y.count }))}
          selected={selectedYear}
          onSelect={toggleYear}
          onClear={() => setSelectedYear(null)}
          showCount
        />

        {rows.length > 0 && (
          <div>
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
                {rows.map((l, idx) => {
                  const where = l.scope === "building" ? "text-fg-1" : "text-fg-2";
                  return (
                    <tr key={idx}>
                      <Td className={cn("pl-0 max-[480px]:hidden", where)}>{l.unitLabel}</Td>
                      <Td className="text-fg-1 max-[480px]:pl-0">
                        {l.type}
                        <span className={cn("block text-meta min-[480px]:hidden", where)}>{l.unitLabel}</span>
                      </Td>
                      <Td className="num whitespace-nowrap text-fg-2 max-[480px]:hidden">{fmtAge(l.age)}</Td>
                      <Td className={cn("num whitespace-nowrap", l.pastDue ? "text-danger" : "text-fg-2")}>
                        {l.pastDue ? "Past due" : l.dueYear}
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
                <tr className={grandTotalRow}>
                  <Td className="whitespace-nowrap pl-0 max-[480px]:hidden">{totalLabel}</Td>
                  <Td className="max-[480px]:pl-0">
                    <span className="whitespace-nowrap min-[480px]:hidden">{totalLabel}</span>
                  </Td>
                  <Td className="max-[480px]:hidden" />
                  <Td />
                  <Td numeric className="pr-0">
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
