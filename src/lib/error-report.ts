import type { Breadcrumb, BrowserOptions, Event } from "@sentry/browser";

/**
 * What an error report may carry out of the app (docs/specs/error-alerts.md,
 * Q4 and Q17). Pure functions, used as Sentry's beforeSend and
 * beforeBreadcrumb on the server (src/lib/report-server.ts) and in the
 * browser (src/lib/sentry-browser.ts), so both sides send the same.
 *
 * - Request bodies, cookies, query objects, headers other than the user
 *   agent, and IP addresses never leave.
 * - A token in a one-tap job link (/j/<token>), an invite or sign-up link
 *   (/join/<token>) or a query value (?token=, an OAuth ?code=) is
 *   replaced wherever it appears: the page
 *   address, the route name, the message, the click trail.
 * - The user is reduced to an ID. Extra fields pass only through an
 *   allowlist, so a field added to a log call later sends nothing until
 *   someone allows it here.
 * - Console breadcrumbs are dropped: they carry our own log lines and their
 *   context (src/lib/log.ts).
 */

/**
 * What the SDK collects on its own, on both sides. Sentry 11 collects cookies,
 * headers, bodies, query values, database query data and local variables by
 * default; all of it is off here, so no privacy rule rests on a default, and
 * scrubEvent below still runs on what's left.
 */
export const DATA_COLLECTION: NonNullable<BrowserOptions["dataCollection"]> = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ["user-agent"] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

/** One-tap job links (/j/<token>) and contractor invite and sign-up links (/join/<token>) carry a working token in the path. */
const TOKEN_PATH = /\/(j|join)\/(?!\[token\])[^/?#\s"'<>]+/g;
const SECRET_QUERY = /([?&](?:token|code|state|access_token|refresh_token|secret|signature|sig|key)=)[^&#\s"'<>]*/gi;
const REDACTED = "[redacted]";

/** Removes the tokens that work as a sign-in or a grant from any text that may hold an address. */
export function scrubText(text: string): string {
  return text.replace(TOKEN_PATH, "/$1/[token]").replace(SECRET_QUERY, `$1${REDACTED}`);
}

/** Extra fields that may leave: IDs, counts and kinds. Anything else, a subject line or a file name, stays home. */
const ALLOWED_EXTRA = new Set([
  "scope",
  "kind",
  "trigger",
  "count",
  "status",
  "statusCode",
  "attempts",
  "sentToday",
  "dbVia",
  "dbPool",
  "digest",
  "reason",
  "area",
  "source",
  "routeType",
]);

function isAllowedExtra(key: string): boolean {
  return ALLOWED_EXTRA.has(key) || key === "id" || /^[a-z][A-Za-z]*Id$/.test(key);
}

function allowedValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return scrubText(value).slice(0, 200);
  return undefined;
}

export function scrubExtra(extra: Record<string, unknown> | undefined): Record<string, string | number | boolean> | undefined {
  if (!extra) return undefined;
  const kept: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(extra)) {
    if (!isAllowedExtra(key)) continue;
    const v = allowedValue(value);
    if (v !== undefined) kept[key] = v;
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

function scrubStrings<T>(value: T, depth = 0): T {
  if (typeof value === "string") return scrubText(value) as T;
  if (!value || typeof value !== "object" || depth > 4) return value;
  if (Array.isArray(value)) return value.map((v) => scrubStrings(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = scrubStrings(v, depth + 1);
  return out as T;
}

const BREADCRUMB_DATA = new Set(["url", "from", "to", "method", "status_code"]);

/** beforeBreadcrumb: null drops it. */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === "console") return null;
  const out: Breadcrumb = { ...crumb };
  if (typeof out.message === "string") {
    // A click's selector can carry an aria-label or title; keep the tags and classes only.
    out.message = scrubText(out.category?.startsWith("ui.") ? out.message.replace(/\[[^\]]*\]/g, "") : out.message);
  }
  if (out.data) {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(out.data)) {
      if (BREADCRUMB_DATA.has(k)) data[k] = typeof v === "string" ? scrubText(v) : v;
    }
    out.data = data;
  }
  return out;
}

/** beforeSend, on both sides. Returns the same event, changed in place, so Sentry's own types carry through. */
export function scrubEvent<E extends Event>(event: E): E {
  if (event.request) {
    const userAgent = Object.entries(event.request.headers ?? {}).find(([k]) => k.toLowerCase() === "user-agent")?.[1];
    event.request = {
      ...(event.request.url ? { url: scrubText(event.request.url) } : {}),
      ...(event.request.method ? { method: event.request.method } : {}),
      ...(userAgent ? { headers: { "User-Agent": userAgent } } : {}),
    };
  }

  const id = event.user?.id;
  if (id !== undefined && id !== null && id !== "") event.user = { id: String(id) };
  else delete event.user;

  const extra = scrubExtra(event.extra as Record<string, unknown> | undefined);
  if (extra) event.extra = extra;
  else delete event.extra;

  if (event.tags) event.tags = scrubStrings(event.tags);
  if (event.contexts) event.contexts = scrubStrings(event.contexts);
  if (typeof event.transaction === "string") event.transaction = scrubText(event.transaction);
  if (typeof event.message === "string") event.message = scrubText(event.message);
  if (event.logentry?.message) event.logentry = { ...event.logentry, message: scrubText(event.logentry.message) };

  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value === "string") ex.value = scrubText(ex.value);
    for (const frame of ex.stacktrace?.frames ?? []) delete frame.vars;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb).filter((b): b is Breadcrumb => b !== null);
  }
  return event;
}

/** The part of the app an error came from (Q7). Null where the address alone can't tell: `/` is the public page signed out and Home signed in. */
export type Area = "staff" | "portal" | "public" | "sign-in" | "api";

const PUBLIC_PREFIXES = ["/rentals", "/residents", "/welcome"];

function underAny(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

/** From the address a person was on. */
export function areaOfPath(pathname: string): Area | null {
  const path = pathname.split(/[?#]/)[0] || "/";
  if (path === "/") return null;
  if (underAny(path, ["/p", "/j", "/join"])) return "portal";
  if (underAny(path, ["/login"])) return "sign-in";
  if (underAny(path, ["/api"])) return "api";
  if (underAny(path, PUBLIC_PREFIXES)) return "public";
  return "staff";
}

/**
 * From the route Next names in onRequestError. Next 16.3 names it without its
 * route group (`/residents/moving-in`, checked against a local production
 * build), so `/` stays untagged on the server too. A group, if a later Next
 * version names one, settles it.
 */
export function areaOfRoute(routePath: string): Area | null {
  if (routePath.includes("(marketing)")) return "public";
  if (routePath.includes("(portal)")) return "portal";
  if (routePath.includes("(app)")) return "staff";
  const path = routePath.replace(/^\/app(?=\/)/, "");
  return areaOfPath(path);
}

/** Staff or contractor (Q4), where the area says which. */
export function kindOfArea(area: Area | null): "staff" | "contractor" | null {
  if (area === "staff") return "staff";
  if (area === "portal") return "contractor";
  return null;
}
