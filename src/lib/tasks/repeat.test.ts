import test from "node:test";
import assert from "node:assert/strict";
import {
  copyOrigin,
  describeRepeat,
  firstOccurrence,
  isUntouchedCopy,
  nextOccurrence,
  nextRepeatDue,
  parseRepeatRule,
  repeatCreatedCopy,
  repeatDue,
  repeatFrom,
  type RepeatCopyTrace,
} from "./repeat";

test("parseRepeatRule: valid rules, defaults, junk", () => {
  assert.deepEqual(parseRepeatRule({ freq: "monthly" }), { freq: "monthly", interval: 1 });
  assert.deepEqual(parseRepeatRule({ freq: "weeks", interval: 2 }), { freq: "weeks", interval: 2 });
  assert.deepEqual(parseRepeatRule({ freq: "weeks", interval: 1, weekday: 0 }), { freq: "weeks", interval: 1, weekday: 0 });
  assert.equal(parseRepeatRule(null), null);
  assert.equal(parseRepeatRule({ freq: "hourly" }), null);
  assert.equal(parseRepeatRule({ freq: "days", interval: 0 }), null);
  assert.equal(parseRepeatRule({ freq: "monthly", dayOfMonth: 32 }), null);
  assert.equal(parseRepeatRule({ freq: "weeks", weekday: 7 }), null);
  assert.equal(parseRepeatRule({ freq: "weeks", weekday: -1 }), null);
  assert.equal(parseRepeatRule({ freq: "weeks", weekday: 1.5 }), null);
});

test("nextOccurrence: days and weeks", () => {
  assert.equal(nextOccurrence({ freq: "days", interval: 1 }, "2026-10-31"), "2026-11-01");
  assert.equal(nextOccurrence({ freq: "days", interval: 10 }, "2026-12-25"), "2027-01-04");
  assert.equal(nextOccurrence({ freq: "weeks", interval: 2 }, "2026-10-22"), "2026-11-05");
});

test("nextOccurrence: a pinned weekday holds when one copy moves", () => {
  const mondays = { freq: "weeks" as const, interval: 1, weekday: 1 };
  assert.equal(nextOccurrence(mondays, "2026-10-19"), "2026-10-26", "on its day");
  assert.equal(nextOccurrence(mondays, "2026-10-22"), "2026-10-26", "moved to Thursday");
  assert.equal(nextOccurrence(mondays, "2026-10-23"), "2026-10-26", "moved to Friday");
  assert.equal(nextOccurrence(mondays, "2026-10-25"), "2026-10-26", "moved to Sunday");
  assert.equal(nextOccurrence(mondays, "2026-10-27"), "2026-11-02", "moved past the next Monday");
  assert.equal(nextOccurrence(mondays, "2026-12-28"), "2027-01-04", "across the year");
  assert.equal(nextOccurrence({ ...mondays, interval: 2 }, "2026-10-23"), "2026-11-02", "every 2 weeks, moved Oct 19 to Friday");
  assert.equal(nextOccurrence({ freq: "weeks", interval: 1, weekday: 0 }, "2026-10-25"), "2026-11-01", "Sunday is 0, not unset");
  // Saved before the pin existed: follows the last copy, as before.
  assert.equal(nextOccurrence({ freq: "weeks", interval: 1 }, "2026-10-22"), "2026-10-29");
});

test("nextOccurrence: months keep the day and clamp short months", () => {
  assert.equal(nextOccurrence({ freq: "monthly", interval: 1 }, "2026-10-05"), "2026-11-05");
  assert.equal(nextOccurrence({ freq: "monthly", interval: 1 }, "2026-01-31"), "2026-02-28");
  assert.equal(nextOccurrence({ freq: "monthly", interval: 1, dayOfMonth: 31 }, "2026-02-28"), "2026-03-31");
  assert.equal(nextOccurrence({ freq: "monthly", interval: 1 }, "2026-12-15"), "2027-01-15");
  assert.equal(nextOccurrence({ freq: "monthly", interval: 1, dayOfMonth: 5 }, "2026-10-20"), "2026-11-05");
});

