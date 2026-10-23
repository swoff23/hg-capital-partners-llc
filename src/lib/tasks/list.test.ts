import test from "node:test";
import assert from "node:assert/strict";
import type { TaskStatus } from "@prisma/client";
import {
  applyPatch,
  byDateThenStatus,
  compareByDue,
  compareByTarget,
  doneMessage,
  groupContractors,
  groupMine,
  isOverdue,
  isTargetLate,
  movedAllMessage,
  movedMessage,
  targetField,
  targetOf,
  toListTask,
  type ListAssignee,
  type ListTask,
} from "./list";

const TODAY = "2026-10-22"; // a Thursday
const ME = "u-connor";
const PIETER = "u-pieter";

let seq = 0;
function task(over: Partial<ListTask> & { who?: ListAssignee | null } = {}): ListTask {
  seq += 1;
  const { who, ...rest } = over;
  return {
    id: `t${String(seq).padStart(3, "0")}`,
    title: `Task ${seq}`,
    status: "OPEN",
    checked: false,
    due: null,
    scheduledFor: null,
    waitingOn: null,
    unitLabel: null,
    propertyId: null,
    place: null,
    assignee: who === undefined ? { kind: "user", id: ME, name: "Connor", email: "c@x.com" } : who,
    createdAt: `2026-10-01T00:00:${String(seq % 60).padStart(2, "0")}.000Z`,
    ...rest,
  };
}
const zack: ListAssignee = { kind: "contact", id: "c-zack", name: "Zack Reading" };
const jacob: ListAssignee = { kind: "contact", id: "c-jacob", name: "Jacob Hoak" };
const ids = (ts: ListTask[]) => ts.map((t) => t.title);

test("toListTask: names the assignee, shortens the address, keeps calendar dates", () => {
  const base = {
    id: "a",
    title: "Call plumber",
    status: "SCHEDULED" as TaskStatus,
    dueDate: new Date(Date.UTC(2026, 9, 30)),
    scheduledFor: new Date(Date.UTC(2026, 9, 27)),
    waitingOn: null,
    unitLabel: "Upper",
    assigneeName: null,
    createdAt: new Date("2026-10-01T12:00:00Z"),
    property: { id: "p1", address: "767 Prospect Ave, Buffalo, NY 14213" },
    deal: null,
    assignee: null,
    assigneeContact: { id: "c-zack", fullName: "Zack Reading" },
  };
  const t = toListTask(base);
  assert.equal(t.due, "2026-10-30");
  assert.equal(t.scheduledFor, "2026-10-27");
  assert.equal(t.place, "767 Prospect Ave");
  assert.equal(t.propertyId, "p1");
  assert.deepEqual(t.assignee, { kind: "contact", id: "c-zack", name: "Zack Reading" });
  assert.equal(t.checked, false);
  assert.equal(targetOf(t), "2026-10-27", "Scheduled jobs target the visit date");
  assert.equal(targetField(t), "scheduledFor");

  const legacy = toListTask({ ...base, status: "DONE", assigneeContact: null, assigneeName: "Bob", property: null, deal: { address: "12 Elm St, Buffalo" } });
  assert.deepEqual(legacy.assignee, { kind: "name", name: "Bob" });
  assert.equal(legacy.place, "12 Elm St");
  assert.equal(legacy.checked, true);
  assert.equal(targetOf(legacy), "2026-10-30", "anything not Scheduled targets Due");
  assert.equal(targetField(legacy), "dueDate");
});

test("overdue: before today, and never Waiting or Review", () => {
  assert.equal(isOverdue(task({ due: "2026-10-21" }), TODAY), true);
  assert.equal(isOverdue(task({ due: TODAY }), TODAY), false);
  assert.equal(isOverdue(task({ due: null }), TODAY), false);
  assert.equal(isOverdue(task({ due: "2026-10-01", status: "IN_PROGRESS" }), TODAY), true);
  assert.equal(isOverdue(task({ due: "2026-10-01", status: "WAITING" }), TODAY), false);
  assert.equal(isOverdue(task({ due: "2026-10-01", status: "REVIEW" }), TODAY), false);
  assert.equal(isOverdue(task({ due: "2026-10-01", status: "DONE" }), TODAY), false);
  // A Scheduled job is late by its visit date, not its due date.
  const job = task({ who: zack, status: "SCHEDULED", scheduledFor: "2026-10-20", due: "2026-10-30" });
  assert.equal(isTargetLate(job, TODAY), true);
  assert.equal(isTargetLate({ ...job, scheduledFor: "2026-10-23" }, TODAY), false);
});

