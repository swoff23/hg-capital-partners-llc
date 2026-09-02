import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVE_DEAL_STATUSES, DEAL_STATUSES, DEFAULT_DEAL_STATUS, isDealStatus } from "./config";

test("the default deal status is a real status and is not counted as Active", () => {
  assert.ok(isDealStatus(DEFAULT_DEAL_STATUS));
  assert.ok(!(ACTIVE_DEAL_STATUSES as readonly string[]).includes(DEFAULT_DEAL_STATUS));
});

test("isDealStatus rejects the legacy schema default and unknown values", () => {
  assert.equal(isDealStatus("Active"), false);
  assert.equal(isDealStatus("Closing"), false);
  assert.equal(isDealStatus(null), false);
  for (const s of DEAL_STATUSES) assert.equal(isDealStatus(s), true);
});

test("Active = everything ranked above TBD", () => {
  assert.deepEqual([...ACTIVE_DEAL_STATUSES], ["1 - High", "2 - Medium", "3 - Low", "4 - To Schedule"]);
});
