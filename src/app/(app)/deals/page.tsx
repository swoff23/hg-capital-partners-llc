import type { Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LinkButton, PageHeader, Table, Th, EmptyState, chromeIconClass } from "@/components/ui";
import { ACTIVE_DEAL_STATUSES, DEAL_STATUSES, dealStatusLabel } from "@/lib/config";
import { todayYmdEastern } from "@/lib/dates";
import { DealFilters } from "./filters";
import { DealRowEditable } from "./deal-row";
import { SortHeader } from "./sort-header";
import { ColumnWidthsProvider, Cols, ResizeHandle } from "./column-widths";
import { COLUMN_DROP } from "./columns";
import { easternDay, noteDay } from "./format";

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
  units: (desc) => ({ units: { sort: desc ? "desc" : "asc", nulls: "last" } }),
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
          ? { status: { in: ACTIVE_DEAL_STATUSES } }
          : { status: statusFilter }),
    ...(sp.q ? { address: { contains: sp.q, mode: "insensitive" as const } } : {}),
  };

  // The empty list's one line names what narrowed it ("No deals at "zzz" in Active."), and its
  // action clears the search and the statuses.
  const VIEW_LABEL: Record<string, string> = { all: "", active: "Active", "5 - TBD": "TBD" };
  const scope =
    selectedStatuses.length > 1
      ? `${selectedStatuses.length} statuses`
      : selectedStatuses.length === 1
        ? dealStatusLabel(selectedStatuses[0])
        : (VIEW_LABEL[statusFilter] ?? dealStatusLabel(statusFilter));
  const narrowed = Boolean(sp.q) || scope !== "";
  const emptyLine = !narrowed
    ? "No deals yet. New ones show up here."
    : `No deals ${sp.q ? `at “${sp.q}” ` : ""}${scope ? `in ${scope}` : ""}`.trim() + ".";

  const sortRaw = sp.sort || "status";
  const sortDesc = sortRaw.startsWith("-");
  const sortField = (sortDesc ? sortRaw.slice(1) : sortRaw) || "status";

  // Sorting by status happens in memory (see sortByStatus), so that fetch can't be `take`-limited
  // up front: limiting by DB order first would silently drop whole status groups before the
  // real sort ever runs. Every other sort is a plain DB order, so it can take the cap directly.
  const [dealsRaw, filteredCount, statusCounts] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: dbOrderBy(sortField, sortDesc),
      ...(sortField === "status" ? {} : { take: 300 }),
      include: {
        // Most recent notes, typed here or imported from the spreadsheet, shown as a column so
        // they're visible without opening each deal. Auto-logged "change" entries are excluded.
        // Undated imported lines sort after every dated one.
        notes: {
          where: { source: { not: "change" } },
          orderBy: [{ noteDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
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
  const today = todayYmdEastern();

  return (
    <>
      <PageHeader
        title="Deals"
        actions={
          <LinkButton href="/deals/new" variant="primary">
            <Plus aria-hidden="true" className={chromeIconClass} />
            New deal
          </LinkButton>
        }
      />

      <DealFilters
        statusCounts={Object.fromEntries(statusCounts.map((s) => [s.status, s._count]))}
        current={{ status: statusFilter, statuses: selectedStatuses, q: sp.q ?? "" }}
      />

      {/* Flat on the page: the header's rule and the row hairlines are its only lines (section 5).
          A size container, so columns drop by the list's own width (COLUMN_DROP in columns.ts). */}
      <div className="mt-4 @container">
        {deals.length === 0 ? (
          <EmptyState
            action={
              narrowed && (
                <LinkButton href="/deals?status=all" variant="secondary" size="sm">
                  Show all deals
                </LinkButton>
              )
            }
          >
            {emptyLine}
          </EmptyState>
        ) : (
          <ColumnWidthsProvider>
            <Table style={{ tableLayout: "fixed" }}>
              <Cols />
              <thead>
                <tr>
                  {/* Column one starts on the page gutter, under the title (section 5). */}
                  <SortHeader label="Address" field="address" resizeKey="address" className="pl-0" />
                  <SortHeader label="Status" field="status" resizeKey="status" className={COLUMN_DROP.status} />
                  <SortHeader label="Units" field="units" resizeKey="units" numeric className={COLUMN_DROP.units} />
                  <SortHeader
                    label="Their price"
                    field="theirPrice"
                    resizeKey="theirPrice"
                    numeric
                    className={COLUMN_DROP.theirPrice}
                  />
                  <SortHeader
                    label="Our price"
                    field="ourPrice"
                    resizeKey="ourPrice"
                    numeric
                    className={COLUMN_DROP.ourPrice}
                  />
                  <Th className={COLUMN_DROP.latestNote}>
                    Latest note
                    <ResizeHandle columnKey="latestNote" />
                  </Th>
                  <SortHeader
                    label="Next action"
                    field="nextAction"
                    resizeKey="nextAction"
                    className={COLUMN_DROP.nextAction}
                  />
                  <SortHeader
                    label="Updated"
                    field="updated"
                    resizeKey="updated"
                    className={`pr-0 ${COLUMN_DROP.updated}`}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {deals.map((d) => (
                  <DealRowEditable
                    key={d.id}
                    deal={{
                      id: d.id,
                      address: d.address,
                      status: d.status,
                      units: d.units,
                      theirPrice: d.theirPrice ? Number(d.theirPrice) : null,
                      theirPriceRaw: d.theirPriceRaw,
                      ourPrice: d.ourPrice ? Number(d.ourPrice) : null,
                      ourPriceRaw: d.ourPriceRaw,
                      nextAction: d.nextAction,
                      sourceUrl: d.sourceUrl,
                      updated: easternDay(d.updatedAt, today),
                      // An undated imported line has no day of its own; its createdAt is the import run.
                      latestNotes: d.notes.map((n) => ({
                        body: n.body,
                        day: n.noteDate ? noteDay({ noteDate: n.noteDate, source: n.source }, today) : null,
                      })),
                    }}
                  />
                ))}
              </tbody>
            </Table>
          </ColumnWidthsProvider>
        )}
      </div>
      {truncated && (
        <p className="mt-2 text-meta text-fg-3">Showing first 300. Use the address filter to narrow.</p>
      )}
    </>
  );
}

export const dynamic = "force-dynamic";
