import test from "node:test";
import assert from "node:assert/strict";
import { BlobClientTokenExpiredError, BlobServiceNotAvailable } from "@vercel/blob";
import {
  MAX_ONLINE_TRIES,
  OUTBOX_MAX_AGE_MS,
  RETRY_DELAYS_MS,
  STALL_MS,
  ServerBusyError,
  StalledError,
  afterFailure,
  classifyFailure,
  joinEntry,
  memoryOutbox,
  resumable,
  retryDelay,
  splitEntry,
  type OutboxEntry,
  type RetryState,
} from "./outbox";

test("the policy's numbers: retries after 2, 5, 15 and 60 seconds, red after 4 failed tries online", () => {
  assert.deepEqual([...RETRY_DELAYS_MS], [2000, 5000, 15000, 60000]);
  assert.equal(MAX_ONLINE_TRIES, 4);
  assert.equal(STALL_MS, 30_000);
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(retryDelay), [2000, 5000, 15000, 60000, 60000, 60000]);
});

test("classifyFailure: no signal is offline, a dropped request online is the network, a stall is a timeout, anything else a refusal", () => {
  assert.equal(classifyFailure(new TypeError("Failed to fetch"), false), "offline");
  assert.equal(classifyFailure(new Error("anything"), false), "offline");
  assert.equal(classifyFailure(new TypeError("Failed to fetch"), true), "network");
  assert.equal(classifyFailure(new TypeError("Load failed"), true), "network");
  assert.equal(classifyFailure(new BlobServiceNotAvailable(), true), "network");
  assert.equal(classifyFailure(new ServerBusyError(), true), "network", "a 5xx from the token route is the road, not the file");
  assert.equal(classifyFailure(new BlobClientTokenExpiredError(), true), "network", "an hour-old token is the clock, not the file");
  assert.equal(classifyFailure(new StalledError(), true), "timeout");
  assert.equal(classifyFailure(new StalledError(), false), "timeout");
  assert.equal(classifyFailure(new Error("Failed to retrieve the client token"), true), "refused");
  assert.equal(classifyFailure(new Error("That file is over the 25 MB limit."), true), "refused");
});

/** Plays a run of failures through the policy and returns what each one turned into. */
function play(failures: Parameters<typeof afterFailure>[1][]): string[] {
  let state: RetryState = { tries: 0, waits: 0 };
  const out: string[] = [];
  for (const f of failures) {
    const next = afterFailure(state, f);
    if (next.phase === "failed") {
      out.push("failed");
      break;
    }
    state = { tries: next.tries, waits: next.waits };
    out.push(`waiting ${next.retryInMs / 1000}s (tries ${next.tries})`);
  }
  return out;
}

test("Waiting: with no signal a file waits 2, 5, 15, then 60 seconds at a time and never turns red", () => {
  assert.deepEqual(play(Array.from({ length: 8 }, () => "offline" as const)), [
    "waiting 2s (tries 0)",
    "waiting 5s (tries 0)",
    "waiting 15s (tries 0)",
    "waiting 60s (tries 0)",
    "waiting 60s (tries 0)",
    "waiting 60s (tries 0)",
    "waiting 60s (tries 0)",
    "waiting 60s (tries 0)",
  ]);
});

test("Failed: the fourth failed try while online turns the file red", () => {
  assert.deepEqual(play(["network", "network", "network", "network"]), [
    "waiting 2s (tries 1)",
    "waiting 5s (tries 2)",
    "waiting 15s (tries 3)",
    "failed",
  ]);
  assert.deepEqual(play(["timeout", "timeout", "timeout", "timeout"]).at(-1), "failed");
});

test("Failed: a refusal is red at once, however few tries it has had", () => {
  assert.deepEqual(play(["refused"]), ["failed"]);
  assert.deepEqual(play(["network", "refused"]), ["waiting 2s (tries 1)", "failed"]);
});

test("offline spells don't count as tries, so a bad signal can't use them up", () => {
  assert.deepEqual(play(["network", "offline", "offline", "network", "network"]), [
    "waiting 2s (tries 1)",
    "waiting 5s (tries 1)",
    "waiting 15s (tries 1)",
    "waiting 60s (tries 2)",
    "waiting 60s (tries 3)",
  ]);
});

