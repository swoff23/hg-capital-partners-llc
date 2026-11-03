import { Block, LoadingScreen, rowWidth } from "@/components/skeleton";
import { Td, Th, flushTable } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";
import { trailingMonths } from "@/lib/quickbooks/months";
import { fmtMonth } from "@/lib/quickbooks/period";
import { cn } from "@/lib/utils";
import { GridFrame } from "./grid-frame";

/* The pinned property column, as the page pins it. */
const pinned = "sticky left-0 z-20 bg-surface";

/**
 * The rent roll while it loads (docs/specs/performance.md 4.3), on the
 * Overview's pattern: the Cash | Accrual row keeps its height and the source
 * line is a block; from sm the grid draws Property and the 12 month labels
 * (from trailingMonths, as the Overview's chart does) over 8 rows of figure
 * blocks, and below sm the month stepper's frame holds 8 rows. The total
 * column's label names the basis, so it is a block too.
 */
export default function RentRollLoading() {
  const running = todayYmdEastern().slice(0, 7);
  const months = trailingMonths(running);
  const thisYear = Number(running.slice(0, 4));
  return (
    <LoadingScreen className="space-y-4">
      <div className="h-8 pointer-coarse:h-11" />
      <Block text="text-meta" className="w-64 max-w-full" />

      <div aria-hidden="true" className="space-y-3 sm:hidden">
        <div className="flex h-11 items-center justify-center">
          <Block text="text-label" className="w-16" />
        </div>
        <Block text="text-figure-m" className="w-32" />
        <ul className="divide-y divide-line">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="flex min-h-12 items-center justify-between gap-3 py-2">
              <Block text="text-body" className={rowWidth(i, ["w-36", "w-28", "w-40"])} />
              <Block text="text-body" className="w-16" />
            </li>
          ))}
        </ul>
      </div>

      <div className="max-sm:hidden">
        <GridFrame>
          <table className={cn("w-full text-body", flushTable)}>
            <thead>
              <tr>
                <Th className={cn(pinned, "z-30 min-w-56")}>Property</Th>
                {months.map((m) => (
                  <Th key={m} numeric>
                    {m === running ? `${fmtMonth(m, thisYear)} MTD` : fmtMonth(m, thisYear)}
                  </Th>
                ))}
                <Th numeric>
                  <Block text="text-meta" className="ml-auto w-20" />
                </Th>
              </tr>
            </thead>
            <tbody aria-hidden="true" className="divide-y divide-line">
              {Array.from({ length: 8 }, (_, i) => (
                <tr key={i}>
                  <Td className={cn(pinned, "min-w-56")}>
                    <Block text="text-body" className={rowWidth(i, ["w-36", "w-28", "w-40"])} />
                  </Td>
                  {months.map((m) => (
                    <Td key={m} numeric>
                      <Block text="text-body" className="ml-auto w-14" />
                    </Td>
                  ))}
                  <Td numeric>
                    <Block text="text-body" className="ml-auto w-16" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </GridFrame>
      </div>
    </LoadingScreen>
  );
}
