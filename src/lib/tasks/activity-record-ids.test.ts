import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activityRecordIds, buildActivity, type ActivityEvent } from "./activity";

/**
 * NOV3-TASKS-1: a task's history named an archived contractor "someone" and
 * an archived property "another property", because the page named records
 * from the pickers' lists, which leave archived ones out. The page now looks
 * up every contractor and property the lines name by id (activity-names.ts).
 */

let seq = 0;
function ev(kind: ActivityEvent["kind"], data: Record<string, unknown>): ActivityEvent {
  seq++;
  return {
    id: `e${seq}`,
    kind,
    visibility: "INTERNAL",
    actorLabel: "Connor Swofford",
    actorUserId: "u-connor",
    actorContactId: null,
    body: null,
    data,
    createdAt: new Date(Date.UTC(2026, 9, 20, 14, seq * 5)),
    source: "APP",
  };
}

test("activityRecordIds: every contractor and property a line names, once each", () => {
  const events = [
    ev("CREATED", { to: { userId: null, contactId: "c-zack" } }),
    ev("ASSIGNED", { from: { userId: null, contactId: "c-zack", name: null }, to: { userId: null, contactId: "c-jose" } }),
    ev("ASSIGNED", { from: { userId: "u-pieter", contactId: null }, to: { userId: "u-connor", contactId: null } }),
    ev("CREATED", { repeatOf: "t0", due: "2026-11-01", archivedAssignee: "c-old" }),
    ev("PROPERTY", { from: "p-sold", to: "p-new" }),
    ev("PROPERTY", { unitFrom: "Upper", unitTo: "Lower" }),
    ev("CONFLICT", { field: "assignee", app: { userId: null, contactId: "c-kept" } }),
    ev("CONFLICT", { field: "place", app: { propertyId: "p-kept", bucket: "Property" } }),
    ev("STATUS", { from: "OPEN", to: "DONE" }),
    ev("ASSIGNED", { from: null, to: "junk" }),
  ];
  const ids = activityRecordIds(events);
  assert.deepEqual(ids.contacts.sort(), ["c-jose", "c-kept", "c-old", "c-zack"]);
  assert.deepEqual(ids.properties.sort(), ["p-kept", "p-new", "p-sold"]);
  assert.deepEqual(activityRecordIds([]), { contacts: [], properties: [] });
});

test("with those names the lines say who and where, archived or not", () => {
  const events = [
    ev("ASSIGNED", { from: { userId: null, contactId: null }, to: { userId: null, contactId: "c-zack" } }),
    ev("PROPERTY", { from: null, to: "p-sold" }),
  ];
  const texts = (names: Parameters<typeof buildActivity>[1]) => buildActivity(events, names, "2026-10-23").flatMap((e) => ("text" in e ? [e.text] : []));
  // What the page showed when the names came only from the pickers' lists.
  assert.deepEqual(texts({}), ["Connor assigned someone", "Connor moved this to another property"]);
  assert.deepEqual(texts({ contacts: { "c-zack": "Zack Outlaw" }, properties: { "p-sold": "118 Congress St" } }), [
    "Connor assigned Zack Outlaw",
    "Connor moved this to 118 Congress St",
  ]);
});

const page = readFileSync(new URL("../../app/(app)/tasks/[id]/page.tsx", import.meta.url), "utf8");

test("the task page names records from activityRecordNames, ahead of the pickers' lists", () => {
  assert.match(page, /activityRecordNames\(activityRecordIds\(task\.events\)\),/);
  assert.match(page, /contacts: \{ \.\.\.recordNames\.contacts, \.\.\.Object\.fromEntries\(contractors\.map/);
  assert.match(page, /properties: \{ \.\.\.recordNames\.properties, \.\.\.Object\.fromEntries\(properties\.map/);
});

test("the task page notes what was seen on the refresh after an action too; only Recent waits for an open", () => {
  // A comment that came in while the page was up and showed with the refresh after a tick came back as unread.
  assert.match(page, /if \(!\(await isActionRender\(\)\)\) after\(\(\) => recordView\(user\.id, "TASK", task\.id\)\);\n\s*after\(\(\) => markTaskSeen\(user\.id, task\.id, now\)/);
  // And the New divider keeps the baseline of the page's first render, so it doesn't move under the reader.
  const activity = readFileSync(new URL("../../app/(app)/tasks/[id]/activity.tsx", import.meta.url), "utf8");
  assert.match(activity, /const \[baseline\] = useState\(newSince\);/);
});
