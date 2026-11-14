import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tidyAddress } from "./address-suggestions";

/**
 * The address field's four design calls (Nov 14), read from the source the
 * way page-wiring.test.ts does: the heading's own size (10), the reserved
 * line (13), the last row's words (14) and the archived sentence (21).
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const combobox = read("../components/address-combobox.tsx");

test("call 10: only the heading's in-place field takes the heading variant, at the heading's size", () => {
  assert.match(combobox, /variant === "heading" \? "h-10 px-\[7px\] text-title font-semibold" : fieldSizeClass\[size\]/);
  assert.match(combobox, /variant === "heading" && "-mx-2"/);
  const inline = read("../components/inline-field.tsx");
  assert.equal(inline.match(/variant="heading"/g)?.length, 1);
  // The one-field sheet on touch keeps the standard field.
  const sheet = inline.slice(inline.indexOf("const sheet = sheetUsed"), inline.indexOf("if (mode !== \"inline\")"));
  assert.doesNotMatch(sheet, /variant="heading"/);
  // The heading size sits on the input alone: no suggestion row or helper line carries it.
  assert.equal(combobox.match(/text-title/g)?.length, 1);
});

test("call 13: New property, New deal and the two prices keep their line's space", () => {
  const ui = read("../components/ui.tsx");
  assert.match(ui, /\{!line && reserveLine && \(\s*<p aria-hidden="true" className="text-meta">\s*&nbsp;\s*<\/p>\s*\)\}/);
  assert.match(combobox, /reserveLine=\{reserveLine\}/);
  const deal = read("../app/(app)/deals/new/new-deal-form.tsx");
  assert.match(deal, /showSavesAs\s*reserveLine/);
  assert.equal(deal.match(/error=\{errors\.(theirPriceRaw|ourPriceRaw)\} reserveLine>/g)?.length, 2);
  const property = read("../app/(app)/properties/new/new-property-form.tsx");
  assert.match(property, /showSavesAs\s*reserveLine/);
  // The heading's field reserves nothing: it has its own fixed-height sheet.
  assert.doesNotMatch(read("../components/inline-field.tsx"), /reserveLine/);
});

test("call 14: the last row reads Use and the tidied address, and a pick writes that text", () => {
  assert.match(combobox, /const asTypedText = \(typed: string\) => tidyAddress\(typed\) \|\| typed;/);
  assert.match(combobox, /Use &ldquo;\{asTypedText\(typed\)\}&rdquo;<\/span>/);
  assert.match(combobox, /textValue=\{asTypedText\(typed\)\}/);
  assert.doesNotMatch(combobox, /as typed<\/span>/);
  assert.match(combobox, /const text = asTypedText\(id\.slice\(AS_TYPED\.length\)\);\s*if \(text !== value\) onChange\(text\);/);
  // The row's text is what the save keeps.
  assert.equal(asTyped("12 elm st"), "12 Elm St");
  assert.equal(asTyped("34 St James Pl Buffalo, NY 14222"), "34 St James Pl, Buffalo, NY 14222");
  assert.equal(asTyped("lot on main street"), "Lot on Main St");
  assert.equal(asTyped("....."), ".....");
});

test("call 21: the line and every refusal use the one archived sentence", () => {
  assert.match(combobox, /duplicateSentence\(match\.kind, match\.street, match\.archived\)/);
  assert.doesNotMatch(combobox, /Restore/);
  for (const path of [
    "../lib/deals/service.ts",
    "../lib/properties/service.ts",
    "../app/(app)/deals/new/actions.ts",
    "../app/(app)/properties/new/actions.ts",
  ]) {
    const src = read(path);
    assert.match(src, /duplicateSentence\(/, path);
    assert.doesNotMatch(src, /is already a (deal|property)\.`/, path);
  }
});

// The row's text, as the field computes it.
const asTyped = (typed: string) => tidyAddress(typed) || typed;
