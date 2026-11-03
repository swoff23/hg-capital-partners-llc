import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Fixes from the Nov 3 landing's verify pass that live in components, which
 * have no test setup of their own: read from the source, as
 * deals/page-wiring.test.ts does. The rules they call are tested in
 * record-menu-focus.test.ts and lazy-module.test.ts.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("a rail row with an anchor lands below the sticky app bar, as the activity and comment anchors do", () => {
  // The Portfolio strip's 'Leaves out 765 Prospect Avenue' link (#value) landed with the Value row under the bar.
  const src = read("./rail.tsx");
  assert.match(src, /\bid && "scroll-mt-\[calc\(var\(--app-bar-h\)\+1rem\)\]",/);
  assert.match(read("./activity-timeline.tsx"), /const ANCHOR = "scroll-mt-\[calc\(var\(--app-bar-h\)\+1rem\)\]";/);
});

test("Restore on the archived notice hands focus to the record's ⋯ button; the menu's own Restore already keeps it", () => {
  const src = read("./record-archive.tsx");
  assert.match(src, /onClick=\{\(\) => change\(false, \(\) => focusRecordMenu\(\)\)\}/);
  assert.match(src, /aria-label="More actions"\s*data-record-menu=""/);
  assert.match(src, /succeeded,\s*\}\);/);
  // The menu's items call change(archived) with no handoff: the menu returns focus to its trigger itself.
  assert.match(src, /onAction=\{\(\) => change\(false\)\}/);
  assert.match(src, /onAction=\{\(\) => change\(true\)\}/);
});

test("a sheet whose code can't be fetched closes with a toast instead of replacing the record page", () => {
  // Before, useLazyModule threw to the page boundary: the property page became 'Something went wrong'.
  const hook = read("./use-lazy-module.ts");
  assert.match(hook, /failed: \(error\) => \(answer\.current \? answer\.current\(error\) : setFailure\(\{ error \}\)\),/);
  for (const [file, sheet] of [
    ["../app/(app)/properties/[id]/edit-units.tsx", "unitSheet"],
    ["../app/(app)/properties/[id]/edit-listings.tsx", "listingSheet"],
  ] as const) {
    const src = read(file);
    assert.match(
      src,
      new RegExp(`useLazyModule\\(${sheet}, sheet !== null, \\(\\) => \\{\\s*setSheet\\(null\\);\\s*setIsOpen\\(false\\);\\s*run\\.toast\\(openFailedToast\\(\\)\\);\\s*\\}\\);`),
      `${file} closes the sheet and toasts`,
    );
    // And the code is fetched ahead of the tap: when the page is idle, and at hover, focus and press.
    assert.match(src, new RegExp(`useEffect\\(\\(\\) => warmWhenIdle\\(${sheet}\\), \\[\\]\\);`), `${file} warms when idle`);
    assert.match(src, new RegExp(`onIntent=\\{${sheet}\\.warm\\}`), `${file} warms at the add row`);
    assert.match(src, new RegExp(`\\{\\.\\.\\.warmOnIntent\\(${sheet}\\)\\}`), `${file} warms at the row that opens it`);
    assert.match(src, new RegExp(`onPressStart=\\{${sheet}\\.warm\\}`), `${file} warms at the row's menu`);
  }
});