test("nextOccurrence: quarterly and yearly", () => {
  assert.equal(nextOccurrence({ freq: "quarterly", interval: 1 }, "2026-11-30"), "2027-02-28");
  assert.equal(nextOccurrence({ freq: "quarterly", interval: 1, dayOfMonth: 15 }, "2026-10-01"), "2027-01-15");
  assert.equal(nextOccurrence({ freq: "yearly", interval: 1 }, "2028-02-29"), "2029-02-28");
  assert.equal(nextOccurrence({ freq: "yearly", interval: 1 }, "2026-02-15"), "2027-02-15");
});

test("nextRepeatDue: a late repeat's copy lands on the first date on or after today", () => {
  const today = "2026-10-23";
  const monthly5 = { freq: "monthly" as const, interval: 1, dayOfMonth: 5 };
  assert.equal(nextRepeatDue(monthly5, "2026-07-05", today), "2026-11-05", "due Jul 5, finished Oct 23: Nov 5, not Aug 5");
  assert.equal(nextRepeatDue(monthly5, "2026-10-05", today), "2026-11-05", "less than a step late: the usual next date");
  assert.equal(nextRepeatDue({ freq: "weeks", interval: 1 }, "2026-10-16", today), today, "today counts");
  assert.equal(nextRepeatDue({ freq: "weeks", interval: 1, weekday: 1 }, "2026-09-28", today), "2026-10-26", "a pinned weekday holds");
  assert.equal(nextRepeatDue({ freq: "days", interval: 3 }, "2026-01-01", today), "2026-10-25", "the cadence holds: every 3 days from Jan 1");
  assert.equal(nextRepeatDue({ freq: "quarterly", interval: 1, dayOfMonth: 15 }, "2026-01-15", today), "2027-01-15");
  assert.equal(nextRepeatDue({ freq: "yearly", interval: 1 }, "2024-03-01", today), "2027-03-01");
  // Steps count from the finished copy's date, so an unpinned 31st clamps without sliding to the 28th.
  assert.equal(nextRepeatDue({ freq: "monthly", interval: 1 }, "2026-01-31", "2026-04-10"), "2026-04-30");
});

test("nextRepeatDue: on time or early, one step as before", () => {
  const today = "2026-10-23";
  assert.equal(nextRepeatDue({ freq: "days", interval: 1 }, today, today), "2026-10-24", "always after the finished copy's date");
  assert.equal(nextRepeatDue({ freq: "monthly", interval: 1, dayOfMonth: 30 }, "2026-11-30", today), "2026-12-30", "finished early");
  assert.equal(nextRepeatDue({ freq: "weeks", interval: 2 }, "2026-10-22", today), "2026-11-05");
});

