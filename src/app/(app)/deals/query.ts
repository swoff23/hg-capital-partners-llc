import type { Prisma } from "@prisma/client";
import { ACTIVE_DEAL_STATUSES, DEAL_STATUSES, dealStageLabel, isDealStatus } from "@/lib/config";
import { parseFacet } from "@/lib/list-memory";
import { everyTermMatches, searchTerms } from "@/lib/search";
import { DEFAULT_DEAL_SORT } from "./format";

/*
 * What the Deals page asks of the database (docs/specs/selectors.md 4.3 A):
 * six views that pick the part of the pipeline, a Stage chip that narrows
 * inside Active and All, and a search over the address. Pure, so
 * query.test.ts checks it without a database.
 *
 * The URL: `status` is the view (Active is the default and stays out of it),
 * `statuses` the Stage chip's picks (comma-joined; it keeps the name old links
 * and bookmarks carry), `q` the search, `sort` a column with a leading "-" for
 * descending.
 */

/** The views, Active first. A stage view is the stage as stored. */
export const DEAL_VIEWS = [
  { key: "active", label: "Active" },
  { key: "5 - TBD", label: dealStageLabel("5 - TBD") },
  { key: "6 - Holding", label: dealStageLabel("6 - Holding") },
  { key: "CLOSED!", label: dealStageLabel("CLOSED!") },
  { key: "Pass", label: dealStageLabel("Pass") },
  { key: "all", label: "All" },
] as const;

export type DealView = (typeof DEAL_VIEWS)[number]["key"];

export const DEFAULT_DEAL_VIEW: DealView = "active";

const isView = (v: string): v is DealView => DEAL_VIEWS.some((x) => x.key === v);

/** The stages a view holds: Active's four, a stage view's one, or every stage for All. */
export function viewStages(view: DealView): readonly string[] {
  return view === "active" ? ACTIVE_DEAL_STATUSES : view === "all" ? DEAL_STATUSES : [view];
}

/** The Stage chip narrows inside Active and All; the other views hold a single stage. */
export const hasStageChip = (view: DealView) => view === "active" || view === "all";

export interface DealFilters {
  view: DealView;
  /** Picks of the Stage chip, all inside the view. */
  stages: string[];
  q: string;
  /** "status" or a column, "-" for descending. */
  sort: string;
}

type Params = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * The filters in the URL. Active is the default view, so the bar leaves `status`
 * out of the URL and `?statuses=1 - High` alone is an Active list narrowed by
 * the chip. A link from before the views meant "these stages, wherever they
 * are", so a pick outside Active's stages with no `status` reads as All.
 * Picks outside the view fall away.
 */
export function parseDealFilters(sp: Params): DealFilters {
  const picks = parseFacet(str(sp.statuses));
  const asked = str(sp.status);
  const active: readonly string[] = ACTIVE_DEAL_STATUSES;
  const outsideActive = picks.some((s) => !active.includes(s));
  const view: DealView = isView(asked) ? asked : outsideActive ? "all" : DEFAULT_DEAL_VIEW;
  const inView = viewStages(view);
  return {
    view,
    stages: hasStageChip(view) ? picks.filter((s) => isDealStatus(s) && inView.includes(s)) : [],
    q: str(sp.q).trim(),
    sort: str(sp.sort) || DEFAULT_DEAL_SORT,
  };
}

/** Every word must match the address, in any order: "Prospect Avenue" finds "Prospect Ave". */
export function dealSearchWhere(q: string): Prisma.DealWhereInput {
  const terms = searchTerms(q);
  return terms.length === 0 ? {} : everyTermMatches<Prisma.DealWhereInput>(terms, (t) => [{ address: t }]);
}

/** The deals the view, the Stage chip and the search leave. */
export function dealsWhere(f: DealFilters): Prisma.DealWhereInput {
  const parts: Prisma.DealWhereInput[] = [
    f.view === "all" ? {} : { status: { in: [...viewStages(f.view)] } },
    f.stages.length > 0 ? { status: { in: f.stages } } : {},
    dealSearchWhere(f.q),
  ];
  return { AND: parts.filter((p) => Object.keys(p).length > 0) };
}

/** Deals per view, from the deals per stage: each view's count is the sum of its stages. */
export function viewCounts(byStage: Readonly<Record<string, number>>): Record<DealView, number> {
  const sum = (stages: readonly string[]) => stages.reduce((n, s) => n + (byStage[s] ?? 0), 0);
  return {
    active: sum(ACTIVE_DEAL_STATUSES),
    "5 - TBD": sum(["5 - TBD"]),
    "6 - Holding": sum(["6 - Holding"]),
    "CLOSED!": sum(["CLOSED!"]),
    Pass: sum(["Pass"]),
    // All counts a stage the list doesn't know (the legacy "Active") too.
    all: Object.values(byStage).reduce((a, b) => a + b, 0),
  };
}

export const viewLabel = (view: DealView) => DEAL_VIEWS.find((v) => v.key === view)!.label;

/** Whether the list is anything but its opening state: a view, a stage, a search or a sort of its own. */
export function isFiltered(f: DealFilters): boolean {
  return f.view !== DEFAULT_DEAL_VIEW || f.stages.length > 0 || f.q !== "" || f.sort !== DEFAULT_DEAL_SORT;
}

/* ---------------- The empty list ---------------- */

export type EmptyDeals = {
  line: string;
  /** Show the hits in All, clear the search, clear the filters, or nothing to offer. */
  action: { kind: "show-all"; count: number } | { kind: "clear-search" } | { kind: "clear-filters" } | null;
};

/**
 * The one sentence an empty list says, and the way out (search 2.11):
 * a search that hit in another view offers those ("Show 18 in All"); one
 * that hit nowhere offers Clear search; the Stage chip alone offers Clear
 * filters. `counts` are per view with the search applied.
 */
export function emptyDeals(f: DealFilters, counts: Record<DealView, number>): EmptyDeals {
  // The chip is what hides the hits: say so, and Clear filters takes it off with the search kept.
  if (f.q && f.stages.length > 0 && counts[f.view] > 0) {
    return { line: "No deals match these filters.", action: { kind: "clear-filters" } };
  }
  if (f.q) {
    const quoted = `“${f.q}”`;
    if (f.view !== "all" && counts.all > 0) {
      return { line: `No ${viewLabel(f.view)} deals match ${quoted}.`, action: { kind: "show-all", count: counts.all } };
    }
    return { line: `No deals match ${quoted}.`, action: { kind: "clear-search" } };
  }
  if (f.stages.length > 0) return { line: "No deals match these filters.", action: { kind: "clear-filters" } };
  if (f.view === "all") return { line: "No deals yet. New ones show up here.", action: null };
  return { line: `No deals in ${viewLabel(f.view)}.`, action: null };
}
