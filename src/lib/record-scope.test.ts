import test from "node:test";
import assert from "node:assert/strict";
import { archivedRecord, isArchived, liveOrKept, liveRecord, onMoveInForm } from "./record-scope";

type Row = Record<string, unknown>;

/** A stand-in for Postgres over these clauses: OR, null, `not: null` and `in`. */
function matches(row: Row, cond: Row): boolean {
  return Object.entries(cond).every(([field, filter]) => {
    if (field === "OR") return (filter as Row[]).some((c) => matches(row, c));
    const value = row[field];
    if (filter === null) return value === null || value === undefined;
    if (typeof filter === "object" && filter !== null) {
      const f = filter as Row;
      if ("not" in f) return value !== null && value !== undefined;
      if ("in" in f) return (f.in as unknown[]).includes(value);
    }
    return value === filter;
  });
}

const ROWS: Row[] = [
  { id: "oxford", archivedAt: null, showOnMoveInForm: true },
  { id: "sherwood", archivedAt: null, showOnMoveInForm: false },
  { id: "qa-test", archivedAt: new Date("2026-10-27T14:00:00Z"), showOnMoveInForm: true },
  { id: "old-flip", archivedAt: new Date("2026-10-01T14:00:00Z"), showOnMoveInForm: false },
];
const ids = (where: Row) => ROWS.filter((r) => matches(r, where)).map((r) => r.id);

test("lists, counts and search see live records; the Archived view sees the rest", () => {
  assert.deepEqual(ids(liveRecord), ["oxford", "sherwood"]);
  assert.deepEqual(ids(archivedRecord), ["qa-test", "old-flip"]);
  assert.equal(isArchived({ archivedAt: null }), false);
  assert.equal(isArchived({ archivedAt: new Date() }), true);
});

test("a picker offers live records and keeps the one it already holds, archived or not", () => {
  assert.deepEqual(ids(liveOrKept()), ["oxford", "sherwood"]);
  assert.deepEqual(ids(liveOrKept([])), ["oxford", "sherwood"]);
  assert.deepEqual(ids(liveOrKept(["qa-test"])), ["oxford", "sherwood", "qa-test"], "a task's own archived property stays on offer");
  assert.deepEqual(ids(liveOrKept([null, undefined, ""])), ["oxford", "sherwood"], "a task with no property keeps nothing extra");
  assert.deepEqual(liveOrKept([null]), liveRecord, "no ids is the plain live clause");
  assert.deepEqual(liveOrKept(["a", "a"]), { OR: [liveRecord, { id: { in: ["a"] } }] }, "each id once");
});

test("the move-in form offers a property only while its switch is on and it isn't archived", () => {
  assert.deepEqual(ids(onMoveInForm), ["oxford"]);
});
