import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { hashToken, residentLinkToken, signupLinkToken } from "../../src/lib/portal/tokens";

const APP_DIR = path.join(__dirname, "../../src/app");

type FindRow = (db: PrismaClient) => Promise<{ id: string } | null>;

/** The "portal" fixture contractor's login (setup.ts), who also gets two jobs of their own: one In progress, one To do. */
export const PORTAL_FIXTURE_EMAIL = "device-check@hg.localhost";

/** The end of the To do fixture job's notes, which is how setup.ts and its sample find it again. */
export const TODO_FIXTURE_MARK = "To do fixture for npm run test:devices.";

// One real row per dynamic segment, keyed "parent/[param]". IDs are cuids from
// each machine's own import, so tests/devices/setup.ts looks them up in the
// local DB at the start of every run instead of hard-coding them. A new
// dynamic route with no entry here shows up as a failing test that says which
// key to add.
export const SAMPLE_PARAMS: Record<string, FindRow> = {
  "contractors/[id]": (db) => db.contact.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } }),
  "deals/[id]": (db) => db.deal.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } }),
  // A rehab (docs/specs/rehab-draws.md): an open one, the first made. setup.ts seeds one when the local DB has none.
  "draws/[id]": (db) => db.rehab.findFirst({ where: { doneAt: null }, select: { id: true }, orderBy: { createdAt: "asc" } }),
  // A lease page (docs/specs/tenants.md 6): the one with the most tenants on it, so a household of several and a
  // long name or two are checked on a phone. Each machine's own import, or a lease made with New lease.
  "tenants/[id]": async (db) => {
    const leases = await db.lease.findMany({ select: { id: true, _count: { select: { tenants: true } } }, orderBy: { createdAt: "asc" } });
    const pick = leases.reduce<(typeof leases)[number] | null>((best, l) => (!best || l._count.tenants > best._count.tenants ? l : best), null);
    return pick ? { id: pick.id } : null;
  },
  // The contractor portal's job page: the In progress job setup.ts gives the fixture contractor (its first).
  "jobs/[id]": (db) =>
    db.task.findFirst({
      where: {
        access: { some: { revokedAt: null, contact: { portalAccount: { email: PORTAL_FIXTURE_EMAIL } } } },
        OR: [{ description: null }, { description: { not: { endsWith: TODO_FIXTURE_MARK } } }],
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }),
  // The same page in its first state: the fixture contractor's To do job with no day (setup.ts seedPortalTodoJob).
  "jobs/[id]#todo": (db) =>
    db.task.findFirst({
      where: {
        description: { endsWith: TODO_FIXTURE_MARK },
        access: { some: { revokedAt: null, contact: { portalAccount: { email: PORTAL_FIXTURE_EMAIL } } } },
      },
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
  // The shared sign-up link (docs/specs/contractor-onboarding.md): setup.ts makes sure one exists, and its token is
  // rebuilt from the row the way the app does, under the device check's own SESSION_SECRET.
  "join/[token]": async (db) => {
    const row = await db.portalInvite.findFirst({
      where: { shared: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const secret = process.env.DEVICE_SESSION_SECRET;
    return row && secret ? { id: signupLinkToken(row.id, secret) } : null;
  },
  // A resident's request link (docs/specs/maintenance-requests.md): the fixture link setup.ts keeps live, its token
  // rebuilt under the device check's own SESSION_SECRET, and an open request on its lease.
  "r/[token]": async (db) => {
    const secret = process.env.DEVICE_SESSION_SECRET;
    const row = await db.residentLink.findUnique({ where: { id: "devicecheckresidentlink" }, select: { id: true } });
    return row && secret ? { id: residentLinkToken(row.id, secret) } : null;
  },
  // A crew link's verdict once its job is deleted (docs/specs/emails-redesign.md, Q7): the note setup.ts
  // seedGoneCrewJobs keeps under a fresh crew link token each run. The page loads signed out, as a crew member's would.
  "j/[token]": async (db) => {
    const token = process.env.DEVICE_GONE_LINK_TOKEN;
    if (!token) return null;
    const note = await db.goneCrewJob.findUnique({ where: { tokenHash: hashToken(token) }, select: { kind: true } });
    return note?.kind === "LINK" ? { id: token } : null;
  },
  "[token]/[requestId]": async (db) => {
    const link = await db.residentLink.findUnique({ where: { id: "devicecheckresidentlink" }, select: { leaseId: true } });
    return link ? db.residentRequest.findFirst({ where: { leaseId: link.leaseId }, select: { id: true }, orderBy: { createdAt: "desc" } }) : null;
  },
  "tasks/[id]": (db) =>
    db.task.findFirst({ where: { bucket: { not: "Template" }, status: { not: "DRAFT" } }, select: { id: true }, orderBy: { createdAt: "asc" } }),
  // A draft from Claude's own page (its banner, both buttons, the one-item menu): the first of the drafts setup.ts
  // makes, the one with a contractor on it so the banner's line shows. See EXTRA_PAGES.
  "tasks/[id]#draft": (db) =>
    db.task.findFirst({
      where: { status: "DRAFT", discardedAt: null, assigneeContactId: { not: null } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }),
  // Playbooks come from the Asana load (scripts/asana/20-load.ts).
  "templates/[id]": (db) =>
    db.taskTemplate.findFirst({ where: { archivedAt: null }, select: { id: true }, orderBy: { createdAt: "asc" } }),
};

/**
 * Which session a route loads with: "staff" for (app) pages, "portal" (the
 * fixture contractor from setup.ts) for (portal) pages. Public pages and
 * /login load signed out. "portal-welcome" is the second fixture, still on
 * its starting password, for the one page only it can see. "portal-email-link"
 * and "portal-crew-link" are the "portal" fixture through a job email's link
 * and a Share with crew link (setup.ts seedLinkSessions). "portal-crew-gone" is
 * a crew session whose job was deleted, which only /j/gone reads (setup.ts
 * seedGoneCrewJobs).
 */
export type RouteSession =
  | "none"
  | "staff"
  | "portal"
  | "portal-welcome"
  | "portal-setup"
  | "portal-email-link"
  | "portal-crew-link"
  | "portal-crew-gone";

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
  // Setup is for people who came in by an invite or the sign-up link; the fixture staff added would only bounce to /p.
  "/p/setup": "portal-setup",
  // A crew session's verdict once its job is gone (docs/specs/emails-redesign.md, Q7); with no session it only goes to sign in.
  "/j/gone": "portal-crew-gone",
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

/**
 * A page in a state its route's one sample doesn't reach, loaded as well as the route itself. The pattern ends in
 * `#name`, which is the page's own name in the report and the fragment of the URL it loads (no page reads it), and
 * the SAMPLE_PARAMS key is the pattern's. A draft's page is one: the task page's sample is never a draft. The
 * contractor's job page at To do is the other: its sample is In progress.
 */
const EXTRA_PAGES: Route[] = [
  { pattern: "/tasks/[id]#draft", params: ["tasks/[id]#draft"], session: "staff" },
  // The contractor's job page at To do with no day: the Schedule step, "Not set" and the three-control bar.
  { pattern: "/p/jobs/[id]#todo", params: ["jobs/[id]#todo"], session: "portal" },
  // The same job through a Share with crew link: no back arrow, only the job (Connor, Nov 22).
  { pattern: "/p/jobs/[id]#crew", params: ["jobs/[id]#todo"], session: "portal-crew-link" },
  // Sign in from a job email's link: Welcome back, the email known, and Email me a sign-in link.
  { pattern: "/login#welcome-back", params: [], session: "portal-email-link" },
];

export function listRoutes(): Route[] {
  const own = listOwnRoutes();
  return [...own, ...EXTRA_PAGES].sort((a, b) => a.pattern.localeCompare(b.pattern));
}

function listOwnRoutes(): Route[] {
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
