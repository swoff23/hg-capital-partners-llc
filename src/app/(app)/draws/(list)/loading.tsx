import { FactStrip } from "@/components/fact-strip";
import { Block, LoadingScreen, rowWidth } from "@/components/skeleton";
import { Button, PageHeader, Table, Th } from "@/components/ui";
import { Plus } from "lucide-react";

/**
 * Draws while it loads (docs/specs/performance.md 4.3): the title, New rehab, the strip's labels and the column
 * headers draw at once, with the page's own hiding classes; the figures and 5 rows are --muted blocks.
 */
export default function DrawsLoading() {
  return (
    <LoadingScreen>
      <PageHeader
        title="Draws"
        actions={
          <Button disabled>
            <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4" />
            New rehab
          </Button>
        }
      />
      <div className="mb-4 h-8 w-40 bg-muted pointer-coarse:h-11" aria-hidden="true" />
      <FactStrip
        facts={["Ready to draw", "Submitted", "Funded", "Left"].map((label) => ({
          label,
          value: <Block inline className="h-5 w-24 max-w-full" />,
        }))}
      />
      <Table className="mt-4">
        <thead>
          <tr>
            <Th className="pl-0">Rehab</Th>
            <Th className="max-sm:hidden">Current draw</Th>
            <Th numeric className="max-sm:hidden">
              Ready
            </Th>
            <Th numeric className="max-sm:hidden">
              Left
            </Th>
            <Th numeric className="max-lg:hidden">
              Funded
            </Th>
          </tr>
        </thead>
        <tbody aria-hidden="true" className="divide-y divide-border">
          {Array.from({ length: 5 }, (_, i) => (
            <tr key={i}>
              <td className="w-full max-w-0 p-0 align-middle sm:w-auto sm:max-w-none">
                <div className="flex min-h-14 items-center px-3 pl-0 pointer-coarse:min-h-15">
                  <span className="min-w-0 flex-1">
                    <Block text="text-body" className={rowWidth(i, ["w-40", "w-32", "w-44"])} />
                    <Block text="text-meta" className="w-48 sm:hidden" />
                  </span>
                </div>
              </td>
              <td className="p-0 align-middle max-sm:hidden">
                <div className="flex min-h-14 items-center px-3 pointer-coarse:min-h-15">
                  <Block text="text-body" className="w-44" />
                </div>
              </td>
              {[0, 1].map((c) => (
                <td key={c} className="p-0 align-middle max-sm:hidden">
                  <div className="flex min-h-14 items-center justify-end px-3 pointer-coarse:min-h-15">
                    <Block text="text-body" className="w-20" />
                  </div>
                </td>
              ))}
              <td className="p-0 align-middle max-lg:hidden">
                <div className="flex min-h-14 items-center justify-end px-3 pointer-coarse:min-h-15">
                  <Block text="text-body" className="w-36" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </LoadingScreen>
  );
}