test("firstOccurrence: the first day on or after today the rule lands on", () => {
  const today = "2026-10-23";
  assert.equal(firstOccurrence({ freq: "weeks", interval: 2 }, today), today);
  assert.equal(firstOccurrence({ freq: "weeks", interval: 1, weekday: 5 }, today), today, "pinned to today's weekday (Friday)");
  assert.equal(firstOccurrence({ freq: "weeks", interval: 1, weekday: 1 }, today), "2026-10-26", "the next Monday");
  assert.equal(firstOccurrence({ freq: "weeks", interval: 2, weekday: 4 }, today), "2026-10-29", "the next Thursday");
  assert.equal(firstOccurrence({ freq: "days", interval: 1 }, today), today);
  assert.equal(firstOccurrence({ freq: "yearly", interval: 1 }, today), today);
  assert.equal(firstOccurrence({ freq: "monthly", interval: 1, dayOfMonth: 23 }, today), today);
  assert.equal(firstOccurrence({ freq: "monthly", interval: 1, dayOfMonth: 28 }, today), "2026-10-28");
  assert.equal(firstOccurrence({ freq: "monthly", interval: 1, dayOfMonth: 5 }, today), "2026-11-05");
  assert.equal(firstOccurrence({ freq: "quarterly", interval: 1, dayOfMonth: 1 }, today), "2026-11-01");
  assert.equal(firstOccurrence({ freq: "monthly", interval: 1, dayOfMonth: 31 }, "2026-11-10"), "2026-11-30", "clamped to a short month");
  assert.equal(firstOccurrence({ freq: "monthly", interval: 1, dayOfMonth: 31 }, "2027-02-01"), "2027-02-28");
  assert.equal(firstOccurrence({ freq: "monthly", interval: 1, dayOfMonth: 30 }, "2027-01-31"), "2027-02-28", "passed this month, clamped next");
  assert.equal(firstOccurrence({ freq: "monthly", interval: 1, dayOfMonth: 15 }, "2026-12-20"), "2027-01-15", "across the year");
});

test("repeatDue: a repeating task never starts undated", () => {
  const monthly5 = { freq: "monthly" as const, interval: 1, dayOfMonth: 5 };
  assert.equal(repeatDue(monthly5, "2026-11-15", "2026-10-23"), "2026-11-15", "a date given is kept");
  assert.equal(repeatDue(monthly5, null, "2026-10-23"), "2026-11-05");
  assert.equal(repeatDue(monthly5, "", "2026-10-23"), "2026-11-05");
  assert.equal(repeatDue({ freq: "weeks", interval: 1 }, undefined, "2026-10-23"), "2026-10-23");
  assert.equal(repeatDue(null, null, "2026-10-23"), null, "no repeat, no date");
  assert.equal(repeatDue(undefined, "2026-11-15", "2026-10-23"), "2026-11-15");
});

test("describeRepeat", () => {
  assert.equal(describeRepeat({ freq: "days", interval: 1 }), "Every day");
  assert.equal(describeRepeat({ freq: "weeks", interval: 2 }), "Every 2 weeks");
  assert.equal(describeRepeat({ freq: "weeks", interval: 1, weekday: 1 }), "Every week on Monday");
  assert.equal(describeRepeat({ freq: "weeks", interval: 2, weekday: 1 }), "Every 2 weeks on Monday");
  assert.equal(describeRepeat({ freq: "weeks", interval: 1, weekday: 0 }), "Every week on Sunday");
  assert.equal(describeRepeat({ freq: "monthly", interval: 1, dayOfMonth: 5 }), "Monthly on the 5th");
  assert.equal(describeRepeat({ freq: "monthly", interval: 1, dayOfMonth: 22 }), "Monthly on the 22nd");
  assert.equal(describeRepeat({ freq: "monthly", interval: 1, dayOfMonth: 11 }), "Monthly on the 11th");
  assert.equal(describeRepeat({ freq: "quarterly", interval: 1 }), "Quarterly");
  assert.equal(describeRepeat({ freq: "yearly", interval: 1 }), "Yearly");
});

test("describeRepeat short: the chip names the weekday in three letters", () => {
  assert.equal(describeRepeat({ freq: "weeks", interval: 1, weekday: 1 }, { short: true }), "Every week on Mon");
  assert.equal(describeRepeat({ freq: "weeks", interval: 2, weekday: 3 }, { short: true }), "Every 2 weeks on Wed");
  assert.equal(describeRepeat({ freq: "weeks", interval: 52, weekday: 0 }, { short: true }), "Every 52 weeks on Sun");
  assert.equal(describeRepeat({ freq: "weeks", interval: 2 }, { short: true }), "Every 2 weeks");
  assert.equal(describeRepeat({ freq: "monthly", interval: 1, dayOfMonth: 5 }, { short: true }), "Monthly on the 5th", "only the weekday shortens");
});

