import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * The draft screens' rules that live in JSX and page reads, where a unit test can't render them: each is held by the
 * line that makes it so, and the test fails when that line goes. The words and the grouping are tested beside them
 * (draft-copy.test.ts, needs-you.test.ts).
 */
const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, ...p), "utf8");

test("a discarded draft's page is a 404: the page reads its task through taskPageWhere", () => {
  const page = read("[id]", "page.tsx");
  assert.match(page, /findFirst\(\{\s*where: taskPageWhere\(id\)/);
  assert.doesNotMatch(page, /task\.findUnique\(/);
  assert.match(page, /if \(!row\) notFound\(\)/);
});

test("opening a draft writes no Recent row", () => {
  const page = read("[id]", "page.tsx");
  assert.match(page, /task\.status !== "DRAFT" && !\(await isActionRender\(\)\)\) after\(\(\) => recordView\(/);
});

test("the lockbox row never tells a partner the contractor sees the code while the task is a draft", () => {
  const page = read("[id]", "page.tsx");
  assert.match(page, /contractorSees: showsLockbox && !isDraft/);
});

test("a draft's menu is Copy link alone: Delete and its separator wait for a real task", () => {
  const header = read("[id]", "header.tsx");
  assert.match(header, /\{!draft && <MenuSeparator \/>\}/);
  assert.match(header, /\{!draft && \(\s*<MenuItem variant="destructive"/);
  assert.match(read("[id]", "view.tsx"), /<MoreMenu taskId=\{task\.id\} title=\{task\.title\} draft=\{!!p\.draft\}( canceled=\{task\.status === "CANCELED"\})? \/>/);
});

test("Add task gives focus to the title once its banner is gone", () => {
  const banner = read("[id]", "draft-banner.tsx");
  assert.match(banner, /added\.current = true/);
  assert.match(banner, /if \(added\.current\) focusPageTitle\(\)/);
});

test("a draft row's layout changes sit behind its own flag and leave every other row's classes as they were", () => {
  const row = read("task-row.tsx");
  // The one flag, and only draft rows (actions at the end) set it.
  assert.match(row, /const endRow = Boolean\(actions\) && actionsAtEnd;/);
  // Every new class is on an endRow branch; the old one-line and wrapped-actions branches are untouched.
  assert.match(row, /endRow \? "grid grid-cols-\[minmax\(0,1fr\)_auto\] items-center gap-x-3 gap-y-0 lg:@min-\[60rem\]:flex" : "flex items-start gap-3"/);
  assert.match(row, /actions && !actionsAtEnd && "flex-wrap"/);
  assert.match(row, /actionsAtEnd \? "col-start-2" : "w-full justify-end"/);
  // The date is text on a draft, from 60rem; the picker stays for every other row.
  assert.match(row, /const dateChip = endRow \? \(/);
  assert.match(row, /No date/);
});

test("the draft heading keeps My drafts, its count and both buttons on one row down to 320", () => {
  const sections = read("draft-sections.tsx");
  assert.match(sections, /<div className="flex items-center gap-1\.5">\s*<Button variant="ghost" size="sm" className="-ml-2\.5"/);
});

test("draft rows are focus-safe: the list marks its rows for draft-focus and the context moves focus before a row leaves", () => {
  assert.match(read("draft-sections.tsx"), /data-draft-rows=""/);
  assert.match(read("task-list-context.tsx"), /pressed = pressedControl\(\);\s*const movedTo = keepFocusBeyond\(new Set\(change\.ids\)\);\s*if \(pressed\) pressed\.movedTo = movedTo;/);
});

test("a refused Add or Add all gives focus back to the pressed control once its row is back; the page's Add task too", () => {
  const ctx = read("task-list-context.tsx");
  assert.match(ctx, /else \{\s*toast\(\{ message: result\.error \}\);\s*refused\(\);/);
  assert.match(ctx, /refused\(\);\s*const \{ taskId, message \} = out\.refused;/);
  assert.match(ctx, /focusPressed\(refocus\.current\)\) refocus\.current = null;\s*\}, \[drafts\]\);/);
  const banner = read("[id]/draft-banner.tsx");
  assert.match(banner, /failed: \(\) => \{\s*refused\.current = true;/);
  assert.match(banner, /querySelector<HTMLElement>\("button:last-of-type"\)\?\.focus/);
});

test("Settings > Claude: Connect stays focusable while it connects, focus returns after the steps and a Disconnect, rows reserve the button's height", () => {
  const rows = read("..", "settings", "claude", "claude-rows.tsx");
  assert.match(rows, /if \(connecting\) return;/);
  assert.match(rows, /aria-busy=\{connecting \|\| undefined\}/);
  assert.doesNotMatch(rows, /pending=\{connecting\}/);
  assert.match(rows, /askFocus\(r\.ok \? \{ userId, connected: false \} : \{ userId, connected: true \}\)/);
  assert.match(rows, /requestAnimationFrame\(\(\) => askFocus\(focusFor\.current\)\)/);
  assert.match(rows, /flex min-h-8 items-center[^"]*pointer-coarse:min-h-11/);
  assert.match(rows, /toast\(\{ message: r\.error \}\);\s*\/\/[^\n]*\n\s*router\.refresh\(\);/);
});
