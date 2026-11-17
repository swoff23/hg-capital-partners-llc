import test from "node:test";
import assert from "node:assert/strict";
import type { Ymd } from "@/lib/dates";
import { allTasksOrderBy } from "./list-query";
import {
  NO_GROUP,
  groupCounts,
  groupKeyOf,
  parseTaskSort,
  personKey,
  personName,
  shortName,
  sortRows,
  taskSortPhrase,
  type SortRow,
} from "./list-sort";

/** A row with the given keys; the rest neutral. */
function r(id: string, over: Partial<SortRow> = {}): SortRow {
  return {
    id,
    due: null,
    finished: null,
    created: "2026-01-01T00:00:00.000Z",
    place: null,
    placeKey: NO_GROUP,
    person: null,
    personKey: NO_GROUP,
    ...over,
  };
}
const at = (place: string, id = place) => ({ place, placeKey: `p:${id}` });
const by = (name: string, key = `u:${name}`) => ({ person: name, personKey: key });
const due = (d: string) => ({ due: d as Ymd });
const ids = (rows: SortRow[]) => rows.map((x) => x.id);

test("parseTaskSort: the three fields and their flips; anything else is Property A to Z", () => {
  assert.deepEqual(parseTaskSort(null), { field: "property", desc: false });
  assert.deepEqual(parseTaskSort("-property"), { field: "property", desc: true });
  assert.deepEqual(parseTaskSort("due"), { field: "due", desc: false });
  assert.deepEqual(parseTaskSort("-assignee"), { field: "assignee", desc: true });
  assert.deepEqual(parseTaskSort("value"), { field: "property", desc: false });
  assert.equal(taskSortPhrase("-due"), "Due date, latest first");
  assert.equal(taskSortPhrase("units"), null);
});

test("sortRows by property: street order, overdue first inside, undated last, No property last", () => {
  const rows = [
    r("oxford-later", { ...at("15 Oxford Ave."), ...due("2026-11-20") }),
    r("none", due("2026-01-01")),
    r("congress-undated", at("118 Congress St.")),
    r("congress-late", { ...at("118 Congress St."), ...due("2026-11-06") }),
    r("oxford-late", { ...at("15 Oxford Ave."), ...due("2026-08-28") }),
    r("prospect-767", { ...at("767 Prospect Avenue"), ...due("2026-11-01") }),
    r("prospect-647", { ...at("647 Prospect Ave."), ...due("2026-11-01") }),
  ];
  assert.deepEqual(ids(sortRows(rows, { field: "property", desc: false }, "open")), [
    // Congress before Oxford by street, though "118" sorts before "15" as text either way; 647 before 767 Prospect by number.
    "congress-late",
    "congress-undated",
    "oxford-late",
    "oxford-later",
    "prospect-647",
    "prospect-767",
    "none",
  ]);
  // Flipped: the buildings go Z to A, the order inside and No property's place don't change.
  assert.deepEqual(ids(sortRows(rows, { field: "property", desc: true }, "open")), [
    "prospect-767",
    "prospect-647",
    "oxford-late",
    "oxford-later",
    "congress-late",
    "congress-undated",
    "none",
  ]);
});

test("sortRows keeps two buildings with the same short address apart, each in one run", () => {
  const rows = [r("a1", at("12 Main St", "a")), r("b1", at("12 Main St", "b")), r("a2", at("12 Main St", "a"))];
  const keys = sortRows(rows, { field: "property", desc: false }, "open").map((x) => x.placeKey);
  assert.deepEqual(keys, ["p:a", "p:a", "p:b"]);
});

