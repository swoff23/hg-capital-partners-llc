import test from "node:test";
import assert from "node:assert/strict";
import {
  MOVE_IN_LABEL,
  MOVE_OUT_LABEL,
  UNTICK_LEASE,
  UNTICK_LEASE_SHORT,
  appliedLeaseLine,
  applyDraftKey,
  applyProblems,
  applyTokens,
  createLeaseLabel,
  createTasksLabel,
  dueFromOffset,
  fillInValue,
  hasApplyProblems,
  homeResolves,
  isTenantNameToken,
  isTenantPhoneToken,
  itemsVersion,
  leaseWhere,
  moveOutLabel,
  playbookKind,
  prefillHousehold,
  shortNames,
  tasksToCreate,
  tenantPrefill,
  extractTokens,
  fillNotes,
  hasOpenTokens,
  isAddressToken,
  notesOnlyTokens,
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

// The imported NEW TENANT playbook's shapes (decision 27, BPLAY-010 option B).
const NEW_TENANT = [
  { title: "Get [Tenant] on Baselane", notes: "[tenant name]\n    [tenant email]\n    [tenant number]" },
  { title: "Setup [Tenant] group text", notes: "Hey [tenant]! We're the owners of [property address].\n\nThanks!" },
  { title: "Store [Tenant] insurance", checklist: ["Email [tenant email] the form"] },
];

test("only tokens no title or checklist uses are optional, and the address never is", () => {
  assert.deepEqual(notesOnlyTokens(NEW_TENANT.slice(0, 2)), ["tenant email", "tenant number"]);
  // A checklist item that needs the email makes it required again.
  assert.deepEqual(notesOnlyTokens(NEW_TENANT), ["tenant number"]);
  assert.deepEqual(notesOnlyTokens([{ title: "Walk through with [tenant]" }]), []);
});

test("a blank optional field drops its whole line from the notes; nothing in brackets is left", () => {
  const optional = notesOnlyTokens(NEW_TENANT.slice(0, 2));
  const notes = NEW_TENANT[0].notes;
  const dana = { Tenant: "Dana Reyes", "tenant email": "", "tenant number": "" };
  assert.equal(fillNotes(notes, dana, optional), "Dana Reyes");
  assert.equal(fillNotes(notes, { ...dana, "tenant number": "716-555-0142" }, optional), "Dana Reyes\n    716-555-0142");
  assert.equal(
    fillNotes(notes, { ...dana, "tenant email": "dana@example.com", "tenant number": "716-555-0142" }, optional),
    "Dana Reyes\n    dana@example.com\n    716-555-0142",
  );
  // A spelling of the key counts as its value; whitespace alone is blank.
  assert.equal(fillNotes(notes, { ...dana, "Tenant Email": "dana@example.com", "tenant number": "  " }, optional), "Dana Reyes\n    dana@example.com");
  // Every line dropped: no notes at all.
  assert.equal(fillNotes("[tenant email]\n[tenant number]", {}, optional), null);
  // Lines dropped mid-note leave no run of blank lines behind.
  assert.equal(fillNotes("Call first.\n\n[tenant number]\n\nThen email.", {}, optional), "Call first.\n\nThen email.");
});

test("notes with nothing optional left blank fill exactly as before", () => {
  const values = { Tenant: "Dana Reyes", "property address": "118 Congress" };
  const notes = NEW_TENANT[1].notes!;
  assert.equal(fillNotes(notes, values, ["tenant email"]), applyTokens(notes, values));
  // A required token left blank stays in brackets, so the apply step still blocks on it.
  assert.equal(fillNotes(notes, { "property address": "118 Congress" }, []), "Hey [tenant]! We're the owners of 118 Congress.\n\nThanks!");
  assert.equal(fillNotes(undefined, values, []), null);
  assert.equal(fillNotes("", values, []), null);
});

test("an address ending in a period doesn't double the sentence's own", () => {
  // shortAddress("118 Congress St. Buffalo, NY 14213") is "118 Congress St.", and the group text ends "[property address]."
  const values = { Tenant: "Dana Reyes", "property address": "118 Congress St." };
  assert.equal(fillNotes(NEW_TENANT[1].notes, values, []), "Hey Dana Reyes! We're the owners of 118 Congress St.\n\nThanks!");
  assert.equal(applyTokens("Keys for [property address]", values), "Keys for 118 Congress St.");
  assert.equal(applyTokens("[property address], Buffalo", values), "118 Congress St., Buffalo");
  assert.equal(applyTokens("Owners of [property address]...", values), "Owners of 118 Congress St...");
  assert.equal(applyTokens("Owners of [property address].", { "property address": "58 Mariner Street" }), "Owners of 58 Mariner Street.");
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

test("the bar counts what Create will make: 39 tasks to create, Create 39 tasks", () => {
  assert.equal(tasksToCreate(39), "39 tasks to create");
  assert.equal(createTasksLabel(39), "Create 39 tasks");
  assert.equal(tasksToCreate(1), "1 task to create");
  assert.equal(createTasksLabel(1), "Create 1 task");
  // Nothing ticked: the bar says so, and the primary stays pressable to explain why.
  assert.equal(tasksToCreate(0), "No tasks to create");
  assert.equal(createTasksLabel(0), "Create tasks");
});

test("applyProblems names what to enter, once per field, and stays empty when all is well", () => {
  const ok = applyProblems({ propertyId: "p1", count: 39, open: [] });
  assert.deepEqual(ok, { tokens: {} });
  assert.equal(hasApplyProblems(ok), false);

  const none = applyProblems({ propertyId: null, count: 0, open: ["Tenant", "tenant email", "Tenant"] });
  assert.equal(none.property, "Choose a property.");
  assert.equal(none.tasks, "Include a task first.");
  assert.deepEqual(none.tokens, { Tenant: "Enter the tenant.", "tenant email": "Enter the tenant email." });
  assert.equal(hasApplyProblems(none), true);

  // Each alone is enough to stop Create.
  assert.equal(hasApplyProblems(applyProblems({ propertyId: "", count: 3, open: [] })), true);
  assert.equal(hasApplyProblems(applyProblems({ propertyId: "p1", count: 0, open: [] })), true);
  assert.equal(hasApplyProblems(applyProblems({ propertyId: "p1", count: 3, open: ["Tenant"] })), true);
});

test("a playbook's version changes with its tasks, so an old draft never lands on a new list", () => {
  const a = [{ title: "Collect deposit" }, { title: "Give keys" }];
  assert.equal(itemsVersion(a), itemsVersion([{ title: "Collect deposit" }, { title: "Give keys" }]));
  assert.notEqual(itemsVersion(a), itemsVersion([{ title: "Give keys" }, { title: "Collect deposit" }]));
  assert.notEqual(itemsVersion(a), itemsVersion([...a, { title: "Walk the unit" }]));
  assert.match(itemsVersion(a), /^2-/);
});

test("an application's draft is kept per person and per building it was opened for, so it never replaces another's page", () => {
  const items = [{ title: "Collect deposit" }, { title: "Give keys" }];
  const forA = applyDraftKey("u1", "t1", items, "prop_A");
  const forB = applyDraftKey("u1", "t1", items, "prop_B");
  const none = applyDraftKey("u1", "t1", items, null);
  assert.equal(forA, applyDraftKey("u1", "t1", items, "prop_A"), "the same page finds its own draft again");
  assert.equal(new Set([forA, forB, none]).size, 3);
  // A second person on the same browser never gets the first one's draft.
  assert.notEqual(forA, applyDraftKey("u2", "t1", items, "prop_A"));
  // Still per playbook and per version of its tasks.
  assert.notEqual(forA, applyDraftKey("u1", "t2", items, "prop_A"));
  assert.notEqual(forA, applyDraftKey("u1", "t1", [...items, { title: "Walk the unit" }], "prop_A"));
  assert.ok(forA.startsWith(`apply:u1:t1:${itemsVersion(items)}:`));
});

// Playbooks and leases (docs/specs/tenants.md section 9, tenant-contact.md section 6).

test("the date label says which playbook it is, by the two patterns the spec pins", () => {
  assert.equal(MOVE_IN_LABEL.source, "move[- ]?in");
  assert.equal(MOVE_IN_LABEL.flags, "i");
  assert.equal(MOVE_OUT_LABEL.source, "move[- ]?out");
  assert.equal(MOVE_OUT_LABEL.flags, "i");
  for (const label of ["Move-in date", "Move in date", "MOVEIN", "move-in"]) assert.equal(playbookKind(label), "move-in", label);
  for (const label of ["Move-out date", "Move out date", "moveout"]) assert.equal(playbookKind(label), "move-out", label);
  // Renamed, or no label at all: no lease box, so it fails safe. Both at once is neither.
  for (const label of ["Start date", "Closing date", "Moving day", "", null, undefined, "Move-in or move-out date"]) assert.equal(playbookKind(label), null, String(label));
});

test("the household's names join for a fill-in, and shorten past two for a box or a toast", () => {
  const joined = (...names: string[]) => tenantPrefill("Tenant", { names, phone: null });
  assert.equal(joined("Dana Lee"), "Dana Lee");
  assert.equal(joined("Dana Lee", "Sam Ortiz"), "Dana Lee and Sam Ortiz");
  assert.equal(joined("Dana Lee", "Sam Ortiz", "Ana Ruiz"), "Dana Lee, Sam Ortiz and Ana Ruiz");
  assert.equal(joined("Dana Lee", "Sam Ortiz", "Ana Ruiz", "Bo Chen"), "Dana Lee, Sam Ortiz, Ana Ruiz and Bo Chen");
  // Joined the way comments and the portal join names (job-view.ts), after a trim: a blank name isn't a person.
  assert.equal(joined(" Dana Lee ", ""), "Dana Lee");
  assert.equal(joined(" ", ""), undefined);
  assert.equal(shortNames(["Dana Lee", "Sam Ortiz"]), "Dana Lee and Sam Ortiz");
  assert.equal(shortNames(["Dana Lee", "Sam Ortiz", "Ana Ruiz"]), "Dana Lee and 2 others");
});

test("[Tenant] and [tenant name] take the names; a phone fill-in starting with tenant takes the primary's phone", () => {
  const home = { names: ["Dana Lee", "Sam Ortiz"], phone: "716-555-1234 ext 2" };
  assert.equal(isTenantNameToken("Tenant"), true);
  assert.equal(isTenantNameToken("tenant name"), true);
  assert.equal(isTenantNameToken("tenant email"), false);
  for (const t of ["tenant number", "Tenant phone", "tenant cell", "tenant mobile"]) {
    assert.equal(isTenantPhoneToken(t), true, t);
    assert.equal(tenantPrefill(t, home), "716-555-1234 ext 2", t);
  }
  for (const t of ["Tenant", "tenant name"]) assert.equal(tenantPrefill(t, home), "Dana Lee and Sam Ortiz", t);
  // Nothing else prefills: not the email, not someone else's phone, not the address.
  for (const t of ["tenant email", "owner phone", "cell", "Address", "unit number"]) assert.equal(tenantPrefill(t, home), undefined, t);
  // No phone on file: the field stays blank. Nobody living there: nothing prefills.
  assert.equal(tenantPrefill("tenant number", { names: ["Dana Lee"], phone: null }), undefined);
  assert.equal(tenantPrefill("Tenant", null), undefined);
  assert.equal(tenantPrefill("Tenant", { names: [], phone: null }), undefined);
});

test("a move-in playbook prefills nothing: its tenants are new", () => {
  const home = { names: ["Dana Lee"], phone: "716-555-1234" };
  assert.equal(prefillHousehold("move-in", home), null);
  assert.equal(prefillHousehold("move-out", home), home);
  assert.equal(prefillHousehold(null, home), home);
  assert.equal(prefillHousehold(null, undefined), null);
});

test("the prefill is a computed default: it never lands in the typed values, and anything typed wins", () => {
  const home = { names: ["Dana Lee", "Sam Ortiz"], phone: "716-555-1234" };
  const typed = Object.freeze({}) as Record<string, string>;
  const defaults = { address: "767 Prospect", household: home };
  assert.equal(fillInValue("Tenant", typed, defaults), "Dana Lee and Sam Ortiz");
  assert.equal(fillInValue("tenant number", typed, defaults), "716-555-1234");
  assert.equal(fillInValue("property address", typed, defaults), "767 Prospect");
  assert.equal(fillInValue("tenant email", typed, defaults), "");
  // Nothing was written into what was typed, so the draft and the changed check never see the prefill.
  assert.deepEqual(typed, {});
  // Typing over it wins, and so does clearing it.
  assert.equal(fillInValue("Tenant", { Tenant: "Ana Ruiz" }, defaults), "Ana Ruiz");
  assert.equal(fillInValue("Tenant", { Tenant: "" }, defaults), "");
  // No household, no address: blank.
  assert.equal(fillInValue("Tenant", {}, {}), "");
});

test("a home names one household with a unit picked or a building of one unit", () => {
  assert.equal(homeResolves(["1", "2"], "2"), true);
  assert.equal(homeResolves(["1", "2"], null), false, "a building with several units and none picked");
  assert.equal(homeResolves(["Front", "HSE (house)"], null), true, "the house meter isn't a unit");
  assert.equal(homeResolves([], null), true, "a whole house");
  assert.equal(homeResolves(["Front", "HSE (house)"], "HSE (house)"), false);
});

test("the lease box reads what Apply will do, with the playbook's date", () => {
  const today = "2026-11-20";
  assert.equal(createLeaseLabel("Dana Lee", leaseWhere("767 Prospect", "2"), "2026-12-01", today), "Create a lease for Dana Lee at Unit 2, moving in Dec 1");
  assert.equal(createLeaseLabel(" Dana  Lee ", leaseWhere("767 Prospect", null), "2027-02-01", today), "Create a lease for Dana Lee at 767 Prospect, moving in Feb 1, 2027");
  assert.equal(leaseWhere("647 Prospect", "Front"), "Front");
  assert.equal(moveOutLabel(["Dana Lee", "Sam Ortiz"], "2026-12-31", today), "Set Dana Lee and Sam Ortiz to move out Dec 31");
  assert.equal(moveOutLabel(["Dana Lee", "Sam Ortiz", "Ana Ruiz"], "2026-12-31", today), "Set Dana Lee and 2 others to move out Dec 31");
  assert.equal(moveOutLabel(["Dana Lee"], "2026-12-31", today), "Set Dana Lee to move out Dec 31");
});

test("the toast says what happened to the lease in its second clause, short enough to sit beside the count", () => {
  const today = "2026-11-20";
  assert.equal(appliedLeaseLine({ kind: "move-in", name: "Dana Lee" }, today), "Lease created for Dana Lee");
  assert.equal(appliedLeaseLine({ kind: "move-out", names: ["Dana Lee", "Sam Ortiz"], movesOut: "2026-12-31" }, today), "Dana Lee and Sam Ortiz move out Dec 31");
  assert.equal(appliedLeaseLine({ kind: "move-out", names: ["Dana Lee"], movesOut: "2026-12-31" }, today), "Dana Lee moves out Dec 31");
  const whole = `10 tasks created for 767 Prospect Ave. · ${appliedLeaseLine({ kind: "move-out", names: ["Dana Lee", "Sam Ortiz", "Ana Ruiz"], movesOut: "2027-01-31" }, today)}`;
  assert.ok(whole.length <= 90, whole);
  assert.match(UNTICK_LEASE, /^Untick the box/);
});

test("a refused lease write ends with the way through, short on a phone", () => {
  // The way through is never cut (SaveError's action), so on a 375 phone it leaves the refusal about 30 characters.
  assert.equal(UNTICK_LEASE, "Untick the box to apply without it.");
  assert.equal(UNTICK_LEASE_SHORT, "Untick to skip it.");
  assert.ok(UNTICK_LEASE_SHORT.length <= 18);
});
