import type { TaskStatus } from "@prisma/client";
import type { Ymd } from "@/lib/dates";

/**
 * What /api/search answers, as the browser reads it (docs/specs/search.md
 * 2.10): records in groups with the total of every match, each row carrying
 * the context to choose by. The palette and lib/search-panel.ts import this
 * file, not search-results.ts, which holds the queries and drags Prisma and
 * the task rules with it. search-results.ts re-exports all of it, so server
 * code and the tests keep importing from there.
 */

export const SEARCH_TYPES = ["property", "task", "deal", "contractor"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** Rows per group when searching everything, and when narrowed to one type. */
export const ALL_LIMIT = 4;
export const TYPE_LIMIT = 20;
/** Fewest characters the server searches on. */
export const MIN_QUERY = 2;
/**
 * Most characters the server reads: longer than any title worth typing (300
 * is the task title's cap, and only the first six words count anyway), and
 * short enough that a pasted page of text stays one cheap query.
 */
export const MAX_QUERY = 200;
/** Records Recent shows. */
export const RECENT_SHOWN = 5;

export type PropertySearchRow = {
  type: "property";
  id: string;
  href: string;
  /** The short address, the name Portfolio uses. */
  title: string;
  units: number | null;
  owner: string | null;
  /** The property's front photo (public Blob); null until one is set, so the row shows the House tile. */
  photoUrl: string | null;
};

export type TaskSearchRow = {
  type: "task";
  id: string;
  href: string;
  title: string;
  status: TaskStatus;
  due: Ymd | null;
  overdue: boolean;
  /** Short address of the property, or of the deal when there's no property. */
  place: string | null;
  assignee: { name: string; contractor: boolean } | null;
};

export type DealSearchRow = {
  type: "deal";
  id: string;
  href: string;
  title: string;
  /** The stage as stored; the client prints it through dealStageLabel. */
  stage: string;
  /** The asking price as a plain number string, or null. */
  asking: string | null;
};

export type ContractorSearchRow = {
  type: "contractor";
  id: string;
  href: string;
  title: string;
  trade: string | null;
  company: string | null;
  active: boolean;
};

export type SearchRow = PropertySearchRow | TaskSearchRow | DealSearchRow | ContractorSearchRow;

export type SearchGroup = {
  type: SearchType;
  /** Every match, for "See all 40 tasks". */
  total: number;
  rows: SearchRow[];
};

export type SearchResponse = { groups: SearchGroup[] };
export type RecentResponse = { rows: SearchRow[] };
