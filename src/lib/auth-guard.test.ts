/**
 * Static guard for the contractor portal (docs/asana-migration-plan.md §5.1,
 * Hardening). Three rules, in the style of db-rls.test.ts:
 *
 *  1. Every exported function in a "use server" file, and every handler in a
 *     route file, checks who is calling: requireUser / getCurrentUser for
 *     staff, getPortalPrincipal / requirePortalPrincipal for contractors.
 *     The few that are public on purpose are on ALLOWLIST below.
 *  2. Portal code (src/app/(portal), src/lib/portal) never imports staff
 *     auth or sessions, the staff task read helpers, staff pages, or the
 *     properties, deals or QuickBooks modules.
 *  3. Lockbox codes live in Property.units, which portal code reads in one
 *     place only: src/lib/portal/access-code.ts.
 *
 * Static only: it parses the source with the TypeScript compiler, no Next,
 * no database.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error("could not locate prisma/schema.prisma above " + process.cwd());
    dir = up;
  }
}

const root = repoRoot();
const SRC = path.join(root, "src");
const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");

/** Calls that count as "checked who is calling". */
const GUARDS = new Set(["requireUser", "getCurrentUser", "getPortalPrincipal", "requirePortalPrincipal"]);

/**
 * Public on purpose. "file#export" for actions, a route path (or a /* prefix)
 * for handlers. Each needs its own protection, named here, and must match
 * something that exists (see "allowlist entries still exist").
 */
const ALLOWLIST = new Set([
  "src/app/login/actions.ts#login", // the sign-in itself; per-email throttle
  "src/app/login/actions.ts#signOut", // only clears the caller's own cookie
  "src/app/login/actions.ts#requestPasswordReset", // same answer for every email; DB rate limit
  "src/app/(marketing)/residents/moving-in/actions.ts#submitMoveInInspection", // public form; IP and global caps
  "/login/reset/submit", // the reset link's form; does nothing without a live single-use token
  "/api/health", // detail behind HEALTH_TOKEN
  "/api/quickbooks/sync", // CRON_SECRET
  "/api/cron/notifications", // CRON_SECRET, the same check as /api/quickbooks/sync
]);

/**
 * Planned public routes that don't exist yet. These excuse nothing: when the
 * route lands, "pending entries" fails until the entry moves to ALLOWLIST,
 * which is the moment to check the route really does verify CRON_SECRET.
 * Crons are allowlisted one path at a time (the notifications cron moved
 * over by its own path), so a new one, such as an Asana sync cron, fails the
 * route check until it's listed with its reason.
 */
const PENDING = new Set<string>([]);

const HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

/** Next's default pageExtensions, which route files use too. */
const SOURCE_EXT = /\.(ts|tsx|js|jsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

const sources = walk(SRC).filter((f) => !/\.test\.[jt]sx?$/.test(f));

const SCRIPT_KIND: Record<string, ts.ScriptKind> = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
};

function parse(file: string): ts.SourceFile {
  const kind = SCRIPT_KIND[path.extname(file)] ?? ts.ScriptKind.TS;
  return ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, kind);
}

function isDirective(stmt: ts.Statement, text: string): boolean {
  return ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression) && stmt.expression.text === text;
}

function hasUseServer(sf: ts.SourceFile): boolean {
  for (const stmt of sf.statements) {
    if (!ts.isExpressionStatement(stmt) || !ts.isStringLiteral(stmt.expression)) return false;
    if (stmt.expression.text === "use server") return true;
  }
  return false;
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === kind);
const isExported = (node: ts.Node) => hasModifier(node, ts.SyntaxKind.ExportKeyword);

/**
 * Does this subtree call one of GUARDS (directly, or as `x.requireUser()`)?
 * With `sf`, a call to a helper declared in the same file counts when the
 * helper itself checks the caller (e.g. currentViewer() in /api/files).
 */
