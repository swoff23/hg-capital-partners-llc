import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MAX_NEXT_LENGTH,
  STAFF_HOME,
  STAFF_SECTIONS,
  afterStaffSignIn,
  safeReturnPath,
  safeStaffPath,
  staffReturnPath,
  withNext,
} from "./next-path";
import { afterPortalSignIn, portalReturnPath, safePortalPath } from "./portal/next-path";

const ORIGIN = "https://hgcapitalpartners.com";

const GOOD = [
  "/",
  "/tasks",
  "/tasks/",
  "/tasks/cmtg25yuf01zsjphs0xu5d2fl",
  "/tasks/abc?x=1",
  "/tasks/all?view=done",
  "/tasks/new?propertyId=abc",
  "/deals/cmtg25yd8002cjphs49ovlvob",
  "/properties/abc?tab=units",
  "/contractors/abc",
  "/financials/rent-roll",
  "/settings/move-in-form",
  "/templates/abc/apply",
  "/tasks/abc%20def",
  "/tasks/%E2%9C%93",
];

const BAD = [
  // Somewhere else, or not a path at all.
  "//evil.com",
  "///evil.com",
  "/\\evil",
  "%2F%2Fevil.com",
  "https://evil.com/tasks/abc",
  "http:/tasks",
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "tasks/abc",
  " /tasks/abc",
  // Doubled slashes, backslashes and dot segments, as given or once decoded.
  "/tasks//evil.com",
  "/tasks/%2F%2Fevil.com",
  "/tasks\\evil",
  "/tasks/%5Cevil",
  "/tasks/../p/jobs/abc",
  "/tasks/./abc",
  "/tasks/%2e%2e/login",
  "/tasks/.%2E/api/search",
  // Control characters and anything that isn't printable ASCII as given.
  "/tasks/a\nb",
  "/tasks/a\rb",
  "/tasks/\t/evil.com",
  "/tasks/a\u0000b",
  "/tasks/a\u0085b",
  "/tasks/%0d%0aSet-Cookie:%20x=1",
  "/tasks/✓",
  "/tasks/a b",
  "/tasks/%E0%A4%A",
  "/tasks/%",
  // Not a staff page: the portal, sign-in, the public site, the API, Next's own files.
  "/p",
  "/p/jobs/abc",
  "/p/welcome/password?next=%2Ftasks",
  "/login",
  "/login?next=%2Ftasks%2Fabc",
  "/login/forgot",
  "/welcome",
  "/rentals",
  "/residents/moving-in",
  "/api/search?q=x",
  "/api/files/task/abc",
  "/_next/static/chunk.js",
  "/favicon.ico",
  "/tasksfoo",
  "/tasks.evil.com",
  "/Tasks/abc",
  "",
];

test("staff pages pass, as given", () => {
  for (const p of GOOD) assert.equal(safeStaffPath(p), p, p);
});

test("anything that isn't a plain staff page is refused", () => {
  for (const p of BAD) assert.equal(safeStaffPath(p), null, JSON.stringify(p));
});

test("only strings, and no more than the length cap", () => {
  for (const value of [undefined, null, 42, ["/tasks/abc"], { toString: () => "/tasks" }, new String("/tasks")]) {
    assert.equal(safeStaffPath(value), null, String(value));
  }
  const atCap = "/tasks/" + "a".repeat(MAX_NEXT_LENGTH - 7);
  assert.equal(atCap.length, MAX_NEXT_LENGTH);
  assert.equal(safeStaffPath(atCap), atCap);
  assert.equal(safeStaffPath(atCap + "a"), null);
});

test("whatever passes stays on this site, in a staff section, once a browser resolves it", () => {
  // Including a double-encoded "//" and "..": one decode leaves "%2F" and
  // "%2e", which a browser keeps as literal characters in the path.
  const tricky = ["/tasks/%252F%252Fevil.com", "/tasks/%252e%252e/p", "/deals/%E2%80%A8x", ...GOOD];
  for (const p of tricky) {
    const safe = safeStaffPath(p);
    assert.ok(safe, p);
    const url = new URL(safe, ORIGIN);
    assert.equal(url.origin, ORIGIN, p);
    const top = url.pathname.split("/")[1];
    assert.ok(url.pathname === STAFF_HOME || (STAFF_SECTIONS as readonly string[]).includes(top), `${p} -> ${url.pathname}`);
  }
});

test("the shared check needs a scope, and a leading slash whatever the scope says", () => {
  const anything = () => true;
  assert.equal(safeReturnPath("/anywhere?x=1", anything), "/anywhere?x=1");
  assert.equal(safeReturnPath("anywhere", anything), null);
  assert.equal(safeReturnPath("//evil.com", anything), null);
  assert.equal(safeReturnPath("/tasks/abc", () => false), null);
});

test("the return path: the dashboard itself is the default, and refused paths fall back to it", () => {
  assert.equal(staffReturnPath(STAFF_HOME), null);
  assert.equal(staffReturnPath("/tasks/abc"), "/tasks/abc");
  assert.equal(staffReturnPath("/tasks/abc?x=1"), "/tasks/abc?x=1");
  assert.equal(staffReturnPath("//evil.com"), null);
  assert.equal(staffReturnPath("/p/jobs/abc"), null);
  assert.equal(staffReturnPath(null), null);
  assert.equal(afterStaffSignIn(null), "/");
  assert.equal(afterStaffSignIn("/deals/abc"), "/deals/abc");
});

test("staff and portal paths never overlap, so each account only follows its own", () => {
  const candidates = [...GOOD, ...BAD, "/p", "/p/", "/p/jobs/abc", "/p?view=done", "/p/welcome/password?next=%2Fp%2Fjobs%2Fabc"];
  for (const p of candidates) {
    assert.ok(!(safeStaffPath(p) && safePortalPath(p)), `${p} passes both`);
  }
  for (const p of GOOD) assert.equal(portalReturnPath(p), null, p);
  // A contractor who follows a staff link signs in to My jobs.
  assert.equal(afterPortalSignIn(false, portalReturnPath("/tasks/abc")), "/p");
});

test("an email's task link survives sign-in", () => {
  // The hops a signed-out partner takes, each reading ?next= the way the code
  // does (Next hands pages their query already decoded once).
  const nextOf = (href: string) => new URL(href, ORIGIN).searchParams.get("next");
  const task = "/tasks/cmtg25yuf01zsjphs0xu5d2fl";

  const login = withNext("/login", staffReturnPath(task)); // requireUser, signed out
  assert.equal(login, "/login?next=%2Ftasks%2Fcmtg25yuf01zsjphs0xu5d2fl");
  const formNext = staffReturnPath(nextOf(login)); // the login page's hidden field
  assert.equal(afterStaffSignIn(staffReturnPath(formNext)), task); // the login action

  // With a query, and from the dashboard (no ?next= at all).
  const filtered = "/tasks/all?view=done&property=abc";
  assert.equal(afterStaffSignIn(staffReturnPath(nextOf(withNext("/login", staffReturnPath(filtered))))), filtered);
  assert.equal(withNext("/login", staffReturnPath(STAFF_HOME)), "/login");
});

test("STAFF_SECTIONS is the list of folders in src/app/(app)", () => {
  let dir = process.cwd();
  while (!fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) {
    const up = path.dirname(dir);
    assert.notEqual(up, dir, "could not locate the repo root");
    dir = up;
  }
  const app = path.join(dir, "src", "app", "(app)");
  const folders = fs
    .readdirSync(app, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !/^[_([@]/.test(e.name))
    .map((e) => e.name)
    .sort();
  assert.deepEqual([...STAFF_SECTIONS].sort(), folders);
});
