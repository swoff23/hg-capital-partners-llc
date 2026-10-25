import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { brandTokens } from "./brand-tokens";
import { monogramRadius, monogramSvg } from "./monogram-art";

function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, "src", "app", "icon.svg"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error("could not locate src/app/icon.svg above " + process.cwd());
    dir = up;
  }
}

test("src/app/icon.svg is the monogram drawn from the brand tokens", () => {
  const file = fs.readFileSync(path.join(repoRoot(), "src", "app", "icon.svg"), "utf8");
  assert.equal(
    file,
    monogramSvg() + "\n",
    'icon.svg is stale. Rewrite it: npx tsx -e \'import { monogramSvg } from "./src/lib/monogram-art"; process.stdout.write(monogramSvg() + "\\n")\' > src/app/icon.svg',
  );
});

test("the favicon is the rounded ink tile with gold letters; apple-icon's bleed drops the corners and the edge", () => {
  const icon = monogramSvg();
  assert.ok(icon.includes(`fill="${brandTokens.inkTile}"`));
  assert.ok(icon.includes(`fill="${brandTokens.gold}"`));
  assert.ok(icon.includes(' rx="22"'));
  const bleed = monogramSvg({ bleed: true });
  assert.ok(!bleed.includes("rx="));
  assert.ok(!bleed.includes("<style>"));
});

test("the dark-ground edge is a 2px stroke clipped to the tile, so 1px lands inside on every side", () => {
  const icon = monogramSvg();
  assert.match(icon, /<clipPath id="tile"><rect width="100" height="100" rx="22"\/><\/clipPath>/);
  assert.match(icon, /<rect class="edge"[^>]* stroke-width="2" vector-effect="non-scaling-stroke" clip-path="url\(#tile\)"\/>/);
  assert.ok(!monogramSvg({ darkEdge: false }).includes("clipPath"));
});

test("the radius is 22% rounded to whole pixels", () => {
  assert.deepEqual([16, 24, 32, 180, 512].map(monogramRadius), [4, 5, 7, 40, 113]);
  // A raster gets the whole-pixel radius in the 100-unit viewBox: 113 of 512.
  assert.ok(monogramSvg({ px: 512, darkEdge: false }).includes(' rx="22.07"'));
});
