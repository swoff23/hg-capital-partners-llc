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
import { Prisma } from "@prisma/client";
import {
  NONE,
  allTasksOrderBy,
  allTasksWhere,
  ownerCounts,
  ownerWhere,
  parseAllFilters,
  personRefs,
  propertyCounts,
  propertyWhere,
  searchWhere,
  viewScopeWhere,
  type AllFilters,
  type LegacyNames,
} from "./list-query";

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
    repeat: null,
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

test("toListTask: carries the repeat rule, and a missing or malformed one is no repeat", () => {
  const base = {
    id: "a",
    title: "Check the sump pump",
    status: "OPEN" as TaskStatus,
    dueDate: null,
    scheduledFor: null,
    waitingOn: null,
    unitLabel: null,
    assigneeName: null,
    createdAt: new Date("2026-10-01T12:00:00Z"),
    property: null,
    deal: null,
    assignee: null,
    assigneeContact: null,
  };
  assert.deepEqual(toListTask({ ...base, repeatRule: { freq: "weeks", interval: 2, weekday: 5 } }).repeat, {
    freq: "weeks",
    interval: 2,
    weekday: 5,
  });
  assert.equal(toListTask({ ...base, repeatRule: null }).repeat, null);
  assert.equal(toListTask({ ...base }).repeat, null);
  assert.equal(toListTask({ ...base, repeatRule: { freq: "fortnightly" } }).repeat, null);
});

// ---------------------------------------------------------------------------
// The Tasks page's where-builder (list-query.ts)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/**
 * A stand-in for Postgres over the where clauses list-query builds: AND, OR,
 * equality, `in`, `not`, `contains` (ILIKE) and a relation's own filter.
 */
function matches(row: Row, cond: Record<string, unknown>): boolean {
  return Object.entries(cond).every(([field, filter]) => {
    if (field === "AND") return (filter as Row[]).every((c) => matches(row, c));
    if (field === "OR") return (filter as Row[]).some((c) => matches(row, c));
    const value = row[field];
    if (filter === null) return value === null || value === undefined;
    if (typeof filter !== "object") return value === filter;
    const f = filter as Row;
    if ("in" in f) return (f.in as unknown[]).includes(value);
    if ("contains" in f) return typeof value === "string" && value.toLowerCase().includes(String(f.contains).toLowerCase());
    if ("not" in f) return f.not === Prisma.DbNull ? value !== null && value !== undefined : value !== f.not;
    return value != null && typeof value === "object" && matches(value as Row, f);
  });
}

function dbTask(over: Row & { id: string; title: string }): Row {
  return {
    status: "OPEN",
    bucket: "Property",
    propertyId: null,
    property: null,
    deal: null,
    assignee: null,
    assigneeContact: null,
    assigneeName: null,
    assigneeUserId: null,
    assigneeContactId: null,
    repeatRule: null,
    ...over,
  };
}
const TAMARACK = { address: "56 Tamarack St, Buffalo, NY 14209" };
const CONGRESS = { address: "118 Congress St. Buffalo, NY 14213" };
const TASKS: Row[] = [
  dbTask({ id: "roof", title: "Fix the roof", propertyId: "p-tam", property: TAMARACK, assigneeContactId: "c-zack", assigneeContact: { fullName: "Zack Reading" } }),
  dbTask({ id: "gutters", title: "Clean gutters", propertyId: "p-con", property: CONGRESS, assigneeUserId: "u-pieter", assignee: { name: "Pieter" } }),
  dbTask({ id: "taxes", title: "Check if any taxes are due", repeatRule: { freq: "monthly", interval: 1, dayOfMonth: 5 }, assigneeUserId: "u-connor", assignee: { name: "Connor" } }),
  dbTask({ id: "legacy-zack", title: "Old plumbing quote", propertyId: "p-con", property: CONGRESS, assigneeName: "Zack Reading" }),
  dbTask({ id: "legacy-bob", title: "Old paint quote", assigneeName: "Bob Smith, Jr." }),
  dbTask({ id: "deal-task", title: "Walk through", deal: { address: "767 Prospect Avenue, Buffalo" } }),
  dbTask({ id: "playbook", title: "Move-in checklist", bucket: "Template" }),
  dbTask({ id: "done", title: "Fix the fence", status: "DONE", property: TAMARACK, propertyId: "p-tam" }),
];
const found = (f: Partial<AllFilters>, legacy: LegacyNames = new Map()) =>
  TASKS.filter((t) => matches(t, allTasksWhere({ status: "open", owner: [], property: [], repeats: false, q: "", ...f }, legacy) as Row)).map(
    (t) => t.id,
  );