function callsGuard(node: ts.Node, sf?: ts.SourceFile, seen: Set<string> = new Set()): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
      if (name && GUARDS.has(name)) {
        found = true;
        return;
      }
      if (sf && ts.isIdentifier(callee) && !seen.has(callee.text)) {
        seen.add(callee.text);
        const helper = localBody(sf, callee.text);
        if (helper && callsGuard(helper, sf, seen)) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

type Exported = { name: string; body: ts.Node | undefined };

/** Identifiers a destructuring declaration binds (`export const { a, b: [c] } = x`). */
function boundNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((el) => (ts.isOmittedExpression(el) ? [] : boundNames(el.name)));
}

/** The body behind a local name: a function declaration's body or a const's initializer. */
function localBody(sf: ts.SourceFile, local: string): ts.Node | undefined {
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === local && stmt.body) return stmt.body;
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === local) return d.initializer;
      }
    }
  }
  return undefined;
}

/**
 * Everything a module exports that could be a function, with the code to
 * search for a guard. `body` is undefined when it can't be seen from this
 * file (a re-export, a destructured binding), which counts as unchecked.
 * Covers `export async function f`, `export const f = ...`,
 * `export default ...`, `export { f, g as h }`, and re-exports
 * (`export { f } from`, `export * from`, the latter named "*").
 */
function exportedFunctions(sf: ts.SourceFile): Exported[] {
  const out: Exported[] = [];
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && isExported(stmt)) {
      const isDefault = hasModifier(stmt, ts.SyntaxKind.DefaultKeyword);
      const name = isDefault ? "default" : stmt.name?.text;
      if (name && stmt.body) out.push({ name, body: stmt.body });
    } else if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) out.push({ name: d.name.text, body: d.initializer });
        else for (const name of boundNames(d.name)) out.push({ name, body: undefined });
      }
    } else if (ts.isExportAssignment(stmt)) {
      const e = stmt.expression;
      out.push({ name: "default", body: ts.isIdentifier(e) ? localBody(sf, e.text) : e });
    } else if (ts.isExportDeclaration(stmt) && !stmt.isTypeOnly) {
      const fromElsewhere = !!stmt.moduleSpecifier;
      if (!stmt.exportClause) {
        out.push({ name: "*", body: undefined });
      } else if (ts.isNamespaceExport(stmt.exportClause)) {
        out.push({ name: stmt.exportClause.name.text, body: undefined });
      } else {
        for (const el of stmt.exportClause.elements) {
          if (el.isTypeOnly) continue;
          const local = (el.propertyName ?? el.name).text;
          out.push({ name: el.name.text, body: fromElsewhere ? undefined : localBody(sf, local) });
        }
      }
    }
  }
  return out;
}

/** "/api/files/[kind]/[id]" for src/app/api/files/[kind]/[id]/route.ts, route groups dropped. */
function routePath(file: string): string {
  const dir = path.dirname(path.relative(path.join(SRC, "app"), file));
  const segments = dir.split(path.sep).filter((s) => s && !(s.startsWith("(") && s.endsWith(")")));
  return "/" + segments.join("/");
}

/** Does an allowlist route entry ("/api/health", or a "/api/cron/*" prefix) cover this route? */
function routeEntryMatches(entry: string, route: string): boolean {
  if (entry.includes("#")) return false;
  if (entry.endsWith("/*")) return route.startsWith(entry.slice(0, -1));
  return entry === route;
}

function routeAllowed(route: string, list: Iterable<string> = ALLOWLIST): boolean {
  return [...list].some((entry) => routeEntryMatches(entry, route));
}

const ROUTE_FILE = /[\\/]route\.(ts|tsx|js|jsx)$/;

const serverActionFiles = sources.filter((f) => hasUseServer(parse(f)));
const routeFiles = sources.filter((f) => ROUTE_FILE.test(f) && f.startsWith(path.join(SRC, "app")));
const routePaths = routeFiles.map(routePath);

test("the guard sees the files it's meant to", () => {
  // If parsing silently broke, everything would pass. The tree has had
  // actions and routes in these places since v1.
  assert.ok(serverActionFiles.some((f) => rel(f) === "src/app/login/actions.ts"), "no use-server files found");
  assert.ok(serverActionFiles.length >= 8, `only ${serverActionFiles.length} use-server files found`);
  assert.ok(routeFiles.some((f) => routePath(f) === "/api/health"), "no route handlers found");
});

