import { BackLink } from "@/components/back-link";
import { FactStrip } from "@/components/fact-strip";
import { RailFact, RailList } from "@/components/rail";
import { Block, HeadingBlock, LoadingScreen, TaskRowSkeleton, rowWidth } from "@/components/skeleton";
import { Section } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";

/**
 * The rail's sections and the rows a property usually has in them, as
 * edit-details, edit-loan and edit-insurance list them. Empty rows fold
 * (components/rail-fold.tsx), so Loan and Insurance draw their reminder date,
 * the rows most properties fill, and the fold's row (`fold`).
 */
const RAIL = [
  {
    title: "Details",
    rows: ["Value", "Purchase date", "Purchase price", "Refinance date", "Strategy", "Sq ft", "Entity", "Attorney", "Status", "Move-in form", "Registration", "Tax due"],
    fold: false,
  },
  { title: "Loan", rows: ["Maturity", "Balance", "Servicer", "Escrow"], fold: true },
  { title: "Insurance", rows: ["Renewal", "Replacement"], fold: true },
];

/**
 * A property while it loads (docs/specs/performance.md 4.3), on the page's
 * grid and in its order (docs/specs/property-page.md): Portfolio, the four
 * figures' labels, then Tasks, Units & access and CapEx (its years, from
 * today, as the card counts them, and the folded Building systems row) beside
 * the rail's Details, Loan and Insurance with every label drawn at once; the
 * photo, the status, the address, the subline, the figures and the sections'
 * values are --fill-1 blocks. The Financials card shows only once QuickBooks
 * is connected, and Rental listings only with a listing, so both stay out.
 * Full width at 16:9 on a phone, the photo is 96x72 from sm.
 */
export default function PropertyLoading() {
  const from = Number(todayYmdEastern().slice(0, 4));
  const years = [0, 1, 2, 3, 4].map((i) => from + i);
  return (
    <LoadingScreen className="max-w-300">
      <BackLink fallback="/properties" label="Portfolio" />

      <header className="mt-3 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <Block className="aspect-video w-full rounded-lg sm:aspect-auto sm:h-18 sm:w-24" />
        <div className="min-w-0">
          <Block text="text-meta" className="w-24" />
          <HeadingBlock className="w-3/5 max-sm:w-full" phoneLines={2} />
          <Block text="text-meta" className="w-48" />
        </div>
      </header>

      <FactStrip
        className="mt-6"
        facts={[
          { label: "Value", key: true, value: <Block inline className="h-7 w-32 max-w-full" /> },
          ...["Loan balance", "Equity", "LTV"].map((label) => ({ label, value: <Block inline className="h-5 w-24 max-w-full" /> })),
        ]}
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10 pointer-coarse:mt-6">
        <div className="min-w-0 space-y-8 pointer-coarse:space-y-6">
          {/* PropertyTasksSection's rows, on its container query. */}
          <Section title="Tasks">
            <ul className="@container divide-y divide-line">
              {Array.from({ length: 4 }, (_, i) => (
                <TaskRowSkeleton key={i} i={i} />
              ))}
            </ul>
          </Section>

          <Section title="Units & access">
            <SectionLines lines={2} />
          </Section>

          {/* CapexForecastCard's boxes: the total, ForecastYearBars' rows, then the folded Building systems row. */}
          <Section
            title="CapEx"
            actions={
              <span className="num flex h-8 items-center text-meta text-fg-3">
                {from} to {from + 4}
              </span>
            }
          >
            <div className="space-y-4">
              <Block text="text-figure-m" className="w-20" />
              <div aria-hidden="true" className="-mx-2 space-y-0.5">
                {years.map((y) => (
                  <div key={y} className="flex w-full items-center gap-3 px-2 py-1 text-meta pointer-coarse:min-h-11">
                    <span className="num w-10 shrink-0 text-fg-3">{y}</span>
                    <Block className="h-1 min-w-0 flex-1" />
                    <span className="flex w-20 shrink-0 justify-end">
                      <Block text="text-meta" className="w-14" />
                    </span>
                    <span className="w-14 shrink-0 max-[400px]:hidden" />
                  </div>
                ))}
              </div>
              <FoldLine />
            </div>
          </Section>
        </div>

        <div className="min-w-0 space-y-8 pointer-coarse:space-y-6">
          {RAIL.map((s) => (
            <Section key={s.title} title={s.title}>
              <RailList>
                {s.rows.map((label, i) => (
                  <RailFact key={label} label={label}>
                    <Block text="text-body" className={rowWidth(i, ["w-24", "w-20", "w-28", "w-16"])} />
                  </RailFact>
                ))}
              </RailList>
              {s.fold && <FoldLine />}
            </Section>
          ))}
        </div>
      </div>
    </LoadingScreen>
  );
}

/** A section's contents as lines of blocks, 40px apart as its rows are. */
function SectionLines({ lines }: { lines: number }) {
  return (
    <ul aria-hidden="true" className="divide-y divide-line">
      {Array.from({ length: lines }, (_, i) => (
        <li key={i} className="flex min-h-10 items-center pointer-coarse:min-h-12">
          <Block text="text-body" className={rowWidth(i)} />
        </li>
      ))}
    </ul>
  );
}

/** A fold's foot row ("7 more fields", "Building systems"): 40px over a --line rule, 48 on touch. */
function FoldLine() {
  return (
    <div aria-hidden="true" className="flex min-h-10 items-center border-t border-line pointer-coarse:min-h-12">
      <Block text="text-label" className="w-28" />
    </div>
  );
}
