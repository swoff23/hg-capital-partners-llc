import test from "node:test";
import assert from "node:assert/strict";
import type { UploadTarget } from "@/components/upload-queue";
import { UploadEngine, capReason, type EngineDeps, type EngineNotice } from "./engine";
import { MAX_ONLINE_TRIES, STALL_MS, memoryOutbox, type OutboxStore } from "./outbox";
import type { SendInput } from "./transfer";

/**
 * The engine on fakes: a transfer that follows a script, a clock and timers
 * the test moves by hand, an outbox in memory. What it checks is the queue's
 * behavior, which can't be tried against real Blob here: tiles and counts,
 * the cap, Waiting and Failed, the record-only retry, a batch landing with
 * its page gone, and the outbox putting a file back after a reload.
 */

type Step = "ok" | Error;

function setup(opts: { outbox?: OutboxStore | null; script?: Step[]; online?: boolean } = {}) {
  let clock = Date.UTC(2026, 9, 25, 18, 14, 30);
  let nextTimer = 1;
  const timers = new Map<number, { due: number; fn: () => void }>();
  const sent: SendInput[] = [];
  const notices: EngineNotice[] = [];
  const state = { online: opts.online ?? true, script: [...(opts.script ?? [])], seq: 0 };
  const outbox = opts.outbox === undefined ? memoryOutbox() : opts.outbox;

  const deps: EngineDeps = {
    transfer: async (input) => {
      sent.push(input);
      const step = state.script.shift() ?? "ok";
      if (step !== "ok") throw step;
      input.onProgress(1);
      return { pathname: `${input.role}/${input.name}-${++state.seq}` };
    },
    prepare: async (file, input) => ({ blob: file, name: input.name, contentType: input.contentType, thumb: null, poster: null, meta: {} }),
    outbox,
    notify: (n) => notices.push(n),
    navigate: () => {},
    online: () => state.online,
    now: () => new Date(clock),
    setTimer: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { due: clock + ms, fn });
      return id;
    },
    clearTimer: (h) => {
      timers.delete(h as number);
    },
    preview: { create: () => "blob:preview", revoke: () => {} },
    uid: () => String(++state.seq),
  };
  const engine = new UploadEngine(deps);

  const flush = async () => {
    for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r));
  };
  /** Moves the clock and runs the timers that fall due, soonest first. */
  const advance = async (ms: number) => {
    const end = clock + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!due) break;
      timers.delete(due[0]);
      clock = Math.max(clock, due[1].due);
      due[1].fn();
      await flush();
    }
    clock = end;
    await flush();
  };
  return { engine, deps, sent, notices, state, outbox, flush, advance, timers };
}

const file = (name: string, type = "image/jpeg", size = 3000, lastModified = Date.UTC(2026, 9, 25, 18, 14, 5)) =>
  new File([new Uint8Array(size)], name, { type, lastModified });

function target(over: Partial<UploadTarget> = {}): UploadTarget & { recorded: string[] } {
  const recorded: string[] = [];
  let n = 0;
  const t: UploadTarget & { recorded: string[] } = {
    key: "task:t1",
    label: "56 Tamarack St",
    uploadKind: "task-upload",
    parentId: "t1",
    access: "private",
    allowed: ["image", "video", "file"],
    prepare: "original",
    record: async (f) => {
      recorded.push(f.filename);
      return { ok: true, data: { id: `a${++n}` } };
    },
    whenAway: "hold",
    recorded,
    ...over,
  };
  return t;
}

