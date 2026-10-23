import test from "node:test";
import assert from "node:assert/strict";
import { describeRepeat, repeatRuleSchema } from "./repeat";
import { choiceFromRule, ruleFromChoice, type RepeatChoice } from "./repeat-choice";

test("Never is no rule, both ways", () => {
  assert.equal(ruleFromChoice({ mode: "never", every: 3, day: 5 }), null);
  assert.deepEqual(choiceFromRule(null, 14), { mode: "never", every: 1, day: 14 });
});

test("every N days and weeks keep N", () => {
  assert.deepEqual(ruleFromChoice({ mode: "days", every: 10, day: 1 }), { freq: "days", interval: 10 });
  assert.deepEqual(ruleFromChoice({ mode: "weeks", every: 2, day: 1 }), { freq: "weeks", interval: 2 });
  assert.equal(describeRepeat(ruleFromChoice({ mode: "weeks", every: 2, day: 1 })!), "Every 2 weeks");
});

test("monthly pins the day of the month", () => {
  const rule = ruleFromChoice({ mode: "monthly", every: 1, day: 5 })!;
  assert.deepEqual(rule, { freq: "monthly", interval: 1, dayOfMonth: 5 });
  assert.equal(describeRepeat(rule), "Monthly on the 5th");
});

test("quarterly and yearly carry no day", () => {
  assert.deepEqual(ruleFromChoice({ mode: "quarterly", every: 1, day: 9 }), { freq: "quarterly", interval: 1 });
  assert.deepEqual(ruleFromChoice({ mode: "yearly", every: 1, day: 9 }), { freq: "yearly", interval: 1 });
});

test("out-of-range numbers are pulled into range", () => {
  assert.deepEqual(ruleFromChoice({ mode: "days", every: 0, day: 1 }), { freq: "days", interval: 1 });
  assert.deepEqual(ruleFromChoice({ mode: "days", every: 9999, day: 1 }), { freq: "days", interval: 365 });
  assert.deepEqual(ruleFromChoice({ mode: "monthly", every: 1, day: 40 }), { freq: "monthly", interval: 1, dayOfMonth: 31 });
  assert.deepEqual(ruleFromChoice({ mode: "days", every: Number.NaN, day: 1 }), { freq: "days", interval: 1 });
});

test("a stored rule round-trips through the editor unchanged", () => {
  const rules = [
    { freq: "days", interval: 3 },
    { freq: "weeks", interval: 1 },
    { freq: "monthly", interval: 1, dayOfMonth: 31 },
    { freq: "monthly", interval: 2, dayOfMonth: 15 },
    { freq: "quarterly", interval: 1 },
    { freq: "yearly", interval: 1 },
  ].map((r) => repeatRuleSchema.parse(r));
  for (const rule of rules) assert.deepEqual(ruleFromChoice(choiceFromRule(rule, 1)), rule);
});

test("every rule the editor makes passes the stored schema", () => {
  const choices: RepeatChoice[] = [
    { mode: "days", every: 1, day: 1 },
    { mode: "weeks", every: 52, day: 1 },
    { mode: "monthly", every: 1, day: 28 },
    { mode: "quarterly", every: 1, day: 1 },
    { mode: "yearly", every: 1, day: 1 },
  ];
  for (const c of choices) assert.ok(repeatRuleSchema.safeParse(ruleFromChoice(c)).success);
});
