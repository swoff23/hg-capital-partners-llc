import type { Prisma, PrismaClient, RecentKind, TaskStatus } from "@prisma/client";
import { ACTIVE_DEAL_STATUSES } from "@/lib/config";
import { cleanTrades } from "@/lib/contacts";
import { toYmd, todayYmdEastern, type Ymd } from "@/lib/dates";
import { shortAddress } from "@/lib/normalize";
import { propertyUnitCount } from "@/lib/property-types";
import { everyTermMatches, rankRows, searchTerms, type Rankable } from "@/lib/search";
import { activeTask, closedTask, excludeTemplateTasks, isActiveStatus } from "@/lib/task-scope";
import { isOverdue } from "@/lib/tasks/list";
import { paletteTaskWhere } from "@/lib/tasks/list-query";

/**
 * What /api/search answers (docs/specs/search.md 2.10): records in groups with
 * the total of every match, each row carrying the context to choose by.
 * `answerSearch` and `answerRecent` take the database and the signed-in person
 * as arguments, so route.test.ts runs them with neither a server nor Prisma;
 * the route files in src/app/api/search wire in the real ones.
 *
 * Client code imports only the types from here.
 */

export const SEARCH_TYPES = ["property", "task", "deal", "contractor"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** Rows per group when searching everything, and when narrowed to one type. */
export const ALL_LIMIT = 4;
export const TYPE_LIMIT = 20;
/** Fewest characters the server searches on. */
export const MIN_QUERY = 2;
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

/** The database calls a search makes. */
export type SearchDb = Pick<PrismaClient, "property" | "task" | "deal" | "contact">;

/* ---------------- Rows ---------------- */

const PROPERTY_SELECT = {
  id: true,
  address: true,
  llcOwner: true,
  unitCount: true,
  units: true,
  photoUrl: true,
  updatedAt: true,
} satisfies Prisma.PropertySelect;

const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  dueDate: true,
  assigneeName: true,
  updatedAt: true,
  property: { select: { address: true } },
  deal: { select: { address: true } },
  assignee: { select: { name: true, email: true } },
  assigneeContact: { select: { fullName: true } },
} satisfies Prisma.TaskSelect;

const DEAL_SELECT = {
  id: true,
  address: true,
  status: true,
  theirPrice: true,
  convertedPropertyId: true,
  updatedAt: true,
} satisfies Prisma.DealSelect;

const CONTACT_SELECT = {
  id: true,
  fullName: true,
  company: true,
  trades: true,
  active: true,
  updatedAt: true,
} satisfies Prisma.ContactSelect;

type PropertyRecord = Prisma.PropertyGetPayload<{ select: typeof PROPERTY_SELECT }>;
type TaskRecord = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;
type DealRecord = Prisma.DealGetPayload<{ select: typeof DEAL_SELECT }>;
type ContactRecord = Prisma.ContactGetPayload<{ select: typeof CONTACT_SELECT }>;

export function propertyRow(p: PropertyRecord): PropertySearchRow {
  return {
    type: "property",
    id: p.id,
    href: `/properties/${p.id}`,
    title: shortAddress(p.address) || p.address,
    units: propertyUnitCount(p),
    owner: p.llcOwner?.trim() || null,
    photoUrl: p.photoUrl,
  };
}

export function taskRow(t: TaskRecord, today: Ymd): TaskSearchRow {
  const due = toYmd(t.dueDate);
  const assigneeName = t.assignee ? (t.assignee.name ?? t.assignee.email) : (t.assigneeContact?.fullName ?? t.assigneeName);
  return {
    type: "task",
    id: t.id,
    href: `/tasks/${t.id}`,
    title: t.title,
    status: t.status,
    due,
    overdue: isOverdue({ status: t.status, due }, today),
    place: shortAddress(t.property?.address ?? t.deal?.address) || null,
    assignee: assigneeName ? { name: assigneeName, contractor: t.assignee === null && t.assigneeContact !== null } : null,
  };
}

export function dealRow(d: DealRecord): DealSearchRow {
  const asking = d.theirPrice === null ? null : String(d.theirPrice);
  return {
    type: "deal",
    id: d.id,
    href: `/deals/${d.id}`,
    title: shortAddress(d.address) || d.address,
    stage: d.status,
    asking,
  };
}

