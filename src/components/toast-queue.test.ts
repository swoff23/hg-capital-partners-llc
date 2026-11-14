import test from "node:test";
import assert from "node:assert/strict";
import { addToast, type QueuedToast } from "./toast-queue";

type T = { message: string; key?: string };

test("addToast: toasts without a key stack, keeping the last three", () => {
  let list: QueuedToast<T>[] = [];
  for (let i = 1; i <= 4; i++) list = addToast(list, { message: `m${i}` }, i, 3).list;
  assert.deepEqual(
    list.map((t) => [t.id, t.message]),
    [
      [2, "m2"],
      [3, "m3"],
      [4, "m4"],
    ],
  );
});

test("addToast: a toast with a live key replaces it, keeps its id, moves last and restarts", () => {
  let list: QueuedToast<T>[] = [];
  list = addToast(list, { message: "Rate set to 6.5%", key: "loan" }, 1, 3).list;
  list = addToast(list, { message: "Task created" }, 2, 3).list;
  const res = addToast(list, { message: "Rate set to 6.875%", key: "loan" }, 3, 3);
  assert.equal(res.id, 1);
  assert.deepEqual(
    res.list.map((t) => [t.id, t.message, t.version]),
    [
      [2, "Task created", 0],
      [1, "Rate set to 6.875%", 1],
    ],
  );
});

test("addToast: a key with no live toast adds a new one", () => {
  const list = addToast<T>([], { message: "Lender cleared", key: "lender" }, 7, 3);
  assert.equal(list.id, 7);
  assert.equal(list.list.length, 1);
});

test("addToast: a checklist item's removal takes its rename's Undo off the screen", () => {
  type U = T & { action?: string };
  let list: QueuedToast<U>[] = [];
  list = addToast<U>(list, { message: "Item renamed", key: "checklist:i1", action: "Undo rename" }, 1, 3).list;
  list = addToast<U>(list, { message: "Item renamed", key: "checklist:i2", action: "Undo rename" }, 2, 3).list;
  list = addToast<U>(list, { message: "Item removed", key: "checklist:i1", action: "Undo remove" }, 3, 3).list;
  assert.deepEqual(
    list.map((t) => [t.message, t.key, t.action]),
    [
      ["Item renamed", "checklist:i2", "Undo rename"],
      ["Item removed", "checklist:i1", "Undo remove"],
    ],
  );
});

test("addToast: a sticky toast stays when three newer ones arrive; the oldest plain one goes instead", () => {
  type S = T & { sticky?: boolean };
  let list: QueuedToast<S>[] = [];
  list = addToast<S>(list, { message: "A new version is ready", key: "update", sticky: true }, 1, 3).list;
  for (let i = 2; i <= 4; i++) list = addToast<S>(list, { message: `m${i}` }, i, 3).list;
  assert.deepEqual(
    list.map((t) => [t.id, t.message]),
    [
      [1, "A new version is ready"],
      [3, "m3"],
      [4, "m4"],
    ],
  );
});

test("addToast: with only sticky toasts to drop, the newest still shows and the list runs over", () => {
  type S = T & { sticky?: boolean };
  let list: QueuedToast<S>[] = [];
  for (let i = 1; i <= 3; i++) list = addToast<S>(list, { message: `s${i}`, sticky: true }, i, 3).list;
  list = addToast<S>(list, { message: "m4" }, 4, 3).list;
  assert.deepEqual(
    list.map((t) => t.message),
    ["s1", "s2", "s3", "m4"],
  );
});