test("every exported server action checks the caller, or is allowlisted", () => {
  const missing: string[] = [];
  for (const file of serverActionFiles) {
    const sf = parse(file);
    for (const fn of exportedFunctions(sf)) {
      const key = `${rel(file)}#${fn.name}`;
      if (ALLOWLIST.has(key)) continue;
      if (!fn.body || !callsGuard(fn.body, sf)) missing.push(key);
    }
  }
  assert.deepEqual(
    missing,
    [],
    "These server actions are public HTTP endpoints with no principal check. Call requireUser() or " +
      "requirePortalPrincipal() (or getCurrentUser / getPortalPrincipal), or add them to ALLOWLIST with the reason.",
  );
});

test("every route handler checks the caller, or its route is allowlisted", () => {
  const missing: string[] = [];
  for (const file of routeFiles) {
    const route = routePath(file);
    if (routeAllowed(route)) continue;
    const sf = parse(file);
    for (const fn of exportedFunctions(sf)) {
      // "*" is `export * from`, which could hand over any method unseen.
      if (!HTTP_METHODS.has(fn.name) && fn.name !== "*") continue;
      if (!fn.body || !callsGuard(fn.body, sf)) missing.push(`${route} ${fn.name}`);
    }
  }
  assert.deepEqual(missing, [], "Route handlers with no principal check. Add one, or allowlist the route with the reason.");
});

test("allowlist entries still exist", () => {
  // A renamed action or a deleted route would otherwise leave a stale entry
  // that quietly excuses whatever takes its name later.
  const present = new Set(serverActionFiles.flatMap((f) => exportedFunctions(parse(f)).map((fn) => `${rel(f)}#${fn.name}`)));
  const staleActions = [...ALLOWLIST].filter((a) => a.includes("#") && !present.has(a));
  assert.deepEqual(staleActions, [], "Allowlisted actions that no longer exist");
  const staleRoutes = [...ALLOWLIST].filter((a) => !a.includes("#") && !routePaths.some((r) => routeEntryMatches(a, r)));
  assert.deepEqual(staleRoutes, [], "Allowlisted routes with no route file. Remove them, or move them to PENDING.");
});

test("pending entries don't match a route yet", () => {
  const landed = [...PENDING].filter((p) => routePaths.some((r) => routeEntryMatches(p, r)));
  assert.deepEqual(
    landed,
    [],
    "These routes exist now. Check each handler verifies CRON_SECRET, then move its entry from PENDING to ALLOWLIST.",
  );
});

