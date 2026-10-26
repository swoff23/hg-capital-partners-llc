import test from "node:test";
import assert from "node:assert/strict";
import { copySlot } from "./repeat-slot";

type Where = { taskId?: string; kind?: string; data?: unknown };

/** A db whose REPEAT_CREATED lookup answers `made` (or nothing) and records what was asked. */
function fakeDb(made?: Record<string, unknown>) {
  const asked: Where[] = [];
  const db = {
    taskEvent: {
      findFirst: async (args: { where: Where }) => {
        asked.push(args.where);
        return made ? { data: made } : null;
      },
    },
  } as unknown as Parameters<typeof copySlot>[0];
  return { db, asked };
}

test("copySlot: a copy whose CREATED line kept its date reads nothing more", async () => {
  const { db, asked } = fakeDb({ next: "t1", due: "2026-12-01" });
  assert.equal(await copySlot(db, "t1", { repeatOf: "t0", due: "2026-10-26" }), "2026-10-26");
  assert.equal(asked.length, 0);
});

test("copySlot: a series' first task, or a task made with an assignee, has no slot and reads nothing", async () => {
  const { db, asked } = fakeDb({ next: "t1", due: "2026-10-26" });
  assert.equal(await copySlot(db, "t1", {}), null);
  assert.equal(await copySlot(db, "t1", { to: { userId: "u1", contactId: null } }), null);
  assert.equal(await copySlot(db, "t1", null), null);
  assert.equal(asked.length, 0);
});

test("copySlot: a copy Asana made and the importer joined takes its date from the line on the task before it", async () => {
  // asana/import.ts: CREATED { asanaGid, repeatOf } with no due; REPEAT_CREATED { next, due, madeInAsana } on the source.
  const { db, asked } = fakeDb({ next: "t1", due: "2026-10-26", madeInAsana: true });
  assert.equal(await copySlot(db, "t1", { asanaGid: "123", repeatOf: "t0" }), "2026-10-26");
  assert.deepEqual(asked, [{ taskId: "t0", kind: "REPEAT_CREATED", data: { path: ["next"], equals: "t1" } }], "the line on t0 that made t1");
});

test("copySlot: no such line, or one with no date, is no slot", async () => {
  assert.equal(await copySlot(fakeDb().db, "t1", { repeatOf: "t0" }), null);
  assert.equal(await copySlot(fakeDb({ next: "t1", due: null, madeInAsana: true }).db, "t1", { repeatOf: "t0" }), null);
});
