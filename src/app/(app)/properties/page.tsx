import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ScopeButton } from "@/components/filter-bar";
import { SortHeader } from "@/components/sort-header";
import { EmptyState, LinkButton, PageHeader, RowCell, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";
import { PhotoThumb } from "@/components/photo-thumb";
import { shortAddress } from "@/lib/normalize";
import { activeTask, excludeTemplateTasks } from "@/lib/task-scope";
import { parseBuildingCapex, parseUnits, propertyUnitCount } from "@/lib/property-types";
import { getCapexRules } from "@/lib/capex-rules";
import { cn, toMoneyNumber } from "@/lib/utils";
import { isSold } from "@/lib/properties/figures";
import { PortfolioCapexForecastCard } from "../portfolio-capex";
import { PortfolioStrip } from "./portfolio-strip";
import { PropertyFilters } from "./filters";
import {
  DEFAULT_PROPERTY_SORT,
  filterByStatus,
  isPropertyListFiltered,
  parsePropertyFilters,
  sortProperties,
  statusOptions,
} from "./list";
import { PropertyStatus } from "./property-status";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Portfolio (docs/brand-guidelines.md, sections 5 and 9): the summary strip
 * (value, loan balance, equity and LTV; charts D4 A), then one
 * 56px row per property with its photo (the fallback tile until
 * it's taken), money right-aligned and tabular, and a footer row that counts
 * and sums. The whole row opens the property. Below sm the status leads the
 * row's subline and the secondary columns drop. The 5-year CapEx forecast
 * sits under the table at #capex. A Status chip filters (several picks) and
 * the Property, Units and Value headers sort (street order, 15 before 118);
 * both live in the URL (selectors 3.6 and 3.7).
 */
export default async function PropertiesPage({ searchParams }: PageProps<"/properties">) {
  await requireUser();
  const filters = parsePropertyFilters(await searchParams);
  const [properties, openByProp, capexRules] = await Promise.all([
    prisma.property.findMany({ orderBy: { address: "asc" } }),
    prisma.task.groupBy({
      by: ["propertyId"],
      where: { ...activeTask, ...excludeTemplateTasks, propertyId: { not: null } },
      _count: true,
    }),
    getCapexRules(),
  ]);
  const openMap = new Map(openByProp.map((r) => [r.propertyId, r._count]));

  const all = properties.map((p) => ({
    id: p.id,
    address: p.address,
    name: shortAddress(p.address) || p.address,
    entity: p.llcOwner?.trim() || null,
    status: p.status?.trim() || null,
    units: propertyUnitCount(p),
    openTasks: openMap.get(p.id) ?? 0,
    purchase: p.purchasePrice,
    value: p.value,
  }));

  // A sold property leaves every count and sum: the strip, the subtitle and the footer (charts D4).
  const sum = (list: typeof all) =>
    list
      .filter((r) => !isSold(r.status))
      .reduce(
        (acc, r) => {
          acc.count += 1;
          acc.units += r.units ?? 0;
          acc.purchase += toMoneyNumber(r.purchase) ?? 0;
          acc.value += toMoneyNumber(r.value) ?? 0;
          acc.openTasks += r.openTasks;
          return acc;
        },
        { count: 0, units: 0, purchase: 0, value: 0, openTasks: 0 },
      );
  // "11 properties" while every one is owned; "10 owned" once one has sold.
  const countLabel = (list: typeof all, n: number) =>
    list.some((r) => isSold(r.status)) ? `${n} owned` : plural(n, "property", "properties");
  // The footer counts and sums the rows on show; the portfolio strip and the subtitle stay whole.
  const rows = sortProperties(filterByStatus(all, filters.statuses), filters.sort);
  const totals = sum(rows);
  const whole = sum(all);

  // A sold building leaves the CapEx forecast too (charts D4).
  const capexProperties = properties
    .filter((p) => !isSold(p.status))
    .map((p) => ({
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
          all.length > 0 ? `${countLabel(all, whole.count)} · ${plural(whole.units, "unit", "units")}` : undefined
        }
        actions={
          <LinkButton href="/properties/new" variant="primary">
            <Plus aria-hidden="true" strokeWidth={1.75} className="h-4 w-4" />
            New property
          </LinkButton>
        }
      />

      {all.length === 0 ? (
        <EmptyState>Add your first property to track its loan, units and tasks here.</EmptyState>
      ) : (
        <>
          {/* Purchase, units and open tasks are the footer's sums; the strip carries leverage (charts D4 A). */}
          <PortfolioStrip
            properties={properties.map((p) => ({
              status: p.status,
              value: toMoneyNumber(p.value),
              balance: toMoneyNumber(p.currentLoan),
            }))}
          />

          <PropertyFilters
            data={{
              statuses: all.map((r) => r.status),
              options: statusOptions(all.map((r) => r.status)),
              shown: rows.length,
              hidden: all.length - rows.length,
              filtered: isPropertyListFiltered(filters),
            }}
          >
            {rows.length === 0 ? (
              <EmptyState action={<ScopeButton clear>Clear filters</ScopeButton>}>No properties match these filters.</EmptyState>
            ) : (
              <Table className="mt-4">
                <thead>
                  <tr>
                    <SortHeader label="Property" field="address" defaultSort={DEFAULT_PROPERTY_SORT} className="pl-0" />
                    <SortHeader
                      label="Units"
                      field="units"
                      defaultSort={DEFAULT_PROPERTY_SORT}
                      first="desc"
                      numeric
                      className="max-[480px]:hidden"
                    />
                    <Th numeric className="max-sm:hidden">
                      Open tasks
                    </Th>
                    <Th numeric className="max-md:hidden">
                      Purchase
                    </Th>
                    <SortHeader
                      label="Value"
                      field="value"
                      defaultSort={DEFAULT_PROPERTY_SORT}
                      first="desc"
                      numeric
                      className="max-sm:pr-0"
                    />
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
                          {/* Decorative inside the link, which the address already names. */}
                          <span aria-hidden="true" className="shrink-0">
                            <PhotoThumb size={48} alt="" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-body text-fg-1">{r.name}</span>
                            {(r.entity || r.status) && (
                              <span className={cn("block truncate text-meta text-fg-3", !r.entity && "sm:hidden")}>
                                {/* The status column drops below sm, so its word leads the subline. */}
                                {r.status && (
                                  <span className="sm:hidden">
                                    <PropertyStatus status={r.status} />
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
                        <RowCell href={href} cell="max-sm:hidden" className="whitespace-nowrap pr-0 text-meta">
                          {r.status ? <PropertyStatus status={r.status} /> : <span className="text-fg-3">—</span>}
                        </RowCell>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <Td className="border-t border-line-strong pl-0">{countLabel(rows, totals.count)}</Td>
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
            )}
          </PropertyFilters>

          <PortfolioCapexForecastCard
            id="capex"
            className="mt-8 pointer-coarse:mt-6"
            properties={capexProperties}
            rules={capexRules}
          />
        </>
      )}
    </>
  );
}

export const dynamic = "force-dynamic";
