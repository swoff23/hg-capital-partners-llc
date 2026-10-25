import test from "node:test";
import assert from "node:assert/strict";
import { dayPart, firstName, greetingLine, summaryLine } from "./summary";

test("dayPart: Buffalo's clock, in daylight time", () => {
  assert.equal(dayPart(new Date("2026-10-25T11:00:00Z")), "morning"); // 7am EDT
  assert.equal(dayPart(new Date("2026-10-25T15:59:00Z")), "morning"); // 11:59am
  assert.equal(dayPart(new Date("2026-10-25T16:00:00Z")), "afternoon"); // noon
  assert.equal(dayPart(new Date("2026-10-25T21:59:00Z")), "afternoon"); // 5:59pm
  assert.equal(dayPart(new Date("2026-10-25T22:00:00Z")), "evening"); // 6pm
  assert.equal(dayPart(new Date("2026-10-26T03:30:00Z")), "evening"); // 11:30pm, already Oct 26 in UTC
});

test("dayPart: Buffalo's clock, in standard time", () => {
  assert.equal(dayPart(new Date("2026-01-15T16:30:00Z")), "morning"); // 11:30am EST
  assert.equal(dayPart(new Date("2026-01-15T17:00:00Z")), "afternoon"); // noon EST
  assert.equal(dayPart(new Date("2026-01-15T05:00:00Z")), "morning"); // midnight EST
});

test("firstName: the first word, or nothing to use", () => {
  assert.equal(firstName("Connor Swofford"), "Connor");
  assert.equal(firstName("  Pieter  "), "Pieter");
  assert.equal(firstName(""), null);
  assert.equal(firstName("   "), null);
  assert.equal(firstName(null), null);
  assert.equal(firstName(undefined), null);
});

test("greetingLine: with a name, and without one", () => {
  const morning = new Date("2026-10-25T13:00:00Z");
  assert.equal(greetingLine("Connor Swofford", morning), "Good morning, Connor");
  assert.equal(greetingLine("", morning), "Good morning");
  assert.equal(greetingLine(null, new Date("2026-10-25T23:00:00Z")), "Good evening");
});

test("summaryLine: both clauses, one, or none", () => {
  assert.equal(summaryLine(3, 5), "3 need you · 5 late");
  assert.equal(summaryLine(1, 1), "1 needs you · 1 late");
  assert.equal(summaryLine(0, 5), "5 late");
  assert.equal(summaryLine(2, 0), "2 need you");
  assert.equal(summaryLine(0, 0), null);
});