test("a batch: camera names are dated, a refused file gets its reason, the rest land together", async () => {
  const h = setup();
  const landed: string[][] = [];
  const t = target({ onRecorded: (ids) => landed.push(ids) });
  h.engine.mount(t.key);
  h.engine.add(t, [file("image.jpg"), file("image.jpg"), file("setup.exe", "application/x-msdownload"), file("Lease 2026.pdf", "application/pdf")]);

  const tiles = h.engine.uploadsFor(t.key);
  assert.deepEqual(
    tiles.map((u) => [u.name, u.status]),
    [
      ["Photo 2026-10-25 at 2.14 PM.jpg", "queued"],
      ["Photo 2026-10-25 at 2.14 PM 2.jpg", "queued"],
      ["setup.exe", "invalid"],
      ["Lease 2026.pdf", "queued"],
    ],
  );
  assert.equal(tiles[2].error, "only photos, videos and documents can be added here");
  assert.equal(new Set(tiles.map((u) => u.batchId)).size, 1, "one batch");
  assert.deepEqual(h.engine.counts(t.key), { pending: 3, waiting: 0, failed: 1, pendingKinds: ["image", "image", "file"] });

  await h.flush();
  assert.deepEqual(t.recorded.sort(), ["Lease 2026.pdf", "Photo 2026-10-25 at 2.14 PM 2.jpg", "Photo 2026-10-25 at 2.14 PM.jpg"].sort());
  // The refused tile stays for its Remove; the landed ones are gone. The batch reported once, in order of landing.
  assert.deepEqual(h.engine.uploadsFor(t.key).map((u) => u.status), ["invalid"]);
  assert.equal(landed.length, 1);
  assert.equal(landed[0].length, 3);
  assert.deepEqual(h.engine.counts(t.key), { pending: 0, waiting: 0, failed: 1, pendingKinds: [] });
});

test("the record step gets the pathname, the stored name and no queuedAt unless the target asks", async () => {
  const h = setup();
  const seen: unknown[] = [];
  const t = target({ record: async (f) => (seen.push(f), { ok: true, data: { id: "a" } }) });
  h.engine.add(t, [file("IMG_6117.jpg")]);
  await h.flush();
  assert.equal(seen.length, 1);
  assert.deepEqual(Object.keys(seen[0] as object).sort(), ["filename", "pathname"]);

  const sends = setup();
  const q = target({ sendQueuedAt: true, record: async (f) => (seen.push(f), { ok: true, data: { id: "b" } }) });
  sends.engine.add(q, [file("IMG_1.jpg")]);
  await sends.flush();
  assert.equal(((seen[1] as { queuedAt?: string }).queuedAt ?? "").slice(0, 10), "2026-10-25");
});

test("a target's cap counts files in flight, and a file past it is refused with a reason", async () => {
  const h = setup({ script: [new TypeError("Failed to fetch")] });
  const t = target({ maxFiles: 2, allowed: ["image"] });
  h.engine.add(t, [file("a.jpg"), file("b.jpg"), file("c.jpg")]);
  assert.deepEqual(
    h.engine.uploadsFor(t.key).map((u) => [u.name, u.status, u.error]),
    [
      ["a.jpg", "queued", undefined],
      ["b.jpg", "queued", undefined],
      ["c.jpg", "invalid", "no more can be added here"],
    ],
  );
  assert.equal(capReason(0), "no more can be added here");
  assert.equal(capReason(3), "only 3 more can be added here");
});

test("no signal: the file waits, then goes the moment the signal is back", async () => {
  const h = setup({ online: false, script: [new TypeError("Failed to fetch")] });
  const t = target();
  h.engine.mount(t.key);
  h.engine.add(t, [file("a.jpg")]);
  await h.flush();
  assert.equal(h.engine.uploadsFor(t.key)[0].status, "waiting");
  assert.deepEqual(h.engine.counts(t.key), { pending: 0, waiting: 1, failed: 0, pendingKinds: ["image"] });
  assert.equal(h.sent.length, 1);

  h.state.online = true;
  h.engine.nudge();
  await h.flush();
  assert.equal(h.engine.uploadsFor(t.key).length, 0, "recorded and gone");
  assert.deepEqual(t.recorded, ["a.jpg"]);
});

test("a waiting file tries again after 2, 5, 15 and then every 60 seconds, and never turns red while offline", async () => {
  const h = setup({ online: false, script: Array.from({ length: 8 }, () => new TypeError("Failed to fetch")) });
  const t = target();
  h.engine.mount(t.key);
  h.engine.add(t, [file("a.jpg")]);
  await h.flush();
  assert.equal(h.sent.length, 1);
  await h.advance(1999);
  assert.equal(h.sent.length, 1, "not yet");
  await h.advance(1);
  assert.equal(h.sent.length, 2, "after 2 seconds");
  await h.advance(5000);
  assert.equal(h.sent.length, 3, "5 more");
  await h.advance(15000);
  assert.equal(h.sent.length, 4, "15 more");
  await h.advance(60000);
  assert.equal(h.sent.length, 5, "60 more");
  await h.advance(60000);
  assert.equal(h.sent.length, 6, "and every 60");
  assert.equal(h.engine.uploadsFor(t.key)[0].status, "waiting");
  assert.equal(h.engine.counts(t.key).failed, 0);
});

