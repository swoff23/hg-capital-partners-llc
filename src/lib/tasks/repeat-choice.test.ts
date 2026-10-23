import test from "node:test";
import assert from "node:assert/strict";
import { describeRepeat, nextOccurrence, repeatRuleSchema } from "./repeat";
import { choiceFromRule, followDueDay, ruleFromChoice, switchMode, type RepeatChoice } from "./repeat-choice";

// Weekdays: 0 Sunday to 6 Saturday. Oct 23, 2026 is a Friday (5).

test("Never is no rule, both ways", () => {
  assert.equal(ruleFromChoice({ mode: "never", every: 3, day: 5, weekday: 1 }), null);
  assert.deepEqual(choiceFromRule(null, 14, 3), { mode: "never", every: 1, day: 14, weekday: 3 });
});

test("every N days and weeks keep N", () => {
  assert.deepEqual(ruleFromChoice({ mode: "days", every: 10, day: 1, weekday: 1 }), { freq: "days", interval: 10 });
  assert.deepEqual(ruleFromChoice({ mode: "weeks", every: 2, day: 1, weekday: 1 }), { freq: "weeks", interval: 2, weekday: 1 });
  assert.equal(describeRepeat(ruleFromChoice({ mode: "weeks", every: 2, day: 1, weekday: 1 })!), "Every 2 weeks on Monday");
});

test("weekly pins the due date's weekday, as quarterly takes its day", () => {
  // A task due Friday Oct 23, set to Every week.
  const rule = ruleFromChoice(switchMode(choiceFromRule(null, 23, 5), "weeks", 23, 5))!;
  assert.deepEqual(rule, { freq: "weeks", interval: 1, weekday: 5 });
  assert.equal(describeRepeat(rule), "Every week on Friday");
  // A stored pin stays when the editor saves again, even after the copy moved to another day.
  assert.deepEqual(ruleFromChoice(choiceFromRule({ freq: "weeks", interval: 1, weekday: 1 }, 23, 5)), { freq: "weeks", interval: 1, weekday: 1 });
  // A weekly rule saved before the pin existed takes the due date's weekday the next time it's saved.
  assert.deepEqual(ruleFromChoice(choiceFromRule({ freq: "weeks", interval: 2 }, 23, 5)), { freq: "weeks", interval: 2, weekday: 5 });
  // Days don't pin a weekday.
  assert.deepEqual(ruleFromChoice({ mode: "days", every: 7, day: 23, weekday: 5 }), { freq: "days", interval: 7 });
});

test("monthly pins the day of the month", () => {
  const rule = ruleFromChoice({ mode: "monthly", every: 1, day: 5, weekday: 1 })!;
  assert.deepEqual(rule, { freq: "monthly", interval: 1, dayOfMonth: 5 });
  assert.equal(describeRepeat(rule), "Monthly on the 5th");
});

test("quarterly pins the due date's day too; yearly stays unpinned", () => {
  assert.deepEqual(ruleFromChoice({ mode: "quarterly", every: 1, day: 31, weekday: 1 }), { freq: "quarterly", interval: 1, dayOfMonth: 31 });
  // The chip shows no day for yearly, so a pin would silently undo a renewal date someone moved.
  assert.deepEqual(ruleFromChoice({ mode: "yearly", every: 1, day: 29, weekday: 1 }), { freq: "yearly", interval: 1 });
  assert.equal(describeRepeat(ruleFromChoice({ mode: "quarterly", every: 1, day: 31, weekday: 1 })!), "Quarterly on the 31st");
  assert.equal(describeRepeat(ruleFromChoice({ mode: "yearly", every: 1, day: 29, weekday: 1 })!), "Yearly");
  // A quarterly rule saved before the day was pinned takes the due date's day the next time it's saved.
  assert.deepEqual(ruleFromChoice(choiceFromRule({ freq: "quarterly", interval: 1 }, 30, 1)), { freq: "quarterly", interval: 1, dayOfMonth: 30 });
});

test("a pinned quarterly day survives short months", () => {
  let due = "2026-08-31";
  const quarterly = ruleFromChoice({ mode: "quarterly", every: 1, day: 31, weekday: 1 })!;
  const seen: string[] = [];
  for (let i = 0; i < 4; i++) seen.push((due = nextOccurrence(quarterly, due)));
  assert.deepEqual(seen, ["2026-11-30", "2027-02-28", "2027-05-31", "2027-08-31"]);
});

test("a pinned weekday survives a moved copy", () => {
  // Every week on Monday; one copy moved from Monday Oct 19 to Thursday Oct 22.
  const mondays = ruleFromChoice({ mode: "weeks", every: 1, day: 19, weekday: 1 })!;
  const seen: string[] = [];
  let due = "2026-10-22";
  for (let i = 0; i < 3; i++) seen.push((due = nextOccurrence(mondays, due)));
  assert.deepEqual(seen, ["2026-10-26", "2026-11-02", "2026-11-09"]);
});

