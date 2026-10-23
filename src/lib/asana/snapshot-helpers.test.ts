import test from "node:test";
import assert from "node:assert/strict";
import { countBy, isAsanaHosted, nextOffset, retryDelayMs, safeFileName, snapshotStamp } from "./snapshot-helpers";

test("nextOffset: reads the offset, null on the last page", () => {
  assert.equal(nextOffset({ next_page: { offset: "abc" } }), "abc");
  assert.equal(nextOffset({ next_page: null }), null);
  assert.equal(nextOffset({}), null);
  assert.equal(nextOffset({ next_page: { offset: "" } }), null);
});

test("retryDelayMs: 429 honors Retry-After, defaults to 30s", () => {
  assert.equal(retryDelayMs(429, "12", 1), 12_000);
  assert.equal(retryDelayMs(429, "0.5", 1), 500);
  assert.equal(retryDelayMs(429, null, 1), 30_000);
  assert.equal(retryDelayMs(429, "soon", 1), 30_000);
});

test("retryDelayMs: 5xx and network errors back off exponentially, capped", () => {
  assert.equal(retryDelayMs(503, null, 1), 1000);
  assert.equal(retryDelayMs(500, null, 3), 4000);
  assert.equal(retryDelayMs(0, null, 2), 2000);
  assert.equal(retryDelayMs(502, null, 5, 10), 16_000);
  assert.equal(retryDelayMs(502, null, 9, 10), 30_000);
});

test("retryDelayMs: client errors and exhausted attempts give up", () => {
  assert.equal(retryDelayMs(400, null, 1), null);
  assert.equal(retryDelayMs(401, null, 1), null);
  assert.equal(retryDelayMs(403, null, 1), null);
  assert.equal(retryDelayMs(404, null, 1), null);
  assert.equal(retryDelayMs(429, "5", 6), null);
  assert.equal(retryDelayMs(500, null, 6), null);
});

test("safeFileName: strips separators and control characters", () => {
  assert.equal(safeFileName("../../etc/passwd"), "_.._etc_passwd");
  assert.equal(safeFileName("a/b\\c:d*e?.jpg"), "a_b_c_d_e_.jpg");
  assert.equal(safeFileName("tab\there.png"), "tab_here.png");
  assert.equal(safeFileName("two  spaces.png"), "two spaces.png");
  // macOS screenshot names carry a narrow no-break space; on disk it becomes a plain one.
  assert.equal(safeFileName("image 2025-05-06 1.36.59 PM.jpg"), "image 2025-05-06 1.36.59 PM.jpg");
});

test("safeFileName: leading dots, empty names, long names keep the extension", () => {
  assert.equal(safeFileName(".hidden"), "hidden");
  assert.equal(safeFileName("   "), "file");
  assert.equal(safeFileName("..."), "file");
  const long = safeFileName(`${"x".repeat(300)}.jpeg`);
  assert.equal(long.length, 150);
  assert.equal(long.endsWith(".jpeg"), true);
});

test("isAsanaHosted: only Asana-stored files", () => {
  assert.equal(isAsanaHosted({ host: "asana" }), true);
  assert.equal(isAsanaHosted({ host: "dropbox" }), false);
  assert.equal(isAsanaHosted({ host: null }), false);
  assert.equal(isAsanaHosted({}), false);
});

test("countBy: counts and sorts descending, null keys grouped", () => {
  const counts = countBy(["a", "b", "a", null, "a", "b"], (x) => x);
  assert.deepEqual(Object.entries(counts), [
    ["a", 3],
    ["b", 2],
    ["(none)", 1],
  ]);
});

test("snapshotStamp: filesystem-safe and sortable", () => {
  assert.equal(snapshotStamp("2026-10-23T14:05:09.123Z"), "2026-10-23T14-05-09Z");
  assert.equal(snapshotStamp("2026-10-23T14:05:09Z"), "2026-10-23T14-05-09Z");
});
