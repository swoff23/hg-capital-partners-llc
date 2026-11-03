import test from "node:test";
import assert from "node:assert/strict";
import type { UploadTarget } from "@/components/upload-queue";
import { UPLOADS_PAUSED_LINE, UPLOADS_RETRYING_LINE, UploadEngine, type EngineDeps, type EngineNotice } from "./engine";
import { MAX_ONLINE_TRIES, UploadCodeMissingError, memoryOutbox, type OutboxStore } from "./outbox";

/**
 * N2: when the upload code itself didn't load (lazy-transfer.ts), every file
 * failed as "no connection", spending its tries (four in a row turn it red)
 * on a page whose code was missing, which a deploy that removed the chunk
 * never fixes. Now the files wait without counting a try, read "paused" and
 * not "no signal", and the engine says so once, with Reload when that loses
 * nothing. On fakes, as engine.test.ts runs it.
 */

function setup(opts: { outbox?: OutboxStore } = {}) {
  let clock = Date.UTC(2026, 10, 3, 18, 0, 0);
  let nextTimer = 1;
  const timers = new Map<number, { due: number; fn: () => void }>();
  const notices: EngineNotice[] = [];
  const code = { missing: true };
  // What lazyTransfer throws for missing code: the page's own code online, the connection's TypeError offline.
  const net = { online: true };
  let reloads = 0;
  let sends = 0;
  let seq = 0;
  const deps: EngineDeps = {
    transfer: async (input) => {
      sends++;
      if (code.missing) throw net.online ? new UploadCodeMissingError() : new TypeError("Failed to fetch");
      input.onProgress(1);
      return { pathname: `${input.role}/${input.name}` };
    },
    prepare: async (file, input) => ({ blob: file, name: input.name, contentType: input.contentType, thumb: null, poster: null, meta: {} }),
    outbox: opts.outbox ?? memoryOutbox(),
    notify: (n) => notices.push(n),
    navigate: () => {},
    reload: () => void reloads++,
    online: () => net.online,
    now: () => new Date(clock),
    setTimer: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { due: clock + ms, fn });
      return id;
    },
    clearTimer: (h) => void timers.delete(h as number),
    preview: { create: () => "blob:preview", revoke: () => {} },
    uid: () => String(++seq),
  };
  const engine = new UploadEngine(deps);
  const flush = async () => {
    for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r));
  };
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
  return { engine, notices, flush, advance, code, net, reloads: () => reloads, sends: () => sends };
}

function target(): UploadTarget & { recorded: string[] } {
  const recorded: string[] = [];
  return {
    key: "task:t1",
    label: "56 Tamarack St",
    uploadKind: "task-upload",
    parentId: "t1",
    access: "private",
    allowed: ["image", "video", "file"],
    prepare: "original",
    record: async (f) => (recorded.push(f.filename), { ok: true, data: { id: `a${recorded.length}` } }),
    whenAway: "hold",
    recorded,
  };
}

const photo = (name: string) => new File([new Uint8Array(100)], name, { type: "image/jpeg", lastModified: Date.UTC(2026, 10, 3) });

test("missing upload code: files wait past the try limit, one notice says so with Reload, and they go up after", async () => {
  const h = setup();
  const t = target();
  h.engine.mount(t.key);
  h.engine.add(t, [photo("a.jpg"), photo("b.jpg")]);
  await h.flush();
  for (let i = 0; i < 6; i++) await h.advance(60_000);
  assert.ok(h.sends() > MAX_ONLINE_TRIES * 2, `each file tried past the limit (${h.sends()} sends)`);
  assert.deepEqual(t.recorded, []);

  const tiles = h.engine.uploadsFor(t.key);
  assert.ok(tiles.length === 2 && tiles.every((u) => u.status === "waiting" || u.status === "queued" || u.status === "uploading"), JSON.stringify(tiles.map((u) => u.status)));
  assert.ok(!tiles.some((u) => u.status === "failed"), "never red: no try was the file's or the road's");

  const paused = h.notices.filter((n) => n.message === UPLOADS_PAUSED_LINE);
  assert.equal(paused.length, 1, "once, however many files and tries");
  assert.equal(UPLOADS_PAUSED_LINE, "Uploads paused");
  assert.equal(paused[0].action?.label, "Reload");
  assert.equal(h.engine.canReload(), true, "every file's row is in the outbox, so a reload loses none");
  paused[0].action!.run();
  assert.equal(h.reloads(), 1);

  // The code is there (as after a reload), and both land.
  h.code.missing = false;
  await h.advance(60_000);
  assert.deepEqual(t.recorded.sort(), ["a.jpg", "b.jpg"]);
});

