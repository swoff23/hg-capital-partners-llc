import test from "node:test";
import assert from "node:assert/strict";
import type { TaskEventKind } from "@prisma/client";
import { buildActivity, dayLabel, eventLine, fmtAgo, fmtShortDay, groupByDay, splitEarlier, type ActivityEvent } from "./activity";

const TODAY = "2026-10-23";
let seq = 0;
function ev(kind: TaskEventKind, data: Record<string, unknown> = {}, over: Partial<ActivityEvent> = {}): ActivityEvent {
  seq++;
  return {
    id: `e${String(seq).padStart(3, "0")}`,
    kind,
    visibility: "INTERNAL",
    actorLabel: "Connor Swofford",
    actorUserId: "u-connor",
    actorContactId: null,
    body: null,
    data,
    createdAt: new Date(Date.UTC(2026, 9, 20, 14, seq)),
    ...over,
  };
}

const names = { users: { "u-connor": "Connor Swofford" }, contacts: { "c-zack": "Zack Reading" }, properties: { p1: "767 Prospect" } };

test("system events read as one sentence, people by first name", () => {
  const line = (e: ActivityEvent) => eventLine(e, names, TODAY).text;
  assert.equal(line(ev("STATUS", { from: "OPEN", to: "IN_PROGRESS" })), "Connor set status to In progress");
  assert.equal(line(ev("STATUS", { from: "OPEN", to: "WAITING", waitingOn: "city inspection" })), "Connor set status to Waiting on city inspection");
  assert.equal(line(ev("STATUS", { from: "OPEN", to: "SCHEDULED", scheduledFor: "2026-10-30" })), "Connor set status to Scheduled for Fri, Oct 30");
  assert.equal(
    line(ev("STATUS", { from: "IN_PROGRESS", to: "REVIEW" }, { actorLabel: "Zack (Outlaw)", actorUserId: null, actorContactId: "c-zack" })),
    "Zack marked this done",
  );
  assert.equal(line(ev("STATUS", { from: "REVIEW", to: "DONE" })), "Connor approved this");
  assert.equal(line(ev("STATUS", { from: "REVIEW", to: "IN_PROGRESS" })), "Connor sent this back");
  assert.equal(line(ev("ASSIGNED", { to: { userId: null, contactId: "c-zack" } })), "Connor assigned Zack Reading");
  assert.equal(line(ev("ASSIGNED", { to: { userId: null, contactId: null } })), "Connor unassigned this");
  assert.equal(line(ev("ASSIGNED", { to: { name: "Brandon" } })), "Connor assigned Brandon");
  assert.equal(line(ev("PROPERTY", { from: null, to: "p1" })), "Connor moved this to 767 Prospect");
  assert.equal(line(ev("PROPERTY", { unitFrom: null, unitTo: "2" })), "Connor set the unit to 2");
  assert.equal(line(ev("CHECKLIST", { title: "demo", done: true })), "Connor checked “demo”");
  assert.equal(line(ev("TITLE", { from: "Fix steps", to: "Fix front steps" })), "Connor renamed this from “Fix steps”");
  assert.equal(line(ev("NOTES")), "Connor edited the notes");
  assert.equal(line(ev("ATTACHMENT", { filename: "IMG_1.jpg" })), "Connor added IMG_1.jpg");
  assert.equal(line(ev("CREATED", {}, { actorLabel: "Property reminder", actorUserId: null })), "Property reminder created this task");
});

test("checklist edits read as what was done, not as a tick", () => {
  const line = (data: Record<string, unknown>) => eventLine(ev("CHECKLIST", data), names, TODAY).text;
  assert.equal(line({ action: "renamed", itemId: "i1", title: "Bravo", from: "Alpha", to: "Bravo" }), "Connor renamed “Alpha” to “Bravo”");
  assert.equal(line({ action: "removed", itemId: "i1", title: "Alpha", from: "Alpha", to: null }), "Connor removed “Alpha”");
  assert.equal(line({ action: "restored", itemId: "i1", title: "Alpha", from: null, to: "Alpha" }), "Connor put back “Alpha”");
  // An older or partial event still reads, with no quotes to show.
  assert.equal(line({ action: "renamed", title: "Bravo" }), "Connor renamed “Bravo”");
  assert.equal(line({ action: "removed" }), "Connor removed an item");
  assert.equal(line({ action: "restored" }), "Connor put back an item");
  // Ticks keep their lines, and an action wins over a stray `done`.
  assert.equal(line({ action: "removed", title: "demo", done: true }), "Connor removed “demo”");
  assert.equal(line({ title: "demo", done: true }), "Connor checked “demo”");
  assert.equal(line({ title: "demo", done: false }), "Connor unchecked “demo”");
  assert.equal(line({ title: "demo" }), "Connor updated “demo”");
});

