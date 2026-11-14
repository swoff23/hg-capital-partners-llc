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
  // The sheet is mounted on "no login yet" alone. A tab loaded before the contractor was archived can have it open
  // when the server refuses; the refresh that follows must not unmount it, or the refusal never shows.
  const mount = /\{([^{}]*?) && \(\s*<CreateLoginSheet/.exec(card)?.[1];
  assert.equal(mount, "!account", "the sheet's mount condition doesn't read archived or the offers");
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

test("N2: a chunk that didn't load gets Reload on the error screen, which a deploy that moved the chunk needs", () => {
  const screen = read("./error-screen.tsx");
  assert.match(screen, /const reload = isChunkLoadError\(error\);/);
  assert.match(screen, /onClick=\{\(\) => \(reload \? reloadPage\(\) : retry\(\)\)\}/);
  assert.match(screen, /\{reload \? RELOAD_LABEL : "Try again"\}/);
});

test("N2: files held for the upload code read paused on the tile and in the bar, with Reload only where it loses nothing", () => {
  const up = read("./media-uploader.tsx");
  // The bar's way to a reload is the engine's: null where a file's row isn't in the outbox (canReload).
  assert.match(up, /reload: uploads\.some\(\(u\) => u\.paused\) && engine\.canReload\(\) \? engine\.reload : null,/);
  assert.match(up, /if \(held\.some\(\(u\) => u\.paused\)\) \{[\s\S]*?reload \? UPLOADS_PAUSED_LINE : UPLOADS_RETRYING_LINE[\s\S]*?\{reload && \([\s\S]*?Reload\s*<\/button>/, "the bar line");
  assert.match(up, /case "waiting":\s*return u\.paused \? "paused" : "waiting for signal";/, "the tile's label");
  assert.match(up, /u\.paused \? <Pause[^>]*\/> : <WifiOff/, "and its mark");
  assert.match(read("../app/(app)/properties/[id]/listing-photos.tsx"), /u\.paused\s*\? "paused"\s*: "waiting for signal"/);
  assert.match(read("./files-list.tsx"), /u\.paused\s*\? "Paused"\s*: "Waiting for signal"/);
});

test("N2: the upload code is fetched when the queue mounts, and the queue can reload the page", () => {
  const queue = read("./upload-queue.tsx");
  assert.match(queue, /useEffect\(\(\) => preloadTransfer\(\), \[\]\);/);
  assert.match(queue, /reload: reloadPage,/);
  assert.match(queue, /export function preloadTransfer\(\): void \{\s*warmWhenIdle\(/, "never while offline");
});

test("call 5: Create login and Change login email put every refusal that isn't about the address on the sheet's own line", () => {
  const card = read("../app/(app)/contractors/[id]/portal-access-card.tsx");
  // Both sheets: only a FieldError on `email` marks the field, and the rest of run.error is the FormSheet's error line.
  assert.equal(card.match(/const addressRefusal = run\.fieldErrors\?\.email;/g)?.length, 2);
  assert.equal(card.match(/fieldErrors=\{run\.fieldErrors\}\s*error=\{addressRefusal \? undefined : run\.error\}/g)?.length, 2);
  assert.equal(card.match(/\(tried && problem\) \|\| addressRefusal \|\| undefined/g)?.length, 2);
  assert.doesNotMatch(card, /run\.error \? \{ email: run\.error \}/, "no refusal is handed to the Email field by default");
  // The service's own address refusals stay field errors on `email`.
  const accounts = read("../lib/portal/accounts.ts");
  assert.match(accounts, /throw new FieldError\(\{ email: "Enter a valid email\." \}\)/);
  assert.match(accounts, /throw new FieldError\(\{ email: "Enter a full email, like name@example\.com\." \}\)/);
  assert.match(accounts, /err\.code === "P2002"\) \{\s*throw new FieldError\(\{ email: "Another contractor already uses that email\." \}\)/);
});

test("call 3: a job's page, loading screen and error screen draw one header, and the shared error screen is untouched", () => {
  const dir = "../app/(portal)/p/jobs/[id]/";
  for (const file of ["loading.tsx", "error.tsx"]) assert.match(read(dir + file), /<JobHeader \/>/, file);
  // The loaded page adds Text to my crew, while the job is open, before Call HG.
  assert.match(read(dir + "page.tsx"), /<JobHeader actions=\{active && <CrewText taskId=\{job\.id\} openOnLoad=\{ask === "share"\} \/>\} \/>/);
  assert.doesNotMatch(read(dir + "page.tsx"), /<header/);
  assert.doesNotMatch(read(dir + "loading.tsx"), /<header/);
  const header = read(dir + "_components/job-header.tsx");
  assert.match(header, /<BackLink fallback="\/p" label="My jobs"/);
  assert.match(header, /\{actions\}\s*\{tel && \(/);
  assert.match(read(dir + "error.tsx"), /<ErrorScreen \{\.\.\.props\} \/>/);
  // My jobs keeps the shared boundary: a link to itself would clear nothing there.
  assert.doesNotMatch(read("../app/(portal)/p/error.tsx"), /JobHeader|Back to my jobs/);
  assert.doesNotMatch(read("./error-screen.tsx"), /My jobs|JobHeader/);
});

test("call 1: the away toast's place reaches the toast as its second-tone detail", () => {
  assert.match(read("./upload-queue.tsx"), /message: n\.message,\s*detail: n\.detail,/);
  assert.match(read("../lib/attachments/engine.ts"), /message: line\.text,\s*\.\.\.\(line\.detail \? \{ detail: line\.detail \} : \{\}\),/);
});
