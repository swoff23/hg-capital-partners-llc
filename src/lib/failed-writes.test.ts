import test from "node:test";
import assert from "node:assert/strict";
import {
  FAILED_WRITE_WINDOW_MS,
  createWriteWatcher,
  isFailedWriteStatus,
  isServerActionRequest,
} from "./failed-writes";

const action = { method: "POST", headers: { Accept: "text/x-component", "next-action": "abc123" } };

test("a server action call is a POST with a next-action header, in any header form", () => {
  assert.equal(isServerActionRequest(action), true);
  assert.equal(isServerActionRequest({ method: "post", headers: [["Next-Action", "abc"]] }), true);
  assert.equal(isServerActionRequest({ method: "POST", headers: new Headers({ "Next-Action": "abc" }) }), true);
  assert.equal(isServerActionRequest({ method: "GET", headers: { "next-action": "abc" } }), false);
  assert.equal(isServerActionRequest({ method: "POST", headers: { "content-type": "application/json" } }), false);
  assert.equal(isServerActionRequest({ method: "POST" }), false);
  assert.equal(isServerActionRequest(undefined), false);
});

test("an error status didn't save; a success or an action's redirect did", () => {
  assert.equal(isFailedWriteStatus(500), true);
  assert.equal(isFailedWriteStatus(404), true);
  assert.equal(isFailedWriteStatus(413), true);
  assert.equal(isFailedWriteStatus(200), false);
  assert.equal(isFailedWriteStatus(303), false);
});

/** A host whose fetch answers with the given status, or rejects when it's null. */
function hostAnswering(status: number | null) {
  const host = {
    fetch: (async () => {
      if (status === null) throw new TypeError("Failed to fetch");
      return new Response(null, { status });
    }) as typeof fetch,
  };
  return host;
}

async function run(status: number | null, init: RequestInit) {
  let now = 1_000_000;
  const watcher = createWriteWatcher(() => now);
  const host = hostAnswering(status);
  watcher.watch(host);
  await host.fetch("/tasks/1", init).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 0));
  return {
    watcher,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("a server action that comes back 500 counts as a failed save, for a few seconds", async () => {
  const { watcher, advance } = await run(500, action);
  assert.equal(watcher.failedRecently(), true);
  advance(FAILED_WRITE_WINDOW_MS - 1);
  assert.equal(watcher.failedRecently(), true);
  advance(1);
  assert.equal(watcher.failedRecently(), false);
});

test("a server action that never reaches the server counts as a failed save", async () => {
  const { watcher } = await run(null, action);
  assert.equal(watcher.failedRecently(), true);
});

test("a save that worked doesn't count, even if its refreshed page later fails", async () => {
  const { watcher } = await run(200, action);
  assert.equal(watcher.failedRecently(), false);
});

test("other requests don't count, whatever they answer", async () => {
  assert.equal((await run(500, { method: "GET" })).watcher.failedRecently(), false);
  assert.equal((await run(null, { method: "POST", headers: { "content-type": "application/json" } })).watcher.failedRecently(), false);
});

test("the watcher hands the caller the same answer, and wraps fetch once", async () => {
  const watcher = createWriteWatcher();
  const host = hostAnswering(500);
  watcher.watch(host);
  const wrapped = host.fetch;
  watcher.watch(host);
  assert.equal(host.fetch, wrapped);
  const res = await host.fetch("/", action);
  assert.equal(res.status, 500);
  await assert.rejects(hostAnsweringWatched(null)("/", action), /Failed to fetch/);
});

function hostAnsweringWatched(status: number | null) {
  const host = hostAnswering(status);
  createWriteWatcher().watch(host);
  return host.fetch;
}
