import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTokens,
  dueFromOffset,
  extractTokens,
  hasOpenTokens,
  isAddressToken,
  parseTemplateItems,
  rowTitle,
  sameToken,
  tokenInputType,
  tokenLabel,
} from "./template-items";

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
  assert.equal(isAddressToken("Property  name"), true);
  assert.equal(isAddressToken("Tenant"), false);
});

test("one field per value: [tenant name] is [Tenant], and every address spelling is one", () => {
  assert.equal(sameToken("Tenant", "tenant name"), true);
  assert.equal(sameToken("tenant", " Tenant  Name "), true);
  assert.equal(sameToken("Address", "property address"), true);
  assert.equal(sameToken("Tenant", "tenant email"), false);
  assert.equal(sameToken("first name", "last name"), false);
  assert.deepEqual(extractTokens(["Give [Tenant] keys", "[tenant name] [Address]", "owners of [property address]", "[tenant email]"]), [
    "Tenant",
    "Address",
    "tenant email",
  ]);
  const filled = applyTokens("[tenant name] at [property address], hi [tenant]", { Tenant: "Dana Lee", Address: "767 Prospect" });
  assert.equal(filled, "Dana Lee at 767 Prospect, hi Dana Lee");
});

test("a blank spelling never hides a filled one", () => {
  assert.equal(applyTokens("Keys for [Tenant]", { "tenant name": " ", Tenant: "Dana" }), "Keys for Dana");
});

test("an edited title still fills the tokens it kept", () => {
  // The apply step fills the hand-edited title too, so typing the tenant after the edit still clears it.
  const item = "Transfer [Tenant] security deposit to Baselane";
  assert.equal(rowTitle("Transfer [Tenant] deposit today", item, { Tenant: "Dana Price" }), "Transfer Dana Price deposit today");
  assert.equal(rowTitle(undefined, item, { Tenant: "Dana Price" }), "Transfer Dana Price security deposit to Baselane");
  assert.equal(rowTitle("Transfer [Tenant] deposit today", item, {}), "Transfer [Tenant] deposit today");
});

test("the move-in playbook's own wording leaves no brackets once each field is filled", () => {
  // Shapes from the imported NEW TENANT and NEW MOVE OUT playbooks: mixed casing, a notes-only
  // [tenant name] / [tenant email] / [tenant number] block, and the address in the group text.
  const strings = [
    "Give [Tenant] keys (only after they confirmed National Gas/Fuel set up)",
    "[tenant] confirm national fuel and national grid set up",
    "[tenant name]\n[tenant email]\n[tenant number]",
    "Hey [tenant]! We're the owners of [property address].",
    "Perform unit walk through with [tenant] and receive keys",
  ];
  const tokens = extractTokens(strings);
  assert.deepEqual(tokens, ["Tenant", "tenant email", "tenant number", "property address"]);
  assert.deepEqual(tokens.map(tokenLabel), ["Tenant", "Tenant email", "Tenant number", "Property address"]);
  const values = Object.fromEntries(tokens.map((t) => [t, `value of ${t}`]));
  for (const s of strings) assert.equal(hasOpenTokens(applyTokens(s, values)), false, s);
});

test("token labels read in sentence case", () => {
  assert.equal(tokenLabel("tenant email"), "Tenant email");
  assert.equal(tokenLabel(" property  address "), "Property address");
  assert.equal(tokenLabel("Tenant"), "Tenant");
});

test("email and phone tokens get their keyboards; everything else is text", () => {
  assert.equal(tokenInputType("tenant email"), "email");
  assert.equal(tokenInputType("Tenant E-mail"), "email");
  assert.equal(tokenInputType("tenant number"), "tel");
  assert.equal(tokenInputType("Tenant phone"), "tel");
  assert.equal(tokenInputType("cell"), "tel");
  assert.equal(tokenInputType("unit number"), "text", "unit numbers can have letters");
  assert.equal(tokenInputType("policy number"), "text");
  assert.equal(tokenInputType("Tenant"), "text");
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
