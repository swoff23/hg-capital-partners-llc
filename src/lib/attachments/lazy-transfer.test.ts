import test from "node:test";
import assert from "node:assert/strict";
import { lazyTransfer } from "./lazy-transfer";
import { FinalRefusalError, ServerBusyError, UploadCodeMissingError, classifyFailure } from "./outbox";
import type { SendInput, Transfer } from "./transfer";

const input = { name: "a.jpg" } as unknown as SendInput;
const online = () => true;
const offline = () => false;

test("lazyTransfer: the client loads once, with the first file, and every file goes through it", async () => {
  let loads = 0;
  const sent: string[] = [];
  const real: Transfer = async (i) => {
    sent.push(i.name);
    return { pathname: `blob/${i.name}` };
  };
  const t = lazyTransfer(async () => (loads++, real), online);
  assert.equal(loads, 0, "nothing is fetched until a file or a preload asks");
  const [a, b] = await Promise.all([t.send(input), t.send({ ...input, name: "b.jpg" } as SendInput)]);
  assert.deepEqual([a.pathname, b.pathname], ["blob/a.jpg", "blob/b.jpg"]);
  await t.send(input);
  assert.equal(loads, 1);
  assert.deepEqual(sent, ["a.jpg", "b.jpg", "a.jpg"]);
});

test("lazyTransfer: a preload and the first file share one fetch", async () => {
  let loads = 0;
  const t = lazyTransfer(async () => (loads++, async () => ({ pathname: "p" })), online);
  await t.get();
  await t.send(input);
  assert.equal(loads, 1);
});

test("lazyTransfer: a chunk that doesn't arrive while online is the page's code, not the road: the file waits uncounted", async () => {
  // N2: counting tries turned the file red as "no connection" after four fetches in a row, though the page's code was
  // what was missing (and after a deploy removed it, nothing fetches it). Now it waits uncounted, and the engine says
  // "paused" and offers Reload.
  const t = lazyTransfer(async () => {
    throw new Error("ChunkLoadError: Failed to load chunk /_next/static/chunks/0blob.js");
  }, online);
  const failure = await t.send(input).then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(failure instanceof UploadCodeMissingError);
  assert.equal(classifyFailure(failure, true), "offline", "no try is counted");
  assert.equal(classifyFailure(failure, false), "offline");
});

test("lazyTransfer: offline, the same failure is the connection's, and the file waits for the signal", async () => {
  let loads = 0;
  const t = lazyTransfer(async () => {
    loads++;
    if (loads === 1) throw new Error("Loading chunk 123 failed.");
    return async () => ({ pathname: "p" });
  }, offline);
  const failure = await t.send(input).then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(failure instanceof TypeError, "a TypeError, the shape of a dropped request");
  assert.equal(classifyFailure(failure, false), "offline", "offline it just waits");
  // The runtime forgets a failed chunk, so the next try fetches it again and gets the code.
  assert.deepEqual(await t.send(input), { pathname: "p" });
  assert.equal(loads, 2);
});

test("lazyTransfer: online too, the next try after a failed fetch gets the code, which is how a dropped request heals", async () => {
  let loads = 0;
  const t = lazyTransfer(async () => {
    loads++;
    if (loads === 1) throw new Error("ChunkLoadError: Failed to load chunk /_next/static/chunks/0blob.js");
    return async () => ({ pathname: "p" });
  }, online);
  await assert.rejects(t.send(input), UploadCodeMissingError);
  assert.deepEqual(await t.send(input), { pathname: "p" });
  assert.equal(loads, 2, "the failure was forgotten, so the importer ran again");
});

test("lazyTransfer: a loader that throws at once is the same failure", async () => {
  const t = lazyTransfer(() => {
    throw new Error("boom");
  }, online);
  await assert.rejects(t.send(input), UploadCodeMissingError);
  const away = lazyTransfer(() => {
    throw new Error("boom");
  }, offline);
  await assert.rejects(away.send(input), TypeError);
});

test("lazyTransfer: what the transfer itself throws comes out as it is, so its own rules still apply", async () => {
  // BOTH-L2: a refusal (late-photos' FinalRefusalError, a token route's no) or a busy server must not be dressed up as
  // a missing chunk or a dropped connection; only the client's load is.
  class Refused extends Error {}
  for (const thrown of [new ServerBusyError(), new FinalRefusalError("This job is closed."), new Refused("Failed to retrieve the client token"), new TypeError("Failed to fetch")]) {
    const t = lazyTransfer(async () => async () => {
      throw thrown;
    }, online);
    const out = await t.send(input).then(
      () => null,
      (e: unknown) => e,
    );
    assert.equal(out, thrown, `${thrown.constructor.name} passes through unchanged`);
  }
  assert.equal(classifyFailure(new ServerBusyError(), true), "network", "a busy server still counts as a try");
});
