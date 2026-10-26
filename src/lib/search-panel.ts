import {
  GO_TO,
  commandsByWordStart,
  createCommands,
  leadingCommands,
  type Command,
  type PageContext,
} from "@/lib/commands";
import { foldAccents, looksLikeAddress } from "@/lib/search";
import { MIN_QUERY, SEARCH_TYPES, type SearchResponse, type SearchRow, type SearchType } from "@/lib/search-results";

/**
 * What the command palette shows for the state it is in (docs/specs/search.md
 * 2.5 and 2.6): the groups of rows, the one line of text above them, the
 * skeleton while a first load runs, and what a screen reader hears. Pure, so
 * search-panel.test.ts runs the states table without a browser; the palette
 * only draws it.
 */

export type PanelEntry =
  /** A record. `marked` puts the typed words at weight 600 in its title. */
  | { kind: "row"; key: string; row: SearchRow; marked: boolean }
  | { kind: "command"; key: string; command: Command }
  /** "See all 40 tasks": narrows the panel to one type in place. */
  | { kind: "all"; key: string; type: SearchType; total: number }
  /** "Open in Tasks": the list page under the same words. */
  | { kind: "open"; key: string; type: SearchType; href: string; label: string }
  /** 'Add "12 Elmwood Ter" as a deal'. */
  | { kind: "add"; key: string; address: string; href: string }
  /** "See 3 deals": a type that matched when the one asked for didn't. */
  | { kind: "elsewhere"; key: string; type: SearchType; total: number };

export type PanelGroup = { id: string; title?: string; entries: PanelEntry[] };

export type PanelNotice = { kind: "hint" | "empty" | "error" | "signed-out"; text: string };

export type PanelView = {
  groups: PanelGroup[];
  notice: PanelNotice | null;
  /** Static placeholder rows, with the group title they stand under when there is one. */
  skeleton: { rows: number; title?: string } | null;
  /** Narrowed to one type: the band's total once known. */
  band: { total: number | null } | null;
  /** The live region's line. */
  announce: string;
};

export type PanelInput = {
  /** What was typed, trimmed. */
  q: string;
  scope: SearchType | null;
  /** Recent records; `loaded` is false until the first answer (or the held copy) is in. */
  recent: { rows: readonly SearchRow[]; loaded: boolean };
  live: {
    status: "idle" | "ready" | "error" | "signed-out";
    /** The rows to show: the answer for what is typed, or the last one while the next is on its way. */
    response: SearchResponse | null;
  };
  context: PageContext;
};

export const RECENT_HINT = "Search by address, name or task.";
export const KEEP_TYPING = "Keep typing to search records.";
export const LOAD_FAILED = "Search didn't load.";
export const SIGNED_OUT_LINE = "You're signed out.";

const TITLES: Record<SearchType, string> = {
  property: "Properties",
  task: "Tasks",
  deal: "Deals",
  contractor: "Contractors",
};
const PLURAL: Record<SearchType, string> = { property: "properties", task: "tasks", deal: "deals", contractor: "contractors" };
const SINGULAR: Record<SearchType, string> = { property: "property", task: "task", deal: "deal", contractor: "contractor" };

export const groupTitle = (type: SearchType): string => TITLES[type];
const noun = (type: SearchType, n: number): string => (n === 1 ? SINGULAR[type] : PLURAL[type]);

/** "See all 40 tasks". */
export const seeAllLabel = (type: SearchType, total: number): string => `See all ${total} ${noun(type, total)}`;
/** "See 3 deals". */
export const seeElsewhereLabel = (type: SearchType, total: number): string => `See ${total} ${noun(type, total)}`;

/** The scope band's count: "1 deal", "34 tasks". */
export const bandLabel = (type: SearchType, total: number): string => `${total} ${noun(type, total)}`;

/** The list pages that take the same words: Portfolio has no search of its own. */
const OPEN_IN: Partial<Record<SearchType, { path: string; label: string; params?: Record<string, string> }>> = {
  // All statuses, so the page lists as many as "See all 40 tasks" counted.
  task: { path: "/tasks", label: "Open in Tasks", params: { status: "all" } },
  deal: { path: "/deals", label: "Open in Deals", params: { status: "all" } },
  contractor: { path: "/contractors", label: "Open in Contractors" },
};