test("copyOrigin: reads a copy's CREATED event", () => {
  assert.deepEqual(copyOrigin({ repeatOf: "t1", due: "2026-10-26" }), { repeatOf: "t1", due: "2026-10-26" });
  assert.deepEqual(copyOrigin({ repeatOf: "t1" }), { repeatOf: "t1", due: null }, "made before the date was kept");
  assert.equal(copyOrigin({}), null, "the series' first task");
  assert.equal(copyOrigin({ asanaGid: "123" }), null);
  assert.equal(copyOrigin(null), null);
  assert.equal(copyOrigin(["t1"]), null);
});

test("repeatFrom: a pinned day of the month steps from the series' date, not the moved one", () => {
  const on30 = { freq: "monthly" as const, interval: 1, dayOfMonth: 30 };
  // Oct 30 moved to Nov 2: still Nov 30, not Dec 30.
  assert.equal(nextRepeatDue(on30, repeatFrom(on30, "2026-10-30", "2026-11-02", "2026-11-02"), "2026-11-02"), "2026-11-30");
  const on1 = { freq: "monthly" as const, interval: 1, dayOfMonth: 1 };
  // Nov 1 moved back to Oct 30: Dec 1 next, not Nov 1 again.
  assert.equal(nextRepeatDue(on1, repeatFrom(on1, "2026-11-01", "2026-10-30", "2026-10-30"), "2026-10-30"), "2026-12-01");
  // A pinned 31st lands on a short month's last day, and that still counts as the slot.
  const on31 = { freq: "quarterly" as const, interval: 1, dayOfMonth: 31 };
  assert.equal(repeatFrom(on31, "2026-11-30", "2026-12-03", "2026-12-03"), "2026-11-30");
  // Yearly isn't pinned: it steps from its own due date.
  const yearly = { freq: "yearly" as const, interval: 1 };
  assert.equal(repeatFrom(yearly, "2026-03-03", "2026-03-17", "2026-03-17"), "2026-03-17");
});

test("repeatFrom: a pinned weekly copy steps from the date the series gave it, not its moved date", () => {
  const mondays = { freq: "weeks" as const, interval: 1, weekday: 1 };
  // The Mon Oct 26 copy moved to the Saturday before and finished then: the next Monday a week on.
  assert.equal(nextRepeatDue(mondays, repeatFrom(mondays, "2026-10-26", "2026-10-24", "2026-10-24"), "2026-10-24"), "2026-11-02");
  // Every 2 weeks: the Nov 2 copy moved to Fri Oct 30 keeps the schedule, Nov 16 next.
  const fortnightly = { ...mondays, interval: 2 };
  assert.equal(nextRepeatDue(fortnightly, repeatFrom(fortnightly, "2026-11-02", "2026-10-30", "2026-10-30"), "2026-10-30"), "2026-11-16");
  // Moved later, to Thu Oct 29, and finished then: still the next slot.
  assert.equal(nextRepeatDue(mondays, repeatFrom(mondays, "2026-10-26", "2026-10-29", "2026-10-29"), "2026-10-29"), "2026-11-02");
  // Not moved: as before.
  assert.equal(nextRepeatDue(mondays, repeatFrom(mondays, "2026-10-26", "2026-10-26", "2026-10-26"), "2026-10-26"), "2026-11-02");
});

