import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

/* PublicSurface (components/public/surface.tsx) sets React Aria's portal
   container through `react-aria/PortalProvider`, and react-aria-components'
   Popover and Modal read it through `react-aria/Overlay`. They share the
   provider's context only while both resolve the same react-aria copy. A
   react-aria-components bump that leaves the direct react-aria pin behind
   installs a second copy, and public overlays quietly portal to <body> again,
   outside the public ground (docs/specs/design-foundation.md, section 5.5). */

const root = resolve(import.meta.dirname, "../..");
const fromRoot = createRequire(resolve(root, "package.json"));
const racManifest = fromRoot.resolve("react-aria-components/package.json");

test("the direct react-aria pin is the version react-aria-components asks for", () => {
  const ours = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).dependencies["react-aria"];
  const theirs = JSON.parse(readFileSync(racManifest, "utf8")).dependencies["react-aria"];
  assert.equal(ours, theirs, "Pin react-aria in package.json to the exact version react-aria-components depends on.");
});

test("react-aria-components resolves the same react-aria copy the app imports", () => {
  const fromRac = createRequire(racManifest);
  assert.equal(fromRac.resolve("react-aria/package.json"), fromRoot.resolve("react-aria/package.json"));
});
