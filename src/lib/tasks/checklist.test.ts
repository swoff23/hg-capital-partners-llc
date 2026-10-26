import test from "node:test";
import assert from "node:assert/strict";
import { checklistTitle, removeChecklistItem, renameChecklistItem, restoreChecklistItem } from "./checklist";
import { TaskRuleError, type Principal, type Tx } from "./core";

const PIETER: Principal = { kind: "staff", userId: "u-pieter", label: "Pieter Louw" };
const ZACK: Principal = { kind: "contractor", contactId: "c-zack", label: "Zack Reading" };
const NOW = new Date("2026-10-26T15:00:00.000Z");

type Item = {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  doneAt: Date | null;
  doneByUserId: string | null;
  doneByContactId: string | null;
  assigneeLabel: string | null;
  position: number;
};

const item = (over: Partial<Item> = {}): Item => ({
  id: "i1",
  taskId: "t1",
  title: "Shut off the water",
  done: false,
  doneAt: null,
  doneByUserId: null,
  doneByContactId: null,
  assigneeLabel: null,
  position: 0,
  ...over,
});

/** The three tables the checklist edits touch, in memory: the items, the events and the tasks (with their edit stamps). */
function fakeChecklist(initial: Item[], tasks: string[] = ["t1"]) {
  const items = [...initial];
  const events: { taskId: string; kind: string; data: Record<string, unknown>; actorLabel: string }[] = [];
  const stamped: { id: string; data: Record<string, unknown> }[] = [];
  const tx = {
    taskChecklistItem: {
      // Copies, as the database hands back: a later update must not rewrite a row already read.
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = items.find((i) => i.id === where.id);
        return row ? { ...row } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Item> }) => {
        const row = items.find((i) => i.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        items.splice(items.findIndex((i) => i.id === where.id), 1);
      },
      create: async ({ data }: { data: Item }) => {
        items.push({ ...data });
        return data;
      },
    },
    taskEvent: {
      create: async ({ data }: { data: { taskId: string; kind: string; data: Record<string, unknown>; actorLabel: string } }) => {
        events.push(data);
        return data;
      },
    },
    task: {
      findUnique: async ({ where }: { where: { id: string } }) => (tasks.includes(where.id) ? { id: where.id } : null),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        stamped.push({ id: where.id, data });
        return { id: where.id };
      },
    },
  } as unknown as Tx;
  return { tx, items, events, stamped };
}

test("renameChecklistItem: the title changes, and Activity gets one line saying from and to", async () => {
  const { tx, items, events, stamped } = fakeChecklist([item()]);
  await renameChecklistItem(tx, "i1", "  Shut off   the main water ", PIETER, NOW);
  assert.equal(items[0].title, "Shut off the main water");
  assert.deepEqual(events, [
    {
      taskId: "t1",
      kind: "CHECKLIST",
      visibility: "INTERNAL",
      body: null,
      data: { action: "renamed", itemId: "i1", title: "Shut off the main water", from: "Shut off the water", to: "Shut off the main water" },
      asanaStoryGid: null,
      audienceContactId: null,
      actorUserId: "u-pieter",
      actorContactId: null,
      actorLabel: "Pieter Louw",
      source: "APP",
    },
  ]);
  // Stamped like every other edit.
  assert.deepEqual(stamped, [{ id: "t1", data: { appEditedAt: NOW } }]);
});

test("renameChecklistItem: the same title once tidied writes nothing and adds no line", async () => {
  const { tx, events, stamped } = fakeChecklist([item()]);
  await renameChecklistItem(tx, "i1", " Shut off  the water", PIETER, NOW);
  assert.deepEqual(events, []);
  assert.deepEqual(stamped, []);
});

