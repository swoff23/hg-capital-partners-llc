import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The task session's land-nov3 findings that live in components and pages,
 * which have no test setup of their own: read from the source, as
 * component-wiring.test.ts does. The rules they call are tested where they
 * live (access-state.test.ts loginOffers, lazy-module.test.ts,
 * lazy-transfer.test.ts, upload-code.test.ts).
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("N3(a), (b): an archived contractor's card shows neither Create login nor Restore access", () => {
  const card = read("../app/(app)/contractors/[id]/portal-access-card.tsx");
  assert.match(card, /const offers = loginOffers\(account, archived\);/);
  assert.match(card, /\{offers\.create && \(\s*<Button[\s\S]*?Create login\s*<\/Button>\s*\)\}/, "the button");
  assert.match(card, /\{offers\.create && \(\s*<CreateLoginSheet/, "and its sheet");
  assert.match(card, /account\.restorable \? \(\s*offers\.restore && \(\s*<Button[\s\S]*?Restore access\s*<\/Button>/);
  assert.match(read("../app/(app)/contractors/[id]/page.tsx"), /archived=\{!!c\.archivedAt\}/);
});

test("N1: the viewer whose code didn't load closes with one toast, and its code is warmed when the page is idle", () => {
  const lazy = read("./lightbox-lazy.tsx");
  assert.match(lazy, /useLazyModule\(viewer, wanted, \(\) => \{\s*setWanted\(false\);\s*setFailed\(true\);\s*onOpenChange\(false\);\s*toast\(openFailedToast\(\)\);\s*\}\);/);
  // That open asks no more until it has closed, so a parent that hasn't closed it yet can't toast twice.
  assert.match(lazy, /if \(!props\.isOpen && failed\) setFailed\(false\);\s*if \(props\.isOpen && !wanted && !failed\) setWanted\(true\);/);
  assert.match(lazy, /useEffect\(\(\) => warmWhenIdle\(viewer\), \[\]\);/);
});

test("N1: the portal has an error screen, the app's, so a page that throws doesn't fall to Next's blank one", () => {
  assert.match(read("../app/(portal)/p/error.tsx"), /<ErrorScreen \{\.\.\.props\} \/>/);
  assert.match(read("../app/(app)/error.tsx"), /return <ErrorScreen \{\.\.\.props\} \/>;/);
});

test("N2: a chunk that didn't load gets Reload on the error screen, since Try again can't bring it back", () => {
  const screen = read("./error-screen.tsx");
  assert.match(screen, /const reload = isChunkLoadError\(error\);/);
  assert.match(screen, /onClick=\{\(\) => \(reload \? reloadPage\(\) : retry\(\)\)\}/);
  assert.match(screen, /\{reload \? RELOAD_LABEL : "Try again"\}/);
});

test("N2: the upload code is fetched when the queue mounts, and the queue can reload the page", () => {
  const queue = read("./upload-queue.tsx");
  assert.match(queue, /useEffect\(\(\) => preloadTransfer\(\), \[\]\);/);
  assert.match(queue, /reload: reloadPage,/);
  assert.match(queue, /export function preloadTransfer\(\): void \{\s*warmWhenIdle\(/, "never while offline");
});
