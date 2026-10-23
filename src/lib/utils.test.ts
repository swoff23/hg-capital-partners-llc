import test from "node:test";
import assert from "node:assert/strict";
import { fmtDateTime, initials } from "./utils";

test("fmtDateTime: Buffalo time, whatever the server's zone", () => {
  // Some ICU builds put a narrow no-break space before AM/PM.
  const shown = (d: Date | string) => fmtDateTime(d).replace(/\s/g, " ");
  // 01:30 UTC on Oct 24 is 9:30 pm on Oct 23 in New York (EDT).
  assert.equal(shown(new Date("2026-10-24T01:30:00Z")), "Oct 23, 2026, 9:30 PM");
  // After the clocks go back: 17:05 UTC is 12:05 pm EST.
  assert.equal(shown("2026-12-01T17:05:00Z"), "Dec 1, 2026, 12:05 PM");
  assert.equal(fmtDateTime(null), "—");
  assert.equal(fmtDateTime("not a date"), "—");
});

test("initials: first letters of the first two words", () => {
  assert.equal(initials("Zack Smith"), "ZS");
  assert.equal(initials("  connor  a  swofford "), "CA");
  assert.equal(initials("Brandon"), "B");
  assert.equal(initials("J. Smith"), "JS");
});

test("initials: letters only, never punctuation or what's in parentheses", () => {
  assert.equal(initials("Jacob (Jake) hoak"), "JH");
  assert.equal(initials("Zack (Outlaw Carpentry)"), "Z");
  assert.equal(initials("Mike Morris (Freedom Electric)"), "MM");
  assert.equal(initials("Zack(Outlaw"), "Z");
  assert.equal(initials("Dust 2 Sparkles"), "DS");
  assert.equal(initials("Richard O'Neil"), "RO");
  assert.equal(initials("José Álvarez"), "JÁ");
  assert.equal(initials("(Jake)", "jake@example.com"), "J");
});

test("initials: a name that is an email address uses its local part", () => {
  assert.equal(initials("fred.smith@example.com"), "FS");
  assert.equal(initials("zack+jobs@example.com"), "Z");
  assert.equal(initials("@example.com", "pieter@example.com"), "P");
});

test("initials: the email's local part stands in for a missing name", () => {
  assert.equal(initials(null, "zack.smith@example.com"), "ZS");
  assert.equal(initials("", "jacob_m@example.com"), "JM");
  assert.equal(initials("   ", "pieter@example.com"), "P");
  assert.equal(initials(undefined, "dana+jobs@example.com"), "D");
  assert.equal(initials("Zack Smith", "other@example.com"), "ZS");
});

test("initials: '?' when there's nothing to go on", () => {
  assert.equal(initials(null), "?");
  assert.equal(initials("", ""), "?");
  assert.equal(initials(undefined, "@example.com"), "?");
  assert.equal(initials(null, "..@example.com"), "?");
});
