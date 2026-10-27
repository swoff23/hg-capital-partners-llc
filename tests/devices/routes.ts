import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

const APP_DIR = path.join(__dirname, "../../src/app");

type FindRow = (db: PrismaClient) => Promise<{ id: string } | null>;

/** The "portal" fixture contractor's login (setup.ts), who also gets one job of their own. */
export const PORTAL_FIXTURE_EMAIL = "device-check@hg.localhost";

// One real row per dynamic segment, keyed "parent/[param]". IDs are cuids from
// each machine's own import, so tests/devices/setup.ts looks them up in the
// local DB at the start of every run instead of hard-coding them. A new
// dynamic route with no entry here shows up as a failing test that says which
// key to add.
export const SAMPLE_PARAMS: Record<string, FindRow> = {
  "contractors/[id]": (db) => db.contact.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } }),
  "deals/[id]": (db) => db.deal.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } }),
  // The contractor portal's job page: the job setup.ts gives the fixture contractor.
  "jobs/[id]": (db) =>
    db.task.findFirst({
      where: { access: { some: { revokedAt: null, contact: { portalAccount: { email: PORTAL_FIXTURE_EMAIL } } } } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }),
  // The property whose units hold the longest lockbox value ("4857 (back left corner of the
  // house)"), so a long code or note on a phone is checked too; the first one without any.
  "properties/[id]": async (db) => {
    const all = await db.property.findMany({ select: { id: true, units: true }, orderBy: { createdAt: "asc" } });
    const longest = (units: unknown) =>
      Array.isArray(units)
        ? Math.max(0, ...units.map((u) => (typeof u?.lockboxCode === "string" ? u.lockboxCode.length : 0)))
        : 0;
    const pick = all.reduce<(typeof all)[number] | null>((best, p) => (!best || longest(p.units) > longest(best.units) ? p : best), null);
    return pick ? { id: pick.id } : null;
  },
  "tasks/[id]": (db) =>
    db.task.findFirst({ where: { bucket: { not: "Template" } }, select: { id: true }, orderBy: { createdAt: "asc" } }),
  // Playbooks come from the Asana load (scripts/asana/20-load.ts).
  "templates/[id]": (db) =>
    db.taskTemplate.findFirst({ where: { archivedAt: null }, select: { id: true }, orderBy: { createdAt: "asc" } }),
};

/**
 * Which session a route loads with: "staff" for (app) pages, "portal" (the
 * fixture contractor from setup.ts) for (portal) pages. Public pages and
 * /login load signed out. "portal-welcome" is the second fixture, still on
 * its starting password, for the one page only it can see.
 */
export type RouteSession = "none" | "staff" | "portal" | "portal-welcome";

export interface Route {
  /** The URL pattern, e.g. /deals/[id] */
  pattern: string;
  /** SAMPLE_PARAMS keys for its dynamic segments, in order */
  params: string[];
  session: RouteSession;
}

const SESSION_BY_GROUP: Record<string, RouteSession> = { "(app)": "staff", "(portal)": "portal" };

/**
 * Pages that need a different session from their group's, by URL pattern.
 * "Choose your own password" sends anyone who already chose one on to /p, so
 * it's checked as the fixture that hasn't. setup.ts fails on a stale key.
 */
export const ROUTE_SESSION_OVERRIDE: Record<string, RouteSession> = {
  "/p/welcome/password": "portal-welcome",
};

/**
 * Pages that only redirect, so there's nothing of their own to check. Their
 * target is checked in its own right: /tasks/all sends its filters on to /tasks.
 */
const REDIRECT_ONLY = new Set(["/tasks/all"]);

/**
 * A staff section's catch-all (`[...missing]`) only answers an unknown
 * address with the app's Not found, a 404 by design, so there's no page of
 * its own to sweep. next-path.test.ts checks every section has one.
 */
const NOT_FOUND_ONLY = /\/\[\.\.\.missing\]$/;

function findPages(dir: string, segments: string[] = []): string[][] {
  const found: string[][] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.some((e) => e.isFile() && /^page\.(tsx|ts|jsx|js)$/.test(e.name))) {
    found.push(segments);
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Private folders, parallel-route slots and API routes never render a page.
    if (entry.name.startsWith("_") || entry.name.startsWith("@") || entry.name === "api") continue;
    found.push(...findPages(path.join(dir, entry.name), [...segments, entry.name]));
  }
  return found;
}

export function listRoutes(): Route[] {
  return findPages(APP_DIR)
    .map((segments) => {
      // Route groups like (marketing) don't appear in the URL.
      const visible = segments.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
      const params = visible
        .map((seg, i) => (seg.startsWith("[") ? `${visible[i - 1] ?? ""}/${seg}` : null))
        .filter((k): k is string => k !== null);
      const pattern = "/" + visible.join("/");
      const session = ROUTE_SESSION_OVERRIDE[pattern] ?? SESSION_BY_GROUP[segments[0]] ?? "none";
      return { pattern, params, session };
    })
    .filter((r) => !REDIRECT_ONLY.has(r.pattern) && !NOT_FOUND_ONLY.test(r.pattern))
    .sort((a, b) => a.pattern.localeCompare(b.pattern));
}

/** The URL to load, or which SAMPLE_PARAMS key is missing or found no row. */
export function routeUrl(route: Route, samples: Record<string, string>): { url: string } | { problem: string } {
  for (const key of route.params) {
    if (!SAMPLE_PARAMS[key]) return { problem: `No sample for ${key}. Add one to SAMPLE_PARAMS in tests/devices/routes.ts.` };
    if (!samples[key]) return { problem: `SAMPLE_PARAMS["${key}"] found no row in the local DB.` };
  }
  let i = 0;
  return { url: route.pattern.replace(/\[[^\]]+\]/g, () => samples[route.params[i++]]) };
}
