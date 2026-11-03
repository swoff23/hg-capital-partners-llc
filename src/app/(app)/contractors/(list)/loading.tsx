import { Plus } from "lucide-react";
import { Block, LoadingScreen, Words, rowWidth } from "@/components/skeleton";
import { LinkButton, PageHeader, Table, Td, Th, chromeIconClass } from "@/components/ui";
import { ContractorFiltersPlaceholder } from "../filters";

/**
 * Eight rows' words, at the lengths names, companies and trades run to, so
 * the columns size as they will for the real ones: a name is two words, a
 * company is often a dash, and a list of trades can be one long word
 * ("Framing/Tile/Drywall") that sets its column's narrowest width.
 */
const ROWS: { name: string[]; company: string[]; trades: string[] }[] = [
  { name: ["w-12", "w-16"], company: ["w-3"], trades: ["w-16", "w-16"] },
  { name: ["w-16", "w-12"], company: ["w-8", "w-10", "w-10"], trades: ["w-64"] },
  { name: ["w-12", "w-18"], company: ["w-3"], trades: ["w-28", "w-4", "w-16"] },
  { name: ["w-10", "w-14"], company: ["w-8", "w-24", "w-6"], trades: ["w-10"] },
  { name: ["w-14", "w-14"], company: ["w-3"], trades: ["w-24", "w-24"] },
  { name: ["w-16", "w-18", "w-8"], company: ["w-12", "w-8", "w-14"], trades: ["w-20"] },
  { name: ["w-12", "w-16"], company: ["w-3"], trades: ["w-32", "w-4", "w-18"] },
  { name: ["w-18", "w-12"], company: ["w-12", "w-20"], trades: ["w-14"] },
];

/**
 * Contractors while the list loads (docs/specs/performance.md 4.3): the title,
 * New contractor, the filter bar and Name, Company, Trades, Phone and Docs
 * draw at once, with the page's own hiding classes; the count and 8 rows are
 * --fill-1 blocks in the page's cells, the name over its subline below sm.
 */
export default function ContractorsLoading() {
  return (
    <LoadingScreen>
      <PageHeader
        title="Contractors"
        subtitle={<Block text="text-body" className="w-28" />}
        actions={
          <LinkButton href="/contractors/new" variant="primary">
            <Plus aria-hidden="true" className={chromeIconClass} />
            New contractor
          </LinkButton>
        }
      />
      <ContractorFiltersPlaceholder />
      <Table className="mt-4">
        <thead>
          <tr>
            <Th className="pl-0">Name</Th>
            <Th className="hidden sm:table-cell">Company</Th>
            <Th className="hidden sm:table-cell">Trades</Th>
            <Th className="pr-0 sm:pr-3">Phone</Th>
            <Th className="hidden pr-0 sm:table-cell">Docs</Th>
          </tr>
        </thead>
        <tbody aria-hidden="true" className="divide-y divide-line">
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
              <Td className="hidden max-w-xs sm:table-cell">
                <Words text="text-body" widths={r.trades} />
              </Td>
              <Td className="pr-0 sm:pr-3">
                <Block text="text-body" className="w-20 pointer-coarse:w-27" />
              </Td>
              <Td className="hidden pr-0 sm:table-cell">
                <Block text="text-body" className={rowWidth(i, ["w-8", "w-12 pointer-coarse:w-17", "w-8"])} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </LoadingScreen>
  );
}