export function contractorRow(c: ContactRecord): ContractorSearchRow {
  return {
    type: "contractor",
    id: c.id,
    href: `/contractors/${c.id}`,
    title: c.fullName,
    trade: cleanTrades(c.trades),
    company: c.company?.trim() || null,
    active: c.active,
  };
}

/* ---------------- Ranking inputs ---------------- */

/** Live work first: an open task, then a Done one, then a Canceled one. */
export const taskLive = (status: TaskStatus): number => (isActiveStatus(status) ? 0 : status === "DONE" ? 1 : 2);

/** A deal still being worked (High to To schedule) before the rest. */
export const dealLive = (stage: string): number => ((ACTIVE_DEAL_STATUSES as readonly string[]).includes(stage) ? 0 : 1);

const ranked = <T extends Rankable & { row: SearchRow }>(candidates: T[], q: string, limit: number): SearchRow[] =>
  rankRows(candidates, q)
    .slice(0, limit)
    .map((c) => c.row);

/* ---------------- Groups ---------------- */

/** Candidates ranked per type. A pool wider than the limit gives the ranking something to choose from. */
const POOL = 40;
const TASK_ACTIVE_POOL = 30;
const TASK_CLOSED_POOL = 10;

const newest = { updatedAt: "desc" } as const;

/** The stage a deal is in once it has become a property. */
const CLOSED_STAGE = "CLOSED!";

type Found = { rows: SearchRow[]; total: number };

async function findProperties(db: SearchDb, q: string, terms: string[][], limit: number): Promise<Found> {
  const where = everyTermMatches<Prisma.PropertyWhereInput>(terms, (t) => [{ address: t }]);
  const [pool, total] = await Promise.all([
    db.property.findMany({ where, orderBy: newest, take: POOL, select: PROPERTY_SELECT }),
    db.property.count({ where }),
  ]);
  const rows = ranked(
    pool.map((p) => {
      const row = propertyRow(p);
      return { row, title: row.title, live: 0, updatedAt: p.updatedAt };
    }),
    q,
    limit,
  );
  return { rows, total };
}

async function findTasks(db: SearchDb, q: string, limit: number): Promise<Found> {
  // Template rows are playbooks, not work: paletteTaskWhere leaves them out of the pool and the count alike.
  const where = paletteTaskWhere(q);
  const [active, closed, total] = await Promise.all([
    db.task.findMany({ where: { AND: [where, activeTask] }, orderBy: newest, take: TASK_ACTIVE_POOL, select: TASK_SELECT }),
    db.task.findMany({ where: { AND: [where, closedTask] }, orderBy: newest, take: TASK_CLOSED_POOL, select: TASK_SELECT }),
    db.task.count({ where }),
  ]);
  const today = todayYmdEastern();
  const rows = ranked(
    [...active, ...closed].map((t) => ({ row: taskRow(t, today), title: t.title, live: taskLive(t.status), updatedAt: t.updatedAt })),
    q,
    limit,
  );
  return { rows, total };
}

async function findDeals(db: SearchDb, q: string, terms: string[][], limit: number, foldInto: ReadonlySet<string>): Promise<Found> {
  const where = everyTermMatches<Prisma.DealWhereInput>(terms, (t) => [{ address: t }]);
  // Searching everything, a CLOSED! deal already converted into a property in the Properties group folds
  // into it: one row per building. It stays in the Deals scope, and this group counts without it.
  const folds: Prisma.DealWhereInput = { status: CLOSED_STAGE, convertedPropertyId: { in: [...foldInto] } };
  const [pool, total, folded] = await Promise.all([
    db.deal.findMany({ where, orderBy: newest, take: POOL, select: DEAL_SELECT }),
    db.deal.count({ where }),
    foldInto.size > 0 ? db.deal.count({ where: { AND: [where, folds] } }) : 0,
  ]);
  const shown = pool.filter((d) => !(d.status === CLOSED_STAGE && d.convertedPropertyId && foldInto.has(d.convertedPropertyId)));
  const rows = ranked(
    shown.map((d) => {
      const row = dealRow(d);
      return { row, title: row.title, live: dealLive(d.status), updatedAt: d.updatedAt };
    }),
    q,
    limit,
  );
  return { rows, total: total - folded };
}

