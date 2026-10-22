import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

const APP_DIR = path.join(__dirname, "../../src/app");

type FindRow = (db: PrismaClient) => Promise<{ id: string } | null>;

// One real row per dynamic segment, keyed "parent/[param]". IDs are cuids from
// each machine's own import, so tests/devices/setup.ts looks them up in the
// local DB at the start of every run instead of hard-coding them. A new
// dynamic route with no entry here shows up as a failing test that says which
// key to add.
export const SAMPLE_PARAMS: Record<string, FindRow> = {
  "contractors/[id]": (db) => db.contact.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } }),
  "deals/[id]": (db) => db.deal.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } }),
  "properties/[id]": (db) => db.property.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } }),
  "tasks/[id]": (db) =>
    db.task.findFirst({ where: { bucket: { not: "Template" } }, select: { id: true }, orderBy: { createdAt: "asc" } }),
};

export interface Route {
  /** The URL pattern, e.g. /deals/[id] */
  pattern: string;
  /** SAMPLE_PARAMS keys for its dynamic segments, in order */
  params: string[];
  /** Under (app), so it needs a session. Public pages and /login load signed out. */
  signedIn: boolean;
}

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
      return { pattern: "/" + visible.join("/"), params, signedIn: segments[0] === "(app)" };
    })
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
