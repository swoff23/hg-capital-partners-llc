import { Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ScopeButton } from "@/components/filter-bar";
import { SortHeader } from "@/components/sort-header";
import { LinkButton, PageHeader, Table, Th, EmptyState, chromeIconClass } from "@/components/ui";
import { DEAL_FIELD_LABEL } from "@/lib/config";
import { todayYmdEastern } from "@/lib/dates";
import { parseNoteAuthor } from "@/lib/deals/note-author";
import { DealFilters } from "./filters";
import { DealListRow } from "./deal-row";
import { ColumnWidthsProvider, Cols, ResizeHandle } from "./column-widths";
import { COLUMN_DROP } from "./columns";
import { DEFAULT_DEAL_SORT, easternDay, noteDay } from "./format";
import { dealSearchWhere, dealsWhere, emptyDeals, isFiltered, parseDealFilters, viewCounts } from "./query";
import { firstByStage } from "./stage-order";

const CAP = 300;

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

/** DB-level order for the fetch. Stage is ranked in stage-order.ts instead (shownDeals). */
function dbOrderBy(field: string, desc: boolean): Prisma.DealOrderByWithRelationInput[] {
  const build = SORT_COLUMNS[field] ?? SORT_COLUMNS.updated;
  const primary = build(desc);
  return field === "updated" ? [primary] : [primary, { updatedAt: "desc" }];
}

/** What a row shows. */
const LIST_COLUMNS = {
  id: true,
  address: true,
  status: true,
  units: true,
  theirPrice: true,
  theirPriceRaw: true,
  ourPrice: true,
  ourPriceRaw: true,
  nextAction: true,
  sourceUrl: true,
  updatedAt: true,
} satisfies Prisma.DealSelect;

type LatestNote = { dealId: string; body: string; noteDate: Date | null; source: string };

/**
 * Each shown deal's most recent note, typed here or imported from the spreadsheet, shown as a
 * column so it's visible without opening each deal. Auto-logged "change" entries are excluded,
 * and undated imported lines sort after every dated one. One row per deal (DISTINCT ON), for
 * the shown deals only, so a long list doesn't load every note.
 */
async function latestNotes(dealIds: string[]): Promise<Map<string, LatestNote>> {
  if (dealIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<LatestNote[]>`
    SELECT DISTINCT ON ("dealId") "dealId", "body", "noteDate", "source"
    FROM "DealNote"
    WHERE "dealId" IN (${Prisma.join(dealIds)}) AND "source" <> 'change' AND "deletedAt" IS NULL
    ORDER BY "dealId", "noteDate" DESC NULLS LAST, "createdAt" DESC, "id" DESC`;
  return new Map(rows.map((r) => [r.dealId, r]));
}

/** The note without the author pasted into it, "(CS)" or "  ·  Connor", and its day. */
function latestNote(note: LatestNote | undefined, today: string): { text: string; day: string | null } | null {
  if (!note) return null;
  // An undated imported line has no day of its own; its createdAt is the import run.
  return { text: parseNoteAuthor(note.body).text, day: note.noteDate ? noteDay({ noteDate: note.noteDate, source: note.source }, today) : null };
}

/**
 * The rows the list shows, at most CAP, with their latest notes. Every sort but Stage is a DB
 * order that takes the cap directly. Stage has no DB order, so every match's id, stage and update
 * time are read and ranked first (stage-order.ts), and only the CAP shown are read in full: the
 * cap never cuts a stage group before the sort runs, and the rest are never loaded.
 */
async function shownDeals(where: Prisma.DealWhereInput, sortField: string, desc: boolean) {
  if (sortField !== "status") {
    const deals = await prisma.deal.findMany({ where, orderBy: dbOrderBy(sortField, desc), take: CAP, select: LIST_COLUMNS });
    return { deals, notes: await latestNotes(deals.map((d) => d.id)) };
  }
  const keys = await prisma.deal.findMany({ where, select: { id: true, status: true, updatedAt: true } });
  const ids = firstByStage(keys, desc, CAP);
  const [rows, notes] = await Promise.all([
    prisma.deal.findMany({ where: { id: { in: ids } }, select: LIST_COLUMNS }),
    latestNotes(ids),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  // A deal deleted between the two reads drops out.
  return { deals: ids.flatMap((id) => byId.get(id) ?? []), notes };
}

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  const f = parseDealFilters(await searchParams);
  const where = dealsWhere(f);

  const sortDesc = f.sort.startsWith("-");
  const sortField = (sortDesc ? f.sort.slice(1) : f.sort) || DEFAULT_DEAL_SORT;

  // The session check runs beside the reads and is awaited with them, so nothing is shown without it.
  const [, { deals, notes }, shown, byStageSearched, byStageAll] = await Promise.all([
    requireUser(),
    shownDeals(where, sortField, sortDesc),
    prisma.deal.count({ where }),
    // Each view and stage counts the search's hits, so a hit outside the current view shows (DEALS-012).
    prisma.deal.groupBy({ by: ["status"], where: dealSearchWhere(f.q), _count: true }),
    // What "hidden by filters" is measured against: the whole view, whatever is typed.
    f.q ? prisma.deal.groupBy({ by: ["status"], _count: true }) : Promise.resolve(null),
  ]);
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
                        latestNote: latestNote(notes.get(d.id), today),
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
