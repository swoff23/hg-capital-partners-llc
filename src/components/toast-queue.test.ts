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