/** The page that lists what a narrowed search found, under the typed words. Null for properties. */
export function openInEntry(type: SearchType, q: string): { href: string; label: string } | null {
  const target = OPEN_IN[type];
  if (!target) return null;
  const params = new URLSearchParams({ q, ...target.params });
  return { href: `${target.path}?${params}`, label: target.label };
}

/** Where 'Add "12 Elmwood Ter" as a deal' goes: New deal with the address filled in. */
export const addDealHref = (address: string): string => `/deals/new?${new URLSearchParams({ address })}`;

export const addDealLabel = (address: string): string => `Add "${address}" as a deal`;

const norm = (s: string) => foldAccents(s).toLowerCase();

/** What a record row is found by on the client: its title and the words beside it. */
function rowWords(row: SearchRow): string[] {
  const extra =
    row.type === "task"
      ? [row.place ?? ""]
      : row.type === "property"
        ? [row.owner ?? ""]
        : row.type === "contractor"
          ? [row.trade ?? "", row.company ?? ""]
          : [];
  return norm([row.title, ...extra].join(" ")).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** The rows with a word that starts with every typed word (one character filters Recent this way). */
export function rowsByWordStart(rows: readonly SearchRow[], query: string): SearchRow[] {
  const parts = norm(query).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [...rows];
  return rows.filter((r) => {
    const words = rowWords(r);
    return parts.every((p) => words.some((w) => w.startsWith(p)));
  });
}

const rowEntry = (prefix: string, row: SearchRow, marked: boolean): PanelEntry => ({
  kind: "row",
  key: `${prefix}:${row.type}:${row.id}`,
  row,
  marked,
});

const commandEntry = (c: Command): PanelEntry => ({ kind: "command", key: `${c.kind}:${c.id}`, command: c });

/** Create, then Go to, as groups, each only when it has rows. */
function commandGroups(commands: readonly Command[]): PanelGroup[] {
  const create = commands.filter((c) => c.kind === "create");
  const go = commands.filter((c) => c.kind === "go");
  return [
    ...(create.length ? [{ id: "create", title: "Create", entries: create.map(commandEntry) }] : []),
    ...(go.length ? [{ id: "go", title: "Go to", entries: go.map(commandEntry) }] : []),
  ];
}

/** The address of the record page the person is on, from the Recent row `recordView` wrote for it. */
function placeOf(context: PageContext, recent: readonly SearchRow[]): string | undefined {
  if (!context) return undefined;
  return recent.find((r) => r.type === context.kind && r.id === context.id)?.title;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The whole panel for one state. */
export function composePanel(input: PanelInput): PanelView {
  const { q, scope, recent, live, context } = input;
  const create = createCommands(context, placeOf(context, recent.rows));
  const everything = [...create, ...GO_TO];
  const typed = q.length;

  // Narrowed to one type with too little typed: nothing to show but the way back and what to do.
  if (scope && typed < MIN_QUERY) {
    return {
      groups: [],
      notice: { kind: "empty", text: `Keep typing to search ${PLURAL[scope]}.` },
      skeleton: null,
      band: { total: null },
      announce: "",
    };
  }

  // Nothing typed: Recent, Create, Go to.
  if (typed === 0) {
    const recentGroup: PanelGroup[] = recent.rows.length
      ? [{ id: "recent", title: "Recent", entries: recent.rows.map((r) => rowEntry("recent", r, false)) }]
      : [];
    return {
      groups: [...recentGroup, ...commandGroups(everything)],
      notice: recent.loaded && recent.rows.length === 0 ? { kind: "hint", text: RECENT_HINT } : null,
      skeleton: !recent.loaded ? { rows: 5, title: "Recent" } : null,
      band: null,
      announce: "",
    };
  }

  // One character: what is already here, by word start. The server waits for two.
  if (typed < MIN_QUERY) {
    const rows = rowsByWordStart(recent.rows, q);
    const groups = [
      ...(rows.length ? [{ id: "recent", title: "Recent", entries: rows.map((r) => rowEntry("recent", r, false)) }] : []),
      ...commandGroups(commandsByWordStart(everything, q)),
    ];
    return {
      groups,
      notice: groups.length === 0 ? { kind: "empty", text: KEEP_TYPING } : null,
      skeleton: null,
      band: null,
      announce: "",
    };
  }

  const none: PanelView = { groups: [], notice: null, skeleton: null, band: null, announce: "" };

  // A failed request or a signed-out session: the old rows are gone, and what needs no server stays.
  if (live.status === "error" || live.status === "signed-out") {
    const rows = rowsByWordStart(recent.rows, q);
    const local = [
      ...(rows.length ? [{ id: "recent", title: "Recent", entries: rows.map((r) => rowEntry("recent", r, false)) }] : []),
      ...commandGroups(commandsByWordStart(everything, q)),
    ];
    const text = live.status === "error" ? LOAD_FAILED : SIGNED_OUT_LINE;
    return {
      ...none,
      groups: scope ? [] : local,
      notice: { kind: live.status, text },
      band: scope ? { total: null } : null,
      announce: text,
    };
  }

  const response = live.response;
  const lead = scope ? [] : commandGroups(leadingCommands(everything, q));

  // The first request, with nothing on screen yet.
  if (!response) {
    return { ...none, groups: lead, skeleton: { rows: 3 }, band: scope ? { total: null } : null };
  }

  // Narrowed to one type, up to 20 rows.
  if (scope) {
    const group = response.groups.find((g) => g.type === scope && g.total > 0);
    if (!group) {
      const others = SEARCH_TYPES.filter((t) => t !== scope)
        .map((t) => response.groups.find((g) => g.type === t))
        .filter((g): g is NonNullable<typeof g> => g !== undefined && g.total > 0);
      const text = `No ${PLURAL[scope]} match "${q}".`;
      return {
        groups: others.length
          ? [
              {
                id: "elsewhere",
                entries: others.map((g): PanelEntry => ({ kind: "elsewhere", key: `elsewhere:${g.type}`, type: g.type, total: g.total })),
              },
            ]
          : [],
        notice: { kind: "empty", text },
        skeleton: null,
        band: { total: 0 },
        announce: text,
      };
    }
    const open = openInEntry(scope, q);
    return {
      groups: [
        {
          id: scope,
          entries: [
            ...group.rows.map((r) => rowEntry("res", r, true)),
            ...(open ? [{ kind: "open" as const, key: `open:${scope}`, type: scope, ...open }] : []),
          ],
        },
      ],
      notice: null,
      skeleton: null,
      band: { total: group.total },
      announce: count(group.total, "result", "results"),
    };
  }

  // Everything, in the fixed order: Properties, Tasks, Deals, Contractors.
  const found = SEARCH_TYPES.map((type) => response.groups.find((g) => g.type === type)).filter(
    (g): g is NonNullable<typeof g> => g !== undefined && g.total > 0,
  );
  const groups: PanelGroup[] = found.map((g) => ({
    id: g.type,
    title: groupTitle(g.type),
    entries: [
      ...g.rows.map((r) => rowEntry("res", r, true)),
      ...(g.total > g.rows.length
        ? [{ kind: "all" as const, key: `all:${g.type}`, type: g.type, total: g.total }]
        : []),
    ],
  }));

  // An address that isn't a property or a deal yet can become one.
  const knownAddress = found.some((g) => g.type === "property" || g.type === "deal");
  const add: PanelGroup[] =
    looksLikeAddress(q) && !knownAddress
      ? [{ id: "add", entries: [{ kind: "add", key: "add-deal", address: q, href: addDealHref(q) }] }]
      : [];

  if (found.length === 0) {
    const text = `No matches for "${q}".`;
    return { ...none, groups: [...lead, ...add], notice: { kind: "empty", text }, announce: text };
  }
  const shown = found.reduce((n, g) => n + g.rows.length, 0);
  return { ...none, groups: [...lead, ...groups, ...add], announce: count(shown, "result", "results") };
}
