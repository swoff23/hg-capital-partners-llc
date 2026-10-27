import test from "node:test";
import assert from "node:assert/strict";
import type { TaskEventKind } from "@prisma/client";
import {
  buildActivity,
  countsAsUnread,
  entryIsFresh,
  eventLine,
  firstNewIndex,
  foldStart,
  fmtShortDay,
  groupByDay,
  groupHeadings,
  lastWordBy,
  splitEarlier,
  type ActivityEntry,
  type ActivityEvent,
} from "./activity";

const TODAY = "2026-10-23";
let seq = 0;
/** An event; each one lands a minute after the last unless `createdAt` says otherwise. */
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
    source: "APP",
    ...over,
  };
}
/** An event `min` minutes after 14:00 UTC on Oct 20. */
const at = (min: number) => new Date(Date.UTC(2026, 9, 20, 14, 0, 0) + min * 60_000);

const ZACK = { actorLabel: "Zack (Outlaw)", actorUserId: null, actorContactId: "c-zack", source: "PORTAL" } as const;
const PIETER = { actorLabel: "Pieter Hoff", actorUserId: "u-pieter" } as const;

const names = { users: { "u-connor": "Connor Swofford" }, contacts: { "c-zack": "Zack Reading" }, properties: { p1: "767 Prospect" } };
const build = (events: ActivityEvent[]) => buildActivity(events, names, TODAY);
const types = (out: ActivityEntry[]) => out.map((e) => e.type);
const texts = (out: ActivityEntry[]) => out.map((e) => ("text" in e ? e.text : e.type === "decision" ? e.line.text : e.type));

