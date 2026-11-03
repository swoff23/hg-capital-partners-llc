import { test } from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../../next.config";

test("a page left under 30 seconds ago opens from the router's memory (performance plan, fix 10)", () => {
  // Next 15+ defaults dynamic pages to 0 s, so every revisit waits on the server. Every write is a Server
  // Action whose service calls revalidatePath, which clears the whole client cache, so your own edits still show.
  assert.equal(nextConfig.experimental?.staleTimes?.dynamic, 30);
  // The static period (prefetched loading screens) keeps Next's default.
  assert.equal(nextConfig.experimental?.staleTimes?.static, undefined);
});
