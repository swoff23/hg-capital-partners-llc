import test from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_MESSAGE,
  URL_MESSAGE,
  decideInlineEdit,
  headingSave,
  inlineEdit,
  inlineEditCommit,
  inlineProblem,
  inlineSavedMessage,
  inlineShown,
  numberKindOf,
  sameNumberText,
  storedText,
  tooShortMessage,
} from "./inline-edit";

test("inlineProblem: a number says what to enter, by its kind; a blank is fine", () => {
  assert.equal(inlineProblem("money", "low 400s"), "Enter an amount, like 425,000.");
  assert.equal(inlineProblem("percent", "six"), "Enter a rate, like 6.875.");
  assert.equal(inlineProblem("year", "Old"), "Enter a year, like 2014.");
  assert.equal(inlineProblem("integer", "1.5"), "Enter a whole number.");
  assert.equal(inlineProblem("money", "425k"), null);
  assert.equal(inlineProblem("money", "   "), null);
  // A deal price keeps text.
  assert.equal(inlineProblem("money", "low 400s", { allowText: true }), null);
});

test("inlineProblem: an email, a link and a phone by the shapes the server reads", () => {
  assert.equal(inlineProblem("email", "zack@"), EMAIL_MESSAGE);
  assert.equal(inlineProblem("email", "zack@example.com"), null);
  assert.equal(inlineProblem("url", "zillow.com/homes/1"), URL_MESSAGE);
  assert.equal(inlineProblem("url", "http://zillow.com/homes/1"), null);
  assert.equal(inlineProblem("url", "https://www.zillow.com/homedetails/1_zpid/"), null);
  assert.equal(inlineProblem("phone", "555"), "Enter the full number, like 716-555-1234.");
  assert.equal(inlineProblem("phone", "(716) 555-1234"), null);
  assert.equal(inlineProblem("text", "anything at all"), null);
  assert.equal(numberKindOf("money"), "money");
  assert.equal(numberKindOf("date"), null);
});

test("storedText: what the server keeps of what was typed, so Undo expects the stored value", () => {
  assert.equal(storedText("money", "290k"), "290000");
  assert.equal(storedText("money", "$1,842.567"), "1842.57");
  assert.equal(storedText("money", "425000.00"), "425000");
  assert.equal(storedText("percent", "6.875%"), "6.875");
  assert.equal(storedText("percent", "7.0004"), "7");
  assert.equal(storedText("integer", "2,300"), "2300");
  assert.equal(storedText("year", "2014"), "2014");
  // A deal price is kept as typed; a number that isn't one stays as it was.
  assert.equal(storedText("money", " low 400s ", { allowText: true }), "low 400s");
  assert.equal(storedText("money", "425k", { allowText: true }), "425k");
  assert.equal(storedText("money", "low 400s"), "low 400s");
  assert.equal(storedText("email", " Zack@Example.COM "), "zack@example.com");
  assert.equal(storedText("phone", "(716) 555-0199"), "716-555-0199");
  assert.equal(storedText("phone", "716-555-0199 ext 2"), "716-555-0199 ext 2");
  assert.equal(storedText("text", "  M&T   Bank "), "M&T Bank");
  assert.equal(storedText("multiline", " Roof done.\r\nGutters next. "), "Roof done.\nGutters next.");
  assert.equal(storedText("date", "2031-06-01"), "2031-06-01");
  assert.equal(storedText("text", "   "), "");
});

test("sameNumberText: tidying a field is not an edit", () => {
  assert.equal(sameNumberText("money", "425000", "$425,000"), true);
  assert.equal(sameNumberText("money", "425000.00", "425k"), true);
  assert.equal(sameNumberText("money", "425000", "430000"), false);
  assert.equal(sameNumberText("percent", "6.875", "6.875%"), true);
  // Unreadable text is never "the same", so the problem line gets its say.
  assert.equal(sameNumberText("money", "low 400s", "low 400s"), false);
});

test("inlineShown: each kind as a person reads it", () => {
  assert.equal(inlineShown("money", "410000.00"), "$410,000");
  assert.equal(inlineShown("percent", "6.875"), "6.875%");
  assert.equal(inlineShown("integer", "2300", { unit: "sq ft" }), "2,300 sq ft");
  assert.equal(inlineShown("year", "2014"), "2014");
  assert.equal(inlineShown("date", "2031-06-01"), "Jun 1, 2031");
  assert.equal(inlineShown("choice", "yes", { label: (t) => (t === "yes" ? "Yes" : undefined) }), "Yes");
  assert.equal(inlineShown("text", "  M&T   Bank "), "M&T Bank");
  assert.equal(inlineShown("money", "low 400s"), "low 400s");
  assert.equal(inlineShown("text", ""), "");
  assert.equal(inlineShown("multiline", "x".repeat(60)).length, 40);
});