async function findContractors(db: SearchDb, q: string, terms: string[][], limit: number): Promise<Found> {
  const where = everyTermMatches<Prisma.ContactWhereInput>(terms, (t) => [{ fullName: t }, { company: t }, { trades: t }]);
  const [pool, total] = await Promise.all([
    db.contact.findMany({ where, orderBy: newest, take: POOL, select: CONTACT_SELECT }),
    db.contact.count({ where }),
  ]);
  // Inactive contractors stay findable, ranked last.
  const rows = ranked(
    pool.map((c) => ({ row: contractorRow(c), title: c.fullName, live: c.active ? 0 : 1, updatedAt: c.updatedAt })),
    q,
    limit,
  );
  return { rows, total };
}

/** How many of each type match, with no rows: for "See 3 deals" when the type asked for has none. */
async function countsOf(db: SearchDb, q: string, terms: string[][], types: readonly SearchType[]): Promise<Map<SearchType, number>> {
  const counts = await Promise.all(
    types.map(async (type): Promise<[SearchType, number]> => {
      switch (type) {
        case "property":
          return [type, await db.property.count({ where: everyTermMatches<Prisma.PropertyWhereInput>(terms, (t) => [{ address: t }]) })];
        case "task":
          return [type, await db.task.count({ where: paletteTaskWhere(q) })];
        case "deal":
          return [type, await db.deal.count({ where: everyTermMatches<Prisma.DealWhereInput>(terms, (t) => [{ address: t }]) })];
        case "contractor":
          return [
            type,
            await db.contact.count({
              where: everyTermMatches<Prisma.ContactWhereInput>(terms, (t) => [{ fullName: t }, { company: t }, { trades: t }]),
            }),
          ];
      }
    }),
  );
  return new Map(counts);
}

export type SearchParams = { q: string; type?: SearchType; limit?: number };

/**
 * The groups for a typed query, in the fixed order Properties, Tasks, Deals,
 * Contractors. Searching everything, a group with no match is left out. Narrowed
 * to one type, that group comes with up to `limit` rows; and if it has none,
 * the other types that do match follow with their totals and no rows, so the
 * panel can point to them.
 */
export async function runSearch(db: SearchDb, params: SearchParams): Promise<SearchResponse> {
  const q = params.q.trim();
  const terms = searchTerms(q);
  if (q.length < MIN_QUERY || terms.length === 0) return { groups: [] };

  const only = params.type;
  const limit = clampLimit(params.limit, only ? TYPE_LIMIT : ALL_LIMIT);
  const wants = (type: SearchType) => only === undefined || only === type;

  // Properties first, since the Deals group folds into the ones it shows.
  const property = wants("property") ? await findProperties(db, q, terms, limit) : null;
  const foldInto = new Set(only === undefined ? (property?.rows.map((r) => r.id) ?? []) : []);
  const [task, deal, contractor] = await Promise.all([
    wants("task") ? findTasks(db, q, limit) : null,
    wants("deal") ? findDeals(db, q, terms, limit, foldInto) : null,
    wants("contractor") ? findContractors(db, q, terms, limit) : null,
  ]);

  const found: [SearchType, Found | null][] = [
    ["property", property],
    ["task", task],
    ["deal", deal],
    ["contractor", contractor],
  ];
  const groups: SearchGroup[] = found
    .filter((f): f is [SearchType, Found] => f[1] !== null && f[1].total > 0)
    .map(([type, f]) => ({ type, total: f.total, rows: f.rows }));

  if (only && groups.length === 0) {
    const others = await countsOf(db, q, terms, SEARCH_TYPES.filter((t) => t !== only));
    return {
      groups: SEARCH_TYPES.filter((t) => (others.get(t) ?? 0) > 0).map((type) => ({ type, total: others.get(type)!, rows: [] })),
    };
  }
  return { groups };
}

function clampLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(TYPE_LIMIT, Math.max(1, Math.floor(limit)));
}