test("renameChecklistItem: an empty name, a long one, a missing item and a contractor are refused", async () => {
  const { tx, items, events } = fakeChecklist([item()]);
  await assert.rejects(renameChecklistItem(tx, "i1", "   ", PIETER, NOW), (e) => e instanceof TaskRuleError && e.message === "Enter a name for the item.");
  await assert.rejects(renameChecklistItem(tx, "i1", "x".repeat(301), PIETER, NOW), (e) => e instanceof TaskRuleError && e.message === "Use 300 characters or fewer.");
  await assert.rejects(renameChecklistItem(tx, "gone", "New name", PIETER, NOW), (e) => e instanceof TaskRuleError && /no longer exists/.test(e.message));
  await assert.rejects(renameChecklistItem(tx, "i1", "New name", ZACK, NOW), (e) => e instanceof TaskRuleError);
  assert.equal(items[0].title, "Shut off the water");
  assert.deepEqual(events, []);
});

test("checklistTitle: one line of text, trimmed", () => {
  assert.equal(checklistTitle("  Call\nthe   agent "), "Call the agent");
  assert.throws(() => checklistTitle(""), TaskRuleError);
});

test("removeChecklistItem: the row goes, Activity says which, and the snapshot has everything Undo needs", async () => {
  const ticked = item({ id: "i2", title: "Swap the lock", done: true, doneAt: new Date("2026-10-25T14:00:00.000Z"), doneByUserId: "u-connor", position: 3 });
  const { tx, items, events } = fakeChecklist([item(), ticked]);
  const snapshot = await removeChecklistItem(tx, "i2", PIETER, NOW);
  assert.deepEqual(
    items.map((i) => i.id),
    ["i1"],
  );
  assert.deepEqual(snapshot, {
    id: "i2",
    taskId: "t1",
    title: "Swap the lock",
    done: true,
    doneAt: "2026-10-25T14:00:00.000Z",
    doneByUserId: "u-connor",
    doneByContactId: null,
    assigneeLabel: null,
    position: 3,
  });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, { action: "removed", itemId: "i2", title: "Swap the lock", from: "Swap the lock", to: null });
  // It crosses the server action boundary as JSON.
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
});

test("restoreChecklistItem: Undo brings the same item back, in its place, still ticked", async () => {
  const ticked = item({ id: "i2", title: "Swap the lock", done: true, doneAt: new Date("2026-10-25T14:00:00.000Z"), doneByUserId: "u-connor", position: 3 });
  const { tx, items, events } = fakeChecklist([item(), ticked]);
  const snapshot = await removeChecklistItem(tx, "i2", PIETER, NOW);
  await restoreChecklistItem(tx, JSON.parse(JSON.stringify(snapshot)), PIETER, NOW);
  assert.deepEqual(items[1], ticked);
  assert.deepEqual(
    events.map((e) => (e.data as { action: string }).action),
    ["removed", "restored"],
  );
  assert.deepEqual(events[1].data, { action: "restored", itemId: "i2", title: "Swap the lock", from: null, to: "Swap the lock" });
});

test("restoreChecklistItem: a second Undo is a no-op, and a deleted task can't take the item back", async () => {
  const { tx, items, events } = fakeChecklist([item()]);
  const snapshot = await removeChecklistItem(tx, "i1", PIETER, NOW);
  await restoreChecklistItem(tx, snapshot, PIETER, NOW);
  await restoreChecklistItem(tx, snapshot, PIETER, NOW);
  assert.equal(items.length, 1);
  assert.equal(events.length, 2);

  const gone = fakeChecklist([], []);
  await assert.rejects(restoreChecklistItem(gone.tx, snapshot, PIETER, NOW), (e) => e instanceof TaskRuleError && /gone/.test(e.message));
  assert.equal(gone.items.length, 0);
});

test("removeChecklistItem: a missing item or a contractor is refused", async () => {
  const { tx, items } = fakeChecklist([item()]);
  await assert.rejects(removeChecklistItem(tx, "nope", PIETER, NOW), TaskRuleError);
  await assert.rejects(removeChecklistItem(tx, "i1", ZACK, NOW), TaskRuleError);
  assert.equal(items.length, 1);
});
