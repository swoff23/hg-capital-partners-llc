import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* Printing from the dark theme restates the light values (globals.css,
   @media print; docs/specs/charts.md 2.8). This keeps the copy honest: every
   value it sets is the light block's value for that token. */

function hexTokens(body: string): Record<string, string> {
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Record<string, string> = {};
  for (const [, name, value] of clean.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    if (/^#[0-9a-f]{3,8}$/i.test(value.trim())) out[name] = value.trim().toLowerCase();
  }
  return out;
}

test("printing from dark takes the light theme's values", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
  const light = css.match(/^:root \{([\s\S]*?)^\}/m);
  assert.ok(light, "no light :root block");
  const print = css.match(/@media print \{[\s\S]*?^ {2}:root\[data-theme="dark"\] \{([\s\S]*?)^ {2}\}/m);
  assert.ok(print, "no dark override inside @media print");
  const lightTokens = hexTokens(light[1]);
  const printTokens = hexTokens(print[1]);
  assert.ok(Object.keys(printTokens).length >= 20, "the print block restates the light colors");
  for (const [name, hex] of Object.entries(printTokens)) {
    assert.equal(hex, lightTokens[name], `${name} in print differs from the light block`);
  }
  // Every color the dark block changes and a page can show is restated, so nothing dark leaks onto paper.
  for (const name of ["--canvas", "--surface", "--fill-1", "--line", "--line-strong", "--fg-1", "--fg-2", "--fg-3", "--chart-1", "--danger", "--warn", "--ok"]) {
    assert.ok(name in printTokens, `${name} is missing from the print block`);
  }
});
