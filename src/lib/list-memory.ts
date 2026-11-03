/**
 * Remembered lists (docs/specs/selectors.md 3.7, IA-036): each list keeps its
 * last query in a cookie per browser, the way the sidebar keeps its pin, and
 * the sidebar's links carry it, so coming back through the sidebar keeps your
 * filters. The (app) layout reads the cookies on the server, so the links are
 * right on first paint and nothing changes after hydration; the filter bar
 * writes the cookie on each change (components/list-memory.tsx).
 *
 * Pure: no `next/headers` here, so client components can import it. The layout
 * hands `readListHrefs` the cookie jar it already holds. See list-memory.test.ts.
 */

export const LIST_KEYS = ["tasks", "deals", "properties", "contractors"] as const;
export type ListKey = (typeof LIST_KEYS)[number];

/** Where each list lives. */
export const LIST_PATHS: Record<ListKey, string> = {
  tasks: "/tasks",
  deals: "/deals",
  properties: "/properties",
  contractors: "/contractors",
};

/** The cookie each list writes: the list's query string, URL-encoded. */
export const LIST_COOKIES: Record<ListKey, string> = {
  tasks: "hg-list-tasks",
  deals: "hg-list-deals",
  properties: "hg-list-properties",
  contractors: "hg-list-contractors",
};

/** One href per list: the path, plus the remembered query when there is one. */
export type ListHrefs = Record<ListKey, string>;

/** Longer than this and a cookie isn't worth keeping: the list opens plain. */
export const MAX_QUERY = 1500;

/** A query string as stored: parsed and written back, so only well-formed `a=b&c=d` survives. */
export function cleanQuery(query: string | null | undefined): string {
  const raw = (query ?? "").replace(/^\?/, "").trim();
  if (!raw || raw.length > MAX_QUERY) return "";
  try {
    return new URLSearchParams(raw).toString();
  } catch {
    return "";
  }
}

/** The list's href for a remembered query: `/tasks`, or `/tasks?owner=u%3Aabc`. */
export function listHref(list: ListKey, query: string | null | undefined): string {
  const q = cleanQuery(query);
  return q ? `${LIST_PATHS[list]}?${q}` : LIST_PATHS[list];
}

/** Every list at its default: no remembered query. */
export function plainListHrefs(): ListHrefs {
  return Object.fromEntries(LIST_KEYS.map((k) => [k, LIST_PATHS[k]])) as ListHrefs;
}

/**
 * The hrefs for the sidebar, from the cookie jar the layout holds. Next hands
 * the cookie's value back already decoded, so it is the query string itself.
 */
export function readListHrefs(jar: { get(name: string): { value: string } | undefined }): ListHrefs {
  return Object.fromEntries(LIST_KEYS.map((k) => [k, listHref(k, jar.get(LIST_COOKIES[k])?.value)])) as ListHrefs;
}

/** What the browser stores for a query: URL-encoded, since a cookie can't hold `,` or `;`. */
export function encodeListCookie(query: string): string {
  return encodeURIComponent(cleanQuery(query));
}

/** The cookie as a `document.cookie` assignment: for a year, on every path, for this site only. */
export function listCookieString(list: ListKey, query: string): string {
  return `${LIST_COOKIES[list]}=${encodeListCookie(query)}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Where a list goes when its query becomes `next` (the filter bar's
 * `FilterScope`). `transient` names params that are how the list is being
 * viewed, not what it is filtered by: the Tasks list's `show`, how many rows
 * are out. A change to anything else starts them over, so a new filter opens at
 * the first page, and the cookie never keeps them, so the sidebar link does too.
 * `url` is the query for the address, `remembered` the one for the cookie.
 */
export function listChange(
  next: URLSearchParams,
  current: URLSearchParams,
  transient: readonly string[],
): { url: string; remembered: string } {
  const withoutTransient = (q: URLSearchParams) => {
    const rest = new URLSearchParams(q);
    for (const key of transient) rest.delete(key);
    return rest;
  };
  // Compared sorted, so the order a control writes its params in doesn't count as a change.
  const filtersOf = (q: URLSearchParams) => {
    const rest = withoutTransient(q);
    rest.sort();
    return rest.toString();
  };
  const url = filtersOf(next) === filtersOf(current) ? new URLSearchParams(next) : withoutTransient(next);
  return { url: url.toString(), remembered: withoutTransient(url).toString() };
}

/* ---------------- Comma-joined facets ---------------- */

/**
 * A facet with several picks rides in one param, comma-joined ("owner=u:abc,c:def").
 * A value that holds a comma (a legacy name, "Smith, Bob") escapes it, and the
 * percent sign with it, so splitting on commas is always safe.
 */
export function joinFacet(values: readonly string[]): string {
  return values.map((v) => v.replace(/%/g, "%25").replace(/,/g, "%2C")).join(",");
}

/** The picks in a comma-joined param, in order and once each; empty for no param. */
export function parseFacet(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    if (!part) continue;
    seen.add(part.replace(/%2C/gi, ",").replace(/%25/g, "%"));
  }
  return [...seen];
}
