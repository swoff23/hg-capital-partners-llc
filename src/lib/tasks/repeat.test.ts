import test from "node:test";
import assert from "node:assert/strict";
import { describeRepeat, isUntouchedCopy, nextOccurrence, parseRepeatRule, repeatCreatedCopy, type RepeatCopyTrace } from "./repeat";

test("parseRepeatRule: valid rules, defaults, junk", () => {
  assert.deepEqual(parseRepeatRule({ freq: "monthly" }), { freq: "monthly", interval: 1 });
  assert.deepEqual(parseRepeatRule({ freq: "weeks", interval: 2 }), { freq: "weeks", interval: 2 });
  assert.equal(parseRepeatRule(null), null);
  assert.equal(parseRepeatRule({ freq: "hourly" }), null);
  assert.equal(parseRepeatRule({ freq: "days", interval: 0 }), null);
  assert.equal(parseRepeatRule({ freq: "monthly", dayOfMonth: 32 }), null);
});

test("nextOccurrence: days and weeks", () => {
  assert.equal(nextOccurrence({ freq: "days", interval: 1 }, "2026-10-31"), "2026-11-01");
  assert.equal(nextOccurrence({ freq: "days", interval: 10 }, "2026-12-25"), "2027-01-04");
  assert.equal(nextOccurrence({ freq: "weeks", interval: 2 }, "2026-10-22"), "2026-11-05");
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

test("describeRepeat", () => {
  assert.equal(describeRepeat({ freq: "days", interval: 1 }), "Every day");
  assert.equal(describeRepeat({ freq: "weeks", interval: 2 }), "Every 2 weeks");
  assert.equal(describeRepeat({ freq: "monthly", interval: 1, dayOfMonth: 5 }), "Monthly on the 5th");
  assert.equal(describeRepeat({ freq: "monthly", interval: 1, dayOfMonth: 22 }), "Monthly on the 22nd");
  assert.equal(describeRepeat({ freq: "monthly", interval: 1, dayOfMonth: 11 }), "Monthly on the 11th");
  assert.equal(describeRepeat({ freq: "quarterly", interval: 1 }), "Quarterly");
  assert.equal(describeRepeat({ freq: "yearly", interval: 1 }), "Yearly");
});

test("repeatCreatedCopy: reads the copy a REPEAT_CREATED event names", () => {
  assert.deepEqual(repeatCreatedCopy({ next: "t2", due: "2026-11-20" }), { next: "t2", madeInAsana: false });
  assert.deepEqual(repeatCreatedCopy({ next: "t3", due: null, madeInAsana: true }), { next: "t3", madeInAsana: true });
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
