import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import nextConfig from "../../next.config";

// The matcher Next itself runs over `source` (it ships without types).
const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as {
  pathToRegexp: (source: string, keys: unknown[], options: object) => RegExp;
};

/**
 * The headers next.config.ts sends, read the way Next matches them: every
 * rule whose `source` matches the path, the last one winning a shared key.
 */
async function headersFor(path: string): Promise<Record<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const out: Record<string, string> = {};
  for (const rule of rules) {
    if (!pathToRegexp(rule.source, [], {}).test(path)) continue;
    for (const h of rule.headers) out[h.key.toLowerCase()] = h.value;
  }
  return out;
}

test("app pages are never sniffed and never framed by another site", async () => {
  // A HEAD on a task page came back with no X-Frame-Options, no CSP and no nosniff.
  for (const path of ["/", "/tasks/abc", "/properties/abc", "/p/jobs/abc", "/login", "/rentals"]) {
    const h = await headersFor(path);
    assert.equal(h["x-content-type-options"], "nosniff", path);
    assert.equal(h["x-frame-options"], "SAMEORIGIN", path);
    assert.equal(h["content-security-policy"], "frame-ancestors 'self'", path);
  }
});

test("the file routes keep their own CSP, and the media viewer can still frame a PDF from this origin", async () => {
  const h = await headersFor("/api/files/task/abc");
  assert.equal(h["content-security-policy"], undefined);
  assert.equal(h["x-frame-options"], "SAMEORIGIN");
  assert.equal(h["x-content-type-options"], "nosniff");
});

test("the reset page keeps its no-referrer and no-store", async () => {
  const h = await headersFor("/login/reset");
  assert.equal(h["referrer-policy"], "no-referrer");
  assert.equal(h["cache-control"], "no-store");
  assert.equal(h["x-frame-options"], "SAMEORIGIN");
});
