import test from "node:test";
import assert from "node:assert/strict";
import { describeRepeat, nextOccurrence, repeatRuleSchema } from "./repeat";
import { choiceFromRule, followDueDay, ruleFromChoice, switchMode, type RepeatChoice } from "./repeat-choice";

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

test("quarterly pins the due date's day too; yearly stays unpinned", () => {
  assert.deepEqual(ruleFromChoice({ mode: "quarterly", every: 1, day: 31 }), { freq: "quarterly", interval: 1, dayOfMonth: 31 });
  // The chip shows no day for yearly, so a pin would silently undo a renewal date someone moved.
  assert.deepEqual(ruleFromChoice({ mode: "yearly", every: 1, day: 29 }), { freq: "yearly", interval: 1 });
  assert.equal(describeRepeat(ruleFromChoice({ mode: "quarterly", every: 1, day: 31 })!), "Quarterly on the 31st");
  assert.equal(describeRepeat(ruleFromChoice({ mode: "yearly", every: 1, day: 29 })!), "Yearly");
  // A quarterly rule saved before the day was pinned takes the due date's day the next time it's saved.
  assert.deepEqual(ruleFromChoice(choiceFromRule({ freq: "quarterly", interval: 1 }, 30)), { freq: "quarterly", interval: 1, dayOfMonth: 30 });
});

test("a pinned quarterly day survives short months", () => {
  let due = "2026-08-31";
  const quarterly = ruleFromChoice({ mode: "quarterly", every: 1, day: 31 })!;
  const seen: string[] = [];
  for (let i = 0; i < 4; i++) seen.push((due = nextOccurrence(quarterly, due)));
  assert.deepEqual(seen, ["2026-11-30", "2027-02-28", "2027-05-31", "2027-08-31"]);
});

test("switching mode takes the due date's day, not one left over from the last mode", () => {
  const monthlyOn5 = { mode: "monthly" as const, every: 1, day: 5 };
  // Monthly on the 5th, switched to Quarterly on a task due the 23rd: pinned to the 23rd.
  assert.deepEqual(ruleFromChoice(switchMode(monthlyOn5, "quarterly", 23)), { freq: "quarterly", interval: 1, dayOfMonth: 23 });
  // Back to the stored mode keeps what was stored.
  assert.deepEqual(switchMode(monthlyOn5, "monthly", 23), monthlyOn5);
  assert.deepEqual(switchMode({ mode: "weeks", every: 2, day: 1 }, "weeks", 23), { mode: "weeks", every: 2, day: 1 });
  assert.deepEqual(switchMode({ mode: "weeks", every: 2, day: 1 }, "days", 23), { mode: "days", every: 1, day: 23 });
});

test("new task: a day taken from the due date moves with it; a day picked apart stays", () => {
  const monthly23 = { freq: "monthly" as const, interval: 1, dayOfMonth: 23 };
  assert.deepEqual(followDueDay(monthly23, "2026-10-23", "2026-11-15"), { ...monthly23, dayOfMonth: 15 });
  assert.deepEqual(followDueDay(monthly23, "2026-10-01", "2026-11-15"), monthly23, "the 23rd was picked on its own");
  assert.deepEqual(followDueDay(monthly23, "", "2026-11-15"), monthly23);
  assert.deepEqual(followDueDay(monthly23, "2026-10-23", ""), monthly23, "clearing the date leaves the rule");
  assert.deepEqual(followDueDay({ freq: "weeks", interval: 2 }, "2026-10-23", "2026-11-15"), { freq: "weeks", interval: 2 });
  assert.equal(followDueDay(null, "2026-10-23", "2026-11-15"), null);
  // The form passes the last date the field held, so clearing it on the way still follows: 23, cleared, 1st, 15th.
  let rule: typeof monthly23 | null = monthly23;
  let last = "2026-10-23";
  for (const next of ["", "2026-10-01", "2026-10-15"]) {
    if (!next) continue;
    rule = followDueDay(rule, last, next) as typeof monthly23;
    last = next;
  }
  assert.equal(rule?.dayOfMonth, 15);
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
    { freq: "quarterly", interval: 1, dayOfMonth: 31 },
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
