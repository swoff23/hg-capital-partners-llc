import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { brandTokens, cssVarName, type BrandToken } from "./brand-tokens";

function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, "src", "app", "globals.css"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error("could not locate src/app/globals.css above " + process.cwd());
    dir = up;
  }
}

/** Every hex token in globals.css's first, light :root block, as { "--fill-1": "#f2f0ec" }. */
function lightHexTokens(): Record<string, string> {
  const css = fs.readFileSync(path.join(repoRoot(), "src", "app", "globals.css"), "utf8");
  const block = css.match(/^:root \{([\s\S]*?)^\}/m);
  assert.ok(block, "globals.css has no light `:root {` block at the start of a line");
  const body = block[1].replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    if (/^#[0-9a-f]{3,8}$/i.test(value.trim())) tokens[name] = value.trim().toLowerCase();
  }
  return tokens;
}

test("cssVarName: camelCase to the CSS custom property", () => {
  assert.equal(cssVarName("fill1"), "--fill-1");
  assert.equal(cssVarName("lineStrong"), "--line-strong");
  assert.equal(cssVarName("toastFg2"), "--toast-fg-2");
  assert.equal(cssVarName("dangerFillHover"), "--danger-fill-hover");
});

test("brandTokens mirrors every hex token on :root in globals.css, value for value", () => {
  const css = lightHexTokens();
  const mirror = Object.fromEntries(
    (Object.keys(brandTokens) as BrandToken[]).map((t) => [cssVarName(t), brandTokens[t].toLowerCase()]),
  );
  // Same names both ways, so a token added on one side only fails too.
  assert.deepEqual(Object.keys(mirror).sort(), Object.keys(css).sort());
  assert.deepEqual(mirror, css);
});
