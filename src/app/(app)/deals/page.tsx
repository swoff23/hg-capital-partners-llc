import type { Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ScopeButton } from "@/components/filter-bar";
import { SortHeader } from "@/components/sort-header";
import { LinkButton, PageHeader, Table, Th, EmptyState, chromeIconClass } from "@/components/ui";
import { DEAL_FIELD_LABEL, DEAL_STATUSES } from "@/lib/config";
import { todayYmdEastern } from "@/lib/dates";
import { parseNoteAuthor } from "@/lib/deals/note-author";
import { DealFilters } from "./filters";
import { DealListRow } from "./deal-row";
import { ColumnWidthsProvider, Cols, ResizeHandle } from "./column-widths";
import { COLUMN_DROP } from "./columns";
import { DEFAULT_DEAL_SORT, easternDay, noteDay } from "./format";
import { dealSearchWhere, dealsWhere, emptyDeals, isFiltered, parseDealFilters, viewCounts } from "./query";

const CAP = 300;

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
  const f = parseDealFilters(await searchParams);
  const where = dealsWhere(f);

  const sortDesc = f.sort.startsWith("-");
  const sortField = (sortDesc ? f.sort.slice(1) : f.sort) || DEFAULT_DEAL_SORT;

  // Sorting by stage happens in memory (see sortByStatus), so that fetch can't be `take`-limited
  // up front: limiting by DB order first would silently drop whole stage groups before the
  // real sort ever runs. Every other sort is a plain DB order, so it can take the cap directly.
  const [dealsRaw, shown, byStageSearched, byStageAll] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: dbOrderBy(sortField, sortDesc),
      ...(sortField === "status" ? {} : { take: CAP }),
      include: {
        // The most recent note, typed here or imported from the spreadsheet, shown as a column so
        // it's visible without opening each deal. Auto-logged "change" entries are excluded.
        // Undated imported lines sort after every dated one.
        notes: {
          where: { source: { not: "change" }, deletedAt: null },
          orderBy: [{ noteDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
          take: 1,
        },
      },
    }),
    prisma.deal.count({ where }),
    // Each view and stage counts the search's hits, so a hit outside the current view shows (DEALS-012).
    prisma.deal.groupBy({ by: ["status"], where: dealSearchWhere(f.q), _count: true }),
    // What "hidden by filters" is measured against: the whole view, whatever is typed.
    f.q ? prisma.deal.groupBy({ by: ["status"], _count: true }) : Promise.resolve(null),
  ]);
  const sorted = sortField === "status" ? sortByStatus(dealsRaw, sortDesc) : dealsRaw;
  const deals = sorted.slice(0, CAP);
  const truncated = shown > CAP;
  const today = todayYmdEastern();

  const stageCounts = Object.fromEntries(byStageSearched.map((s) => [s.status, s._count]));
  const counts = viewCounts(stageCounts);
  const scope = byStageAll ? viewCounts(Object.fromEntries(byStageAll.map((s) => [s.status, s._count]))) : counts;
  const empty = emptyDeals(f, counts);

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
        data={{
          view: f.view,
          counts,
          stageCounts,
          shown,
          hidden: Math.max(0, scope[f.view] - shown),
          filtered: isFiltered(f),
        }}
      >
        {/* Flat on the page: the header's rule and the row hairlines are its only lines (section 5).
            A size container, so columns drop by the list's own width (COLUMN_DROP in columns.ts). */}
        <div className="mt-4 @container">
          {deals.length === 0 ? (
            <EmptyState
              action={
                empty.action?.kind === "show-all" ? (
                  <ScopeButton changes={{ status: "all", statuses: null }}>Show {empty.action.count} in All</ScopeButton>
                ) : empty.action?.kind === "clear-search" ? (
                  <ScopeButton changes={{ q: null }}>Clear search</ScopeButton>
                ) : empty.action?.kind === "clear-filters" ? (
                  <ScopeButton clear>Clear filters</ScopeButton>
                ) : undefined
              }
            >
              {empty.line}
            </EmptyState>
          ) : (
            <ColumnWidthsProvider>
              <Table style={{ tableLayout: "fixed" }}>
                <Cols />
                <thead>
                  <tr>
                    {/* Column one starts on the page gutter, under the title (section 5). */}
                    <SortHeader
                      label={DEAL_FIELD_LABEL.address}
                      field="address"
                      defaultSort={DEFAULT_DEAL_SORT}
                      className="pl-0"
                      trailing={<ResizeHandle columnKey="address" />}
                    />
                    <SortHeader
                      label={DEAL_FIELD_LABEL.status}
                      field="status"
                      defaultSort={DEFAULT_DEAL_SORT}
                      className={COLUMN_DROP.status}
                      trailing={<ResizeHandle columnKey="status" />}
                    />
                    <SortHeader
                      label={DEAL_FIELD_LABEL.units}
                      field="units"
                      defaultSort={DEFAULT_DEAL_SORT}
                      first="desc"
                      numeric
                      className={COLUMN_DROP.units}
                      trailing={<ResizeHandle columnKey="units" />}
                    />
                    <SortHeader
                      label={DEAL_FIELD_LABEL.theirPrice}
                      field="theirPrice"
                      defaultSort={DEFAULT_DEAL_SORT}
                      first="desc"
                      numeric
                      className={COLUMN_DROP.theirPrice}
                      trailing={<ResizeHandle columnKey="theirPrice" />}
                    />
                    <SortHeader
                      label={DEAL_FIELD_LABEL.ourPrice}
                      field="ourPrice"
                      defaultSort={DEFAULT_DEAL_SORT}
                      first="desc"
                      numeric
                      className={COLUMN_DROP.ourPrice}
                      trailing={<ResizeHandle columnKey="ourPrice" />}
                    />
                    <Th className={COLUMN_DROP.latestNote}>
                      {DEAL_FIELD_LABEL.latestNote}
                      <ResizeHandle columnKey="latestNote" />
                    </Th>
                    <SortHeader
                      label={DEAL_FIELD_LABEL.nextAction}
                      field="nextAction"
                      defaultSort={DEFAULT_DEAL_SORT}
                      className={COLUMN_DROP.nextAction}
                      trailing={<ResizeHandle columnKey="nextAction" />}
                    />
                    <SortHeader
                      label={DEAL_FIELD_LABEL.updatedAt}
                      field="updated"
                      defaultSort={DEFAULT_DEAL_SORT}
                      first="desc"
                      className={`pr-0 ${COLUMN_DROP.updated}`}
                      trailing={<ResizeHandle columnKey="updated" />}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {deals.map((d) => (
                    <DealListRow
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
                        // The note without the author pasted into it, "(CS)" or "  ·  Connor". An undated
                        // imported line has no day of its own; its createdAt is the import run.
                        latestNote: d.notes[0]
                          ? {
                              text: parseNoteAuthor(d.notes[0].body).text,
                              day: d.notes[0].noteDate ? noteDay({ noteDate: d.notes[0].noteDate, source: d.notes[0].source }, today) : null,
                            }
                          : null,
                      }}
                    />
                  ))}
                </tbody>
              </Table>
            </ColumnWidthsProvider>
          )}
        </div>
        {truncated && (
          // One line at every width: the phone's words are shorter.
          <p className="mt-2 truncate text-meta text-fg-3">
            <span className="sm:hidden">First {CAP} of {shown}. Search for more.</span>
            <span className="max-sm:hidden">Showing first {CAP} of {shown}. Search or filter to see the rest.</span>
          </p>
        )}
      </DealFilters>
    </>
  );
}

export const dynamic = "force-dynamic";
