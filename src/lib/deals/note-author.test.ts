import test from "node:test";
import assert from "node:assert/strict";
import { parseNoteAuthor } from "./note-author";

test("a note signed with initials: the text and the initials", () => {
  assert.deepEqual(parseNoteAuthor("seeing tomorrow (CS)"), { text: "seeing tomorrow", initials: "CS", name: null });
  assert.deepEqual(parseNoteAuthor("Agent says cash only (PL)  "), { text: "Agent says cash only", initials: "PL", name: null });
  assert.equal(parseNoteAuthor("three names (JMP)").initials, "JMP");
});

test("a change line with its author after the dot", () => {
  assert.deepEqual(parseNoteAuthor("Status: Closing → CLOSED!  ·  Connor Swofford"), {
    text: "Status: Closing → CLOSED!",
    initials: null,
    name: "Connor Swofford",
  });
  assert.deepEqual(parseNoteAuthor("Listing URL added  ·  Pieter Louw"), { text: "Listing URL added", initials: null, name: "Pieter Louw" });
});

test("the first version's signature: a blank line, an em dash and the name", () => {
  assert.deepEqual(parseNoteAuthor("going to see it tomorrow\n\n\u2014 Connor Swofford"), { text: "going to see it tomorrow", initials: null, name: "Connor Swofford" });
  assert.deepEqual(parseNoteAuthor("Line one\nLine two\n\n\u2014 Pieter Louw  "), { text: "Line one\nLine two", initials: null, name: "Pieter Louw" });
  // Only the blank-line shape counts: a dash opening a line, or a dash inside a sentence, is text.
  assert.equal(parseNoteAuthor("Offer in \u2014 waiting on the agent").name, null);
  assert.equal(parseNoteAuthor("Notes\n\u2014 see Dana").name, null);
  assert.equal(parseNoteAuthor("Notes\n\n\u2014 " + "x".repeat(80)).name, null, "a whole sentence isn't a name");
  assert.equal(parseNoteAuthor("Notes\n\n\u2014 first\nsecond").name, null, "a label doesn't span lines");
});

test("any other label after the dot is read the same way", () => {
  assert.deepEqual(parseNoteAuthor("Price: $425,000 → $410,000  ·  Spreadsheet import"), {
    text: "Price: $425,000 → $410,000",
    initials: null,
    name: "Spreadsheet import",
  });
});

test("only the last dot signs it: a note that holds the dot keeps its text", () => {
  assert.deepEqual(parseNoteAuthor("Called  ·  left a message  ·  Connor Swofford"), {
    text: "Called  ·  left a message",
    initials: null,
    name: "Connor Swofford",
  });
});

test("a note with no author is its own text", () => {
  assert.deepEqual(parseNoteAuthor("  seeing tomorrow "), { text: "seeing tomorrow", initials: null, name: null });
  assert.deepEqual(parseNoteAuthor("Taxes (2025) look high"), { text: "Taxes (2025) look high", initials: null, name: null });
});

test("brackets that are a word, not initials, stay", () => {
  assert.equal(parseNoteAuthor("Need it back (ASAP)").text, "Need it back (ASAP)");
  assert.equal(parseNoteAuthor("(CS) at the start").text, "(CS) at the start", "initials only count at the end");
  assert.equal(parseNoteAuthor("(CS)").text, "(CS)", "a note that is only brackets keeps them");
});

test("a dot with nothing sensible after it isn't a signature", () => {
  assert.equal(parseNoteAuthor("Offer sent  ·  ").text, "Offer sent  ·", "an empty label");
  assert.equal(parseNoteAuthor("Offer sent  ·  " + "x".repeat(80)).name, null, "a whole sentence isn't a name");
  assert.equal(parseNoteAuthor("One  ·  two\nthree").name, null, "a label doesn't span lines");
});
