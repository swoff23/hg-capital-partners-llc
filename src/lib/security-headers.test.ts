import test from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../../next.config";

test("every page refuses another site's frame and is never sniffed as another type", async () => {
  const rules = (await nextConfig.headers?.()) ?? [];
  const all = rules.find((r) => r.source === "/:path*");
  assert.ok(all, "a rule for every path");
  const value = (key: string) => all.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
  assert.equal(value("X-Frame-Options"), "SAMEORIGIN");
  assert.equal(value("X-Content-Type-Options"), "nosniff");
  // No CSP here: the files routes' own sandbox policy must stand alone (lib/attachments/headers.ts).
  assert.equal(value("Content-Security-Policy"), undefined);
});