test("online but failing: the fourth failed try turns it red, and Retry starts it over", async () => {
  const h = setup({ script: Array.from({ length: MAX_ONLINE_TRIES }, () => new TypeError("Failed to fetch")) });
  const t = target();
  h.engine.mount(t.key);
  h.engine.add(t, [file("a.jpg")]);
  await h.flush();
  for (const wait of [2000, 5000, 15000]) {
    assert.equal(h.engine.uploadsFor(t.key)[0].status, "waiting");
    await h.advance(wait);
  }
  const [u] = h.engine.uploadsFor(t.key);
  assert.equal(u.status, "failed");
  assert.equal(u.error, "no connection");
  assert.equal(h.sent.length, MAX_ONLINE_TRIES);

  h.engine.retry(u.key);
  await h.flush();
  assert.deepEqual(t.recorded, ["a.jpg"]);
});

test("a refusal is red at once, with the server's reason; a refused file can't be retried", async () => {
  const h = setup({ script: [new Error("Failed to retrieve the client token")] });
  const t = target();
  h.engine.add(t, [file("a.jpg"), file("b.exe", "application/x-msdownload")]);
  await h.flush();
  const [a, b] = h.engine.uploadsFor(t.key);
  assert.equal(a.status, "failed");
  assert.equal(a.error, "Failed to retrieve the client token");
  assert.equal(h.sent.length, 1, "no second try");
  h.engine.retry(b.key);
  await h.flush();
  assert.equal(h.engine.uploadsFor(t.key)[1].status, "invalid");
});