test("switching mode takes the due date's day and weekday, not ones left over from the last mode", () => {
  const monthlyOn5 = { mode: "monthly" as const, every: 1, day: 5, weekday: 1 };
  // Monthly on the 5th, switched to Quarterly on a task due the 23rd: pinned to the 23rd.
  assert.deepEqual(ruleFromChoice(switchMode(monthlyOn5, "quarterly", 23, 5)), { freq: "quarterly", interval: 1, dayOfMonth: 23 });
  // Switched to weekly on a task due Friday: pinned to Friday.
  assert.deepEqual(ruleFromChoice(switchMode(monthlyOn5, "weeks", 23, 5)), { freq: "weeks", interval: 1, weekday: 5 });
  // Back to the stored mode keeps what was stored.
  assert.deepEqual(switchMode(monthlyOn5, "monthly", 23, 5), monthlyOn5);
  assert.deepEqual(switchMode({ mode: "weeks", every: 2, day: 1, weekday: 1 }, "weeks", 23, 5), { mode: "weeks", every: 2, day: 1, weekday: 1 });
  assert.deepEqual(switchMode({ mode: "weeks", every: 2, day: 1, weekday: 1 }, "days", 23, 5), { mode: "days", every: 1, day: 23, weekday: 5 });
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

test("new task: a weekday taken from the due date moves with it", () => {
  const fridays = { freq: "weeks" as const, interval: 1, weekday: 5 };
  // Due Friday Oct 23, Every week on Friday, then Due Monday Oct 26: Every week on Monday.
  assert.deepEqual(followDueDay(fridays, "2026-10-23", "2026-10-26"), { ...fridays, weekday: 1 });
  assert.deepEqual(followDueDay({ ...fridays, weekday: 0 }, "2026-10-25", "2026-10-23"), fridays, "from Sunday (0)");
  assert.deepEqual(followDueDay(fridays, "2026-10-26", "2026-10-27"), fridays, "the Friday didn't come from the due date");
  assert.deepEqual(followDueDay(fridays, "2026-10-23", ""), fridays, "clearing the date leaves the rule");
});

test("out-of-range numbers are pulled into range", () => {
  assert.deepEqual(ruleFromChoice({ mode: "days", every: 0, day: 1, weekday: 1 }), { freq: "days", interval: 1 });
  assert.deepEqual(ruleFromChoice({ mode: "days", every: 9999, day: 1, weekday: 1 }), { freq: "days", interval: 365 });
  assert.deepEqual(ruleFromChoice({ mode: "monthly", every: 1, day: 40, weekday: 1 }), { freq: "monthly", interval: 1, dayOfMonth: 31 });
  assert.deepEqual(ruleFromChoice({ mode: "days", every: Number.NaN, day: 1, weekday: 1 }), { freq: "days", interval: 1 });
  assert.deepEqual(ruleFromChoice({ mode: "weeks", every: 1, day: 1, weekday: 9 }), { freq: "weeks", interval: 1, weekday: 6 });
});

test("a stored rule round-trips through the editor unchanged", () => {
  const rules = [
    { freq: "days", interval: 3 },
    { freq: "weeks", interval: 1, weekday: 1 },
    { freq: "weeks", interval: 2, weekday: 0 },
    { freq: "monthly", interval: 1, dayOfMonth: 31 },
    { freq: "monthly", interval: 2, dayOfMonth: 15 },
    { freq: "quarterly", interval: 1, dayOfMonth: 31 },
    { freq: "yearly", interval: 1 },
  ].map((r) => repeatRuleSchema.parse(r));
  for (const rule of rules) assert.deepEqual(ruleFromChoice(choiceFromRule(rule, 1, 3)), rule);
});

test("a stored rule and the editor's write the same JSON, so saving it unchanged writes nothing", () => {
  // Postgres JSONB hands keys back in its own order; RepeatPicker compares JSON strings.
  const stored = repeatRuleSchema.parse({ weekday: 1, interval: 1, freq: "weeks" });
  assert.equal(JSON.stringify(ruleFromChoice(choiceFromRule(stored, 22, 4))), JSON.stringify(stored));
});

test("every rule the editor makes passes the stored schema", () => {
  const choices: RepeatChoice[] = [
    { mode: "days", every: 1, day: 1, weekday: 1 },
    { mode: "weeks", every: 52, day: 1, weekday: 0 },
    { mode: "weeks", every: 1, day: 1, weekday: 6 },
    { mode: "monthly", every: 1, day: 28, weekday: 1 },
    { mode: "quarterly", every: 1, day: 1, weekday: 1 },
    { mode: "yearly", every: 1, day: 1, weekday: 1 },
  ];
  for (const c of choices) assert.ok(repeatRuleSchema.safeParse(ruleFromChoice(c)).success);
});