const entry = (id: string, savedAt: number): OutboxEntry => ({
  id,
  scope: "app:u1",
  key: "task:t1",
  batchId: "b1",
  queuedAt: "2026-10-25T18:14:00.000Z",
  uploadKind: "task-upload",
  parentId: "t1",
  access: "private",
  allowed: ["image"],
  prepare: "original",
  label: "",
  whenAway: "hold",
  name: `${id}.jpg`,
  contentType: "image/jpeg",
  fileKind: "image",
  blob: new Blob(["x"]),
  prepared: true,
  thumb: null,
  poster: null,
  meta: {},
  pathname: null,
  thumbPathname: null,
  posterPathname: null,
  multipart: null,
  tries: 0,
  waits: 0,
  savedAt,
});

test("resumable: files older than a week are left behind, the rest come back oldest first", () => {
  const now = 10 * OUTBOX_MAX_AGE_MS;
  const rows = [entry("new", now - 1000), entry("stale", now - OUTBOX_MAX_AGE_MS - 1), entry("old", now - OUTBOX_MAX_AGE_MS), entry("mid", now - 5000)];
  assert.deepEqual(resumable(rows, now).map((e) => e.id), ["old", "mid", "new"]);
});

test("memoryOutbox: put replaces by id, delete forgets, all lists", async () => {
  const box = memoryOutbox();
  await box.put(entry("a", 1));
  await box.put(entry("b", 2));
  await box.put({ ...entry("a", 3), tries: 2 });
  assert.deepEqual((await box.all()).map((e) => [e.id, e.tries]).sort(), [["a", 2], ["b", 0]]);
  await box.delete("a");
  await box.delete("missing");
  assert.deepEqual((await box.all()).map((e) => e.id), ["b"]);
});

test("memoryOutbox: update writes the state and keeps the bytes the row already holds", async () => {
  const box = memoryOutbox();
  const first = entry("a", 1);
  await box.put(first);
  const mid = { ...entry("a", 2), tries: 1, pathname: "tasks/t1/orig/a.jpg", blob: new Blob(["a different file"]) };
  await box.update(mid);
  const [row] = await box.all();
  assert.equal(row.tries, 1);
  assert.equal(row.pathname, "tasks/t1/orig/a.jpg");
  assert.equal(row.savedAt, 2);
  assert.equal(row.blob, first.blob, "the bytes aren't taken from an update");
});

test("memoryOutbox: update of a row that is gone writes nothing, so a recorded file isn't brought back", async () => {
  const box = memoryOutbox();
  await box.put(entry("a", 1));
  await box.delete("a");
  await box.update(entry("a", 2));
  assert.deepEqual(await box.all(), []);
});

test("a row is split into its state and its bytes, and joined again", () => {
  const whole = { ...entry("a", 7), thumb: new Blob(["t"]), poster: new Blob(["p"]) };
  const { state, bytes } = splitEntry(whole);
  assert.ok(!("blob" in state) && !("thumb" in state) && !("poster" in state), "the state carries no bytes");
  assert.equal(state.id, "a");
  assert.equal(state.savedAt, 7);
  assert.deepEqual(Object.keys(bytes).sort(), ["blob", "id", "poster", "thumb"]);
  assert.deepEqual(joinEntry(state, bytes), whole);
});

test("a row an earlier version wrote, bytes and all, still joins; one with no bytes anywhere does not", () => {
  const legacy = entry("old", 1);
  // Version 1 kept everything in the one row.
  assert.equal(joinEntry(legacy, undefined)?.blob, legacy.blob);
  assert.equal(joinEntry(legacy, undefined)?.thumb, null);
  const { state } = splitEntry(entry("new", 2));
  assert.equal(joinEntry(state, undefined), null, "nothing to resume");
  // The bytes' own record wins over bytes left in the row.
  const own = { id: "old", blob: new Blob(["own"]), thumb: null, poster: null };
  assert.equal(joinEntry(legacy, own)?.blob, own.blob);
});
