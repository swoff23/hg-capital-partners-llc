import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { FactStrip } from "@/components/fact-strip";
import { Block, LoadingScreen, rowWidth } from "@/components/skeleton";
import { LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PropertyFiltersPlaceholder } from "../filters";

/** The columns after Property, with the page's classes: `th` for the header, `cell` and `pad` for RowCell's cell and content. */
const COLUMNS = [
  { label: "Units", numeric: true, th: "max-[480px]:hidden", cell: "max-[480px]:hidden", block: "w-2" },
  { label: "Open tasks", numeric: true, th: "max-sm:hidden", cell: "max-sm:hidden", block: "w-4" },
  { label: "Purchase", numeric: true, th: "max-md:hidden", cell: "max-md:hidden", block: "w-19 pointer-coarse:w-22" },
  { label: "Value", numeric: true, th: "max-sm:pr-0", pad: "max-sm:pr-0", block: "w-19 pointer-coarse:w-22" },
  { label: "Status", th: "pr-0 max-sm:hidden", cell: "max-sm:hidden", pad: "pr-0", block: "w-22 pointer-coarse:w-24", text: "text-meta" },
];

/**
 * Portfolio while it loads (docs/specs/performance.md 4.3): the title, New
 * property, the strip's labels, the filter bar and the column headers draw
 * at once, with the page's own hiding classes; the counts, the figures and 8
 * rows (photo tile, address, figures) are --fill-1 blocks in RowCell's boxes.
 */
export default function PortfolioLoading() {
  return (
    <LoadingScreen>
      <PageHeader
        title="Portfolio"
        subtitle={<Block text="text-body" className="w-36" />}
        actions={
          <LinkButton href="/properties/new" variant="primary">
            <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4" />
            New property
          </LinkButton>
        }
      />
      <FactStrip
        facts={["Value", "Loan balance", "Equity", "LTV"].map((label) => ({
          label,
          value: <Block inline className="h-5 w-24 max-w-full" />,
        }))}
      />
      <PropertyFiltersPlaceholder />
      <Table className="mt-4">
        <thead>
          <tr>
            <Th className="pl-0">Property</Th>
            {COLUMNS.map((c) => (
              <Th key={c.label} numeric={c.numeric} className={c.th}>
                {c.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody aria-hidden="true" className="divide-y divide-line">
          {Array.from({ length: 8 }, (_, i) => (
            <tr key={i}>
              <Cell className="pl-0" cell="w-full max-w-0">
                <Block className="h-9 w-12 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <Block text="text-body" className={rowWidth(i, ["w-40", "w-32", "w-44", "w-36"])} />
                  {/* The owning entity under the address. */}
                  <Block text="text-meta" className={rowWidth(i, ["w-36", "w-32", "w-40"])} />
                </span>
              </Cell>
              {COLUMNS.map((c) => (
                <Cell key={c.label} numeric={c.numeric} cell={c.cell} className={c.pad}>
                  <Block text={c.text ?? "text-body"} className={c.block} />
                </Cell>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </LoadingScreen>
  );
}

/** RowCell's boxes without its links: a 56px row with a mouse, 60 on touch. */
function Cell({ numeric, cell, className, children }: { numeric?: boolean; cell?: string; className?: string; children: ReactNode }) {
  return (
    <Td numeric={numeric} className={cn("p-0 align-middle pointer-coarse:h-auto pointer-coarse:p-0", cell)}>
      <div className={cn("flex min-h-14 items-center gap-3 px-3 pointer-coarse:min-h-15", numeric && "justify-end", className)}>{children}</div>
    </Td>
  );
}