test("repeatFrom: otherwise the copy's own due date, or today", () => {
  const wednesdays = { freq: "weeks" as const, interval: 1, weekday: 3 };
  // Re-pinned from Monday to Wednesday, due Wed Oct 28: the old Monday slot doesn't count.
  assert.equal(repeatFrom(wednesdays, "2026-10-26", "2026-10-28", "2026-10-28"), "2026-10-28");
  assert.equal(nextRepeatDue(wednesdays, repeatFrom(wednesdays, "2026-10-26", "2026-10-28", "2026-10-28"), "2026-10-28"), "2026-11-04");
  assert.equal(repeatFrom(wednesdays, null, "2026-10-29", "2026-10-23"), "2026-10-29", "the series' first task");
  assert.equal(repeatFrom(wednesdays, null, null, "2026-10-23"), "2026-10-23", "undated");
  assert.equal(repeatFrom({ freq: "weeks", interval: 1 }, "2026-10-26", "2026-10-29", "2026-10-29"), "2026-10-29", "saved before the pin");
  assert.equal(repeatFrom({ freq: "monthly", interval: 1, dayOfMonth: 5 }, "2026-11-05", "2026-11-09", "2026-11-09"), "2026-11-05", "a pinned monthly day uses the slot too");
  assert.equal(repeatFrom({ freq: "monthly", interval: 1 }, "2026-11-05", "2026-11-09", "2026-11-09"), "2026-11-09", "an unpinned monthly rule doesn't");
});

test("repeatCreatedCopy: reads the copy a REPEAT_CREATED event names", () => {
  assert.deepEqual(repeatCreatedCopy({ next: "t2", due: "2026-11-20" }), { next: "t2", madeInAsana: false, due: "2026-11-20" });
  assert.deepEqual(repeatCreatedCopy({ next: "t3", due: null, madeInAsana: true }), { next: "t3", madeInAsana: true, due: null });
  assert.deepEqual(repeatCreatedCopy({ next: "t4", due: "soon" }), { next: "t4", madeInAsana: false, due: null });
  assert.equal(repeatCreatedCopy({ due: "2026-11-20" }), null);
  assert.equal(repeatCreatedCopy({ next: "" }), null);
  assert.equal(repeatCreatedCopy({ next: 42 }), null);
  assert.equal(repeatCreatedCopy(null), null);
  assert.equal(repeatCreatedCopy(["t2"]), null);
  assert.equal(repeatCreatedCopy("t2"), null);
});

const fresh: RepeatCopyTrace = {
  status: "OPEN",
  appEditedAt: null,
  asanaId: null,
  eventKinds: ["CREATED"],
  attachments: 0,
  checkedItems: 0,
  readStates: 0,
  emails: [{ sentAt: null, attempts: 0 }],
};

test("isUntouchedCopy: a fresh copy, with or without its unsent email, can be taken back", () => {
  assert.equal(isUntouchedCopy(fresh), true);
  assert.equal(isUntouchedCopy({ ...fresh, emails: [] }), true);
});

test("isUntouchedCopy: any sign of use keeps the copy", () => {
  const touched: [string, Partial<RepeatCopyTrace>][] = [
    ["started", { status: "IN_PROGRESS" }],
    ["finished", { status: "DONE" }],
    ["canceled", { status: "CANCELED" }],
    ["edited in the app", { appEditedAt: new Date("2026-10-23T15:00:00Z") }],
    ["Asana's own task", { asanaId: "1209" }],
    ["a comment", { eventKinds: ["CREATED", "COMMENT"] }],
    ["a title change", { eventKinds: ["CREATED", "TITLE"] }],
    ["its own next copy", { eventKinds: ["CREATED", "REPEAT_CREATED"] }],
    ["no CREATED line", { eventKinds: ["COMMENT"] }],
    ["no events at all", { eventKinds: [] }],
    ["a file", { attachments: 1 }],
    ["a checked item", { checkedItems: 1 }],
    ["opened in the portal", { readStates: 1 }],
    ["an email that went out", { emails: [{ sentAt: new Date("2026-10-23T15:05:00Z"), attempts: 1 }] }],
    ["an email a send run took", { emails: [{ sentAt: null, attempts: 1 }] }],
    ["one of two emails sent", { emails: [{ sentAt: null, attempts: 0 }, { sentAt: new Date("2026-10-23T15:05:00Z"), attempts: 1 }] }],
  ];
  for (const [why, change] of touched) assert.equal(isUntouchedCopy({ ...fresh, ...change }), false, why);
});