test("missing upload code reads as paused on the tiles and in the counts, not as no signal", async () => {
  const h = setup();
  const t = target();
  h.engine.mount(t.key);
  h.engine.add(t, [photo("a.jpg"), photo("b.jpg")]);
  await h.flush();
  const tiles = h.engine.uploadsFor(t.key);
  assert.deepEqual(
    tiles.map((u) => [u.status, u.paused]),
    [
      ["waiting", true],
      ["waiting", true],
    ],
    "waiting, but for the code",
  );
  assert.deepEqual(h.engine.counts(t.key), { pending: 0, waiting: 2, paused: 2, failed: 0, awaitingPage: 0, pendingKinds: ["image", "image"] });

  // The code arrives and both go up: nothing is left to read paused.
  h.code.missing = false;
  await h.advance(60_000);
  assert.deepEqual(h.engine.uploadsFor(t.key), []);
  assert.equal(h.engine.counts(t.key).paused, 0);
});

test("a wait for the signal is not paused, and a paused file that loses the signal reads as no signal again", async () => {
  const h = setup();
  const t = target();
  h.engine.mount(t.key);
  h.net.online = false;
  h.engine.add(t, [photo("a.jpg")]);
  await h.flush();
  assert.equal(h.engine.uploadsFor(t.key)[0].status, "waiting");
  assert.equal(h.engine.uploadsFor(t.key)[0].paused, undefined, "the connection's wait, whatever the code");
  assert.equal(h.engine.counts(t.key).paused, 0);
  assert.equal(h.notices.length, 0, "and no notice about the code");

  // Online with the code still missing: paused.
  h.net.online = true;
  h.engine.nudge();
  await h.flush();
  assert.equal(h.engine.uploadsFor(t.key)[0].paused, true);

  // The signal drops again: the next try is the connection's, and the file reads that.
  h.net.online = false;
  await h.advance(60_000);
  const [tile] = h.engine.uploadsFor(t.key);
  assert.equal(tile.status, "waiting");
  assert.equal(tile.paused, undefined);
  assert.equal(h.engine.counts(t.key).paused, 0);
});

test("a file whose row never reached the outbox: the notice says the files keep trying and offers no Reload", async () => {
  // A reload would lose it (needsLeaveWarning), and a retry fetches the code again anyway.
  const full: OutboxStore = {
    ...memoryOutbox(),
    put: async () => {
      throw new Error("QuotaExceededError");
    },
  };
  const h = setup({ outbox: full });
  const t = target();
  h.engine.mount(t.key);
  h.engine.add(t, [photo("a.jpg")]);
  await h.flush();
  for (let i = 0; i < 3; i++) await h.advance(60_000);
  assert.equal(h.engine.needsLeaveWarning(), true);
  assert.equal(h.engine.canReload(), false);
  const said = h.notices.filter((n) => n.key === "upload-code");
  assert.equal(said.length, 1, "once");
  assert.equal(said[0].message, UPLOADS_RETRYING_LINE);
  assert.equal(said[0].action, undefined, "no Reload where it costs a file");
  assert.ok(!h.notices.some((n) => n.message === UPLOADS_PAUSED_LINE));
  assert.equal(h.reloads(), 0);

  // The file still goes up when the code comes.
  h.code.missing = false;
  await h.advance(60_000);
  assert.deepEqual(t.recorded, ["a.jpg"]);
});

test("the notices fit a phone and carry no dash", () => {
  for (const line of [UPLOADS_PAUSED_LINE, UPLOADS_RETRYING_LINE]) assert.ok(line.length <= 40 && !line.includes("—"), line);
});
