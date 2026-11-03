import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Block, LoadingScreen, rowWidth } from "@/components/skeleton";
import { LinkButton, PageHeader, Table, Td, Th, chromeIconClass } from "@/components/ui";
import { DEAL_FIELD_LABEL } from "@/lib/config";
import { cn } from "@/lib/utils";
import { ColumnWidthsProvider, Cols } from "../column-widths";
import { COLUMN_DROP, type ColumnKey } from "../columns";
import { DealFiltersPlaceholder } from "../filters";

/** The columns after Address, in the page's order, with a block's width for each. */
const COLUMNS: { key: Exclude<ColumnKey, "address">; label: string; numeric?: boolean; block: string; text?: string }[] = [
  { key: "status", label: DEAL_FIELD_LABEL.status, block: "w-24", text: "text-meta" },
  { key: "units", label: DEAL_FIELD_LABEL.units, numeric: true, block: "w-4" },
  { key: "theirPrice", label: DEAL_FIELD_LABEL.theirPrice, numeric: true, block: "w-16" },
  { key: "ourPrice", label: DEAL_FIELD_LABEL.ourPrice, numeric: true, block: "w-16" },
  { key: "latestNote", label: DEAL_FIELD_LABEL.latestNote, block: "w-24", text: "text-meta" },
  { key: "nextAction", label: DEAL_FIELD_LABEL.nextAction, block: "w-28" },
  { key: "updated", label: DEAL_FIELD_LABEL.updatedAt, block: "w-12", text: "text-meta" },
];

/** DealListRow's 40px rows with a mouse, 48 on touch. */
const dense = "min-h-10 pointer-coarse:min-h-12";

/**
 * Deals while the list loads (docs/specs/performance.md 4.3): the title, New
 * deal, the filter bar and the column headers draw at once, on the page's own
 * column widths (a dragged width too) and drop points; 10 rows are --fill-1
 * blocks in DealListRow's boxes, two lines where the list is under 520px.
 */
export default function DealsLoading() {
  return (
    <LoadingScreen>
      <PageHeader
        title="Deals"
        actions={
          <LinkButton href="/deals/new" variant="primary">
            <Plus aria-hidden="true" className={chromeIconClass} />
            New deal
          </LinkButton>
        }
      />
      <DealFiltersPlaceholder />
      <div className="mt-4 @container">
        <ColumnWidthsProvider>
          <Table style={{ tableLayout: "fixed" }}>
            <Cols />
            <thead>
              <tr>
                <Th className="pl-0">{DEAL_FIELD_LABEL.address}</Th>
                {COLUMNS.map((c) => (
                  <Th key={c.key} numeric={c.numeric} className={cn(COLUMN_DROP[c.key], c.key === "updated" && "pr-0")}>
                    {c.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody aria-hidden="true" className="divide-y divide-line">
              {Array.from({ length: 10 }, (_, i) => (
                <tr key={i}>
                  <Cell className="flex-col items-start justify-center gap-0 pl-0 @max-[32.5rem]:py-2">
                    <Block text="text-body" className={rowWidth(i, ["w-40", "w-32", "w-44", "w-36"])} />
                    {/* The phone row's subline: the stage and the asking price. */}
                    <span className="mt-0.5 hidden w-full @max-[32.5rem]:block">
                      <Block text="text-meta" className="w-28" />
                    </span>
                  </Cell>
                  {COLUMNS.map((c) => (
                    <Cell key={c.key} numeric={c.numeric} cell={COLUMN_DROP[c.key]} className={cn(c.key === "updated" && "pr-0")}>
                      <Block text={c.text ?? "text-body"} className={c.block} />
                    </Cell>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </ColumnWidthsProvider>
      </div>
    </LoadingScreen>
  );
}

/** RowCell's boxes without its links, at the deals table's density. */
function Cell({ numeric, cell, className, children }: { numeric?: boolean; cell?: string; className?: string; children: ReactNode }) {
  return (
    <Td numeric={numeric} className={cn("p-0 align-middle pointer-coarse:h-auto pointer-coarse:p-0", cell)}>
      <div className={cn("flex items-center gap-3 px-3", dense, numeric && "justify-end", className)}>{children}</div>
    </Td>
  );
}
