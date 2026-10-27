import test from "node:test";
import assert from "node:assert/strict";
import { TaskRuleError, checklistTitle, removeChecklistItem, renameChecklistItem, restoreChecklistItem, type Principal, type Tx } from "./core";
import { checklistSnapshotSchema } from "./checklist-snapshot";

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
  dueDate: Date | null;
  position: number;
  asanaGid: string | null;
  createdAt: Date;
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
  dueDate: null,
  position: 0,
  asanaGid: null,
  createdAt: new Date("2026-10-20T12:00:00.000Z"),
  ...over,
});

/** The three tables the checklist edits touch, in memory: the items, the events and the tasks (with their edit stamps). */
function fakeChecklist(initial: Item[], tasks: string[] = ["t1"], onLock?: (items: Item[]) => void) {
  const items = [...initial];
  const events: { taskId: string; kind: string; data: Record<string, unknown>; actorLabel: string }[] = [];
  const stamped: { id: string; data: Record<string, unknown> }[] = [];
  // What touched the items table, in order: the row lock and the reads, so a test can see the lock comes first.
  const order: string[] = [];
  const tx = {
    $executeRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      order.push(`lock ${values.join(",")}: ${sql.join("?").replace(/\s+/g, " ").trim()}`);
      // Whoever held the row's lock before us has committed by the time we get it.
      onLock?.(items);
      return 1;
    },
    taskChecklistItem: {
      // Copies, as the database hands back: a later update must not rewrite a row already read.
      findUnique: async ({ where }: { where: { id: string } | { asanaGid: string } }) => {
        order.push("read");
        const row = items.find((i) => ("id" in where ? i.id === where.id : i.asanaGid === where.asanaGid));
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
  return { tx, items, events, stamped, order };
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
    dueDate: null,
    position: 3,
    asanaGid: null,
    createdAt: "2026-10-20T12:00:00.000Z",
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

test("restoreChecklistItem: an imported item comes back with its Asana link and due date, unless an import brought it back first", async () => {
  const imported = item({ id: "i2", title: "Patch the soffit", assigneeLabel: "Zack", dueDate: new Date("2026-10-30T00:00:00.000Z"), asanaGid: "120001" });
  const { tx, items, events } = fakeChecklist([item(), imported]);
  const snapshot = await removeChecklistItem(tx, "i2", PIETER, NOW);
  await restoreChecklistItem(tx, JSON.parse(JSON.stringify(snapshot)), PIETER, NOW);
  assert.deepEqual(items[1], imported);

  // The next Asana import found the subtask missing and added it again under a new id: that is the item, back.
  const again = fakeChecklist([item(), imported]);
  const removed = await removeChecklistItem(again.tx, "i2", PIETER, NOW);
  again.items.push(item({ id: "i9", title: "Patch the soffit", asanaGid: "120001", position: 1 }));
  await restoreChecklistItem(again.tx, removed, PIETER, NOW);
  assert.deepEqual(
    again.items.map((i) => i.id),
    ["i1", "i9"],
  );
  assert.equal(events.length, 2);
  assert.equal(again.events.length, 1);
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

test("restoreChecklistItem: an item longer than Add item allows still comes back through Undo", async () => {
  // Imported, playbook and repeat-copy titles aren't held to the 300 characters that Add item and Rename allow.
  const long = "Replace the damaged soffit and fascia on the north side, ".repeat(6).trim();
  assert.ok(long.length > 300);
  const title = "x".repeat(301);
  const label = "Zack Reading and crew, ".repeat(20);
  for (const text of [title, long]) {
    const { tx, items } = fakeChecklist([item({ id: "i2", title: text, assigneeLabel: label, position: 1, asanaGid: "120001" })]);
    const snapshot = await removeChecklistItem(tx, "i2", PIETER, NOW);
    assert.equal(snapshot.title, text);
    // The action checks the snapshot the client sends back, as JSON, before it writes anything.
    const sent = checklistSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
    await restoreChecklistItem(tx, sent, PIETER, NOW);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, text);
    assert.equal(items[0].assigneeLabel, label);
  }
  // Add item and Rename keep their cap.
  const { tx } = fakeChecklist([item()]);
  await assert.rejects(renameChecklistItem(tx, "i1", title, PIETER, NOW), (e) => e instanceof TaskRuleError && e.message === "Use 300 characters or fewer.");
});

test("checklistSnapshotSchema: still refuses a snapshot that isn't one", () => {
  const ok = { id: "i1", taskId: "t1", title: "Shut off the water", done: false, doneAt: null, doneByUserId: null, doneByContactId: null, assigneeLabel: null, dueDate: null, position: 0, asanaGid: null, createdAt: "2026-10-20T12:00:00.000Z" };
  assert.ok(checklistSnapshotSchema.safeParse(ok).success);
  assert.ok(!checklistSnapshotSchema.safeParse({ ...ok, title: "" }).success);
  assert.ok(!checklistSnapshotSchema.safeParse({ ...ok, id: "" }).success);
  assert.ok(!checklistSnapshotSchema.safeParse({ ...ok, position: 1.5 }).success);
  assert.ok(!checklistSnapshotSchema.safeParse({ ...ok, done: "yes" }).success);
});

test("rename and remove lock the item's row before they read it", async () => {
  const rename = fakeChecklist([item()]);
  await renameChecklistItem(rename.tx, "i1", "Shut off the main water", PIETER, NOW);
  assert.match(rename.order[0], /^lock i1: SELECT 1 FROM "TaskChecklistItem" WHERE "id" = \? FOR NO KEY UPDATE$/);
  assert.equal(rename.order[1], "read");

  const remove = fakeChecklist([item()]);
  await removeChecklistItem(remove.tx, "i1", PIETER, NOW);
  assert.match(remove.order[0], /^lock i1: SELECT 1 FROM "TaskChecklistItem" WHERE "id" = \? FOR NO KEY UPDATE$/);
  assert.equal(remove.order[1], "read");
});

test("removeChecklistItem: a tick that lands first is in the snapshot, so Undo brings the item back ticked", async () => {
  // The tick commits while Remove waits for the row; Remove then reads the ticked row.
  const tick = (items: Item[]) => Object.assign(items[0], { done: true, doneAt: NOW, doneByUserId: "u-connor" });
  const { tx, items } = fakeChecklist([item()], ["t1"], tick);
  const snapshot = await removeChecklistItem(tx, "i1", PIETER, NOW);
  assert.equal(snapshot.done, true);
  assert.equal(snapshot.doneByUserId, "u-connor");
  await restoreChecklistItem(tx, snapshot, PIETER, NOW);
  assert.equal(items[0].done, true);
});

test("removeChecklistItem: a Remove that finds the item already gone says so instead of failing on the delete", async () => {
  // The first Remove commits while the second waits for the row; the second finds nothing.
  const gone = (items: Item[]) => void items.splice(0, items.length);
  const { tx, events } = fakeChecklist([item()], ["t1"], gone);
  await assert.rejects(removeChecklistItem(tx, "i1", PIETER, NOW), (e) => e instanceof TaskRuleError && /no longer exists/.test(e.message));
  await assert.rejects(renameChecklistItem(tx, "i1", "New name", PIETER, NOW), (e) => e instanceof TaskRuleError && /no longer exists/.test(e.message));
  assert.deepEqual(events, []);
});