test("groupMine: Unassigned, Overdue, Today, Waiting and No date, each in its own place", () => {
  const all = [
    task({ title: "later", due: "2026-10-25" }),
    task({ title: "overdue old", due: "2026-10-01" }),
    task({ title: "overdue new", due: "2026-10-21" }),
    task({ title: "today", due: TODAY }),
    task({ title: "today scheduled", due: TODAY, status: "SCHEDULED", scheduledFor: TODAY }),
    task({ title: "waiting late", due: "2026-10-01", status: "WAITING", waitingOn: "gas co." }),
    task({ title: "review late", due: "2026-10-01", status: "REVIEW" }),
    task({ title: "no date", due: null }),
    task({ title: "done", due: "2026-10-01", status: "DONE", checked: true }),
    task({ title: "canceled", due: null, status: "CANCELED" }),
    task({ title: "nobody", due: "2026-10-20", who: null }),
    task({ title: "nobody next spring", due: "2027-04-01", who: null }),
    task({ title: "legacy name", due: null, who: { kind: "name", name: "Bob" } }),
    task({ title: "pieter's", due: "2026-10-01", who: { kind: "user", id: PIETER, name: "Pieter", email: "p@x.com" } }),
    task({ title: "zack's", due: "2026-10-01", who: zack }),
  ];
  const g = groupMine(all, ME, TODAY);
  assert.deepEqual(ids(g.unassigned), ["nobody", "legacy name"]);
  assert.deepEqual(ids(g.overdue), ["overdue old", "overdue new"]);
  assert.deepEqual(ids(g.today), ["review late", "today", "today scheduled"]);
  assert.deepEqual(ids(g.waiting), ["waiting late"]);
  assert.deepEqual(ids(g.noDate), ["no date"]);
});

test("groupMine: the other partner's view of the same rows", () => {
  const all = [task({ title: "mine", due: TODAY }), task({ title: "nobody", who: null })];
  const g = groupMine(all, PIETER, TODAY);
  assert.deepEqual(ids(g.unassigned), ["nobody"], "both partners see Unassigned");
  assert.deepEqual(ids(g.today), []);
});

test("groupContractors: Needs review on top, then a group per contractor by soonest Target", () => {
  const all = [
    task({ title: "bathroom tile", who: zack, status: "SCHEDULED", scheduledFor: "2026-10-23", due: "2026-11-05" }),
    task({ title: "cabinet install", who: zack, status: "IN_PROGRESS", due: "2026-10-22" }),
    task({ title: "zack undated", who: zack }),
    task({ title: "mini splits", who: jacob, status: "SCHEDULED", scheduledFor: "2026-10-23" }),
    task({ title: "front steps", who: jacob, status: "REVIEW", due: "2026-10-20" }),
    task({ title: "zack done", who: zack, status: "DONE", checked: true }),
    task({ title: "staff task", due: "2026-10-01" }),
  ];
  const c = groupContractors(all);
  assert.deepEqual(ids(c.review), ["front steps"]);
  assert.deepEqual(
    c.groups.map((g) => [g.name, ids(g.jobs)]),
    [
      ["Zack Reading", ["cabinet install", "bathroom tile", "zack undated"]],
      ["Jacob Hoak", ["mini splits"]],
    ],
  );
});

test("groupContractors: undated groups go last, by name", () => {
  const amy: ListAssignee = { kind: "contact", id: "c-amy", name: "Amy" };
  const c = groupContractors([task({ title: "z", who: zack }), task({ title: "a", who: amy }), task({ title: "j", who: jacob, due: "2026-12-01" })]);
  assert.deepEqual(
    c.groups.map((g) => g.name),
    ["Jacob Hoak", "Amy", "Zack Reading"],
  );
});

test("sorting: date first (none last), then status order, then newest first", () => {
  const a = task({ title: "in progress", due: TODAY, status: "IN_PROGRESS", createdAt: "2026-10-01T00:00:00.000Z" });
  const b = task({ title: "to do old", due: TODAY, status: "OPEN", createdAt: "2026-10-01T00:00:00.000Z" });
  const c = task({ title: "to do new", due: TODAY, status: "OPEN", createdAt: "2026-10-02T00:00:00.000Z" });
  const d = task({ title: "undated", due: null });
  const e = task({ title: "earlier", due: "2026-10-20", status: "WAITING" });
  assert.deepEqual(ids([d, a, b, c, e].sort(compareByDue)), ["earlier", "to do new", "to do old", "in progress", "undated"]);

  // Jobs sort on Target: a Scheduled job's visit date, not its due date.
  const visit = task({ title: "visit Fri", who: zack, status: "SCHEDULED", scheduledFor: "2026-10-23", due: "2026-12-01" });
  const due = task({ title: "due Mon", who: zack, due: "2026-10-26" });
  assert.deepEqual(ids([due, visit].sort(compareByTarget)), ["visit Fri", "due Mon"]);
  assert.deepEqual(ids([due, visit].sort(compareByDue)), ["due Mon", "visit Fri"]);
});

