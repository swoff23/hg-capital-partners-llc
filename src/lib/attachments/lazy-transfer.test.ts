import test from "node:test";
import assert from "node:assert/strict";
import { uploadFailureReason } from "./media";
import { PROBE_PATH, lazyTransfer, originProbe, type ProbeEnv } from "./lazy-transfer";
import { FinalRefusalError, NoConnectionError, ServerBusyError, UploadCodeMissingError, afterFailure, classifyFailure } from "./outbox";
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
  // lazyModule forgets the failure and runs the importer again. In the browser the runtime answers that with the same
  // failure until a reload (lazy-module.ts); here the importer's second answer is the code.
  assert.deepEqual(await t.send(input), { pathname: "p" });
  assert.equal(loads, 2);
});

test("lazyTransfer: online too, the next try runs the importer again (the browser's runtime answers it with the same failure until a reload)", async () => {
  let loads = 0;
  const t = lazyTransfer(async () => {
    loads++;
    if (loads === 1) throw new Error("ChunkLoadError: Failed to load chunk /_next/static/chunks/0blob.js");
    return async () => ({ pathname: "p" });
  }, online);
  await assert.rejects(t.send(input), UploadCodeMissingError);
  assert.deepEqual(await t.send(input), { pathname: "p" });
  assert.equal(loads, 2, "the failure was forgotten here, so the importer ran again");
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

test("lazyTransfer: online with no answer from the server, a missing chunk is the connection's: the file waits for the signal, no Reload", async () => {
  // Lows 7: a phone with no data still reads online, and "Uploads paused · Reload" sent it to Safari's offline page.
  const road = { up: false };
  let asked = 0;
  const t = lazyTransfer(
    async () => {
      throw new Error("ChunkLoadError: Failed to load chunk /_next/static/chunks/0blob.js");
    },
    online,
    async () => (asked++, road.up),
  );
  const down = await t.send(input).then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(down instanceof NoConnectionError, "the road, not the code");
  assert.ok(!(down instanceof UploadCodeMissingError), "so the engine shows no paused line and no Reload");
  assert.equal(classifyFailure(down, true), "offline", "it waits for the signal, uncounted, though the device reads online");
  assert.equal(uploadFailureReason(down), "no connection");
  assert.deepEqual(afterFailure({ tries: 3, waits: 6 }, classifyFailure(down, true)), { phase: "waiting", tries: 3, waits: 7, retryInMs: 60_000 }, "never red on its own");

  // The server answers again and the chunk is still missing (the runtime keeps the failure): now it is the code, with Reload.
  road.up = true;
  await assert.rejects(t.send(input), UploadCodeMissingError);
  assert.equal(asked, 2, "asked once for each failed load");
});

test("lazyTransfer: the probe is asked only online, and never for what the transfer itself throws", async () => {
  let asked = 0;
  const reachable = async () => (asked++, false);
  const away = lazyTransfer(
    async () => {
      throw new Error("Loading chunk 123 failed.");
    },
    offline,
    reachable,
  );
  await assert.rejects(away.send(input), (e: unknown) => e instanceof TypeError && !(e instanceof NoConnectionError));
  assert.equal(asked, 0, "the device's own word that it's offline is enough");
  for (const thrown of [new ServerBusyError(), new FinalRefusalError("This job is closed.")]) {
    const t = lazyTransfer(
      async () => async () => {
        throw thrown;
      },
      online,
      reachable,
    );
    const out = await t.send(input).then(
      () => null,
      (e: unknown) => e,
    );
    assert.equal(out, thrown, `${thrown.constructor.name} passes through unchanged`);
  }
  assert.equal(asked, 0, "the client loaded, so the road needs no asking");
});

/** A browser for originProbe: each fetch answers as `answer` says, and the timers run when the test says. */
function probeEnv(answer: (init: RequestInit) => Promise<unknown>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const timers = new Map<number, () => void>();
  let next = 1;
  const env: ProbeEnv = {
    fetch: (url, init) => (calls.push({ url, init }), answer(init)),
    setTimer: (fn) => (timers.set(next, fn), next++),
    clearTimer: (h) => void timers.delete(h as number),
  };
  return { env, calls, timers, fire: () => [...timers.values()].forEach((fn) => fn()) };
}

test("originProbe: any answer is a connection, a failed request is none, and files that fail together share one ask", async () => {
  const ok = probeEnv(async () => ({ status: 503 }));
  const probe = originProbe(ok.env);
  const [a, b] = await Promise.all([probe(), probe()]);
  assert.deepEqual([a, b], [true, true], "a 503 still came back over a working connection");
  assert.equal(ok.calls.length, 1, "one request for both");
  assert.equal(ok.calls[0].url, PROBE_PATH);
  assert.equal(PROBE_PATH, "/api/health");
  assert.equal(ok.calls[0].init.method, "HEAD");
  assert.equal(ok.calls[0].init.cache, "no-store", "never a cached answer");
  assert.equal(ok.timers.size, 0, "its timer is cleared");
  await probe();
  assert.equal(ok.calls.length, 2, "a later failure asks afresh");

  const down = probeEnv(async () => {
    throw new TypeError("Load failed");
  });
  assert.equal(await originProbe(down.env)(), false);

  assert.equal(await originProbe(null)(), true, "with no browser to ask from (the server, a test), yes");
});

test("originProbe: no answer in time is no connection, and the request is called off", async () => {
  const h = probeEnv(
    (init) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))),
  );
  const asking = originProbe(h.env, 5_000)();
  h.fire();
  assert.equal(await asking, false);
  assert.equal(h.calls[0].init.signal?.aborted, true);
});
