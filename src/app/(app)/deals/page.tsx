import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, LinkButton, PageHeader, Table, Th, EmptyState } from "@/components/ui";
import { DEAL_STATUSES } from "@/lib/config";
import { DealFilters } from "./filters";
import { DealRowEditable } from "./deal-row";
import { SortHeader } from "./sort-header";

type SP = { status?: string; statuses?: string; q?: string; sort?: string };

// Status has no natural DB ordering (it's not alphabetical), so it's ranked by its position
// in the pipeline (DEAL_STATUSES) and sorted in memory below.
const STATUS_RANK = new Map(DEAL_STATUSES.map((s, i) => [s as string, i]));
const statusRank = (status: string) => STATUS_RANK.get(status) ?? DEAL_STATUSES.length;

const SORT_COLUMNS: Record<
  string,
  (desc: boolean) => Prisma.DealOrderByWithRelationInput
> = {
  address: (desc) => ({ address: desc ? "desc" : "asc" }),
  theirPrice: (desc) => ({ theirPrice: { sort: desc ? "desc" : "asc", nulls: "last" } }),
  ourPrice: (desc) => ({ ourPrice: { sort: desc ? "desc" : "asc", nulls: "last" } }),
  nextAction: (desc) => ({ nextAction: { sort: desc ? "desc" : "asc", nulls: "last" } }),
  updated: (desc) => ({ updatedAt: desc ? "desc" : "asc" }),
};

/** DB-level order for the fetch. Status is re-sorted in memory afterward, so fetch order for it doesn't matter. */
function dbOrderBy(field: string, desc: boolean): Prisma.DealOrderByWithRelationInput[] {
  if (field === "status") return [{ updatedAt: "desc" }];
  const build = SORT_COLUMNS[field] ?? SORT_COLUMNS.updated;
  const primary = build(desc);
  return field === "updated" ? [primary] : [primary, { updatedAt: "desc" }];
}

function sortByStatus<T extends { status: string; updatedAt: Date }>(list: T[], desc: boolean): T[] {
  return [...list].sort((a, b) => {
    const diff = statusRank(a.status) - statusRank(b.status);
    if (diff !== 0) return desc ? -diff : diff;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  await requireUser();
  const sp = (await searchParams) as SP;

  const statusFilter = sp.status ?? "active";
  const selectedStatuses = (sp.statuses ?? "").split(",").filter(Boolean);
  const where = {
    ...(selectedStatuses.length > 0
      ? { status: { in: selectedStatuses } }
      : statusFilter === "all"
        ? {}
        : statusFilter === "active"
          ? { status: { notIn: ["Pass", "CLOSED!"] } }
          : { status: statusFilter }),
    ...(sp.q ? { address: { contains: sp.q, mode: "insensitive" as const } } : {}),
  };

  const sortRaw = sp.sort || "status";
  const sortDesc = sortRaw.startsWith("-");
  const sortField = (sortDesc ? sortRaw.slice(1) : sortRaw) || "status";

  // Sorting by status happens in memory (see sortByStatus), so that fetch can't be `take`-limited
  // up front — limiting by DB order first would silently drop whole status groups before the
  // real sort ever runs. Every other sort is a plain DB order, so it can take the cap directly.
  const [dealsRaw, filteredCount, statusCounts] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: dbOrderBy(sortField, sortDesc),
      ...(sortField === "status" ? {} : { take: 300 }),
      include: {
        // Most recent manually-entered activity notes — shown as a column so they're visible
        // without opening each deal. Auto-logged "change" entries are excluded.
        notes: {
          where: { source: "manual" },
          orderBy: [{ noteDate: "desc" }, { createdAt: "desc" }],
          take: 2,
        },
      },
    }),
    prisma.deal.count({ where }),
    prisma.deal.groupBy({ by: ["status"], _count: true }),
  ]);
  const sorted = sortField === "status" ? sortByStatus(dealsRaw, sortDesc) : dealsRaw;
  const deals = sorted.slice(0, 300);
  const truncated = filteredCount > 300;

  return (
    <>
      <PageHeader
        title="Deals"
        actions={
          <LinkButton href="/deals/new" variant="primary">
            + New deal
          </LinkButton>
        }
      />

      <DealFilters
        statusCounts={Object.fromEntries(statusCounts.map((s) => [s.status, s._count]))}
        current={{ status: statusFilter, statuses: selectedStatuses, q: sp.q ?? "" }}
      />

      <Card className="mt-4 overflow-hidden">
        {deals.length === 0 ? (
          <div className="p-4">
            <EmptyState>No deals match.</EmptyState>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <SortHeader label="Address" field="address" />
                <SortHeader label="Status" field="status" />
                <SortHeader label="Their price" field="theirPrice" align="right" />
                <SortHeader label="Our price" field="ourPrice" align="right" />
                <Th>Latest note</Th>
                <SortHeader label="Next action" field="nextAction" />
                <SortHeader label="Updated" field="updated" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deals.map((d) => (
                <DealRowEditable
                  key={d.id}
                  deal={{
                    id: d.id,
                    address: d.address,
                    status: d.status,
                    theirPrice: d.theirPrice ? Number(d.theirPrice) : null,
                    theirPriceRaw: d.theirPriceRaw,
                    ourPrice: d.ourPrice ? Number(d.ourPrice) : null,
                    ourPriceRaw: d.ourPriceRaw,
                    nextAction: d.nextAction,
                    sourceUrl: d.sourceUrl,
                    updatedAt: d.updatedAt.toISOString(),
                    latestNotes: d.notes.map((n) => ({
                      body: n.body,
                      date: (n.noteDate ?? n.createdAt).toISOString(),
                    })),
                  }}
                />
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {truncated && (
        <p className="mt-2 text-xs text-muted">Showing first 300. Use the address filter to narrow.</p>
      )}
    </>
  );
}

export const dynamic = "force-dynamic";