test("byDateThenStatus: the same order for Prisma rows, whose createdAt is a Date", () => {
  const row = (title: string, target: string | null, status: TaskStatus, createdAt: string) => ({
    id: title,
    title,
    status,
    target,
    createdAt: new Date(createdAt),
  });
  const rows = [
    row("undated", null, "OPEN", "2026-10-05T00:00:00Z"),
    row("fri old", "2026-10-23", "OPEN", "2026-10-01T00:00:00Z"),
    row("fri scheduled", "2026-10-23", "SCHEDULED", "2026-09-01T00:00:00Z"),
    row("fri new", "2026-10-23", "OPEN", "2026-10-02T00:00:00Z"),
    row("thu", "2026-10-22", "WAITING", "2026-10-03T00:00:00Z"),
  ];
  assert.deepEqual(
    rows.sort(byDateThenStatus((r) => r.target)).map((r) => r.title),
    ["thu", "fri new", "fri old", "fri scheduled", "undated"],
  );
});

test("applyPatch: date moves, checks and status changes touch only their rows", () => {
  const a = task({ due: "2026-10-01" });
  const b = task({ status: "SCHEDULED", scheduledFor: "2026-10-23", who: zack });
  const list = [a, b];

  const moved = applyPatch(list, {
    kind: "dates",
    changes: [
      { id: a.id, field: "dueDate", value: TODAY },
      { id: b.id, field: "scheduledFor", value: "2026-10-30" },
    ],
  });
  assert.equal(moved[0].due, TODAY);
  assert.equal(moved[1].scheduledFor, "2026-10-30");
  assert.equal(moved[1].due, null);
  assert.equal(list[0].due, "2026-10-01", "the input is left alone");

  const checked = applyPatch(list, { kind: "check", id: a.id, checked: true });
  assert.equal(checked[0].checked, true);
  assert.equal(checked[0].status, "OPEN", "a tick doesn't move the row until the server answers");
  assert.equal(checked[1], b);

  const approved = applyPatch(list, { kind: "status", id: b.id, status: "DONE" });
  assert.equal(approved[1].status, "DONE");
  assert.equal(approved[1].checked, true);
  assert.equal(groupContractors(approved).groups.length, 0, "an approved job leaves the column");
});

test("toast copy", () => {
  assert.equal(movedMessage("2026-10-27"), "Moved to Tue Oct 27");
  assert.equal(movedMessage("2026-11-02"), "Moved to Mon Nov 2");
  assert.equal(movedMessage(null), "Date removed");
  assert.equal(movedAllMessage(1), "Moved 1 task to today");
  assert.equal(movedAllMessage(3), "Moved 3 tasks to today");
});

test("Done toast: names the task, or for a repeat when the next one is due", () => {
  assert.equal(doneMessage("Call plumber", null, TODAY), "Done: Call plumber");
  assert.equal(doneMessage("Check if any taxes are due", "2026-11-05", TODAY), "Done. Next due Nov 5");
  assert.equal(doneMessage("Walk the vacant units", TODAY, TODAY), "Done. Next due today");
  assert.equal(doneMessage("Pay the water bill", "2027-01-05", "2026-12-20"), "Done. Next due Jan 5", "next year, but close: no year");
  assert.equal(doneMessage("Check the sump pump", "2027-08-20", TODAY), "Done. Next due Aug 20", "10 months out");
  assert.equal(doneMessage("Renew insurance", "2027-10-22", TODAY), "Done. Next due Oct 22, 2027", "a year out");
  assert.equal(doneMessage("Service the boiler", "2027-09-30", TODAY), "Done. Next due Sep 30, 2027", "over 11 months out");
});

test("Done toast's Undo: the row comes back with the status it had, unticked", () => {
  const waiting = task({ status: "WAITING", waitingOn: "City inspection" });
  const other = task();
  // Today and All > Open: the refresh after the tick has already dropped the row.
  const undone = applyPatch([other], { kind: "restore", task: { ...waiting, status: "WAITING", checked: false } });
  assert.deepEqual(undone.map((t) => t.id), [other.id, waiting.id]);
  assert.equal(undone[1].status, "WAITING");
  assert.equal(undone[1].checked, false);
  assert.equal(undone[1].waitingOn, "City inspection");
  // A list that still shows the ticked row: it's replaced, not added twice.
  const ticked = applyPatch([waiting, other], { kind: "check", id: waiting.id, checked: true });
  const again = applyPatch(ticked, { kind: "restore", task: { ...waiting, status: "WAITING", checked: false } });
  assert.deepEqual(again.map((t) => t.id), [waiting.id, other.id]);
  assert.equal(again[0].checked, false);
});