test("a stalled upload is cut off after 30 seconds and counted as a timeout", async () => {
  const h = setup();
  // A transfer that never answers until it is aborted.
  h.deps.transfer = async (input) => {
    h.sent.push(input);
    return new Promise((_, reject) => input.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  };
  const t = target();
  h.engine.mount(t.key);
  h.engine.add(t, [file("a.jpg")]);
  await h.flush();
  assert.equal(h.engine.uploadsFor(t.key)[0].status, "uploading");
  await h.advance(STALL_MS);
  assert.equal(h.engine.uploadsFor(t.key)[0].status, "waiting");
});

test("a failed record step retries without sending the bytes again", async () => {
  const h = setup();
  let calls = 0;
  const t = target({
    record: async () => {
      calls++;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return { ok: true, data: { id: "x" } };
    },
  });
  h.engine.mount(t.key);
  h.engine.add(t, [file("a.jpg")]);
  await h.flush();
  assert.equal(h.engine.uploadsFor(t.key)[0].status, "waiting");
  await h.advance(2000);
  assert.equal(calls, 2);
  assert.equal(h.sent.length, 1, "the bytes were sent once");
  assert.equal(h.engine.uploadsFor(t.key).length, 0);
});

test("a refused record step keeps the bytes once, then sends the file again", async () => {
  const h = setup();
  let calls = 0;
  const t = target({
    record: async () => {
      calls++;
      return calls <= 2 ? { ok: false, error: "That file isn't in this task's folder." } : { ok: true, data: { id: "x" } };
    },
  });
  h.engine.add(t, [file("a.jpg")]);
  await h.flush();
  const [u] = h.engine.uploadsFor(t.key);
  assert.equal(u.status, "failed");
  assert.equal(u.error, "That file isn't in this task's folder.");
  h.engine.retry(u.key);
  await h.flush();
  assert.equal(h.sent.length, 1, "the first retry records what is already up");
  h.engine.retry(h.engine.uploadsFor(t.key)[0].key);
  await h.flush();
  assert.equal(h.sent.length, 2, "after a second refusal it goes up again");
  assert.deepEqual(h.engine.uploadsFor(t.key), []);
});

test("removing a tile mid-flight aborts it and lets the batch settle", async () => {
  const h = setup();
  const aborted: boolean[] = [];
  h.deps.transfer = async (input) => {
    h.sent.push(input);
    if (input.name === "slow.jpg") return new Promise((_, reject) => input.signal.addEventListener("abort", () => (aborted.push(true), reject(new Error("aborted")))));
    return { pathname: `p/${input.name}` };
  };
  const landed: string[][] = [];
  const t = target({ onRecorded: (ids) => landed.push(ids) });
  h.engine.mount(t.key);
  h.engine.add(t, [file("fast.jpg"), file("slow.jpg")]);
  await h.flush();
  assert.equal(landed.length, 0, "the batch waits for the slow one");
  const slow = h.engine.uploadsFor(t.key).find((u) => u.name === "slow.jpg")!;
  h.engine.remove(slow.key);
  await h.flush();
  assert.deepEqual(aborted, [true]);
  assert.equal(landed.length, 1);
  assert.equal(landed[0].length, 1);
  assert.equal(h.engine.uploadsFor(t.key).length, 0);
});

test("a file that failed reports on its own when a retry lands", async () => {
  const h = setup({ script: ["ok", new Error("Failed to retrieve the client token")] });
  const landed: string[][] = [];
  const t = target({ onRecorded: (ids) => landed.push(ids) });
  h.engine.mount(t.key);
  h.engine.add(t, [file("a.jpg"), file("b.jpg")]);
  await h.flush();
  assert.equal(landed.length, 1, "the good one doesn't wait on the bad one");
  assert.equal(landed[0].length, 1);
  h.engine.retry(h.engine.uploadsFor(t.key)[0].key);
  await h.flush();
  assert.equal(landed.length, 2);
});

test("a batch that lands with its page gone: staff files wait as drafts with a toast, a contractor's are handed to onAway", async () => {
  const staff = setup();
  const t = target();
  const unmount = staff.engine.mount(t.key);
  staff.engine.add(t, [file("a.jpg"), file("b.jpg")]);
  unmount();
  await staff.flush();
  assert.equal(staff.notices.length, 1);
  assert.equal(staff.notices[0].message, "2 files ready to send");
  assert.equal(staff.notices[0].action?.label, "View");
  assert.deepEqual(t.recorded.sort(), ["a.jpg", "b.jpg"], "recorded all the same, as drafts");

  const portal = setup();
  const away: string[][] = [];
  const p = target({
    key: "portal-task:t1",
    uploadKind: "portal-task-upload",
    allowed: ["image", "video"],
    whenAway: "post",
    onAway: (ids) => away.push(ids),
  });
  const gone = portal.engine.mount(p.key);
  portal.engine.add(p, [file("a.jpg")]);
  gone();
  await portal.flush();
  assert.equal(away.length, 1);
  assert.equal(portal.notices.length, 0, "the target posts and says so itself");
});

test("the queue keeps a page's tiles for when it comes back", async () => {
  const h = setup({ script: [new TypeError("Failed to fetch")], online: false });
  const t = target();
  const unmount = h.engine.mount(t.key);
  h.engine.add(t, [file("a.jpg")]);
  await h.flush();
  unmount();
  assert.equal(h.engine.uploadsFor(t.key).length, 1, "still there with the page gone");
  h.engine.mount(t.key);
  assert.equal(h.engine.counts().waiting, 1);
});

test("every file is in the outbox before its bytes move, and gone once it is recorded", async () => {
  const h = setup();
  const t = target();
  h.engine.mount(t.key);
  const seenAtSend: number[] = [];
  const send = h.deps.transfer;
  h.deps.transfer = async (input) => {
    seenAtSend.push((await h.outbox!.all()).length);
    return send(input);
  };
  h.engine.add(t, [file("a.jpg"), file("b.jpg")]);
  await h.flush();
  assert.ok(seenAtSend.length >= 2);
  assert.ok(seenAtSend.every((n) => n >= 1), "a row existed when the first byte went");
  assert.deepEqual(await h.outbox!.all(), []);
});

test("a whole batch is in the outbox while the first file is still being prepared", async () => {
  const h = setup();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  h.deps.prepare = async (file, input) => {
    await gate;
    return { blob: file, name: input.name, contentType: input.contentType, thumb: null, poster: null, meta: {} };
  };
  const t = target();
  h.engine.add(t, [file("a.jpg"), file("b.jpg"), file("c.jpg")]);
  await h.flush();
  assert.equal((await h.outbox!.all()).length, 3, "all three, though only the first is being prepared");
  assert.equal(h.sent.length, 0, "and nothing has gone up");
  release();
  await h.flush();
  assert.deepEqual(t.recorded.sort(), ["a.jpg", "b.jpg", "c.jpg"]);
  assert.deepEqual(await h.outbox!.all(), []);
});

test("after a reload the outbox puts a file back and records it once its page sets the target", async () => {
  const outbox = memoryOutbox();
  const first = setup({ outbox, online: false, script: [new TypeError("Failed to fetch")] });
  const t1 = target({ key: "portal-task:t9", uploadKind: "portal-task-upload", parentId: "t9", allowed: ["image", "video"], whenAway: "post" });
  first.engine.add(t1, [file("a.jpg")]);
  await first.flush();
  assert.equal((await outbox.all()).length, 1);
  assert.equal(first.engine.uploadsFor(t1.key)[0].status, "waiting");

  // A new page load: another engine on the same outbox, with a signal.
  const second = setup({ outbox });
  await second.engine.restore();
  await second.flush();
  const [back] = second.engine.uploadsFor(t1.key);
  assert.ok(back, "the tile is back");
  assert.equal(second.sent.length >= 1, true, "the bytes went without the page");
  assert.equal(back.status, "saving", "up, and waiting for a record step");
  assert.equal(second.engine.counts().pending, 1);

  const t2 = target({ key: t1.key, uploadKind: "portal-task-upload", parentId: "t9", allowed: ["image", "video"], whenAway: "post" });
  second.engine.mount(t2.key);
  second.engine.setTarget(t2);
  await second.flush();
  assert.deepEqual(t2.recorded, ["a.jpg"]);
  assert.deepEqual(await outbox.all(), []);
  assert.equal(second.sent.length, 1, "sent once in all");
});

test("files put back by a reload say they are waiting for their page when another page is open", async () => {
  const outbox = memoryOutbox();
  const first = setup({ outbox, online: false, script: [new TypeError("Failed to fetch"), new TypeError("Failed to fetch")] });
  const t1 = target({ key: "task:t7", parentId: "t7", whenAway: "hold" });
  first.engine.add(t1, [file("a.jpg"), file("b.jpg")]);
  await first.flush();

  const second = setup({ outbox });
  await second.engine.restore();
  await second.flush();
  assert.equal(second.notices.length, 0, "not at once: the page may be about to set its target");
  await second.advance(1500);
  assert.equal(second.notices.length, 1);
  assert.equal(second.notices[0].message, "2 files are waiting to finish");
  assert.equal(second.notices[0].action?.label, "View");
  // Said once, however many files land.
  await second.advance(5000);
  assert.equal(second.notices.length, 1);

  // The page comes: they record, and the outbox empties.
  const t2 = target({ key: "task:t7", parentId: "t7" });
  second.engine.setTarget(t2);
  await second.flush();
  assert.deepEqual(t2.recorded.sort(), ["a.jpg", "b.jpg"]);
  assert.deepEqual(await outbox.all(), []);
});

test("an old outbox row is dropped when the outbox loads", async () => {
  const outbox = memoryOutbox();
  const first = setup({ outbox, online: false, script: [new TypeError("Failed to fetch")] });
  first.engine.add(target(), [file("a.jpg")]);
  await first.flush();
  const later = setup({ outbox });
  // Eight days on.
  later.deps.now = () => new Date(Date.UTC(2026, 10, 2, 18, 14));
  await later.engine.restore();
  assert.equal(later.engine.counts().pending, 0);
  assert.deepEqual(await outbox.all(), []);
});

test("without an outbox the queue still works and says a reload would lose files", async () => {
  const h = setup({ outbox: null, online: false, script: [new TypeError("Failed to fetch")] });
  const t = target();
  h.engine.add(t, [file("a.jpg")]);
  await h.flush();
  assert.equal(h.engine.persistent, false);
  assert.equal(h.engine.needsLeaveWarning(), true);
  const kept = setup();
  assert.equal(kept.engine.persistent, true);
  assert.equal(kept.engine.needsLeaveWarning(), false);
});

test("uploadsFor and counts return the same value until something changes", async () => {
  const h = setup({ online: false, script: [new TypeError("Failed to fetch")] });
  const t = target();
  h.engine.mount(t.key);
  assert.equal(h.engine.uploadsFor(t.key), h.engine.uploadsFor(t.key));
  assert.equal(h.engine.counts(), h.engine.counts());
  h.engine.add(t, [file("a.jpg")]);
  const mid = h.engine.uploadsFor(t.key);
  assert.equal(mid, h.engine.uploadsFor(t.key));
  await h.flush();
  assert.notEqual(h.engine.uploadsFor(t.key), mid);
});
