import test from "node:test";
import assert from "node:assert/strict";
import { parseRepeatRule } from "./repeat";
import { repeatRuleSchema } from "./repeat-schema";

/**
 * The browser reads a repeat rule with parseRepeatRule (repeat.ts, no zod) and
 * the server checks a post with repeatRuleSchema. They are two statements of
 * one rule, so every input here must get the same answer from both.
 */

const FREQS = ["days", "weeks", "monthly", "quarterly", "yearly"];

const CASES: unknown[] = [
  // Well formed, every frequency, with and without the optional pins.
  ...FREQS.map((freq) => ({ freq })),
  ...FREQS.map((freq) => ({ freq, interval: 1 })),
  ...FREQS.map((freq) => ({ freq, interval: 365 })),
  { freq: "weeks", interval: 2, weekday: 0 },
  { freq: "weeks", interval: 1, weekday: 6 },
  { freq: "monthly", interval: 1, dayOfMonth: 1 },
  { freq: "quarterly", interval: 3, dayOfMonth: 31 },
  { freq: "yearly", interval: 2 },
  // Keys the rule doesn't know are dropped.
  { freq: "days", interval: 3, extra: "x" },
  { freq: "weeks", weekday: 3, pinned: true },
  // Out of range, not whole, or the wrong type.
  { freq: "hourly" },
  { freq: "Days" },
  { freq: null },
  { freq: 1 },
  {},
  { interval: 1 },
  { freq: "days", interval: 0 },
  { freq: "days", interval: 366 },
  { freq: "days", interval: -1 },
  { freq: "days", interval: 1.5 },
  { freq: "days", interval: "2" },
  { freq: "days", interval: null },
  { freq: "days", interval: NaN },
  { freq: "days", interval: Infinity },
  { freq: "monthly", dayOfMonth: 0 },
  { freq: "monthly", dayOfMonth: 32 },
  { freq: "monthly", dayOfMonth: 5.5 },
  { freq: "monthly", dayOfMonth: "5" },
  { freq: "monthly", dayOfMonth: null },
  { freq: "weeks", weekday: -1 },
  { freq: "weeks", weekday: 7 },
  { freq: "weeks", weekday: 1.5 },
  { freq: "weeks", weekday: "1" },
  { freq: "weeks", weekday: null },
  // Not a rule at all.
  null,
  undefined,
  "weekly",
  "",
  42,
  true,
  [],
  [{ freq: "days" }],
  JSON.parse('{"freq":"weeks","interval":2,"weekday":5}'),
];

test("parseRepeatRule and repeatRuleSchema agree on every input", () => {
  for (const input of CASES) {
    const byHand = parseRepeatRule(input);
    const bySchema = repeatRuleSchema.safeParse(input);
    assert.deepEqual(byHand, bySchema.success ? bySchema.data : null, `input: ${JSON.stringify(input)}`);
  }
});

test("the rule carries no key that wasn't given, so ruleKey and the stored JSON stay as they were", () => {
  assert.deepEqual(Object.keys(parseRepeatRule({ freq: "monthly" })!).sort(), ["freq", "interval"]);
  assert.deepEqual(Object.keys(parseRepeatRule({ freq: "weeks", weekday: 0 })!).sort(), ["freq", "interval", "weekday"]);
});