test("inlineSavedMessage: the toast names the change", () => {
  assert.equal(inlineSavedMessage("Rate", "percent", "6.875"), "Rate set to 6.875%");
  assert.equal(inlineSavedMessage("Lender", "text", ""), "Lender cleared");
  assert.equal(inlineSavedMessage("Maturity", "date", "2031-06-01"), "Maturity set to Jun 1, 2031");
  assert.equal(inlineSavedMessage("Notes", "multiline", "Roof done."), "Notes saved");
  assert.equal(inlineSavedMessage("Notes", "multiline", ""), "Notes cleared");
  assert.equal(inlineSavedMessage("Address", "heading", "767 Prospect Ave"), "Address changed");
  assert.equal(inlineSavedMessage("Sq ft", "integer", "2300", { unit: "sq ft" }), "Sq ft set to 2,300 sq ft");
});

test("decideInlineEdit: a number that reads the same is no edit; one that doesn't read stays open with its line", () => {
  const money = { allowText: false };
  assert.deepEqual(decideInlineEdit("money", "$425,000", "425000", money), { kind: "same", value: "$425,000" });
  assert.deepEqual(decideInlineEdit("money", "430k", "425000", money), { kind: "save", value: "430k" });
  assert.deepEqual(decideInlineEdit("money", "low 400s", "425000", money), { kind: "problem", message: "Enter an amount, like 425,000.", value: "low 400s" });
  // A deal price keeps text, and text unchanged is no edit.
  assert.deepEqual(decideInlineEdit("money", "low 400s", "425k", { allowText: true }), { kind: "save", value: "low 400s" });
  assert.deepEqual(decideInlineEdit("money", "low 400s", "low 400s", { allowText: true }), { kind: "same", value: "low 400s" });
  // A blank clears a number, and a blank over a blank is nothing.
  assert.deepEqual(decideInlineEdit("percent", "", "6.875", money), { kind: "save", value: "" });
  assert.deepEqual(decideInlineEdit("percent", "  ", "", money), { kind: "same", value: "" });
});

test("decideInlineEdit: text is tidied to one line, and too short says so", () => {
  assert.deepEqual(decideInlineEdit("text", "  M&T   Bank ", "Vontive", {}), { kind: "save", value: "M&T Bank" });
  assert.deepEqual(decideInlineEdit("text", "Vontive ", "Vontive", {}), { kind: "same", value: "Vontive" });
  assert.deepEqual(decideInlineEdit("text", "", "Vontive", {}), { kind: "save", value: "" });
  assert.deepEqual(decideInlineEdit("heading", "A", "Fix steps", { minLength: 2 }), { kind: "problem", message: "Enter at least 2 characters.", value: "A" });
  assert.deepEqual(decideInlineEdit("heading", " ", "767 Prospect Ave", { minLength: 4, blank: "Enter the address." }), {
    kind: "problem",
    message: "Enter at least 4 characters.",
    value: "",
  });
  assert.deepEqual(decideInlineEdit("heading", "", "767 Prospect Ave", { minLength: 1, blank: "Enter the address." }), {
    kind: "problem",
    message: "Enter the address.",
    value: "",
  });
});

test("decideInlineEdit: an email, a link and a phone are checked before they are sent", () => {
  assert.deepEqual(decideInlineEdit("email", "zack@", "", {}), { kind: "problem", message: EMAIL_MESSAGE, value: "zack@" });
  assert.deepEqual(decideInlineEdit("email", "zack@example.com", "", {}), { kind: "save", value: "zack@example.com" });
  assert.deepEqual(decideInlineEdit("url", "zillow.com", "", {}), { kind: "problem", message: URL_MESSAGE, value: "zillow.com" });
  assert.deepEqual(decideInlineEdit("phone", "555", "", {}).kind, "problem");
});

test("decideInlineEdit: notes keep their line breaks and compare with Windows line endings", () => {
  assert.deepEqual(decideInlineEdit("multiline", "Roof done.\r\nGutters next.", "Roof done.\nGutters next.", {}), {
    kind: "same",
    value: "Roof done.\nGutters next.",
  });
  assert.deepEqual(decideInlineEdit("multiline", " Roof done.\n\nBoiler serviced. ", "Roof done.", {}), {
    kind: "save",
    value: "Roof done.\n\nBoiler serviced.",
  });
  assert.deepEqual(decideInlineEdit("multiline", "  ", "Roof done.", {}), { kind: "save", value: "" });
});