/* ---------------- Recent ---------------- */

/**
 * The records a person opened last as search rows, in the order they opened
 * them. A record deleted since is skipped, and so is a Template task (a
 * playbook, not work). `entries` come newest first; the result is cut to `take`.
 */
export async function recentRows(
  db: SearchDb,
  entries: readonly { kind: RecentKind; recordId: string }[],
  take: number = RECENT_SHOWN,
): Promise<SearchRow[]> {
  const idsOf = (kind: RecentKind) => entries.filter((e) => e.kind === kind).map((e) => e.recordId);
  const [properties, tasks, deals, contacts] = await Promise.all([
    idsOf("PROPERTY").length
      ? db.property.findMany({ where: { id: { in: idsOf("PROPERTY") } }, select: PROPERTY_SELECT })
      : [],
    idsOf("TASK").length
      ? db.task.findMany({ where: { AND: [{ id: { in: idsOf("TASK") } }, excludeTemplateTasks] }, select: TASK_SELECT })
      : [],
    idsOf("DEAL").length ? db.deal.findMany({ where: { id: { in: idsOf("DEAL") } }, select: DEAL_SELECT }) : [],
    idsOf("CONTACT").length ? db.contact.findMany({ where: { id: { in: idsOf("CONTACT") } }, select: CONTACT_SELECT }) : [],
  ]);
  const today = todayYmdEastern();
  const byKey = new Map<string, SearchRow>();
  for (const p of properties) byKey.set(`PROPERTY:${p.id}`, propertyRow(p));
  for (const t of tasks) byKey.set(`TASK:${t.id}`, taskRow(t, today));
  for (const d of deals) byKey.set(`DEAL:${d.id}`, dealRow(d));
  for (const c of contacts) byKey.set(`CONTACT:${c.id}`, contractorRow(c));
  return entries
    .map((e) => byKey.get(`${e.kind}:${e.recordId}`))
    .filter((r): r is SearchRow => r !== undefined)
    .slice(0, take);
}

/* ---------------- Answers ---------------- */

export type Answer<T> = { status: 200; body: T } | { status: 400 | 401 | 500; body: { error: string } };

/** Who may search: a signed-in staff user. A contractor's portal session is a different cookie and never reaches this. */
export type Viewer = { id: string } | null;

export const SIGNED_OUT = { status: 401, body: { error: "signed-out" } } as const satisfies Answer<never>;

/** Reads `q`, `type` and `limit` from a request's query string. */
export function parseSearchParams(sp: URLSearchParams): SearchParams | { error: string } {
  const type = sp.get("type");
  if (type !== null && type !== "" && !(SEARCH_TYPES as readonly string[]).includes(type)) return { error: "bad-type" };
  const limit = sp.get("limit");
  const n = limit === null || limit === "" ? undefined : Number(limit);
  return {
    q: (sp.get("q") ?? "").trim(),
    type: type ? (type as SearchType) : undefined,
    limit: n,
  };
}

/** GET /api/search. Nothing is read before the viewer is known. */
export async function answerSearch(
  viewer: Viewer,
  sp: URLSearchParams,
  db: SearchDb,
  onError: (err: unknown) => void = () => {},
): Promise<Answer<SearchResponse>> {
  if (!viewer) return SIGNED_OUT;
  const params = parseSearchParams(sp);
  if ("error" in params) return { status: 400, body: { error: params.error } };
  try {
    return { status: 200, body: await runSearch(db, params) };
  } catch (err) {
    onError(err);
    return { status: 500, body: { error: "failed" } };
  }
}

/** GET /api/search/recent. `read` lists this viewer's recent views (readRecents, in the route). */
export async function answerRecent(
  viewer: Viewer,
  db: SearchDb,
  read: (userId: string) => Promise<{ kind: RecentKind; recordId: string }[]>,
  onError: (err: unknown) => void = () => {},
): Promise<Answer<RecentResponse>> {
  if (!viewer) return SIGNED_OUT;
  try {
    return { status: 200, body: { rows: await recentRows(db, await read(viewer.id)) } };
  } catch (err) {
    onError(err);
    return { status: 500, body: { error: "failed" } };
  }
}
