import { Block, LoadingScreen, Words, rowWidth } from "@/components/skeleton";
import { LinkButton, PageHeader, Table, Td, Th, chromeIconClass } from "@/components/ui";
import { Plus } from "lucide-react";
import { TenantFiltersPlaceholder } from "../filters";

/** Eight rows' words, at the lengths names run to, so the columns size as they will for the real ones. */
const NAMES: string[][] = [
  ["w-12", "w-16"],
  ["w-16", "w-12"],
  ["w-12", "w-18"],
  ["w-10", "w-14"],
  ["w-14", "w-14"],
  ["w-16", "w-18"],
  ["w-12", "w-16"],
  ["w-18", "w-12"],
];

/**
 * Tenants while the list loads (docs/specs/performance.md 4.3): the title and
 * New lease, the filter bar and the five headers draw at once, with the page's
 * own hiding classes; the count and 8 rows are --fill-1 blocks in the page's
 * cells, the name over the home below sm.
 */
export default function TenantsLoading() {
  return (
    <LoadingScreen>
      <PageHeader
        title="Tenants"
        subtitle={<Block text="text-body" className="w-28" />}
        actions={
          <LinkButton href="/tenants/new" variant="primary">
            <Plus aria-hidden="true" className={chromeIconClass} />
            New lease
          </LinkButton>
        }
      />
      <TenantFiltersPlaceholder />
      <Table className="mt-4">
        <thead>
          <tr>
            <Th className="pl-0">Name</Th>
            <Th className="hidden sm:table-cell">Home</Th>
            <Th numeric className="pr-0 sm:pr-3">
              Rent
            </Th>
            <Th className="hidden pr-0 sm:table-cell lg:pr-3">Lease ends</Th>
            <Th className="hidden pr-0 lg:table-cell">Phone</Th>
          </tr>
        </thead>
        <tbody aria-hidden="true" className="divide-y divide-line">
          {NAMES.map((name, i) => (
            <tr key={i}>
              <Td className="pl-0 max-sm:w-full max-sm:max-w-0">
                <Words text="text-body" widths={name} />
                <div className="mt-0.5 sm:hidden">
                  <Block text="text-meta" className={rowWidth(i + 1, ["w-40", "w-32", "w-28"])} />
                </div>
              </Td>
              <Td className="hidden sm:table-cell">
                <Block text="text-body" className={rowWidth(i, ["w-32", "w-28", "w-36"])} />
              </Td>
              <Td numeric className="pr-0 sm:pr-3">
                <Block text="text-body" className="ml-auto w-12" />
              </Td>
              <Td className="hidden pr-0 sm:table-cell lg:pr-3">
                <Block text="text-body" className="w-16" />
              </Td>
              <Td className="hidden pr-0 lg:table-cell">
                <Block text="text-body" className="w-24" />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </LoadingScreen>
  );
}