test("a repeat's next copy links to it", () => {
  const out = eventLine(ev("REPEAT_CREATED", { next: "t2", due: "2026-11-20" }, { actorLabel: "Repeats", actorUserId: null }), names, TODAY);
  assert.deepEqual(out, { text: "Next repeat created, due Fri, Nov 20", href: "/tasks/t2" });
});

test("back-to-back due moves fold into one line; a lone one stays a sentence", () => {
  const events = [
    ev("CREATED"),
    ev("DUE", { from: null, to: "2026-10-24" }),
    ev("DUE", { from: "2026-10-24", to: "2026-10-27" }),
    ev("DUE", { from: "2026-10-27", to: "2026-10-30" }),
    ev("COMMENT", {}, { body: "Started demo", visibility: "SHARED" }),
    ev("DUE", { from: "2026-10-30", to: null }),
  ];
  const out = buildActivity(events, names, TODAY);
  assert.deepEqual(
    out.map((e) => e.type),
    ["line", "due-run", "comment", "line"],
  );
  const run = out[1];
  assert.equal(run.type === "due-run" && run.text, "Due moved 3× · now Fri, Oct 30");
  assert.equal(run.type === "due-run" && run.events.length, 3);
  assert.equal(run.at, events[3].createdAt, "the run sits at its latest move");
  assert.equal(out[3].type === "line" && out[3].text, "Connor cleared the due date");
});

test("a run that ends cleared says so", () => {
  const out = buildActivity([ev("DUE", { to: "2026-10-24" }), ev("DUE", { from: "2026-10-24", to: null })], names, TODAY);
  assert.equal(out[0].type === "due-run" && out[0].text, "Due moved 2× · cleared");
});

test("entries come out oldest first whatever order they went in", () => {
  const a = ev("CREATED");
  const b = ev("NOTES");
  const c = ev("COMMENT", {}, { body: "hi" });
  assert.deepEqual(
    buildActivity([c, a, b], names, TODAY).map((e) => e.id),
    [a.id, b.id, c.id],
  );
});

test("splitEarlier keeps the latest N and folds the rest", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  const { earlier, latest } = splitEarlier(items, 15);
  assert.deepEqual(earlier, [0, 1, 2, 3, 4]);
  assert.equal(latest.length, 15);
  assert.deepEqual(splitEarlier([1, 2], 15), { earlier: [], latest: [1, 2] });
});

test("groupByDay starts a new group whenever the day changes", () => {
  const groups = groupByDay(["2026-10-20", "2026-10-20", "2026-10-22", "2026-10-23"], (d) => d);
  assert.deepEqual(
    groups.map((g) => [g.day, g.entries.length]),
    [
      ["2026-10-20", 2],
      ["2026-10-22", 1],
      ["2026-10-23", 1],
    ],
  );
});

test("day headings and short dates", () => {
  assert.equal(dayLabel("2026-10-23", TODAY), "Today");
  assert.equal(dayLabel("2026-10-22", TODAY), "Yesterday");
  assert.equal(dayLabel("2026-10-20", TODAY), "Tue, Oct 20");
  assert.equal(fmtShortDay("2025-12-31", TODAY), "Wed, Dec 31, 2025");
  assert.equal(fmtShortDay(null, TODAY), "");
});

test("fmtAgo: minutes and hours within a day, then the Buffalo time of day", () => {
  const now = new Date("2026-10-23T18:00:00Z");
  assert.equal(fmtAgo(new Date("2026-10-23T17:59:30Z"), now), "now");
  assert.equal(fmtAgo(new Date("2026-10-23T17:15:00Z"), now), "45m");
  assert.equal(fmtAgo(new Date("2026-10-23T08:00:00Z"), now), "10h");
  assert.equal(fmtAgo(new Date("2026-10-21T18:14:00Z"), now), "2:14 PM");
});