test("parseAllFilters: open by default, picks comma-joined, the old shortcuts still served", () => {
  assert.deepEqual(parseAllFilters({}, "u-me"), { status: "open", owner: [], property: [], repeats: false, q: "" });
  assert.equal(parseAllFilters({ status: "done" }, "u-me").status, "done");
  assert.equal(parseAllFilters({ status: "nonsense" }, "u-me").status, "open");
  assert.deepEqual(parseAllFilters({ owner: "u:a,c:b,none" }, "u-me").owner, ["u:a", "c:b", "none"]);
  assert.deepEqual(parseAllFilters({ assignee: "me" }, "u-me").owner, ["u:u-me"], "?assignee=me is still 'mine'");
  assert.deepEqual(parseAllFilters({ assignee: "me", owner: "c:z" }, "u-me").owner, ["c:z"], "?owner= supersedes it");
  assert.deepEqual(parseAllFilters({ property: "p1,none" }, "u-me").property, ["p1", "none"]);
  assert.equal(parseAllFilters({ repeats: "1" }, "u-me").repeats, true);
  assert.equal(parseAllFilters({ repeats: "0" }, "u-me").repeats, false);
  assert.equal(parseAllFilters({ q: "  roof " }, "u-me").q, "roof");
});

test("/tasks leaves out Template rows and finished work in the Open view", () => {
  assert.deepEqual(found({}), ["roof", "gutters", "taxes", "legacy-zack", "legacy-bob", "deal-task"]);
  assert.deepEqual(found({ status: "done" }), ["done"]);
  assert.equal(found({ status: "all" }).includes("playbook"), false, "a playbook row is never a task");
  assert.equal(found({ status: "all" }).length, 7);
});

test("/tasks search matches the title, the property, the deal and the assignee", () => {
  assert.deepEqual(found({ q: "roof" }), ["roof"], "the title");
  assert.deepEqual(found({ q: "tamarack" }), ["roof"], "the property's address");
  assert.deepEqual(found({ q: "prospect avenue" }), ["deal-task"], "a deal's address, Avenue or Ave");
  assert.deepEqual(found({ q: "pieter" }), ["gutters"], "a teammate");
  assert.deepEqual(found({ q: "zack" }), ["roof", "legacy-zack"], "a contractor, and a legacy name");
  assert.deepEqual(found({ q: "congress gutters" }), ["gutters"], "words in any order, across fields");
  assert.deepEqual(found({ q: "zzzz" }), []);
  assert.deepEqual(searchWhere("  "), {}, "no words, no filter");
});

test("/tasks search runs on the words the palette's does: abbreviations and accents", () => {
  assert.deepEqual(found({ q: "118 congress street" }), ["gutters", "legacy-zack"]);
  assert.deepEqual(found({ q: "Tamarack St" }), ["roof"]);
});

test("owner: several picks are any of them; Unassigned is no real person", () => {
  assert.deepEqual(found({ owner: ["u:u-pieter", "c:c-zack"] }), ["roof", "gutters"]);
  assert.deepEqual(found({ owner: [NONE] }), ["legacy-zack", "legacy-bob", "deal-task"], "a legacy name has no real person behind it");
  assert.deepEqual(found({ owner: [NONE, "u:u-connor"] }), ["taxes", "legacy-zack", "legacy-bob", "deal-task"]);
  assert.deepEqual(found({ owner: ["n:Bob Smith, Jr."] }), ["legacy-bob"], "a name that holds a comma");
  assert.deepEqual(ownerWhere([]), {});
});

test("owner: a picked person also finds the imported rows that carry their name", () => {
  const legacy: LegacyNames = new Map([["c:c-zack", ["Zack Reading"]]]);
  assert.deepEqual(found({ owner: ["c:c-zack"] }), ["roof"]);
  assert.deepEqual(found({ owner: ["c:c-zack"] }, legacy), ["roof", "legacy-zack"]);
});

test("property: several picks, and 'none' for a task with no property", () => {
  assert.deepEqual(found({ property: ["p-tam"] }), ["roof"]);
  assert.deepEqual(found({ property: ["p-tam", "p-con"] }), ["roof", "gutters", "legacy-zack"]);
  assert.deepEqual(found({ property: [NONE] }), ["taxes", "legacy-bob", "deal-task"], "a deal's task has no property");
  assert.deepEqual(found({ property: ["p-con", NONE] }), ["gutters", "taxes", "legacy-zack", "legacy-bob", "deal-task"]);
  assert.deepEqual(propertyWhere([]), {});
});

