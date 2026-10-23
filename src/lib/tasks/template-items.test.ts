import test from "node:test";
import assert from "node:assert/strict";
import { applyTokens, dueFromOffset, extractTokens, hasOpenTokens, isAddressToken, parseTemplateItems } from "./template-items";

test("parseTemplateItems keeps the import's shape and drops junk", () => {
  const items = parseTemplateItems([
    { title: " Collect deposit from [Tenant] ", notes: "Fill in [Address].", assigneeUserId: "u1", asanaGid: "1" },
    { title: "Give keys", assigneeContactId: "c1", checklist: ["Photo of the lockbox", "", 3] },
    { title: "Utilities", assigneeName: "Zed", dueOffsetDays: -2 },
    { title: "  " },
    null,
    "nope",
    { title: "Bad offset", dueOffsetDays: 1.5 },
  ]);
  assert.deepEqual(items, [
    { title: "Collect deposit from [Tenant]", notes: "Fill in [Address].", assigneeUserId: "u1" },
    { title: "Give keys", assigneeContactId: "c1", checklist: ["Photo of the lockbox"] },
    { title: "Utilities", assigneeName: "Zed", dueOffsetDays: -2 },
    { title: "Bad offset" },
  ]);
  assert.deepEqual(parseTemplateItems({}), []);
});

test("extractTokens lists each token once, in first-seen order", () => {
  assert.deepEqual(extractTokens(["Lease signed by [Tenant]", "Utilities into [tenant]'s name at [Address]", null, "[] and [a[b]"]), [
    "Tenant",
    "Address",
    "b",
  ]);
});

test("applyTokens fills known tokens and leaves the rest as written", () => {
  const values = { tenant: "Dana Lee", Address: "767 Prospect", Unit: "  " };
  assert.equal(applyTokens("Lease signed by [Tenant] at [ADDRESS]", values), "Lease signed by Dana Lee at 767 Prospect");
  assert.equal(applyTokens("Keys for [Unit] and [Other]", values), "Keys for [Unit] and [Other]");
});

test("hasOpenTokens spots an unfilled token", () => {
  assert.equal(hasOpenTokens("Lease signed by [Tenant]"), true);
  assert.equal(hasOpenTokens("Lease signed by Dana"), false);
  assert.equal(hasOpenTokens("Lease signed by [Tenant]"), true, "the regex keeps no state between calls");
});

test("address tokens are filled from the property", () => {
  assert.equal(isAddressToken("Address"), true);
  assert.equal(isAddressToken(" property address "), true);
  assert.equal(isAddressToken("Tenant"), false);
});

test("dueFromOffset moves the anchor by whole days, across months and DST", () => {
  assert.equal(dueFromOffset("2026-10-30", 3), "2026-11-02");
  assert.equal(dueFromOffset("2026-11-02", -7), "2026-10-26");
  assert.equal(dueFromOffset("2026-03-07", 1), "2026-03-08");
  assert.equal(dueFromOffset("2026-10-30", 0), "2026-10-30");
  assert.equal(dueFromOffset("2026-10-30", undefined), null);
  assert.equal(dueFromOffset(null, 3), null);
  assert.equal(dueFromOffset("not a date", 3), null);
  assert.equal(dueFromOffset("2026-10-30", 2.9), "2026-11-01", "whole days only");
});
