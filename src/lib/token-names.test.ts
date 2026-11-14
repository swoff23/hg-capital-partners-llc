import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findOldNames } from "../../scripts/token-renames.mjs";
import { filesUnder, lineAndColumn, ROOT, scopeFiles } from "../../scripts/rename-tokens.mjs";

/* HG's color tokens took shadcn's names on Nov 14 (docs/specs/design-foundation.md,
   sections 3 and 6.2). Lint rejects an old name in app code, but it doesn't read
   CSS, tests or the docs, so this does: an old name there draws nothing, or
   teaches the next person a token that's gone.

   The files are the rename script's scope minus app code: CSS, tests, the docs
   and CLAUDE.md, plus tests/. The script's skips apply (docs/uiux-review/, the
   design-foundation spec, and the tests that import token-renames.mjs as
   fixtures). tests/devices/gallery-reporter.ts styles its own report page with
   its own --line and --muted, so it's skipped too. */

const OWN_NAMES = ["tests/devices/gallery-reporter.ts"];

function checkedFiles(): string[] {
  const fromScope = scopeFiles().filter((rel: string) => /\.css$|\.test\.tsx?$|\.md$/.test(rel));
  const fromTests = filesUnder("tests", (name: string) => /\.(?:ts|tsx|json)$/.test(name)).filter(
    (rel: string) => !OWN_NAMES.includes(rel),
  );
  return [...fromScope, ...fromTests];
}

test("CSS, tests and the docs use the new color names", () => {
  const files = checkedFiles();
  assert.ok(files.includes("src/app/globals.css"), "globals.css is checked");
  assert.ok(files.includes("docs/brand-guidelines.md"), "the brand doc is checked");
  assert.ok(files.includes("CLAUDE.md"), "CLAUDE.md is checked");
  assert.ok(!files.includes("src/lib/token-names.test.ts"), "this file's own patterns aren't checked");

  const hits: string[] = [];
  for (const rel of files) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    for (const hit of findOldNames(text)) {
      const { line } = lineAndColumn(text, hit.index);
      hits.push(`${rel}:${line}  ${hit.match} -> ${hit.replacement}`);
    }
  }
  const shown = hits.slice(0, 40).join("\n");
  const more = hits.length > 40 ? `\n...and ${hits.length - 40} more` : "";
  assert.equal(
    hits.length,
    0,
    `${hits.length} old color names. Run node scripts/rename-tokens.mjs to rename them.\n${shown}${more}`,
  );
});
