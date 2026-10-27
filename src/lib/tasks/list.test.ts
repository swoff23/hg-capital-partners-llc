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
  isApproval,
  isOverdue,
  isTargetLate,
  movedAllMessage,
  movedMessage,
  targetField,
  targetOf,
  tickPlan,
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
  paletteTaskWhere,
  parseAllFilters,
  personOfLegacyName,
  personRefs,
  propertyCounts,
  propertyWhere,
  searchWhere,
  toQuery,
  viewScopeWhere,
  withMergedOwners,
  withoutAssigneeShortcut,
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

test("a tick on a Needs review row is an approval; any other tick is a plain status move", () => {
  const row = (status: TaskStatus, checked = status === "DONE") => ({ status, checked });
  // All's Review row ticked: Approve and Approve's Undo, never Done then back to Review.
  assert.deepEqual(tickPlan(row("REVIEW"), true), { shown: "REVIEW", approves: true, holds: false });
  for (const status of ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "CANCELED"] as const) {
    assert.deepEqual(tickPlan(row(status), true), { shown: status, approves: false, holds: false }, status);
  }
  assert.deepEqual(tickPlan(row("DONE"), false), { shown: "DONE", approves: false, holds: false });
  // While the approving tap is still saving, the row shows Done and a second tap is held: a plain move to To do
  // would leave the approval live (the contractor emailed "approved" for a job that is back in To do).
  assert.deepEqual(tickPlan(row("REVIEW", true), false), { shown: "DONE", approves: false, holds: true });
  // Unticked again before the server answered: the row shows To do, so a new tick isn't an approval.
  assert.deepEqual(tickPlan(row("DONE", false), true), { shown: "OPEN", approves: false, holds: false });
  // Only a Review row waiting on its approval holds; any other untick is a plain move.
  for (const status of ["OPEN", "IN_PROGRESS", "DONE", "CANCELED"] as const) {
    assert.equal(tickPlan(row(status, true), false).holds, false, status);
  }
});

