import { Block, LoadingScreen, Words, rowWidth } from "@/components/skeleton";
import { PageHeader, Table, Td, Th } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ContractorFiltersPlaceholder } from "../filters";
import { ContractorHeaderActions } from "../invite-sheet";

/**
 * Eight rows' words, at the lengths names and companies run to, so the
 * columns size as they will for the real ones: a name is two words and a
 * company is often a dash. Trades are tags, one to three of them, in a
 * column that takes a third of the width (a quarter from md to lg) whatever they hold.
 */
const ROWS: { name: string[]; company: string[]; trades: string[] }[] = [
  { name: ["w-12", "w-16"], company: ["w-3"], trades: ["w-12", "w-16"] },
  { name: ["w-16", "w-12"], company: ["w-8", "w-10", "w-10"], trades: ["w-14", "w-12", "w-10"] },
  { name: ["w-12", "w-18"], company: ["w-3"], trades: ["w-16"] },
  { name: ["w-10", "w-14"], company: ["w-8", "w-24", "w-6"], trades: ["w-12"] },
  { name: ["w-14", "w-14"], company: ["w-3"], trades: ["w-10", "w-16"] },
  { name: ["w-16", "w-18", "w-8"], company: ["w-12", "w-8", "w-14"], trades: ["w-20"] },
  { name: ["w-12", "w-16"], company: ["w-3"], trades: ["w-14", "w-10", "w-12"] },
  { name: ["w-18", "w-12"], company: ["w-12", "w-20"], trades: ["w-12"] },
];

/**
 * Contractors while the list loads (docs/specs/performance.md 4.3): the title,
 * Sign-up link and Invite contractor, the filter bar and Name, Company, Trades, Phone, Docs and Status
 * draw at once, with the page's own hiding classes; the count and 8 rows are
 * --muted blocks in the page's cells, the name over its subline below sm.
 */
export default function ContractorsLoading() {
  return (
    <LoadingScreen>
      <PageHeader
        title="Contractors"
        subtitle={<Block text="text-body" className="w-28" />}
        actions={<ContractorHeaderActions />}
      />
      <ContractorFiltersPlaceholder />
      <Table className="mt-4">
        <thead>
          <tr>
            <Th className="pl-0">Name</Th>
            <Th className="hidden sm:table-cell">Company</Th>
            <Th className="hidden w-1/3 sm:table-cell md:w-1/4 lg:w-1/3">Trades</Th>
            <Th className="pr-0 sm:pr-3">Phone</Th>
            <Th className="hidden pr-0 sm:table-cell md:pr-3">Docs</Th>
            <Th className="hidden pr-0 md:table-cell">Status</Th>
          </tr>
        </thead>
        <tbody aria-hidden="true" className="divide-y divide-border">
          {ROWS.map((r, i) => (
            <tr key={i}>
              <Td className="pl-0 max-sm:w-full max-sm:max-w-0">
                <Words text="text-body" widths={r.name} />
                <div className="mt-0.5 sm:hidden">
                  <Block text="text-meta" className={rowWidth(i + 1, ["w-40", "w-32", "w-28"])} />
                </div>
              </Td>
              <Td className="hidden sm:table-cell">
                <Words text="text-body" widths={r.company} />
              </Td>
              <Td className="hidden sm:table-cell">
                {/* Tag-shaped, at a tag's height (tagClass). */}
                <span className="flex w-0 min-w-full gap-1 overflow-hidden">
                  {r.trades.map((w, k) => (
                    <Block key={k} className={cn("h-5.5 shrink-0 rounded-sm", w)} />
                  ))}
                </span>
              </Td>
              <Td className="pr-0 sm:pr-3">
                <Block text="text-body" className="w-20 pointer-coarse:w-27" />
              </Td>
              <Td className="hidden pr-0 sm:table-cell md:pr-3">
                <Block text="text-body" className={rowWidth(i, ["w-8", "w-12 pointer-coarse:w-17", "w-8"])} />
              </Td>
              <Td className="hidden pr-0 md:table-cell">
                {/* Most rows are Active, the empty dash. */}
                <Block text="text-body" className="w-3" />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </LoadingScreen>
  );
}