test("system events read as one sentence, people by first name", () => {
  const line = (e: ActivityEvent) => eventLine(e, names, TODAY).text;
  assert.equal(line(ev("STATUS", { from: "OPEN", to: "IN_PROGRESS" })), "Connor set status to In progress");
  assert.equal(line(ev("STATUS", { from: "OPEN", to: "WAITING", waitingOn: "city inspection" })), "Connor set status to Waiting on city inspection");
  assert.equal(line(ev("STATUS", { from: "OPEN", to: "SCHEDULED", scheduledFor: "2026-10-30" })), "Connor set status to Scheduled for Fri, Oct 30");
  assert.equal(line(ev("STATUS", { from: "IN_PROGRESS", to: "REVIEW" }, ZACK)), "Zack marked this done");
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
  // Taking a posted file off the task leaves its own line, named for the file.
  assert.equal(line(ev("ATTACHMENT", { attachmentId: "a1", filename: "quote.pdf", removed: true })), "Connor removed quote.pdf");
  assert.equal(line(ev("ATTACHMENT", { removed: true })), "Connor removed a file");
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

test("a repeat's next copy links forward, and a copy links back to the task it repeats", () => {
  const next = eventLine(ev("REPEAT_CREATED", { next: "t2", due: "2026-11-20" }, { actorLabel: "Repeats", actorUserId: null }), names, TODAY);
  assert.deepEqual(next, { text: "Next repeat created, due Fri, Nov 20", href: "/tasks/t2" });
  const back = eventLine(ev("CREATED", { repeatOf: "t1", due: "2026-11-20" }, { actorLabel: "Repeats", actorUserId: null }), names, TODAY);
  assert.deepEqual(back, { text: "Created as the next repeat", href: "/tasks/t1" });
  // Without the link the sentence still reads.
  assert.deepEqual(eventLine(ev("CREATED", {}), names, TODAY), { text: "Connor created this task" });
});

test("turning repeats on, changing them or turning them off reads as one sentence (activity 2.3 rule 9)", () => {
  const line = (e: ActivityEvent) => eventLine(e, names, TODAY).text;
  assert.equal(line(ev("REPEAT", { from: null, to: { freq: "weeks", interval: 2 } })), "Connor set this to repeat every 2 weeks");
  assert.equal(line(ev("REPEAT", { from: { freq: "weeks", interval: 2 }, to: { freq: "monthly", interval: 1, dayOfMonth: 5 } })), "Connor set this to repeat every month on the 5th");
  assert.equal(line(ev("REPEAT", { from: { freq: "weeks", interval: 2 }, to: null })), "Connor turned off repeats");
  // A rule that doesn't parse still says repeats changed, never raw JSON or a false "off".
  assert.equal(line(ev("REPEAT", { to: { freq: "hourly" } })), "Connor changed how this repeats");
  assert.equal(line(ev("REPEAT", {})), "Connor turned off repeats");
  // Its own kind: the next copy's line is unchanged.
  assert.equal(line(ev("REPEAT_CREATED", { due: "2026-12-05" })), "Next repeat created, due Sat, Dec 5");
});

test("a sync conflict reads as a sentence, never raw ids or JSON", () => {
  const conflict = (data: Record<string, unknown>) => eventLine(ev("CONFLICT", data, { actorLabel: "Asana sync", actorUserId: null, source: "ASANA" }), names, TODAY).text;
  assert.equal(conflict({ field: "dueDate", app: "2026-10-30", asana: "2026-10-28", base: "2026-10-25" }), "Asana and HG disagreed on the due date. Kept Fri, Oct 30.");
  assert.equal(conflict({ field: "dueDate", app: null, asana: "2026-10-28", base: null }), "Asana and HG disagreed on the due date. Kept no date.");
  assert.equal(conflict({ field: "title", app: "Fix front steps", asana: "Fix steps", base: "Fix steps" }), "Asana and HG disagreed on the title. Kept “Fix front steps”.");
  assert.equal(conflict({ field: "completed", app: true, asana: false, base: false }), "Asana and HG disagreed on the status. Kept Done.");
  // A place or an assignee is named through the maps, never printed as an object.
  assert.equal(conflict({ field: "place", app: { propertyId: "p1", bucket: "Property" }, asana: { propertyId: null, bucket: "General" }, base: null }), "Asana and HG disagreed on the property. Kept 767 Prospect.");
  assert.equal(conflict({ field: "place", app: { propertyId: null, bucket: "General" }, asana: {}, base: null }), "Asana and HG disagreed on the property. Kept General.");
  assert.equal(conflict({ field: "assignee", app: { userId: "u-connor", contactId: null }, asana: {}, base: null }), "Asana and HG disagreed on the assignee. Kept Connor Swofford.");
  assert.equal(conflict({ field: "description", app: "long text ".repeat(50), asana: "x", base: "y" }), "Asana and HG disagreed on the notes. Kept the HG notes.");
  assert.equal(conflict({ field: "section", app: null, asana: "Misc", base: null }), "Asana moved this to a section that isn't imported. Kept where it is.");
  // Older rows with no field.
  assert.equal(conflict({}), "Asana and HG disagreed on a change");
  assert.doesNotMatch(conflict({ field: "place", app: { propertyId: "p9", bucket: "Property" }, asana: {}, base: null }), /[{}]|p9|undefined/);
});

/* ---------------- Bursts ---------------- */

test("14 checklist ticks by one person fold into one line that opens onto the 14", () => {
  const ticks = Array.from({ length: 14 }, (_, i) => ev("CHECKLIST", { itemId: `i${i}`, title: `item ${i}`, done: true }, { ...ZACK, createdAt: at(100 + i) }));
  const out = build([ev("CREATED", {}, { createdAt: at(1) }), ...ticks]);
  assert.deepEqual(types(out), ["line", "run"]);
  const run = out[1];
  assert.ok(run.type === "run");
  assert.equal(run.text, "Zack checked 14 items");
  assert.equal(run.lines.length, 14);
  assert.equal(run.lines[0].text, "Zack checked “item 0”");
  assert.equal(run.at, ticks[13].createdAt, "the run sits at its latest tick");
  assert.equal(run.id, ticks[0].id);
});

test("ticks and unticks of different items count both ways", () => {
  const e = [
    ...Array.from({ length: 12 }, (_, i) => ev("CHECKLIST", { itemId: `i${i}`, title: "x", done: true }, ZACK)),
    ev("CHECKLIST", { itemId: "j1", title: "x", done: false }, ZACK),
    ev("CHECKLIST", { itemId: "j2", title: "x", done: false }, ZACK),
  ];
  assert.deepEqual(texts(build(e)), ["Zack checked 12 items and unchecked 2 items"]);
  assert.deepEqual(texts(build(e.slice(0, 2))), ["Zack checked 2 items"]);
});

test("a due date moved several times reads from where it started to where it ended", () => {
  const moved = build([
    ev("DUE", { from: "2026-10-20", to: "2026-10-24" }, { createdAt: at(0) }),
    ev("DUE", { from: "2026-10-24", to: "2026-10-27" }, { createdAt: at(10) }),
    ev("DUE", { from: "2026-10-27", to: "2026-10-30" }, { createdAt: at(20) }),
  ]);
  assert.deepEqual(texts(moved), ["Connor moved the due date from Tue, Oct 20 to Fri, Oct 30"]);
  const pair = (a: Record<string, unknown>, b: Record<string, unknown>) => [ev("DUE", a, { createdAt: at(0) }), ev("DUE", b, { createdAt: at(10) })];
  assert.deepEqual(texts(build(pair({ from: null, to: "2026-10-24" }, { from: "2026-10-24", to: null }))), ["Connor set the due date, then cleared it"]);
  assert.deepEqual(texts(build(pair({ from: "2026-10-20", to: "2026-10-24" }, { from: "2026-10-24", to: null }))), ["Connor cleared the due date"]);
  assert.deepEqual(texts(build(pair({ from: null, to: "2026-10-24" }, { from: "2026-10-24", to: "2026-10-30" }))), ["Connor set the due date to Fri, Oct 30"]);
  // Back where it started after more than one move, without the 2-minute rule hiding it.
  const circle = [
    ev("DUE", { from: "2026-10-20", to: "2026-10-24" }, { createdAt: at(0) }),
    ev("DUE", { from: "2026-10-24", to: "2026-10-27" }, { createdAt: at(10) }),
    ev("DUE", { from: "2026-10-27", to: "2026-10-20" }, { createdAt: at(20) }),
  ];
  assert.deepEqual(texts(build(circle)), ["Connor moved the due date 3 times"]);
});

test("a visit moved twice reads as one move", () => {
  const out = build([
    ev("SCHEDULED", { from: "2026-10-22", to: "2026-10-23" }, { createdAt: at(0) }),
    ev("SCHEDULED", { from: "2026-10-23", to: "2026-10-24" }, { createdAt: at(10) }),
  ]);
  assert.deepEqual(texts(out), ["Connor moved the visit from Thu, Oct 22 to Sat, Oct 24"]);
});

test("a status that went there and back, and one that moved three times", () => {
  // Shared statuses aren't hidden as a reversal, so they fold.
  const there = [
    ev("STATUS", { from: "IN_PROGRESS", to: "WAITING", waitingOn: "inspector" }, { visibility: "SHARED" }),
    ev("STATUS", { from: "WAITING", to: "IN_PROGRESS" }, { visibility: "SHARED" }),
  ];
  assert.deepEqual(texts(build(there)), ["Connor set status to Waiting, then back to In progress"]);
  const many = [
    ev("STATUS", { from: "OPEN", to: "SCHEDULED", scheduledFor: "2026-10-30" }, { visibility: "SHARED" }),
    ev("STATUS", { from: "SCHEDULED", to: "WAITING", waitingOn: "x" }, { visibility: "SHARED" }),
    ev("STATUS", { from: "WAITING", to: "IN_PROGRESS" }, { visibility: "SHARED" }),
  ];
  const out = build(many);
  assert.deepEqual(texts(out), ["Connor changed the status 3 times, now In progress"]);
  assert.equal(out[0].type === "run" && out[0].status, "IN_PROGRESS");
});

test("notes saved five times are one line that keeps the text before the first save", () => {
  const saves = Array.from({ length: 5 }, (_, i) => ev("NOTES", { from: `v${i}` }));
  const out = build(saves);
  assert.deepEqual(texts(out), ["Connor edited the notes"]);
  assert.ok(out[0].type === "run" && out[0].previousNotes === "v0");
  // A single save keeps its own text; one with no `from` (imported, older) has nothing to view.
  const one = build([ev("NOTES", { from: "" })]);
  assert.ok(one[0].type === "line" && one[0].previousNotes === "");
  const old = build([ev("NOTES")]);
  assert.ok(old[0].type === "line" && old[0].previousNotes === undefined);
});

test("a title renamed twice names the first title", () => {
  assert.deepEqual(texts(build([ev("TITLE", { from: "Porch light", to: "Porch lamp" }), ev("TITLE", { from: "Porch lamp", to: "Front porch light" })])), ["Connor renamed this from “Porch light”"]);
});

test("three sentences or more fold into the first and a count; one or two stay lines", () => {
  const three = build([
    ev("ASSIGNED", { to: { contactId: "c-zack" } }),
    ev("DUE", { from: null, to: "2026-10-30" }),
    ev("TITLE", { from: "A", to: "B" }),
    ev("NOTES", { from: "" }),
  ]);
  assert.deepEqual(types(three), ["run"]);
  assert.equal(three[0].type === "run" && three[0].text, "Connor assigned Zack Reading and made 3 more changes");
  assert.equal(three[0].type === "run" && three[0].lines.length, 4);
  const two = build([ev("ASSIGNED", { to: { contactId: "c-zack" } }), ev("DUE", { from: null, to: "2026-10-30" })]);
  assert.deepEqual(types(two), ["line", "line"]);
  // Two sentences, one of them merged: a line and a run.
  const mixed = build([ev("DUE", { from: null, to: "2026-10-30" }), ev("DUE", { from: "2026-10-30", to: "2026-11-02" }), ev("TITLE", { from: "A", to: "B" })]);
  assert.deepEqual(types(mixed), ["run", "line"]);
  // One event more of a different kind: "1 more change".
  const plural = build([ev("ASSIGNED", { to: { contactId: "c-zack" } }), ev("DUE", { from: null, to: "2026-10-30" }), ev("TITLE", { from: "A", to: "B" })]);
  assert.equal(plural[0].type === "run" && plural[0].text, "Connor assigned Zack Reading and made 2 more changes");
});

test("a burst ends at another person, a comment, 30 minutes from its first event, or a never-folded event", () => {
  const e1 = ev("CHECKLIST", { itemId: "a", title: "a", done: true }, { createdAt: at(0) });
  const e2 = ev("CHECKLIST", { itemId: "b", title: "b", done: true }, { createdAt: at(10) });
  const other = ev("CHECKLIST", { itemId: "c", title: "c", done: true }, { ...PIETER, createdAt: at(11) });
  const e3 = ev("CHECKLIST", { itemId: "d", title: "d", done: true }, { createdAt: at(12) });
  const e4 = ev("CHECKLIST", { itemId: "e", title: "e", done: true }, { createdAt: at(13) });
  assert.deepEqual(texts(build([e1, e2, other, e3, e4])), ["Connor checked 2 items", "Pieter checked “c”", "Connor checked 2 items"]);

  const first = ev("CHECKLIST", { itemId: "a", title: "a", done: true }, { createdAt: at(0) });
  const near = ev("CHECKLIST", { itemId: "b", title: "b", done: true }, { createdAt: at(29) });
  const late = ev("CHECKLIST", { itemId: "c", title: "c", done: true }, { createdAt: at(31) });
  const later = ev("CHECKLIST", { itemId: "d", title: "d", done: true }, { createdAt: at(32) });
  assert.deepEqual(texts(build([first, near, late, later])), ["Connor checked 2 items", "Connor checked 2 items"], "30 minutes from the burst's first event");

  const comment = ev("COMMENT", {}, { body: "hi", createdAt: at(5) });
  const a = ev("CHECKLIST", { itemId: "a", title: "a", done: true }, { createdAt: at(4) });
  const b = ev("CHECKLIST", { itemId: "b", title: "b", done: true }, { createdAt: at(6) });
  assert.deepEqual(types(build([a, comment, b])), ["line", "comment", "line"]);
});

test("automated writers and unmatched Asana people don't fold into each other", () => {
  const sync = { actorUserId: null, source: "ASANA" } as const;
  const e = [
    ev("DUE", { from: null, to: "2026-10-24" }, { ...sync, actorLabel: "Asana sync" }),
    ev("DUE", { from: "2026-10-24", to: "2026-10-27" }, { ...sync, actorLabel: "Asana sync" }),
    ev("DUE", { from: "2026-10-27", to: "2026-10-30" }, { ...sync, actorLabel: "Rae Realtor" }),
    ev("DUE", { from: "2026-10-30", to: "2026-11-02" }, { ...sync, actorLabel: "Rae Realtor" }),
  ];
  assert.deepEqual(types(build(e)), ["run", "run"]);
  // The same label from the app is a different writer than from the sync.
  const app = [ev("DUE", { from: null, to: "2026-10-24" }, { actorUserId: null, actorLabel: "Asana sync" }), ev("DUE", { from: "2026-10-24", to: "2026-10-27" }, { ...sync, actorLabel: "Asana sync" })];
  assert.deepEqual(types(build(app)), ["line", "line"]);
});

test("comments, Mark done, Approve, Send back, a contractor's Start, creation, the next repeat, access and conflicts never fold", () => {
  const e = [
    ev("CREATED"),
    ev("STATUS", { from: "SCHEDULED", to: "IN_PROGRESS" }, ZACK),
    ev("STATUS", { from: "IN_PROGRESS", to: "REVIEW" }, ZACK),
    ev("STATUS", { from: "REVIEW", to: "IN_PROGRESS" }),
    ev("STATUS", { from: "IN_PROGRESS", to: "REVIEW" }, ZACK),
    ev("STATUS", { from: "REVIEW", to: "DONE" }),
    ev("REPEAT_CREATED", { next: "t2", due: "2026-11-20" }, { actorLabel: "Repeats", actorUserId: null, source: "SYSTEM" }),
    ev("ACCESS"),
    ev("ACCESS"),
    ev("CONFLICT", { field: "title", app: "A", asana: "B", base: "C" }, { actorLabel: "Asana sync", actorUserId: null, source: "ASANA" }),
    ev("CONFLICT", { field: "title", app: "A", asana: "B", base: "C" }, { actorLabel: "Asana sync", actorUserId: null, source: "ASANA" }),
  ];
  const out = build(e);
  assert.equal(out.length, e.length);
  assert.ok(out.every((x) => x.type === "line"));
});

/* ---------------- Reversals ---------------- */

test("a change the same person reversed within two minutes doesn't show", () => {
  const e = [
    ev("CREATED", {}, { createdAt: at(0) }),
    ev("DUE", { from: "2026-10-24", to: "2026-10-30" }, { createdAt: at(10) }),
    ev("DUE", { from: "2026-10-30", to: "2026-10-24" }, { createdAt: at(11) }),
    ev("CHECKLIST", { itemId: "i1", title: "x", done: true }, { createdAt: at(20) }),
    ev("CHECKLIST", { itemId: "i1", title: "x", done: false }, { createdAt: at(21) }),
    ev("ASSIGNED", { from: { userId: "u-connor", contactId: null }, to: { userId: null, contactId: "c-zack" } }, { createdAt: at(40) }),
    ev("ASSIGNED", { from: { userId: null, contactId: "c-zack" }, to: { userId: "u-connor", contactId: null } }, { createdAt: at(41) }),
  ];
  assert.deepEqual(texts(build(e)), ["Connor created this task"]);
});

test("a reversal stays when it took longer than two minutes, was by someone else, or touched another item", () => {
  const slow = [ev("DUE", { from: "2026-10-24", to: "2026-10-30" }, { createdAt: at(10) }), ev("DUE", { from: "2026-10-30", to: "2026-10-24" }, { createdAt: at(13) })];
  assert.equal(build(slow).length, 1, "two moves are one sentence, still shown");
  const person = [ev("DUE", { from: "2026-10-24", to: "2026-10-30" }, { createdAt: at(10) }), ev("DUE", { from: "2026-10-30", to: "2026-10-24" }, { ...PIETER, createdAt: at(11) })];
  assert.deepEqual(types(build(person)), ["line", "line"]);
  // A tick and an untick of different items are two changes, not a reversal.
  const items = [ev("CHECKLIST", { itemId: "a", title: "x", done: true }, { createdAt: at(10) }), ev("CHECKLIST", { itemId: "b", title: "y", done: false }, { createdAt: at(11) })];
  assert.deepEqual(texts(build(items)), ["Connor checked 1 item and unchecked 1 item"]);
});

test("a Shared change that was reversed stays: it may already be emailed or seen", () => {
  const e = [
    ev("STATUS", { from: "OPEN", to: "SCHEDULED", scheduledFor: "2026-10-30" }, { visibility: "SHARED", createdAt: at(10) }),
    ev("STATUS", { from: "SCHEDULED", to: "OPEN" }, { visibility: "SHARED", createdAt: at(11) }),
  ];
  assert.equal(build(e).length, 1);
  assert.ok(texts(build(e))[0].includes("set status to Scheduled"));
});

test("a Done whose next repeat was made isn't hidden when it is reopened inside two minutes", () => {
  const done = ev("STATUS", { from: "OPEN", to: "DONE" }, { createdAt: at(10) });
  const copy = ev("REPEAT_CREATED", { next: "t2", due: "2026-11-20" }, { actorLabel: "Repeats", actorUserId: null, source: "SYSTEM", createdAt: new Date(at(10).getTime() + 200) });
  const reopened = ev("STATUS", { from: "DONE", to: "OPEN" }, { createdAt: at(11) });
  assert.equal(build([done, copy, reopened]).length, 3);
  // Without a copy the pair goes.
  assert.equal(build([done, reopened]).length, 0);
});

test("an approval that was undone is gone from the timeline (its Done line is soft-deleted)", () => {
  const review = ev("STATUS", { from: "IN_PROGRESS", to: "REVIEW" }, { ...ZACK, visibility: "SHARED", createdAt: at(1) });
  const approved = ev("STATUS", { from: "REVIEW", to: "DONE" }, { visibility: "SHARED", createdAt: at(5), deletedAt: at(6) });
  assert.deepEqual(texts(build([review, approved])), ["Zack marked this done"]);
});

/* ---------------- Decisions, batches and deleted comments ---------------- */

test("a status change and its note are one decision, paired by id and not by adjacency", () => {
  const status = ev("STATUS", { from: "REVIEW", to: "IN_PROGRESS" }, { visibility: "SHARED", createdAt: at(10) });
  const other = ev("COMMENT", {}, { body: "unrelated", createdAt: at(10.5) });
  const note = ev("COMMENT", { statusEventId: status.id }, { body: "Trim needs paint", visibility: "SHARED", createdAt: at(11) });
  const out = build([status, other, note]);
  assert.deepEqual(types(out), ["decision", "comment"]);
  const d = out[0];
  assert.ok(d.type === "decision");
  assert.equal(d.line.text, "Connor sent this back");
  assert.equal(d.note?.id, note.id);
  assert.equal(d.at, note.createdAt);
  assert.equal(out[1].id, other.id, "the comment beside it stays a comment");
  // The status menu moves Review to In progress with no note: a plain line.
  assert.deepEqual(types(build([ev("STATUS", { from: "REVIEW", to: "IN_PROGRESS" }), ev("COMMENT", {}, { body: "later" })])), ["line", "comment"]);
});

test("a contractor's Mark done pairs with its note, which was written a moment earlier", () => {
  const note = ev("COMMENT", { statusEventId: "later" }, { ...ZACK, body: "Doors are in", visibility: "SHARED", createdAt: at(10) });
  const status = ev("STATUS", { from: "IN_PROGRESS", to: "REVIEW" }, { ...ZACK, visibility: "SHARED", createdAt: new Date(at(10).getTime() + 1) });
  note.data = { statusEventId: status.id };
  const out = build([note, status]);
  assert.deepEqual(types(out), ["decision"]);
  assert.ok(out[0].type === "decision" && out[0].note?.body === "Doors are in" && out[0].line.status === "REVIEW");
});

test("a note whose status is hidden or missing stays a comment", () => {
  const orphan = ev("COMMENT", { statusEventId: "gone" }, { body: "hello" });
  assert.deepEqual(types(build([orphan])), ["comment"]);
});

test("files posted together by one person are one batch line; apart or by two people they are not", () => {
  const f = (min: number, name: string, over: Partial<ActivityEvent> = {}) => ev("ATTACHMENT", { attachmentId: name, filename: name }, { createdAt: at(min), ...over });
  const e = [f(1, "a.jpg"), f(1.5, "b.jpg"), f(2.5, "c.jpg"), f(3, "d.jpg")];
  const kinds = new Map(e.map((x) => [x.id, ["image" as const]]));
  const out = buildActivity(e, names, TODAY, { fileKinds: kinds });
  assert.deepEqual(types(out), ["batch"]);
  assert.equal(out[0].type === "batch" && out[0].text, "Connor added 4 photos");
  assert.equal(out[0].events.length, 4);
  // A pause of more than two minutes starts another; one file is a plain line.
  const split = buildActivity([f(1, "a.jpg"), f(2, "b.jpg"), f(10, "c.pdf")], names, TODAY, { fileKinds: new Map([[e[0].id, ["image"]]]) });
  assert.deepEqual(types(split), ["batch", "line"]);
  assert.equal(split[1].type === "line" && split[1].text, "Connor added c.pdf");
  // Two people's files don't merge.
  assert.deepEqual(types(build([f(1, "a.jpg"), f(1.5, "b.jpg", PIETER)])), ["line", "line"]);
  // Photos and a document count as files; photos and videos name both.
  const mixed = [f(1, "a.jpg"), f(1.2, "b.pdf")];
  const m = buildActivity(mixed, names, TODAY, { fileKinds: new Map([[mixed[0].id, ["image"]], [mixed[1].id, ["file"]]]) });
  assert.equal(m[0].type === "batch" && m[0].text, "Connor added 2 files");
  const pv = [f(1, "a.jpg"), f(1.2, "b.mov")];
  const p = buildActivity(pv, names, TODAY, { fileKinds: new Map([[pv[0].id, ["image"]], [pv[1].id, ["video"]]]) });
  assert.equal(p[0].type === "batch" && p[0].text, "Connor added 1 photo and 1 video");
  // A removed file never joins a batch.
  const removed = [f(1, "a.jpg"), ev("ATTACHMENT", { filename: "a.jpg", removed: true }, { createdAt: at(1.5) })];
  assert.deepEqual(texts(build(removed)), ["Connor added a.jpg", "Connor removed a.jpg"]);
});

test("a deleted comment leaves a line, and any other deleted event is gone", () => {
  const gone = ev("COMMENT", {}, { body: "oops", deletedAt: at(30) });
  const hiddenDue = ev("DUE", { from: null, to: "2026-10-30" }, { deletedAt: at(30) });
  const out = build([gone, hiddenDue]);
  assert.deepEqual(types(out), ["deleted"]);
  assert.equal(out[0].id, gone.id);
});

test("a contractor's photo post taken back leaves no line, but a real delete does", () => {
  // takeBackContractorPost soft-deletes a body-less comment marked `batch`, written by the contractor: the update
  // that never was. Staff were told of it by no one, and "Zack deleted a comment" would describe nothing he did.
  const taken = ev("COMMENT", { batch: true }, { ...ZACK, visibility: "SHARED", createdAt: at(1), deletedAt: at(1.05) });
  const kept = ev("COMMENT", { batch: true }, { ...ZACK, visibility: "SHARED", createdAt: at(2) });
  assert.deepEqual(build([taken, kept]).map((e) => e.id), [kept.id], "only the post that stayed");
  // Staff deleting their own reply, or a contractor's post that was given words first, still leave the line.
  const reply = ev("COMMENT", {}, { visibility: "SHARED", body: "Gate code changed", createdAt: at(3), deletedAt: at(4) });
  const worded = ev("COMMENT", { batch: true }, { ...ZACK, visibility: "SHARED", body: "Before photo", createdAt: at(5), deletedAt: at(6) });
  const contractorsOwn = ev("COMMENT", {}, { ...ZACK, visibility: "SHARED", createdAt: at(7), deletedAt: at(8) });
  assert.deepEqual(types(build([reply, worded, contractorsOwn])), ["deleted", "deleted", "deleted"]);
  // A staff member's body-less comment is never a batch post, whatever its data says.
  const staffBatch = ev("COMMENT", { batch: true }, { createdAt: at(9), deletedAt: at(10) });
  assert.deepEqual(types(build([staffBatch])), ["deleted"], "no contractor behind it");
});

test("imported history is flagged: story rows and the importer's creation line, not later sync rows", () => {
  const sync = { actorUserId: null, source: "ASANA" } as const;
  const created = ev("CREATED", {}, { ...sync, actorLabel: "Asana import" });
  const story = ev("COMMENT", {}, { ...sync, actorLabel: "Rae", body: "hi", asanaStoryGid: "s1" });
  const conflict = ev("CONFLICT", { field: "title", app: "A" }, { ...sync, actorLabel: "Asana sync" });
  const out = build([created, story, conflict]);
  assert.deepEqual(out.map((e) => e.imported), [true, true, false]);
  assert.ok(out[2].type === "line" && out[2].viaAsana === true, "a live sync event after the move says so");
  assert.ok(out[0].type === "line" && !out[0].viaAsana);
});

/* ---------------- Reading it ---------------- */

test("entries come out oldest first whatever order they went in", () => {
  const a = ev("CREATED");
  const b = ev("NOTES");
  const c = ev("COMMENT", {}, { body: "hi" });
  assert.deepEqual(
    build([c, a, b]).map((e) => e.id),
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

test("the fold never hides the New divider or an anchored update", () => {
  assert.equal(foldStart(20), 5);
  assert.equal(foldStart(10), 0);
  assert.equal(foldStart(30, { firstNew: 12 }), 12, "the fold already includes it");
  assert.equal(foldStart(30, { firstNew: 3 }), 3, "the divider is inside the fold: it shrinks");
  assert.equal(foldStart(30, { anchored: 2 }), 2);
  assert.equal(foldStart(30, { firstNew: 8, anchored: 4 }), 4);
  assert.equal(foldStart(30, { firstNew: -1, anchored: undefined }), 15);
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

test("rows more than 60 days back sit under month headings, newer ones under days", () => {
  const days = ["2026-07-30", "2026-08-02", "2026-08-09", "2026-08-30", "2026-10-02", "2026-10-02", "2026-10-23"];
  const groups = groupHeadings(days, (d) => d, "2026-10-23");
  assert.deepEqual(
    groups.map((g) => [g.month, g.month ? g.day.slice(0, 7) : g.day, g.entries.length]),
    [
      [true, "2026-07", 1],
      [true, "2026-08", 2],
      [false, "2026-08-30", 1],
      [false, "2026-10-02", 2],
      [false, "2026-10-23", 1],
    ],
  );
  // Sixty days exactly is still a day; 61 is a month.
  assert.equal(groupHeadings(["2026-08-24"], (d) => d, "2026-10-23")[0].month, false);
  assert.equal(groupHeadings(["2026-08-23"], (d) => d, "2026-10-23")[0].month, true);
  // A month heading never swallows a different month or year.
  const years = groupHeadings(["2025-08-30", "2026-08-30"], (d) => d, "2026-10-23");
  assert.equal(years.length, 2);
});

test("short dates", () => {
  assert.equal(fmtShortDay("2025-12-31", TODAY), "Wed, Dec 31, 2025");
  assert.equal(fmtShortDay(null, TODAY), "");
});

test("lastWordBy: the contractor wrote last, or a Shared staff comment answered", () => {
  const staff = (visibility: "SHARED" | "INTERNAL", min: number) => ev("COMMENT", {}, { visibility, body: "x", createdAt: at(min) });
  const contractor = (min: number) => ev("COMMENT", {}, { ...ZACK, visibility: "SHARED", body: "x", createdAt: at(min) });
  assert.equal(lastWordBy([]), null);
  assert.equal(lastWordBy([ev("NOTES")]), null);
  assert.equal(lastWordBy([staff("SHARED", 1), contractor(2)]), "contractor");
  assert.equal(lastWordBy([contractor(1), staff("SHARED", 2)]), "staff");
  // An Internal note answers nobody.
  assert.equal(lastWordBy([contractor(1), staff("INTERNAL", 2)]), "contractor");
  // A deleted comment doesn't count.
  assert.equal(lastWordBy([staff("SHARED", 1), { ...contractor(2), deletedAt: at(3) }]), "staff");
  // Order in the array doesn't matter.
  assert.equal(lastWordBy([contractor(2), staff("SHARED", 1)]), "contractor");
});

test("what counts as new: someone else's app or portal comment, or a contractor's photos, start or Mark done", () => {
  const base = { source: "APP", actorUserId: "u-pieter", actorContactId: null, createdAt: at(10) };
  const since = at(5);
  const yes = (e: Partial<Parameters<typeof countsAsUnread>[0]> & { kind: string }) => countsAsUnread({ ...base, ...e }, "u-connor", since);
  assert.equal(yes({ kind: "COMMENT" }), true, "the other partner's comment");
  assert.equal(yes({ kind: "COMMENT", source: "PORTAL", actorUserId: null, actorContactId: "c-zack" }), true);
  assert.equal(yes({ kind: "ATTACHMENT", source: "PORTAL", actorUserId: null, actorContactId: "c-zack" }), true);
  assert.equal(yes({ kind: "STATUS", source: "PORTAL", actorUserId: null, actorContactId: "c-zack" }), true);
  // The other partner's changes, your own writes, imported and system rows, deleted rows and older ones don't.
  assert.equal(yes({ kind: "DUE" }), false);
  assert.equal(yes({ kind: "STATUS" }), false);
  assert.equal(yes({ kind: "COMMENT", actorUserId: "u-connor" }), false);
  assert.equal(yes({ kind: "COMMENT", source: "ASANA" }), false);
  assert.equal(yes({ kind: "COMMENT", source: "SYSTEM" }), false);
  assert.equal(yes({ kind: "COMMENT", deletedAt: at(11) }), false);
  assert.equal(yes({ kind: "COMMENT", createdAt: at(5) }), false, "at the baseline is seen");
  assert.equal(yes({ kind: "COMMENT", createdAt: at(4) }), false);
});

test("the New divider sits above the first fresh row after the baseline", () => {
  const row = (min: number, fresh: boolean) => ({ at: at(min), fresh });
  const rows = [row(1, true), row(5, false), row(8, true), row(9, true)];
  assert.equal(firstNewIndex(rows, at(6)), 2);
  assert.equal(firstNewIndex(rows, at(0)), 0);
  assert.equal(firstNewIndex(rows, at(20)), -1);
  assert.equal(firstNewIndex(rows, null), -1);
  // A fresh row is not enough, and neither is a row after the baseline that isn't fresh.
  assert.equal(firstNewIndex([row(8, false)], at(6)), -1);
});

test("entryIsFresh looks inside decisions, batches and runs", () => {
  const status = ev("STATUS", { from: "IN_PROGRESS", to: "REVIEW" }, { ...ZACK, visibility: "SHARED" });
  const note = ev("COMMENT", { statusEventId: status.id }, { ...ZACK, body: "done", visibility: "SHARED" });
  const [decision] = build([note, status]);
  assert.equal(entryIsFresh(decision, "u-connor"), true);
  assert.equal(entryIsFresh(decision, "c-zack"), true, "a partner id never matches a contractor's");
  const [mine] = build([ev("COMMENT", {}, { body: "mine" })]);
  assert.equal(entryIsFresh(mine, "u-connor"), false);
  const [run] = build([ev("CHECKLIST", { itemId: "a", title: "a", done: true }, ZACK), ev("CHECKLIST", { itemId: "b", title: "b", done: true }, ZACK)]);
  assert.equal(entryIsFresh(run, "u-connor"), false, "ticks alone don't dot");
});
