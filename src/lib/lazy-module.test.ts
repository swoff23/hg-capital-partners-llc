import test from "node:test";
import assert from "node:assert/strict";
import { TOAST_PHONE_CHARS } from "@/lib/toast-line";
import { OPEN_FAILED_LINE, RELOAD_LABEL, fetchModule, isChunkLoadError, lazyModule, openFailedToast, reloadPage, warmWhenIdle, type IdleEnv } from "./lazy-module";

test("lazyModule: nothing is fetched until it is asked for, then once for everyone", async () => {
  let fetched = 0;
  const m = lazyModule(async () => (fetched++, { name: "sheet" }));
  assert.equal(fetched, 0);
  assert.equal(m.loaded(), null);
  const [a, b] = await Promise.all([m.load(), m.load()]);
  assert.equal(a, b);
  assert.equal(fetched, 1);
  assert.deepEqual(m.loaded(), { name: "sheet" });
  await m.load();
  m.warm();
  assert.equal(fetched, 1);
});

test("lazyModule: warm starts the fetch, so the tap that follows finds it", async () => {
  let fetched = 0;
  const m = lazyModule(async () => (fetched++, 1));
  m.warm();
  await m.load();
  assert.equal(fetched, 1);
  assert.equal(m.loaded(), 1);
});

test("lazyModule: a fetch that fails is forgotten and the next ask tries again", async () => {
  let fetched = 0;
  const m = lazyModule(async () => {
    fetched++;
    if (fetched === 1) throw new Error("Loading chunk 7 failed.");
    return "ok";
  });
  await assert.rejects(m.load(), /chunk 7/);
  assert.equal(m.loaded(), null, "nothing to show from a failed fetch");
  assert.equal(await m.load(), "ok");
  assert.equal(fetched, 2);
});

test("lazyModule: warm never throws, even when the fetch fails", async () => {
  const m = lazyModule(async () => {
    throw new Error("offline");
  });
  m.warm();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(m.loaded(), null);
});

test("lazyModule: an importer that throws at once is the same failure", async () => {
  const m = lazyModule((): Promise<number> => {
    throw new Error("boom");
  });
  await assert.rejects(m.load(), /boom/);
});

const settle = () => new Promise((r) => setTimeout(r, 5));

test("fetchModule: a sheet whose code can't be fetched is answered, not thrown, and the next ask fetches again", async () => {
  // A dropped connection, or a deploy that moved the chunk while the tab stayed open.
  let fetched = 0;
  const sheet = lazyModule(async () => {
    fetched++;
    if (fetched === 1) throw new Error("ChunkLoadError: /_next/static/chunks/336e.js");
    return { name: "unit sheet" };
  });
  const seen: string[] = [];
  fetchModule(sheet, { arrived: (m) => seen.push(`arrived ${m.name}`), failed: (e) => seen.push(`failed ${(e as Error).message}`) });
  await settle();
  assert.deepEqual(seen, ["failed ChunkLoadError: /_next/static/chunks/336e.js"]);
  assert.equal(sheet.loaded(), null);
  // The caller closed the sheet; the next tap asks again and gets it.
  fetchModule(sheet, { arrived: (m) => seen.push(`arrived ${m.name}`), failed: (e) => seen.push(`failed ${(e as Error).message}`) });
  await settle();
  assert.equal(seen[1], "arrived unit sheet");
  assert.equal(fetched, 2);
});

test("fetchModule: a caller that has gone away is told nothing, arrived or failed", async () => {
  const seen: string[] = [];
  const arrives = lazyModule(async () => 1);
  fetchModule(arrives, { arrived: () => seen.push("arrived"), failed: () => seen.push("failed") })();
  const fails = lazyModule(async (): Promise<number> => {
    throw new Error("offline");
  });
  fetchModule(fails, { arrived: () => seen.push("arrived"), failed: () => seen.push("failed") })();
  await settle();
  assert.deepEqual(seen, []);
});

test("the toast for code that didn't open fits a phone, and its next step is Reload, not another tap", () => {
  // Turbopack keeps a chunk that failed to load as failed for the page's life (every later import gets the same
  // rejection), so "Try again" could never work: only loading the page again fetches it.
  assert.equal(OPEN_FAILED_LINE, "Couldn't open it.");
  assert.ok(OPEN_FAILED_LINE.length <= TOAST_PHONE_CHARS && !OPEN_FAILED_LINE.includes("—"));
  const t = openFailedToast();
  assert.equal(t.message, OPEN_FAILED_LINE);
  assert.equal(t.action.label, RELOAD_LABEL);
  assert.equal(RELOAD_LABEL, "Reload");
  assert.equal(t.action.onAction, reloadPage);
  assert.equal(t.key, openFailedToast().key, "a second failure replaces the toast instead of stacking one");
});

test("isChunkLoadError: Turbopack's and webpack's chunk failures, and nothing else", () => {
  const turbopack = Object.assign(new Error("Failed to load chunk /_next/static/chunks/0abc.js from module 123"), { name: "ChunkLoadError" });
  assert.equal(isChunkLoadError(turbopack), true);
  assert.equal(isChunkLoadError(new Error("Failed to load chunk /_next/static/chunks/0abc.js from module 1")), true, "the message alone");
  assert.equal(isChunkLoadError(new Error("Loading chunk 7 failed.")), true);
  assert.equal(isChunkLoadError(new Error("Loading CSS chunk app-layout failed.")), true);
  for (const other of [new Error("Failed to fetch"), new TypeError("x is undefined"), new Error("chunk"), null, undefined, "Loading chunk 7 failed.", {}]) {
    assert.equal(isChunkLoadError(other), false, String(other));
  }
});

test("warmWhenIdle: starts the fetch when the browser is idle, or after a moment where it has no idle callback", () => {
  const warmed: string[] = [];
  const source = { warm: () => void warmed.push("warm") };

  const idle: (() => void)[] = [];
  const withIdle: IdleEnv = {
    requestIdleCallback: (cb, options) => {
      assert.deepEqual(options, { timeout: 4000 }, "never later than 4 seconds on");
      idle.push(cb);
    },
    setTimeout: () => assert.fail("an idle callback is used when there is one"),
  };
  warmWhenIdle(source, withIdle);
  assert.deepEqual(warmed, [], "nothing is fetched before the browser has a moment");
  idle[0]();
  assert.deepEqual(warmed, ["warm"]);

  const timers: { cb: () => void; ms: number }[] = [];
  warmWhenIdle(source, { setTimeout: (cb, ms) => timers.push({ cb, ms }) });
  assert.equal(timers[0].ms, 1500);
  timers[0].cb();
  assert.deepEqual(warmed, ["warm", "warm"]);

  // On the server there is no window: nothing happens and nothing throws.
  warmWhenIdle(source, undefined);
  assert.equal(warmed.length, 2);
});

test("warmWhenIdle: no warming while the device is offline, which would leave the chunk failed for the tap", () => {
  const warmed: string[] = [];
  const source = { warm: () => void warmed.push("warm") };
  const timers: (() => void)[] = [];
  const net = { onLine: false };
  const env: IdleEnv = { setTimeout: (cb) => timers.push(cb), navigator: net };
  warmWhenIdle(source, env);
  timers[0]();
  assert.deepEqual(warmed, [], "offline when the moment came");
  net.onLine = true;
  warmWhenIdle(source, env);
  timers[1]();
  assert.deepEqual(warmed, ["warm"]);
});
