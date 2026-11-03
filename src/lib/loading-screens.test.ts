/**
 * Static checks for the loading screens (docs/specs/performance.md 4). Next
 * prefetches a dynamic route only as far as its loading.tsx, so a page
 * without one makes every click wait on the server, and a layout that reads
 * the session above one makes each prefetch cost a query and holds the
 * screen back. Source only: no Next, no database.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = path.join(process.cwd(), "src", "app");
const rel = (dir: string) => path.relative(APP, dir).split(path.sep).join("/");

/** Every folder under `dir`, `dir` included. Parallel-route slots (`@modal`) hold sheets, not pages. */
function folders(dir: string, out: string[] = []): string[] {
  out.push(dir);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith("@")) folders(path.join(dir, entry.name), out);
  }
  return out;
}

const has = (dir: string, file: string) => fs.existsSync(path.join(dir, file));
const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), "utf8");

const SURFACES = [path.join(APP, "(app)"), path.join(APP, "(portal)", "p")];
const all = SURFACES.flatMap((s) => folders(s));
const pages = all.filter((d) => has(d, "page.tsx"));
const screens = all.filter((d) => has(d, "loading.tsx"));

/**
 * Pages with no loading screen on purpose (performance.md 4.3, "Left out on
 * purpose"): the create pages open as sheets from every link and show as a
 * page only on a reload, /tasks/all only redirects, and the first-password
 * page renders with no data worth a skeleton.
 */
const WITHOUT = new Set([
  "(app)/contractors/new",
  "(app)/deals/new",
  "(app)/properties/new",
  "(app)/tasks/new",
  "(app)/tasks/all",
  "(portal)/p/welcome/password",
]);

/** The surfaces' own layouts: a click never re-runs them (partial rendering), so they may read the session. */
const ROOT_LAYOUTS = new Set(["(app)", "(portal)/p"]);

test("the checks see the tree they're meant to", () => {
  assert.ok(pages.length >= 20, `only ${pages.length} pages found`);
  assert.ok(screens.some((d) => rel(d) === "(app)/financials/(overview)"), "the Overview's loading screen wasn't found");
});

test("every section and record page has a loading screen beside it", () => {
  const missing = pages.map(rel).filter((p) => !WITHOUT.has(p) && !screens.some((d) => rel(d) === p));
  assert.deepEqual(missing, [], "Give each a loading.tsx on the Financials Overview's pattern, or list it in WITHOUT with the reason.");
  const stale = [...WITHOUT].filter((p) => !pages.some((d) => rel(d) === p));
  assert.deepEqual(stale, [], "WITHOUT names pages that don't exist");
});

test("a loading screen covers its own page only", () => {
  // A list's screen in tasks/ would also show for a task, with the list's shape: the list moves into
  // its own route group (tasks/(list)), as Financials Overview sits in financials/(overview).
  const borrowed = screens.flatMap((s) =>
    folders(s)
      .filter((d) => d !== s && has(d, "page.tsx"))
      .map((d) => `${rel(d)} would show ${rel(s)}/loading.tsx`),
  );
  assert.deepEqual(borrowed, []);
});

test("every loading screen's root is LoadingScreen", () => {
  // The app shell waits on its mark before it moves focus to the page's h1 or scrolls to a #hash.
  const bare = screens.map(rel).filter((d) => {
    const src = read(path.join(APP, d), "loading.tsx");
    return !/import \{[^}]*\bLoadingScreen\b[^}]*\} from "@\/components\/skeleton"/.test(src) || !/return \(\s*<LoadingScreen[\s>]/.test(src);
  });
  assert.deepEqual(bare, []);
});

/** Imports that mean a layout reads the session, the request or the database. */
const READS = [/from "@\/lib\/auth"/, /from "@\/lib\/db"/, /from "next\/headers"/, /from "@\/lib\/portal\/session"/, /\brequireUser\(/];

const sectionLayouts = all.filter((d) => has(d, "layout.tsx") && !ROOT_LAYOUTS.has(rel(d)) && folders(d).some((f) => has(f, "loading.tsx")));

test("a section layout above a loading screen reads nothing", () => {
  assert.ok(sectionLayouts.some((d) => rel(d) === "(app)/financials"), "the Financials layout wasn't found");
  const reading = sectionLayouts.map(rel).filter((d) => READS.some((r) => r.test(read(path.join(APP, d), "layout.tsx"))));
  assert.deepEqual(
    reading,
    [],
    "A layout isn't a security boundary and doesn't re-run on a tab switch; reading here makes every prefetch cost a query. Each page checks the session itself.",
  );
});

test("every page under a section layout checks the session itself", () => {
  const unchecked = sectionLayouts.flatMap((l) =>
    folders(l)
      .filter((d) => has(d, "page.tsx") && !/\brequireUser\(/.test(read(d, "page.tsx")))
      .map(rel),
  );
  assert.deepEqual(unchecked, []);
});