test("Needs review to Done is Approve from any control; every other move is a plain status change", () => {
  assert.equal(isApproval("REVIEW", "DONE"), true);
  for (const from of ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "DONE", "CANCELED"] as const) {
    assert.equal(isApproval(from, "DONE"), false, `${from} to Done`);
  }
  // Send back, Cancel and the rest from Review are not approvals.
  for (const to of ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW", "CANCELED"] as const) {
    assert.equal(isApproval("REVIEW", to), false, `Review to ${to}`);
  }
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

test("parseAllFilters: open by default, picks comma-joined", () => {
  assert.deepEqual(parseAllFilters({}), { status: "open", owner: [], property: [], repeats: false, q: "" });
  assert.equal(parseAllFilters({ status: "done" }).status, "done");
  assert.equal(parseAllFilters({ status: "nonsense" }).status, "open");
  assert.deepEqual(parseAllFilters({ owner: "u:a,c:b,none" }).owner, ["u:a", "c:b", "none"]);
  assert.deepEqual(parseAllFilters({ property: "p1,none" }).property, ["p1", "none"]);
  assert.equal(parseAllFilters({ repeats: "1" }).repeats, true);
  assert.equal(parseAllFilters({ repeats: "0" }).repeats, false);
  assert.equal(parseAllFilters({ q: "  roof " }).q, "roof");
});

test("parseAllFilters: ?assignee=me is not read here, so a pick can only be the bar's own", () => {
  // The page redirects it to owner=u:<id> first (withoutAssigneeShortcut); an unread param can't filter unseen.
  assert.deepEqual(parseAllFilters({ assignee: "me" }).owner, []);
});

test("?assignee=me becomes the owner pick, every other param kept", () => {
  const qs = (sp: Parameters<typeof withoutAssigneeShortcut>[0]) => {
    const out = withoutAssigneeShortcut(sp, "u-me");
    return out === null ? null : Object.fromEntries(new URLSearchParams(out));
  };
  assert.deepEqual(qs({ assignee: "me" }), { owner: "u:u-me" });
  assert.deepEqual(qs({ assignee: "me", status: "done", property: "p1,none", q: "roof", repeats: "1" }), {
    status: "done",
    property: "p1,none",
    q: "roof",
    repeats: "1",
    owner: "u:u-me",
  });
  // The redirect lands on a pick the bar reads and can clear: no assignee param left, and a second pass has nothing to do.
  const landed = withoutAssigneeShortcut({ assignee: "me", status: "all" }, "u-me")!;
  assert.equal(new URLSearchParams(landed).has("assignee"), false);
  assert.deepEqual(parseAllFilters(Object.fromEntries(new URLSearchParams(landed))).owner, ["u:u-me"]);
  assert.equal(withoutAssigneeShortcut(Object.fromEntries(new URLSearchParams(landed)), "u-me"), null);
});

test("?assignee=me: an owner already in the link wins; anything else is left alone", () => {
  assert.deepEqual(Object.fromEntries(new URLSearchParams(withoutAssigneeShortcut({ assignee: "me", owner: "c:z" }, "u-me")!)), {
    owner: "c:z",
  });
  // An empty owner is no pick, so it gives way to "mine".
  assert.deepEqual(Object.fromEntries(new URLSearchParams(withoutAssigneeShortcut({ assignee: "me", owner: "" }, "u-me")!)), {
    owner: "u:u-me",
  });
  assert.equal(withoutAssigneeShortcut({}, "u-me"), null);
  assert.equal(withoutAssigneeShortcut({ status: "done" }, "u-me"), null);
  assert.equal(withoutAssigneeShortcut({ assignee: "someone" }, "u-me"), null, "only 'me' was ever served");
  assert.equal(withoutAssigneeShortcut({ assignee: ["me", "x"], status: "done" }, "u-me")!.includes("owner=u%3Au-me"), true);
});

test("toQuery keeps every value of a repeated param and skips an undefined one", () => {
  const qs = toQuery({ status: "done", property: ["p1", "p2"], q: undefined, owner: "u:a" });
  assert.deepEqual(qs.getAll("property"), ["p1", "p2"]);
  assert.equal(qs.get("status"), "done");
  assert.equal(qs.get("owner"), "u:a");
  assert.equal(qs.has("q"), false);
  assert.equal(toQuery({}).toString(), "");
});

test("?owner=n:<name> becomes the person's key once that name stands for a person", () => {
  const legacy: LegacyNames = new Map([
    ["c:c-brandon", ["Brandon Zarbo"]],
    ["c:c-zack", ["Zack Reading", "Zack R. "]],
  ]);
  const qs = (sp: Parameters<typeof withMergedOwners>[0]) => {
    const out = withMergedOwners(sp, legacy);
    return out === null ? null : Object.fromEntries(new URLSearchParams(out));
  };
  assert.deepEqual(qs({ owner: "n:Brandon Zarbo" }), { owner: "c:c-brandon" });
  assert.deepEqual(qs({ owner: "n:Brandon Zarbo", status: "all", property: "p1", q: "roof", repeats: "1" }), {
    owner: "c:c-brandon",
    status: "all",
    property: "p1",
    q: "roof",
    repeats: "1",
  });
  // Several picks: only the merged name changes; a name that stands for nobody stays; a repeat of the person folds in.
  assert.deepEqual(qs({ owner: "u:u-me,n:Brandon Zarbo,n:Bob Smith" }), { owner: "u:u-me,c:c-brandon,n:Bob Smith" });
  assert.deepEqual(qs({ owner: "c:c-brandon,n:Brandon Zarbo" }), { owner: "c:c-brandon" });
  // The key is made from the trimmed name; the stored one may have kept a space.
  assert.deepEqual(qs({ owner: "n:Zack R." }), { owner: "c:c-zack" });
  // A name that holds a comma rides escaped, and stays escaped when it isn't merged.
  const comma = withMergedOwners({ owner: "n:Brandon Zarbo,n:Smith%2C Bob" }, legacy)!;
  assert.equal(new URLSearchParams(comma).get("owner"), "c:c-brandon,n:Smith%2C Bob");
  // Nothing to rewrite: no owner, no n: pick, or an n: pick that is still its own row.
  assert.equal(qs({}), null);
  assert.equal(qs({ status: "done" }), null);
  assert.equal(qs({ owner: "u:u-me,c:c-zack,none" }), null);
  assert.equal(qs({ owner: "n:Bob Smith" }), null);
  assert.equal(withMergedOwners({ owner: "n:Brandon Zarbo" }, new Map()), null);
});

test("?owner=n:<name>: after the rewrite the bar's pick is a person and a second pass has nothing to do", () => {
  const legacy: LegacyNames = new Map([["c:c-brandon", ["Brandon Zarbo"]]]);
  const landed = Object.fromEntries(new URLSearchParams(withMergedOwners({ owner: "n:Brandon Zarbo", status: "done" }, legacy)!));
  assert.deepEqual(parseAllFilters(landed).owner, ["c:c-brandon"]);
  assert.equal(parseAllFilters(landed).status, "done");
  assert.equal(withMergedOwners(landed, legacy), null);
  // The rows are the same ones: the person's key finds the imported rows under their name.
  assert.deepEqual(found({ owner: ["n:Zack Reading"] }), ["legacy-zack"]);
  const zack: LegacyNames = new Map([["c:c-zack", ["Zack Reading"]]]);
  assert.deepEqual(found({ owner: ["c:c-zack"] }, zack), ["roof", "legacy-zack"], "his own jobs too, which the old bookmark didn't show");
  assert.deepEqual([...personOfLegacyName(zack)], [["Zack Reading", "c:c-zack"]]);
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

test("the palette's task search finds what the Tasks page does, and never a Template row", () => {
  const palette = (q: string) => TASKS.filter((t) => matches(t, paletteTaskWhere(q) as Row)).map((t) => t.id);
  // Same words, same fields, same rows as /tasks in the All view.
  for (const q of ["roof", "tamarack", "prospect avenue", "pieter", "zack", "congress gutters", "zzzz"]) {
    assert.deepEqual(palette(q), found({ status: "all", q }), q);
  }
  // A playbook is not work: its title finds nothing, here or on the page.
  assert.deepEqual(palette("move-in checklist"), []);
  assert.deepEqual(found({ status: "all", q: "move-in checklist" }), []);
  // Finished work still comes up, as it does on the page.
  assert.deepEqual(palette("fence"), ["done"]);
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
