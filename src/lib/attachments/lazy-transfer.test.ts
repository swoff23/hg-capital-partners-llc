import test from "node:test";
import assert from "node:assert/strict";
import { lazyTransfer } from "./lazy-transfer";
import { classifyFailure } from "./outbox";
import type { SendInput, Transfer } from "./transfer";

const input = { name: "a.jpg" } as unknown as SendInput;

test("lazyTransfer: the client loads once, with the first file, and every file goes through it", async () => {
  let loads = 0;
  const sent: string[] = [];
  const real: Transfer = async (i) => {
    sent.push(i.name);
    return { pathname: `blob/${i.name}` };
  };
  const t = lazyTransfer(async () => (loads++, real));
  assert.equal(loads, 0, "nothing is fetched until a file or a preload asks");
  const [a, b] = await Promise.all([t.send(input), t.send({ ...input, name: "b.jpg" } as SendInput)]);
  assert.deepEqual([a.pathname, b.pathname], ["blob/a.jpg", "blob/b.jpg"]);
  await t.send(input);
  assert.equal(loads, 1);
  assert.deepEqual(sent, ["a.jpg", "b.jpg", "a.jpg"]);
});

test("lazyTransfer: a preload and the first file share one fetch", async () => {
  let loads = 0;
  const t = lazyTransfer(async () => (loads++, async () => ({ pathname: "p" })));
  await t.get();
  await t.send(input);
  assert.equal(loads, 1);
});

test("lazyTransfer: a chunk that doesn't arrive fails like a dropped connection, and the next try fetches it again", async () => {
  let loads = 0;
  const t = lazyTransfer(async () => {
    loads++;
    if (loads === 1) throw new Error("Loading chunk 123 failed.");
    return async () => ({ pathname: "p" });
  });
  const failure = await t.send(input).then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(failure instanceof TypeError, "a TypeError, the shape of a dropped request");
  assert.equal(classifyFailure(failure, true), "network", "online it counts as a try and waits");
  assert.equal(classifyFailure(failure, false), "offline", "offline it just waits");
  assert.deepEqual(await t.send(input), { pathname: "p" });
  assert.equal(loads, 2);
});

test("lazyTransfer: a loader that throws at once is the same failure", async () => {
  const t = lazyTransfer(() => {
    throw new Error("boom");
  });
  await assert.rejects(t.send(input), TypeError);
});