test("inlineEdit: a draft shorter than the minimum says so instead of reverting silently", () => {
  assert.deepEqual(inlineEdit("A", "Fix front steps", { minLength: 2 }), { kind: "short", message: "Enter at least 2 characters." });
  assert.deepEqual(inlineEdit("  ", "Fix front steps", { minLength: 2 }), { kind: "short", message: "Enter at least 2 characters." });
  // A blank names what to enter when the field says so.
  assert.deepEqual(inlineEdit("   ", "767 Prospect Ave", { minLength: 1, blank: "Enter the address." }), {
    kind: "short",
    message: "Enter the address.",
  });
  assert.deepEqual(inlineEdit("", "767 Prospect Ave", { minLength: 1 }), { kind: "short", message: "Enter at least 1 character." });
  assert.equal(tooShortMessage(4), "Enter at least 4 characters.");
  assert.equal(tooShortMessage(1, "Enter a name."), "Enter a name.");
  // The blank line is only for a blank; a one-letter draft of a two-letter field reads as short.
  assert.deepEqual(inlineEdit("A", "Fix", { minLength: 2, blank: "Enter a title." }), { kind: "short", message: "Enter at least 2 characters." });
});

test("inlineEdit: an untouched or whitespace-only change is the same, a real edit saves tidied", () => {
  const stored = "256 Auburn Avenue   Buffalo ,  NY   14213";
  assert.deepEqual(inlineEdit(stored, stored, { minLength: 4 }), { kind: "same" });
  assert.deepEqual(inlineEdit("256 Auburn Avenue Buffalo , NY 14213", stored, { minLength: 4 }), { kind: "same" });
  assert.deepEqual(inlineEdit("Fix  front\nsteps ", "Fix front steps"), { kind: "same" });
  assert.deepEqual(inlineEdit("Fix  front\nsteps at 767 ", "Fix front steps", { minLength: 2 }), { kind: "save", value: "Fix front steps at 767" });
});

test("inlineEdit: a fact with no minimum can be cleared", () => {
  assert.deepEqual(inlineEdit("", "M&T Bank", { minLength: 0 }), { kind: "save", value: "" });
  assert.deepEqual(inlineEdit("  ", "", { minLength: 0 }), { kind: "same" });
});

test("inlineEditCommit: focus and blur with no edit saves nothing, stray spaces and all", () => {
  const stored = "256 Auburn Avenue   Buffalo ,  NY   14213";
  assert.equal(inlineEditCommit(stored, stored), null);
  assert.equal(inlineEditCommit("Fix\tfront  steps\n", "Fix\tfront  steps\n", 2), null);
});

test("inlineEditCommit: a whitespace-only change saves nothing", () => {
  assert.equal(inlineEditCommit("256 Auburn Avenue Buffalo", "256 Auburn Avenue   Buffalo"), null);
  assert.equal(inlineEditCommit("  Fix front steps ", "Fix front steps"), null);
});

test("inlineEditCommit: a real edit saves, tidied to one line", () => {
  assert.equal(inlineEditCommit("Fix  front\nsteps at 767 ", "Fix front steps", 2), "Fix front steps at 767");
  assert.equal(inlineEditCommit("258 Auburn Avenue   Buffalo", "256 Auburn Avenue   Buffalo"), "258 Auburn Avenue Buffalo");
});

test("inlineEditCommit: too short or blank reverts", () => {
  assert.equal(inlineEditCommit("   ", "Fix front steps"), null);
  assert.equal(inlineEditCommit("A", "Fix front steps", 2), null);
  assert.equal(inlineEditCommit("Ab", "Fix front steps", 2), "Ab");
});

test("headingSave: an address saves tidied, and typing that tidies to the saved one is no edit", () => {
  assert.equal(headingSave("767 prospect avenue buffalo ny 14209", "12 Elm St", { address: true }), "767 Prospect Ave, Buffalo, NY 14209");
  assert.equal(headingSave("767 prospect ave, buffalo, ny 14209", "767 Prospect Ave, Buffalo, NY 14209", { address: true }), null);
  // A task title or a name saves as decided, its case kept.
  assert.equal(headingSave("call prospect avenue", "Call", {}), "call prospect avenue");
  assert.equal(headingSave("Same", "Same"), null);
});