test("sortRows by assignee: A to Z by name, Unassigned last, overdue first inside", () => {
  const rows = [
    r("nobody", due("2026-01-01")),
    r("pieter-late", { ...by("Pieter Louw"), ...due("2026-11-06") }),
    r("connor", { ...by("Connor Swofford"), ...due("2026-11-10") }),
    r("pieter-early", { ...by("Pieter Louw"), ...due("2026-08-01") }),
    r("jose", { ...by("José Alvarez", "c:1"), ...due("2026-12-01") }),
  ];
  assert.deepEqual(ids(sortRows(rows, { field: "assignee", desc: false }, "open")), ["connor", "jose", "pieter-early", "pieter-late", "nobody"]);
  assert.deepEqual(ids(sortRows(rows, { field: "assignee", desc: true }, "open")), ["pieter-early", "pieter-late", "jose", "connor", "nobody"]);
});

test("sortRows by due: overdue first or latest first, undated last both ways, then newest created", () => {
  const rows = [
    r("undated"),
    r("nov", due("2026-11-13")),
    r("aug-old", { ...due("2026-08-28"), created: "2026-01-01T00:00:00.000Z" }),
    r("aug-new", { ...due("2026-08-28"), created: "2026-02-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(ids(sortRows(rows, { field: "due", desc: false }, "open")), ["aug-new", "aug-old", "nov", "undated"]);
  assert.deepEqual(ids(sortRows(rows, { field: "due", desc: true }, "open")), ["nov", "aug-new", "aug-old", "undated"]);
});

test("sortRows in Done: inside a building the newest finished comes first", () => {
  const rows = [
    r("old", { ...at("1 A St"), finished: "2026-10-01T00:00:00.000Z", ...due("2026-01-01") }),
    r("new", { ...at("1 A St"), finished: "2026-11-01T00:00:00.000Z", ...due("2026-12-01") }),
    r("never", at("1 A St")),
  ];
  assert.deepEqual(ids(sortRows(rows, { field: "property", desc: false }, "done")), ["new", "old", "never"]);
});

test("sortRows matches the database order for the Due sort", () => {
  assert.deepEqual(allTasksOrderBy("open", { field: "due", desc: true }), [
    { dueDate: { sort: "desc", nulls: "last" } },
    { createdAt: "desc" },
    { id: "asc" },
  ]);
  assert.deepEqual(allTasksOrderBy("done", { field: "due", desc: false }), [
    { dueDate: { sort: "asc", nulls: "last" } },
    { completedAt: { sort: "desc", nulls: "last" } },
    { createdAt: "desc" },
    { id: "asc" },
  ]);
});

test("groupCounts counts every row of a group, not just a page of them", () => {
  const rows = [r("1", at("1 A St")), r("2", at("1 A St")), r("3", at("2 B St")), r("4")];
  assert.deepEqual(groupCounts(rows, "property"), { "p:1 A St": 2, "p:2 B St": 1, [NO_GROUP]: 1 });
  assert.deepEqual(groupCounts(rows, "due"), {});
});

test("group keys: a deal's address files like a building; an imported name files with its person", () => {
  assert.equal(groupKeyOf({ propertyId: null, place: "9 Elm St", assignee: null }, "property"), "d:9 Elm St");
  assert.equal(groupKeyOf({ propertyId: null, place: null, assignee: null }, "property"), NO_GROUP);
  const merged = { kind: "name", name: "zack@outlawcarpentry.com", person: { key: "c:zack", name: "Zack Reading" } } as const;
  assert.equal(personKey(merged), "c:zack");
  assert.equal(personName(merged), "Zack Reading");
  assert.equal(personKey({ kind: "name", name: "Kenneth Gonzalez" }), "n:Kenneth Gonzalez");
  assert.equal(groupKeyOf({ propertyId: "p1", place: "1 A St", assignee: null }, "due"), null);
});

test("shortName: a first name, or an email's local part", () => {
  assert.equal(shortName("Pieter Louw"), "Pieter");
  assert.equal(shortName("Jacob (Jake) Hoak"), "Jake");
  assert.equal(shortName("zack.reading@outlawcarpentry.com"), "zack");
  assert.equal(shortName(null), null);
});
