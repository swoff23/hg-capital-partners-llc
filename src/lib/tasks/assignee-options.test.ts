import test from "node:test";
import assert from "node:assert/strict";
import { assigneeKey, mergeLegacyNames, personKey, recentAssigneeKeys, youFirst } from "./assignee-people";

const assigned = (to: { userId?: string | null; contactId?: string | null; name?: string }) => ({ data: { from: {}, to } });

test("assigneeKey: a user is u:, a contractor c:, nobody is null", () => {
  assert.equal(assigneeKey({ userId: "a" }), "u:a");
  assert.equal(assigneeKey({ userId: null, contactId: "z" }), "c:z");
  assert.equal(assigneeKey({ userId: null, contactId: null }), null);
  assert.equal(assigneeKey(null), null);
  assert.equal(assigneeKey(undefined), null);
});

test("youFirst: the viewer's row leads, the rest keep their order", () => {
  const team = [{ id: "p", name: "Pieter" }, { id: "c", name: "Connor" }, { id: "z", name: "Zed" }];
  assert.deepEqual(youFirst(team, "c").map((u) => u.id), ["c", "p", "z"]);
  assert.deepEqual(youFirst(team, "p").map((u) => u.id), ["p", "c", "z"]);
  assert.deepEqual(youFirst(team, undefined).map((u) => u.id), ["p", "c", "z"]);
  assert.deepEqual(youFirst(team, "nobody").map((u) => u.id), ["p", "c", "z"], "an id not on the team changes nothing");
  assert.deepEqual(youFirst([], "c"), []);
});

test("youFirst: does not change the list it was given", () => {
  const team = [{ id: "p" }, { id: "c" }];
  youFirst(team, "c");
  assert.deepEqual(team.map((u) => u.id), ["p", "c"]);
});

test("recentAssigneeKeys: up to 3, newest first, each person once", () => {
  const offered = new Set(["u:a", "u:b", "c:x", "c:y", "c:z"]);
  const events = [
    assigned({ userId: "a" }),
    assigned({ contactId: "x" }),
    assigned({ userId: "a" }), // a again, older: already listed
    assigned({ contactId: "y" }),
    assigned({ userId: "b" }), // a fourth person
  ];
  assert.deepEqual(recentAssigneeKeys(events, offered), ["u:a", "c:x", "c:y"]);
  assert.deepEqual(recentAssigneeKeys(events, offered, 2), ["u:a", "c:x"]);
  assert.deepEqual(recentAssigneeKeys(events, offered, 10), ["u:a", "c:x", "c:y", "u:b"]);
});

test("recentAssigneeKeys: unassigning, a legacy name and someone no longer offered are skipped", () => {
  const offered = new Set(["u:a", "c:x"]);
  const events = [
    assigned({ userId: null, contactId: null }), // "unassigned this"
    assigned({ name: "Brandon" }), // a legacy name, not a person
    assigned({ contactId: "gone" }), // inactive since
    assigned({ contactId: "x" }),
    { data: null },
    { data: "junk" },
    assigned({ userId: "a" }),
  ];
  assert.deepEqual(recentAssigneeKeys(events, offered), ["c:x", "u:a"]);
  assert.deepEqual(recentAssigneeKeys([], offered), []);
});

test("recentAssigneeKeys: a task created with an assignee counts like an assignment; a CREATED line without one is skipped", () => {
  const offered = new Set(["u:a", "c:x", "c:y"]);
  const events = [
    { data: {} }, // a task created with nobody
    { data: { repeatOf: "t0", due: "2026-10-26" } }, // a repeat copy
    { data: { to: { userId: null, contactId: "x" } } }, // created with a contractor
    assigned({ userId: "a" }),
    { data: { to: { userId: "a", contactId: null } } }, // created with a partner, a again
    { data: { to: { userId: null, contactId: "y" } } },
  ];
  assert.deepEqual(recentAssigneeKeys(events, offered), ["c:x", "u:a", "c:y"]);
});

test("personKey: accents, case, a nickname in parentheses and punctuation don't make two people", () => {
  assert.equal(personKey("José Alvarez"), personKey("Jose Alvarez"));
  assert.equal(personKey("Jacob hoak"), personKey("Jacob (Jake) hoak"));
  assert.equal(personKey("  JOHN   O'Connell "), personKey("john oconnell"));
  assert.equal(personKey("Zack (Outlaw Carpentry)"), "zack");
  assert.notEqual(personKey("Brandon Zarbo"), personKey("Brandon Kmiotek"));
});

const people = [
  { key: "u:connor", name: "Connor Swofford", email: "connor@hg.test" },
  { key: "c:zack", name: "Zack Reading", email: "zack@outlawcarpentry.com" },
  { key: "c:jose", name: "Jose Alvarez", email: null },
  { key: "c:jake", name: "Jacob (Jake) hoak", email: null },
  { key: "c:brandonz", name: "Brandon Zarbo", email: null },
];

test("mergeLegacyNames: a legacy name folds into the person it is, by name or by email", () => {
  const { merged, others } = mergeLegacyNames(
    ["Brandon Zarbo", "José Alvarez", "Jacob hoak", "zack@outlawcarpentry.com", "Zack@OutlawCarpentry.com"],
    people,
  );
  assert.equal(merged.get("Brandon Zarbo"), "c:brandonz");
  assert.equal(merged.get("José Alvarez"), "c:jose", "José is Jose");
  assert.equal(merged.get("Jacob hoak"), "c:jake", "the nickname is dropped");
  assert.equal(merged.get("zack@outlawcarpentry.com"), "c:zack", "an email matches the contact's email");
  assert.equal(merged.get("Zack@OutlawCarpentry.com"), "c:zack", "case doesn't matter");
  assert.deepEqual(others, []);
});

test("mergeLegacyNames: a name that is nobody's lists once under Others, however it repeats", () => {
  const { merged, others } = mergeLegacyNames(
    ["Brandon Kmiotek", "John OConnell", "brandon kmiotek", "John O'Connell", "Brandon Zarbo", "nobody@example.com"],
    people,
  );
  assert.deepEqual([...merged.keys()], ["Brandon Zarbo"]);
  assert.deepEqual(others, ["Brandon Kmiotek", "John OConnell", "nobody@example.com"]);
});

test("mergeLegacyNames: a name two people share belongs to neither", () => {
  const twins = [
    { key: "c:a", name: "Sam Lee", email: null },
    { key: "u:b", name: "Sam Lee", email: null },
  ];
  const { merged, others } = mergeLegacyNames(["Sam Lee"], twins);
  assert.equal(merged.size, 0);
  assert.deepEqual(others, ["Sam Lee"]);
});

test("mergeLegacyNames: blanks are skipped, and nothing to merge into leaves every name", () => {
  assert.deepEqual(mergeLegacyNames(["", "  "], people), { merged: new Map(), others: [] });
  assert.deepEqual(mergeLegacyNames(["Zack Reading"], []).others, ["Zack Reading"]);
});
