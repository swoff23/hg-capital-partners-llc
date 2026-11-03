import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The deal page's and New deal's fixes from the break-the-app pass that live
 * in components, which have no test setup of their own: read from the source,
 * as composer-draft.test.ts reads the composer. The rules they call are tested
 * in fields.test.ts and save-conflict.test.ts.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the address field re-renders once per keystroke, so fast typing of a link never trips React's update limit", () => {
  // Typing a Zillow link threw React error #185 near the 60th character and dropped a keystroke ("Buffalo-N").
  const src = read("../../components/address-combobox.tsx");
  assert.match(src, /function useSettleEachKeystroke\(text: string\) \{\s*const \[, settle\] = useReducer\(\(n: number\) => n \+ 1, 0\);\s*useLayoutEffect\(\(\) => \{\s*settle\(\);\s*\}, \[text\]\);\s*\}/);
  assert.match(src, /useSettleEachKeystroke\(value\);/);
});

test("the deal page checks prices and units by the server's rules, and the stage refusal says what the stage is now", () => {
  const src = read("../../app/(app)/deals/[id]/deal-detail.tsx");
  assert.match(src, /check=\{dealPriceProblem\}/);
  assert.match(src, /check=\{dealUnitsProblem\}/);
  assert.match(src, /saveDealFields\(id, \{ status: to \}, \{ status \}\)\.then\(\(r\) => withStageConflictLine\(r\)\)/);
  // The pass reason's search says what it searched, like the Stage filter's "No stage matches."
  assert.match(src, /emptyText="No reason matches\."/);
  const field = read("../../components/inline-field.tsx");
  assert.match(field, /searchLabel=\{`Search \$\{label\.toLowerCase\(\)\}`\}\s*emptyText=\{emptyText\}/);
});

test("a price the save refuses gets no 'Saves as' line, on the deal page or on New deal", () => {
  // It said "Saves as $20,000,000,000" for a save that could only fail.
  const field = read("../../components/inline-field.tsx");
  assert.match(field, /const numberLine = nk && draft !== value && !check\?\.\(draft\.trim\(\)\) \? numberHelper/);
  const form = read("../../app/(app)/deals/new/new-deal-form.tsx");
  assert.match(form, /const priceHelper = \(raw: string\) => \(dealPriceProblem\(raw\) \? undefined : numberHelper\("money", raw, \{ allowText: true \}\)\);/);
  assert.equal(form.match(/helper=\{priceHelper\(values\.(theirPriceRaw|ourPriceRaw)\)\}/g)?.length, 2);
});

test("Discard on a create page replaces it, so Back doesn't return to the form just discarded", () => {
  const src = read("../../components/create-form.tsx");
  assert.match(src, /if \(variant === "sheet"\) router\.back\(\);\s*\/\/[^\n]*\n\s*else router\.replace\(backHref\);/);
});
