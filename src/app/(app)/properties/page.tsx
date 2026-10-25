import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";
import { PhotoThumb } from "@/components/photo-thumb";
import { shortAddress } from "@/lib/normalize";
import { activeTask } from "@/lib/task-scope";
import { parseBuildingCapex, parseUnits, propertyUnitCount } from "@/lib/property-types";
import { getCapexRules } from "@/lib/capex-rules";
import { cn, toMoneyNumber } from "@/lib/utils";
import { PortfolioCapexForecastCard } from "../portfolio-capex";
import { FactStrip } from "./fact-strip";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Portfolio (docs/brand-guidelines.md, sections 5 and 9): a summary strip,
 * then one 56px row per property with its photo (the fallback tile until
 * it's taken), money right-aligned and tabular, and a footer row that counts
 * and sums. The whole row opens the property. Below sm the status leads the
 * row's subline and the secondary columns drop. The 5-year CapEx forecast
 * sits under the table at #capex.
 */
export default async function PropertiesPage() {
  await requireUser();
  const [properties, openByProp, capexRules] = await Promise.all([
    prisma.property.findMany({ orderBy: { address: "asc" } }),
    prisma.task.groupBy({
      by: ["propertyId"],
      where: { ...activeTask, propertyId: { not: null } },
      _count: true,
    }),
    getCapexRules(),
  ]);
  const openMap = new Map(openByProp.map((r) => [r.propertyId, r._count]));

  const rows = properties.map((p) => ({
    id: p.id,
    address: p.address,
    name: shortAddress(p.address) || p.address,
    entity: p.llcOwner?.trim() || null,
    status: p.status?.trim() || null,
    units: propertyUnitCount(p),
    openTasks: openMap.get(p.id) ?? 0,
    purchase: p.purchasePrice,
    value: p.value,
    loan: p.currentLoan,
  }));

  const totals = rows.reduce(
    (acc, r) => {
      acc.units += r.units ?? 0;
      acc.purchase += toMoneyNumber(r.purchase) ?? 0;
      acc.value += toMoneyNumber(r.value) ?? 0;
      acc.loan += toMoneyNumber(r.loan) ?? 0;
      acc.openTasks += r.openTasks;
      return acc;
    },
    { units: 0, purchase: 0, value: 0, loan: 0, openTasks: 0 },
  );

  const capexProperties = properties.map((p) => ({
    id: p.id,
    address: p.address,
    units: parseUnits(p.units),
    building: parseBuildingCapex(p.buildingCapex),
  }));

  return (
    <>
      <PageHeader
        title="Portfolio"
        subtitle={
          rows.length > 0
            ? `${plural(rows.length, "property", "properties")} · ${plural(totals.units, "unit", "units")}`
            : undefined
        }
        actions={
          <LinkButton href="/properties/new" variant="primary">
            <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4" />
            New property
          </LinkButton>
        }
      />

      {rows.length === 0 ? (
        <EmptyState>Add your first property to track its loan, units and tasks here.</EmptyState>
      ) : (
        <>
          <FactStrip
            facts={[
              { label: "Value", value: <Money value={totals.value} /> },
              { label: "Purchase price", value: <Money value={totals.purchase} /> },
              { label: "Loan balance", value: <Money value={totals.loan} /> },
              { label: "Open tasks", value: totals.openTasks },
            ]}
          />

          <Table className="mt-6">
            <thead>
              <tr>
                <Th className="pl-0">Property</Th>
                <Th numeric className="max-[480px]:hidden">
                  Units
                </Th>
                <Th numeric className="max-sm:hidden">
                  Open tasks
                </Th>
                <Th numeric className="max-md:hidden">
                  Purchase
                </Th>
                <Th numeric className="max-sm:pr-0">
                  Value
                </Th>
                <Th className="pr-0 max-sm:hidden">Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const href = `/properties/${r.id}`;
                return (
                  <tr key={r.id} className="transition-colors duration-fast hover:bg-fill-1">
                    {/* The address column takes the room the others leave, so a long address truncates instead of widening the table. */}
                    <RowCell href={href} first cell="w-full max-w-0" className="pl-0">
                      <PhotoThumb size={48} alt={`Front of ${r.name}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-body text-fg-1">{r.name}</span>
                        {(r.entity || r.status) && (
                          <span className={cn("block truncate text-meta text-fg-3", !r.entity && "sm:hidden")}>
                            {/* The status column drops below sm, so its word leads the subline. */}
                            {r.status && (
                              <span className="text-fg-2 sm:hidden">
                                {r.status}
                                {r.entity && " · "}
                              </span>
                            )}
                            {r.entity}
                          </span>
                        )}
                      </span>
                    </RowCell>
                    <RowCell href={href} numeric cell="max-[480px]:hidden">
                      {r.units ?? <span className="text-fg-3">—</span>}
                    </RowCell>
                    <RowCell href={href} numeric cell="max-sm:hidden" className={r.openTasks ? undefined : "text-fg-3"}>
                      {r.openTasks}
                    </RowCell>
                    <RowCell href={href} numeric cell="max-md:hidden">
                      <Money value={r.purchase} />
                    </RowCell>
                    <RowCell href={href} numeric className="max-sm:pr-0">
                      <Money value={r.value} />
                    </RowCell>
                    <RowCell href={href} cell="max-sm:hidden" className="whitespace-nowrap pr-0 text-meta font-medium text-fg-2">
                      {r.status ?? <span className="font-normal text-fg-3">—</span>}
                    </RowCell>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <Td className="border-t border-line-strong pl-0">{plural(rows.length, "property", "properties")}</Td>
                <Td numeric className="border-t border-line-strong max-[480px]:hidden">
                  {totals.units}
                </Td>
                <Td numeric className="border-t border-line-strong max-sm:hidden">
                  {totals.openTasks}
                </Td>
                <Td numeric className="border-t border-line-strong max-md:hidden">
                  <Money value={totals.purchase} />
                </Td>
                <Td numeric className="border-t border-line-strong max-sm:pr-0">
                  <Money value={totals.value} />
                </Td>
                <Td className="border-t border-line-strong pr-0 max-sm:hidden" />
              </tr>
            </tfoot>
          </Table>

          <PortfolioCapexForecastCard id="capex" className="mt-10" properties={capexProperties} rules={capexRules} />
        </>
      )}
    </>
  );
}

/**
 * One cell of a property's row, all of it a link to the property, so the
 * whole row opens it. Only the first cell's link takes focus and names the
 * row; the rest are the same link for a mouse or a tap. A single link
 * stretched over the row would need the row as its containing block, which
 * not every engine gives a table row. 56px with a mouse, 60 on touch
 * (section 5 Density). `cell` styles the cell (when it drops); `className`
 * its content, with pl-0 and pr-0 putting the edge cells on the gutter.
 */
function RowCell({
  href,
  first = false,
  numeric = false,
  cell,
  className,
  children,
}: {
  href: string;
  first?: boolean;
  numeric?: boolean;
  /** The cell's own classes: when it drops, and the first column's width. */
  cell?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Td numeric={numeric} className={cn("p-0 align-middle pointer-coarse:h-auto pointer-coarse:p-0", cell)}>
      <Link
        href={href}
        tabIndex={first ? undefined : -1}
        aria-hidden={first ? undefined : true}
        className={cn(
          "flex min-h-14 items-center gap-3 px-3 -outline-offset-2 pointer-coarse:min-h-15",
          numeric && "justify-end",
          className,
        )}
      >
        {children}
      </Link>
    </Td>
  );
}

export const dynamic = "force-dynamic";
