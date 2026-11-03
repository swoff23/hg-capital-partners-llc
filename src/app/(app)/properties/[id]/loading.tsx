import { BackLink } from "@/components/back-link";
import { FactStrip } from "@/components/fact-strip";
import { RailFact, RailList } from "@/components/rail";
import { Block, HeadingBlock, LoadingScreen, rowWidth } from "@/components/skeleton";
import { Section, Table, Td, Th } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";

/** The rail's sections and their rows on every property, as edit-details, edit-loan and edit-insurance list them. */
const RAIL = [
  {
    title: "Details",
    rows: [
      "Value",
      "Purchase date",
      "Purchase price",
      "Closing costs",
      "Rehab amount",
      "Refinance date",
      "Refi target",
      "Strategy",
      "Sq ft",
      "Entity",
      "Attorney",
      "Status",
      "Registration",
      "Tax due",
    ],
  },
  {
    title: "Loan",
    rows: ["Maturity", "Balance", "Lender", "Servicer", "Loan #", "Loan type", "Original loan", "Rate", "Payment / mo", "Escrow", "Originated"],
  },
  { title: "Insurance", rows: ["Renewal", "Carrier", "Policy #", "Premium", "Replacement", "Coverage", "Deductible", "Liability"] },
];

/** The default CapEx rules' building systems: Building CapEx lists one row each. */
const SYSTEMS = 10;

/**
 * A property while it loads (docs/specs/performance.md 4.3), on the page's
 * grid: Portfolio, the four figures' labels, the main column's 5-year CapEx
 * forecast (its years, from today, as the card counts them), Building CapEx
 * with its column headers, Units & access, and the rail's Details, Loan and
 * Insurance with every label draw at once; the photo, the status, the
 * address, the subline, the figures and the sections' values are --fill-1
 * blocks. The Financials card shows only once QuickBooks is connected, so it
 * stays out. Full width at 16:9 on a phone, the photo is 96x72 from sm.
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
          {/* CapexForecastCard's boxes: the total, then ForecastYearBars' rows. */}
          <Section
            title="5-year CapEx forecast"
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
            </div>
          </Section>

          {/* BuildingCapexSection's boxes: the dated count and its meter, then the table. */}
          <Section title="Building CapEx">
            <div className="flex items-center gap-2">
              <Block text="text-meta" className="w-32" />
            </div>
            <Table className="mt-2">
              <thead>
                <tr>
                  <Th className="pl-0">Component</Th>
                  <Th className="max-[480px]:hidden lg:max-xl:hidden">Type</Th>
                  <Th>Year</Th>
                  <Th className="max-[480px]:hidden">Age</Th>
                  <Th>Status</Th>
                  <Th numeric className="pr-0">
                    Cost
                  </Th>
                </tr>
              </thead>
              <tbody aria-hidden="true" className="divide-y divide-line">
                {Array.from({ length: SYSTEMS }, (_, i) => (
                  <tr key={i}>
                    <Td className="pl-0 align-middle">
                      <Block text="text-body" className={rowWidth(i, ["w-16", "w-28", "w-20", "w-32"])} />
                    </Td>
                    <Td className="align-middle max-[480px]:hidden lg:max-xl:hidden">
                      <Block text="text-body" className="w-14" />
                    </Td>
                    <Td className="align-middle">
                      <Block text="text-body" className="w-8" />
                    </Td>
                    <Td className="align-middle max-[480px]:hidden">
                      <Block text="text-body" className="w-8" />
                    </Td>
                    <Td className="align-middle">
                      <Block text="text-body" className="w-14" />
                    </Td>
                    <Td numeric className="pr-0 align-middle">
                      <Block text="text-body" className="ml-auto w-8" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section title="Units & access">
            <SectionLines lines={2} />
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