test("the Repeats filter keeps only tasks that repeat", () => {
  assert.deepEqual(found({ repeats: true }), ["taxes"]);
  assert.deepEqual(found({ repeats: true, owner: ["u:u-pieter"] }), [], "it narrows with every other filter");
  assert.deepEqual(found({ repeats: true, q: "taxes", owner: ["u:u-connor"] }), ["taxes"]);
});

test("a facet's own picks are left out of its counts, the others stay on", () => {
  const f: AllFilters = { status: "open", owner: ["u:u-pieter"], property: ["p-con"], repeats: false, q: "" };
  const ids = (omit?: "owner" | "property") => TASKS.filter((t) => matches(t, allTasksWhere(f, new Map(), omit) as Row)).map((t) => t.id);
  assert.deepEqual(ids(), ["gutters"]);
  assert.deepEqual(ids("owner"), ["gutters", "legacy-zack"], "every task at that property, whoever has it");
  assert.deepEqual(ids("property"), ["gutters"], "every task Pieter has, wherever");
});

test("hidden by filters is measured against the whole view", () => {
  const scope = (s: "open" | "done" | "all") => TASKS.filter((t) => matches(t, viewScopeWhere(s) as Row)).map((t) => t.id);
  assert.equal(scope("open").length, 6);
  assert.deepEqual(scope("done"), ["done"]);
  assert.equal(scope("all").length, 7);
});

test("Done sorts the newest finished first; Open and All keep the soonest due first", () => {
  assert.deepEqual(allTasksOrderBy("done"), [{ completedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]);
  assert.deepEqual(allTasksOrderBy("open"), [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }]);
  assert.deepEqual(allTasksOrderBy("all"), allTasksOrderBy("open"));
  // What that order does to three finished tasks, one with no finish time.
  const rows = [
    { id: "old", completedAt: new Date("2026-09-01"), createdAt: new Date("2026-01-01") },
    { id: "none", completedAt: null, createdAt: new Date("2026-08-01") },
    { id: "new", completedAt: new Date("2026-10-20"), createdAt: new Date("2026-02-01") },
  ];
  const sorted = [...rows].sort((a, b) => {
    if (a.completedAt && b.completedAt) return b.completedAt.getTime() - a.completedAt.getTime();
    if (a.completedAt) return -1;
    if (b.completedAt) return 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  assert.deepEqual(sorted.map((r) => r.id), ["new", "old", "none"]);
});

test("counts beside the assignee rows: a person, Unassigned, and a legacy name folded into its person", () => {
  const legacy: LegacyNames = new Map([["c:c-zack", ["Zack Reading"]]]);
  const rows = [
    { assigneeUserId: "u-pieter", assigneeContactId: null, assigneeName: null, count: 4 },
    { assigneeUserId: null, assigneeContactId: "c-zack", assigneeName: null, count: 3 },
    { assigneeUserId: null, assigneeContactId: null, assigneeName: "Zack Reading", count: 2 },
    { assigneeUserId: null, assigneeContactId: null, assigneeName: "Bob Smith", count: 1 },
    { assigneeUserId: null, assigneeContactId: null, assigneeName: null, count: 6 },
  ];
  const counts = ownerCounts(rows, legacy);
  assert.equal(counts.get("u:u-pieter"), 4);
  assert.equal(counts.get("c:c-zack"), 5, "his own jobs and his imported ones");
  assert.equal(counts.get("n:Bob Smith"), 1, "a name that is nobody the list can name");
  assert.equal(counts.get(NONE), 9, "no real person: the imported rows count here too");
  assert.equal(counts.get("n:Zack Reading"), undefined, "a folded name isn't listed twice");
});

test("counts beside the property rows: 'none' is the tasks with no property", () => {
  const counts = propertyCounts([
    { propertyId: "p-tam", count: 5 },
    { propertyId: null, count: 7 },
  ]);
  assert.equal(counts.get("p-tam"), 5);
  assert.equal(counts.get(NONE), 7);
  assert.equal(counts.get("p-con"), undefined);
});

test("personRefs: the team and the contractors by their picker keys", () => {
  assert.deepEqual(
    personRefs([{ id: "1", name: null, email: "p@x.com" }], [{ id: "2", name: "Zack Reading", email: "z@x.com" }]),
    [
      { key: "u:1", name: "p@x.com", email: "p@x.com" },
      { key: "c:2", name: "Zack Reading", email: "z@x.com" },
    ],
  );
});
