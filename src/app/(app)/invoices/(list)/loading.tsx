import { Block, LoadingScreen, rowWidth } from "@/components/skeleton";
import { Button, PageHeader, Table, Th, chromeIconClass } from "@/components/ui";
import { Plus } from "lucide-react";

/**
 * Invoices while it loads (docs/specs/performance.md 4.3): the title, New invoice and the column headers draw at
 * once, with the page's own hiding classes; the switch and 5 rows are --muted blocks.
 */
export default function InvoicesLoading() {
  return (
    <LoadingScreen>
      <PageHeader
        title="Invoices"
        actions={
          <Button disabled>
            <Plus aria-hidden="true" className={chromeIconClass} />
            New invoice
          </Button>
        }
      />
      <div className="mb-4 h-8 w-64 max-w-full bg-muted pointer-coarse:h-11" aria-hidden="true" />
      <Table>
        <thead>
          <tr>
            <Th className="pl-0">Contractor</Th>
            <Th className="max-sm:hidden">Invoice</Th>
            <Th className="max-sm:hidden">Jobs</Th>
            <Th className="max-sm:hidden">Date</Th>
            <Th numeric className="pr-0">
              Total
            </Th>
          </tr>
        </thead>
        <tbody aria-hidden="true" className="divide-y divide-border">
          {Array.from({ length: 5 }, (_, i) => (
            <tr key={i}>
              <td className="w-full max-w-0 p-0 align-middle sm:w-64 sm:max-w-64">
                <div className="flex min-h-14 items-center px-3 pl-0 pointer-coarse:min-h-15">
                  <span className="min-w-0 flex-1">
                    <Block text="text-body" className={rowWidth(i, ["w-32", "w-28", "w-36"])} />
                    <Block text="text-meta" className="w-48 sm:hidden" />
                  </span>
                </div>
              </td>
              <td className="p-0 align-middle max-sm:hidden">
                <div className="flex min-h-14 items-center px-3 pointer-coarse:min-h-15">
                  <Block text="text-body" className="w-14" />
                </div>
              </td>
              <td className="w-full max-w-0 p-0 align-middle max-sm:hidden">
                <div className="flex min-h-14 items-center px-3 pointer-coarse:min-h-15">
                  <Block text="text-body" className="w-56" />
                </div>
              </td>
              <td className="p-0 align-middle max-sm:hidden">
                <div className="flex min-h-14 items-center px-3 pointer-coarse:min-h-15">
                  <Block text="text-body" className="w-14" />
                </div>
              </td>
              <td className="p-0 align-middle">
                <div className="flex min-h-14 items-center justify-end px-3 pr-0 pointer-coarse:min-h-15">
                  <Block text="text-body" className="w-20" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </LoadingScreen>
  );
}
