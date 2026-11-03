import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * What the browser downloads (docs/specs/performance.md, fix 2 and 5): a file a
 * client component reaches through static imports ships to every page that
 * draws it. This walks those imports from every "use client" file and fails
 * when one reaches a package that is built for the server or loads on demand:
 *
 *  - zod, which validates form posts on the server (the schemas live in files
 *    like lib/tasks/repeat-schema.ts, and the browser takes the hand-written
 *    twin beside them),
 *  - Prisma's client, a database library; types come in with `import type`,
 *  - the Blob client, which the upload queue fetches when idle or with the
 *    first file (components/upload-queue.tsx `transfer` and `preloadTransfer`,
 *    lib/attachments/lazy-transfer.ts).
 *
 * Type-only imports and `import()` are not followed: they ship nothing, or ship
 * as a chunk of their own. A "use server" file is not followed either; the
 * browser gets a stub that posts to it.
 */

const SRC = path.join(__dirname, "..");
const FORBIDDEN = [
  { match: (spec: string) => spec === "zod" || spec.startsWith("zod/"), why: "zod is server-only; split the schema from the helpers the browser takes" },
  { match: (spec: string) => spec === "@prisma/client" || spec.startsWith("@prisma/client/"), why: "Prisma is server-only; use `import type` for its types" },
  { match: (spec: string) => spec === "@vercel/blob/client", why: "the Blob client loads on demand (upload-queue.tsx `transfer`, lib/attachments/lazy-transfer.ts)" },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

type Parsed = { directive: "client" | "server" | null; imports: string[] };

const parsedCache = new Map<string, Parsed>();

function parse(file: string): Parsed {
  const cached = parsedCache.get(file);
  if (cached) return cached;
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let directive: Parsed["directive"] = null;
  const imports: string[] = [];
  for (const stmt of source.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression)) {
      if (stmt.expression.text === "use client") directive = "client";
      if (stmt.expression.text === "use server") directive = "server";
      continue;
    }
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const clause = stmt.importClause;
      if (clause?.isTypeOnly) continue;
      const named = clause?.namedBindings;
      const onlyTypes =
        clause !== undefined &&
        !clause.name &&
        named !== undefined &&
        ts.isNamedImports(named) &&
        named.elements.length > 0 &&
        named.elements.every((e) => e.isTypeOnly);
      if (!onlyTypes) imports.push(stmt.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      if (stmt.isTypeOnly) continue;
      const exported = stmt.exportClause;
      const onlyTypes = exported !== undefined && ts.isNamedExports(exported) && exported.elements.length > 0 && exported.elements.every((e) => e.isTypeOnly);
      if (!onlyTypes) imports.push(stmt.moduleSpecifier.text);
    }
  }
  const parsed = { directive, imports };
  parsedCache.set(file, parsed);
  return parsed;
}

/** The first chain of files from `root` that imports a forbidden package, or null. */
function findForbidden(root: string): { chain: string[]; why: string } | null {
  const seen = new Set<string>();
  const visit = (file: string, chain: string[]): { chain: string[]; why: string } | null => {
    if (seen.has(file)) return null;
    seen.add(file);
    const { directive, imports } = parse(file);
    if (directive === "server" && file !== root) return null;
    for (const spec of imports) {
      const bad = FORBIDDEN.find((f) => f.match(spec));
      if (bad) return { chain: [...chain, file, spec], why: bad.why };
      const next = resolveImport(file, spec);
      if (next) {
        const found = visit(next, [...chain, file]);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(root, []);
}

test("no client component reaches zod, Prisma or the Blob client through its imports", () => {
  const rel = (f: string) => path.relative(SRC, f);
  const roots = walk(SRC).filter((f) => parse(f).directive === "client");
  assert.ok(roots.length > 50, "found the client components");
  const failures: string[] = [];
  const reported = new Set<string>();
  for (const root of roots) {
    const found = findForbidden(root);
    if (!found) continue;
    // One line per offending file, not one per component that reaches it.
    const offender = found.chain[found.chain.length - 2];
    if (reported.has(offender)) continue;
    reported.add(offender);
    failures.push(`${found.chain.map((c) => (c.startsWith(SRC) ? rel(c) : c)).join(" > ")}\n    ${found.why}`);
  }
  assert.deepEqual(failures, [], `The browser would download a server-only package:\n  ${failures.join("\n  ")}`);
});

/**
 * Code that loads on first use stays that way: these files are fetched with
 * `lazyModule(() => import(...))` (lib/lazy-module.ts), and one static import
 * anywhere puts them back in that page's first download. Each entry lists the
 * files allowed to import it statically, because they draw it at first render.
 */
const LAZY: { file: string; staticImporters: string[]; why: string }[] = [
  { file: "components/date-panel.tsx", staticImporters: [], why: "the calendar loads with the first open (due-date-picker.tsx DatePanel)" },
  {
    file: "components/date-field.tsx",
    staticImporters: [
      "app/(app)/properties/[id]/listing-sheet.tsx",
      "app/(app)/templates/[id]/apply/apply-flow.tsx",
      "app/(marketing)/residents/moving-in/move-in-form.tsx",
    ],
    why: "the typed field loads where a form draws it; a page of chips never needs it",
  },
  { file: "components/lightbox.tsx", staticImporters: ["app/(app)/properties/[id]/listing-photos.tsx"], why: "the viewer loads with the first open (lightbox-lazy.tsx)" },
  { file: "app/(app)/properties/[id]/listing-sheet.tsx", staticImporters: [], why: "the listing editor loads with the first open" },
  { file: "app/(app)/properties/[id]/unit-sheet.tsx", staticImporters: [], why: "the unit editor loads with the first open" },
];

test("what loads on first use is imported only through import(), apart from the files that draw it at once", () => {
  const rel = (f: string) => path.relative(SRC, f);
  const files = walk(SRC);
  const failures: string[] = [];
  for (const lazy of LAZY) {
    const target = path.join(SRC, lazy.file);
    assert.ok(fs.existsSync(target), `${lazy.file} exists`);
    const importers = files
      .filter((f) => f !== target && parse(f).imports.some((spec) => resolveImport(f, spec) === target))
      .map(rel)
      .sort();
    const extra = importers.filter((f) => !lazy.staticImporters.includes(f));
    for (const f of extra) failures.push(`${f} imports ${lazy.file} statically (${lazy.why})`);
  }
  assert.deepEqual(failures, [], `Code meant to load on first use is in the page again:\n  ${failures.join("\n  ")}`);
});
