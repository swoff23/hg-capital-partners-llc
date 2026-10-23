import test from "node:test";
import assert from "node:assert/strict";
import { describeRepeat, nextOccurrence, parseRepeatRule } from "./repeat";

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