test("'use server' appears only at the top of a file", () => {
  // An inline "use server" makes a closure into an endpoint that rule 1
  // doesn't see. None exist; keep it that way, or extend this test first.
  const inline: string[] = [];
  for (const file of sources) {
    const sf = parse(file);
    const visit = (n: ts.Node) => {
      if ((ts.isBlock(n) || ts.isModuleBlock(n)) && n.statements.some((s) => isDirective(s, "use server"))) {
        inline.push(rel(file));
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  assert.deepEqual(inline, []);
});

// ---------------------------------------------------------------------------
// Portal code boundaries
// ---------------------------------------------------------------------------

const PORTAL_DIRS = [path.join(SRC, "app", "(portal)"), path.join(SRC, "lib", "portal")];
const portalFiles = PORTAL_DIRS.flatMap((d) => walk(d));

/**
 * Module paths portal code must never import, matched exactly or as a "/"
 * prefix (so "@/lib/session" doesn't cover "@/lib/session-token"; it's listed
 * on its own). Spec §5.1: staff auth, the staff task read helpers, and the
 * properties, deals and QuickBooks modules. Staff sessions and staff pages
 * (which pull in staff services) count as staff auth here.
 */
const STAFF_ONLY = [
  "@/lib/auth",
  "@/lib/session",
  "@/lib/session-token",
  "@/lib/tasks/service",
  // The task attachment service moved out of service.ts (uploads build plan 1.3); its staff half is as staff-only.
  "@/lib/tasks/attachments",
  "@/lib/tasks/queries",
  "@/lib/tasks/bulk",
  "@/lib/properties",
  "@/lib/deals",
  "@/lib/quickbooks",
  "@/app/(app)",
];

const isStaffOnly = (target: string) => STAFF_ONLY.some((m) => target === m || target.startsWith(m + "/"));

/** "@/lib/x" for an import specifier, resolving relative ones against the file. */
function aliasOf(spec: string, file: string): string {
  if (!spec.startsWith(".")) return spec;
  const abs = path.resolve(path.dirname(file), spec);
  return "@/" + path.relative(SRC, abs).split(path.sep).join("/");
}

function importsOf(sf: ts.SourceFile): string[] {
  const specs: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      specs.push(n.moduleSpecifier.text);
    }
    if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))) {
      const arg = n.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) specs.push(arg.text);
    }
    if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference) && ts.isStringLiteral(n.moduleReference.expression)) {
      specs.push(n.moduleReference.expression.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return specs;
}

/**
 * The staff-only imports portal code may make, by file, module and name. The
 * contractor's upload record step (recordPortalAttachment) lives in
 * tasks/service.ts beside the staff one, because both verify the blob with
 * the same helpers (§5.3); the portal's job service may call that one
 * function and nothing else there. Only a plain named import of the listed
 * names counts: a default, namespace, side-effect or re-export of the module
 * still fails.
 */
const PORTAL_IMPORT_EXCEPTIONS: Record<string, Record<string, readonly string[]>> = {
  "src/lib/portal/jobs.ts": { "@/lib/tasks/service": ["recordPortalAttachment"] },
};

/** `import { a, b as c } from "x"` with every imported name in `allowed`, and nothing else in the clause. */
function isAllowedNamedImport(decl: ts.ImportDeclaration, allowed: readonly string[]): boolean {
  const clause = decl.importClause;
  if (!clause || clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return false;
  const names = clause.namedBindings.elements;
  return names.length > 0 && names.every((el) => allowed.includes((el.propertyName ?? el.name).text));
}

/** Target modules of the import declarations in `sf` that a PORTAL_IMPORT_EXCEPTIONS entry excuses. */
function excusedImports(sf: ts.SourceFile, file: string): string[] {
  const allowed = PORTAL_IMPORT_EXCEPTIONS[rel(file)] ?? {};
  const out: string[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const target = aliasOf(stmt.moduleSpecifier.text, file).replace(SOURCE_EXT, "");
    if (Object.hasOwn(allowed, target) && isAllowedNamedImport(stmt, allowed[target])) out.push(target);
  }
  return out;
}

test("portal code never imports staff auth, sessions, task reads, pages, properties, deals or QuickBooks", () => {
  assert.ok(portalFiles.some((f) => rel(f) === "src/lib/portal/session.ts"), "portal files not found");
  const bad: string[] = [];
  for (const file of portalFiles) {
    const sf = parse(file);
    const excused = excusedImports(sf, file);
    for (const spec of importsOf(sf)) {
      const target = aliasOf(spec, file).replace(SOURCE_EXT, "");
      if (!isStaffOnly(target)) continue;
      const i = excused.indexOf(target);
      if (i >= 0) excused.splice(i, 1);
      else bad.push(`${rel(file)} imports ${spec}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("portal import exceptions still match an import", () => {
  // A stale entry would quietly excuse whatever import takes its place later.
  const stale = Object.keys(PORTAL_IMPORT_EXCEPTIONS).filter((f) => {
    const file = path.join(root, f);
    return !fs.existsSync(file) || excusedImports(parse(file), file).length === 0;
  });
  assert.deepEqual(stale, []);
});

test("the import exception accepts only plain named imports of the listed names", () => {
  const sf = ts.createSourceFile(
    "x.ts",
    `import { recordPortalAttachment } from "a"; import { recordPortalAttachment as r } from "a";
     import { patchTask } from "a"; import { recordPortalAttachment, patchTask } from "a";
     import * as svc from "a"; import svc2 from "a"; import "a"; import svc3, { recordPortalAttachment as q } from "a";`,
    ts.ScriptTarget.Latest,
    true,
  );
  assert.deepEqual(
    sf.statements.filter(ts.isImportDeclaration).map((d) => isAllowedNamedImport(d, ["recordPortalAttachment"])),
    [true, true, false, false, false, false, false, false],
  );
});

test("only access-code.ts in portal code mentions units", () => {
  const allowed = new Set(["src/lib/portal/access-code.ts", "src/lib/portal/access-code.test.ts"]);
  const bad = portalFiles.filter((f) => !allowed.has(rel(f)) && fs.readFileSync(f, "utf8").includes("units")).map(rel);
  assert.deepEqual(bad, [], "Property.units holds lockbox codes; read it only through src/lib/portal/access-code.ts");
});

test("the boundary checks catch what they should", () => {
  // Self-test on inline source, so a parser change can't make them vacuous.
  const sf = ts.createSourceFile(
    "x.ts",
    `import { requireUser } from "../auth"; import "@/lib/deals/service"; const q = import("@/lib/quickbooks");
     import { getCurrentUser } from "../../app/(app)/tasks/actions";
     export async function a() { await requireUser(); } export async function b() { return 1; }
     async function c() { return 2; } const d = async () => { await getPortalPrincipal(); };
     export { c, d as e }; export default async function () { return 3; }
     export { f } from "./elsewhere"; export * from "./more"; export type { T } from "./types";
     export const { g, h: [i] } = obj;`,
    ts.ScriptTarget.Latest,
    true,
  );
  const file = path.join(SRC, "lib", "portal", "x.ts");
  assert.deepEqual(
    importsOf(sf).map((s) => aliasOf(s, file)),
    [
      "@/lib/auth",
      "@/lib/deals/service",
      "@/lib/quickbooks",
      "@/app/(app)/tasks/actions",
      "@/lib/portal/elsewhere",
      "@/lib/portal/more",
      "@/lib/portal/types",
    ],
  );
  assert.deepEqual(
    exportedFunctions(sf).map((fn) => [fn.name, !!fn.body && callsGuard(fn.body)]),
    [
      ["a", true],
      ["b", false],
      ["c", false],
      ["e", true],
      ["default", false],
      ["f", false],
      ["*", false],
      ["g", false],
      ["i", false],
    ],
  );
  const defaultExport = ts.createSourceFile("y.ts", `const h = async () => { await requireUser(); }; export default h;`, ts.ScriptTarget.Latest, true);
  assert.deepEqual(
    exportedFunctions(defaultExport).map((fn) => [fn.name, !!fn.body && callsGuard(fn.body)]),
    [["default", true]],
  );
  // A same-file helper counts only when it really checks the caller, and
  // recursion between helpers can't loop forever.
  const helpers = ts.createSourceFile(
    "z.ts",
    `async function viewer() { return getCurrentUser(); }
     async function looksBusy() { return format(); } function format() { return looksBusy(); }
     export async function GET() { await viewer(); } export async function POST() { await looksBusy(); }`,
    ts.ScriptTarget.Latest,
    true,
  );
  assert.deepEqual(
    exportedFunctions(helpers).map((fn) => [fn.name, !!fn.body && callsGuard(fn.body, helpers)]),
    [
      ["GET", true],
      ["POST", false],
    ],
  );

  assert.equal(isStaffOnly("@/lib/session"), true);
  assert.equal(isStaffOnly("@/lib/session-token"), true);
  assert.equal(isStaffOnly("@/lib/tasks/service"), true);
  assert.equal(isStaffOnly("@/lib/tasks/core"), false);
  assert.equal(isStaffOnly("@/app/(app)/financials/page"), true);
  assert.equal(isStaffOnly("@/app/login/_components/auth-frame"), false);

  assert.equal(routeAllowed("/api/cron/outbox", ["/api/cron/*"]), true);
  assert.equal(routeAllowed("/api/cronjob", ["/api/cron/*"]), false);
  assert.equal(routeAllowed("/api/cron/outbox"), false, "a PENDING entry must not excuse a route");
  assert.equal(routeAllowed("/login/reset/submit"), true);
  assert.ok(ROUTE_FILE.test(path.join("app", "api", "x", "route.tsx")) && ROUTE_FILE.test(path.join("app", "api", "x", "route.js")));
  assert.equal(routePath(path.join(SRC, "app", "api", "files", "[kind]", "[id]", "route.ts")), "/api/files/[kind]/[id]");
});
