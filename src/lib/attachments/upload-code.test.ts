import test from "node:test";
import assert from "node:assert/strict";
import type { UploadTarget } from "@/components/upload-queue";
import { UPLOADS_PAUSED_LINE, UploadEngine, type EngineDeps, type EngineNotice } from "./engine";
import { MAX_ONLINE_TRIES, UploadCodeMissingError, memoryOutbox } from "./outbox";

/**
 * N2: when the upload code itself didn't load (lazy-transfer.ts), every file
 * failed as "no connection" until a reload, spending its tries on a fetch
 * that couldn't succeed. Now the files wait without counting a try and the
 * engine says so once, with Reload. On fakes, as engine.test.ts runs it.
 */

function setup() {
  let clock = Date.UTC(2026, 10, 3, 18, 0, 0);
  let nextTimer = 1;
  const timers = new Map<number, { due: number; fn: () => void }>();
  const notices: EngineNotice[] = [];
  const code = { missing: true };
  let reloads = 0;
  let sends = 0;
  let seq = 0;
  const deps: EngineDeps = {
    transfer: async (input) => {
      sends++;
      if (code.missing) throw new UploadCodeMissingError();
      input.onProgress(1);
      return { pathname: `${input.role}/${input.name}` };
    },
    prepare: async (file, input) => ({ blob: file, name: input.name, contentType: input.contentType, thumb: null, poster: null, meta: {} }),
    outbox: memoryOutbox(),
    notify: (n) => notices.push(n),
    navigate: () => {},
    reload: () => void reloads++,
    online: () => true,
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
  return { engine, notices, flush, advance, code, reloads: () => reloads, sends: () => sends };
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
  paused[0].action!.run();
  assert.equal(h.reloads(), 1);

  // The code is there (as after a reload), and both land.
  h.code.missing = false;
  await h.advance(60_000);
  assert.deepEqual(t.recorded.sort(), ["a.jpg", "b.jpg"]);
});
