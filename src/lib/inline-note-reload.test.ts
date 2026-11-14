import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decideInlineEdit } from "./inline-edit";

/**
 * Design call 8 (Nov 14): the browser asks before a reload or a closed tab only for a multi-line note with unsaved
 * text, through the test the inline field already has for its in-app links. One-line facts and headings save when
 * focus leaves them and never ask. InlineField is a client component node:test can't render, so its source is
 * read, as composer-held-focus.test.ts does.
 */

const field = readFileSync(join(__dirname, "..", "components", "inline-field.tsx"), "utf8");

test("the reload question is on for exactly what holds the in-app links: a changed note open in place", () => {
  assert.match(field, /import \{ useLeaveWarning \} from "@\/components\/use-leave-warning";/);
  // One test, two guards: the LeaveGuard's hold and the browser's own question read the same `dirty`.
  assert.match(
    field,
    /const dirty = mode === "inline" && multiline && decideInlineEdit\(kind, draft, value, \{\}\)\.kind !== "same";\s*useHoldLeave\(dirty \? \{[^\n]*\} : null\);\s*(\/\/[^\n]*\s*)*useLeaveWarning\(dirty\);/,
  );
  // Nothing else in the field asks: a one-line fact, a heading and a switch save on blur or on the tap.
  assert.equal(field.match(/useLeaveWarning\(/g)?.length, 1);
});

test("the test behind it: typed text that differs asks, the stored text retyped or only spaces added does not", () => {
  const dirty = (draft: string, stored: string) => decideInlineEdit("multiline", draft, stored, {}).kind !== "same";
  assert.equal(dirty("Call the tenant before Friday", ""), true);
  assert.equal(dirty("Gate code 4410, side door", "Gate code 4410"), true);
  assert.equal(dirty("Gate code 4410", "Gate code 4410"), false);
  assert.equal(dirty("Gate code 4410  ", "Gate code 4410"), false);
  assert.equal(dirty("", ""), false);
});

test("the hook asks through beforeunload only while it is on, and takes the listener off after", () => {
  const hook = readFileSync(join(__dirname, "..", "components", "use-leave-warning.ts"), "utf8");
  assert.match(hook, /if \(!active\) return;/);
  assert.match(hook, /e\.preventDefault\(\);\s*e\.returnValue = "";/);
  assert.match(hook, /window\.addEventListener\("beforeunload", warn\);\s*return \(\) => window\.removeEventListener\("beforeunload", warn\);/);
});
