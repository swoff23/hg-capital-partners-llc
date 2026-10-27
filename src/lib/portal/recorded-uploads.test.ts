import test from "node:test";
import assert from "node:assert/strict";
import type { UploadTarget } from "@/components/upload-queue";
import { UploadEngine } from "@/lib/attachments/engine";
import { MAX_FILES_PER_POST } from "./job-view";
import { postInBatches, RecordedUploads, recordedUploads, toldOf, trayRoom, type RecordedUpload } from "./recorded-uploads";

// The job page's record step answers with an id alone, so each page notes what
// it recorded. A batch can start under one visit to the job and land under the
// next (chunk 6 review, fix 6): the second visit must still know the first
// visit's files, or they're dropped and never posted.

const photo = (id: string): RecordedUpload => ({ id, name: `${id}.jpg`, kind: "image", hasThumb: true, hasPoster: false });

test("a batch that started on an earlier visit to the job lands with every file it holds", () => {
  const tab = new RecordedUploads();
  // Visit 1 records photos 1 to 3, then the contractor leaves for My jobs.
  for (const id of ["a1", "a2", "a3"]) tab.note("t1", photo(id));
  // Visit 2 (a new page) records 4 and 5; the queue reports the whole batch to it.
  for (const id of ["a4", "a5"]) tab.note("t1", photo(id));
  const landed = tab.take("t1", ["a1", "a2", "a3", "a4", "a5"]);
  assert.deepEqual(
    landed.map((r) => [r.id, r.kind]),
    [
      ["a1", "image"],
      ["a2", "image"],
      ["a3", "image"],
      ["a4", "image"],
      ["a5", "image"],
    ],
  );
});

test("a file no page here noted (a reload in between) still comes back, by id alone", () => {
  const tab = new RecordedUploads();
  tab.note("t1", photo("a1"));
  assert.deepEqual(tab.take("t1", ["a1", "a9"]), [photo("a1"), { id: "a9", name: "", kind: null, hasThumb: false, hasPoster: false }]);
});

test("each file is handed over once, and jobs never mix", () => {
  const tab = new RecordedUploads();
  tab.note("t1", photo("a1"));
  tab.note("t2", photo("b1"));
  assert.equal(tab.take("t2", ["a1"])[0].kind, null, "t1's file is not t2's");
  assert.equal(tab.take("t1", ["a1"])[0].kind, "image");
  assert.equal(tab.take("t1", ["a1"])[0].kind, null, "already handed over");
  assert.equal(tab.take("t2", ["b1"])[0].name, "b1.jpg");
});

test("a batch whose post didn't go through rides with the next batch for the job, kinds and all, once", () => {
  const tab = new RecordedUploads();
  for (const id of ["a1", "a2"]) tab.note("t1", photo(id));
  const first = tab.take("t1", ["a1", "a2"]);
  // The post failed (no signal): the page keeps the batch.
  tab.keep("t1", first);
  tab.note("t1", photo("a3"));
  assert.deepEqual(
    tab.take("t1", ["a3"]).map((r) => [r.id, r.kind]),
    [
      ["a1", "image"],
      ["a2", "image"],
      ["a3", "image"],
    ],
    "the kept files first, then the new batch",
  );
  assert.deepEqual(tab.take("t1", ["a4"]).map((r) => r.id), ["a4"], "handed over once");
});

test("kept files stay with their job, and one the next batch names already isn't doubled", () => {
  const tab = new RecordedUploads();
  tab.keep("t1", [photo("a1")]);
  tab.keep("t2", [photo("b1")]);
  assert.deepEqual(tab.take("t2", ["b2"]).map((r) => r.id), ["b1", "b2"]);
  assert.deepEqual(tab.take("t1", ["a1"]), [photo("a1")], "named again: once, and still known");
  tab.keep("t1", []);
  assert.deepEqual(tab.take("t1", ["a5"]).map((r) => r.id), ["a5"]);
});

const many = (prefix: string, n: number): RecordedUpload[] => Array.from({ length: n }, (_, i) => photo(`${prefix}${i}`));

test("30 kept files and 25 new ones: the tab hands them all over, and a post of them goes in pieces of 50 that never stall", async () => {
  const tab = new RecordedUploads();
  const first = many("a", 30);
  for (const f of first) tab.note("t1", f);
  // The first batch's post failed (no signal) and was kept.
  tab.keep("t1", tab.take("t1", first.map((f) => f.id)));
  const second = many("b", 25);
  for (const f of second) tab.note("t1", f);
  const handed = tab.take("t1", second.map((f) => f.id));
  assert.equal(handed.length, 55, "the kept files ride with the new batch");
  assert.deepEqual(handed.map((r) => r.id), [...first, ...second].map((r) => r.id), "kept first, in order");
  // Posted whole it would pass the 50 one post takes (every later batch refused until a reload). In pieces:
  const sent: number[] = [];
  const left = await postInBatches(handed, async (piece) => (sent.push(piece.length), true));
  assert.deepEqual(sent, [50, 5]);
  assert.deepEqual(left, [], "everything went");
  // Nothing is left behind to be carried again.
  assert.deepEqual(tab.take("t1", []), []);
});

test("a piece that fails stops the rest, and only the files not posted come back to keep", async () => {
  const items = many("a", 120);
  const sent: string[][] = [];
  const left = await postInBatches(items, async (piece) => {
    sent.push(piece.map((r) => r.id));
    return sent.length < 2; // the second piece fails
  });
  assert.equal(sent.length, 2, "the third piece isn't tried");
  assert.deepEqual(left.map((r) => r.id), items.slice(50).map((r) => r.id), "the first 50 posted; the failed piece and the rest wait");
  assert.deepEqual(await postInBatches([], async () => false), [], "nothing to post is nothing left");
  assert.deepEqual(await postInBatches(many("c", MAX_FILES_PER_POST), async () => true), []);
  assert.deepEqual((await postInBatches(many("d", MAX_FILES_PER_POST), async () => false)).length, MAX_FILES_PER_POST);
});

test("a tray with room for some takes those, and the rest stay kept in order for the next batch", () => {
  const tab = new RecordedUploads();
  tab.keep("t1", many("k", 30));
  for (const f of many("n", 25)) tab.note("t1", f);
  const ids = many("n", 25).map((f) => f.id);
  // A composer already holding 10 has room for 40 more: the 30 kept, then 10 of the new.
  const held = tab.take("t1", ids, MAX_FILES_PER_POST - 10);
  assert.equal(held.length, 40);
  assert.deepEqual(held.map((r) => r.id), [...many("k", 30), ...many("n", 10)].map((r) => r.id));
  // The other 15 wait, and come first in the next batch, with kinds and names intact.
  const next = tab.take("t1", ["x1"], MAX_FILES_PER_POST);
  assert.deepEqual(next.map((r) => r.id), [...many("n", 25).slice(10).map((r) => r.id), "x1"]);
  assert.equal(next[0].kind, "image");
  assert.equal(next[0].name, "n10.jpg");
});

test("a tray with no room takes none, and nothing is lost", () => {
  const tab = new RecordedUploads();
  tab.note("t1", photo("a1"));
  assert.deepEqual(tab.take("t1", ["a1"], 0), []);
  assert.deepEqual(tab.take("t1", [], -3), []);
  assert.deepEqual(tab.take("t1", []), [photo("a1")], "still kept, with its kind");
});

test("a toast counts the files the post told HG of; one posted already isn't counted again", () => {
  const piece = [photo("a1"), photo("a2"), photo("a3"), photo("a4"), photo("a5")];
  // a4 and a5 were posted by an earlier send whose answer was lost: the post linked three.
  assert.deepEqual(toldOf(piece, ["a1", "a2", "a3"]).map((r) => r.id), ["a1", "a2", "a3"]);
  assert.deepEqual(toldOf(piece, piece.map((r) => r.id)).length, 5);
  // Everything was posted already (the answer was lost): they are on the job as the toast says.
  assert.deepEqual(toldOf(piece, []).length, 5);
});

test("every job page shares one registry for the tab", () => {
  assert.ok(recordedUploads instanceof RecordedUploads);
});

test("a tray holding photos for a Send or Mark done takes no more than one post, counting what it holds", () => {
  assert.equal(trayRoom(true, 0), MAX_FILES_PER_POST);
  assert.equal(trayRoom(true, 45), 5);
  assert.equal(trayRoom(true, MAX_FILES_PER_POST), 0);
  assert.equal(trayRoom(true, 60), 0, "never below none");
  // Nothing holds them: a batch that posts on its own goes in pieces, so there is no cap.
  assert.equal(trayRoom(false, 10), undefined);
});

test("the 51st photo picked with the Mark done sheet open gets the queue's cap tile, and the first 50 go up", () => {
  let n = 0;
  const engine = new UploadEngine({
    // The bytes never land here: the cap is decided as the files are added.
    transfer: () => new Promise(() => {}),
    outbox: null,
    notify: () => {},
    navigate: () => {},
    online: () => true,
    now: () => new Date(Date.UTC(2026, 9, 27, 14, 0)),
    setTimer: () => 0,
    clearTimer: () => {},
    preview: { create: () => null, revoke: () => {} },
    uid: () => String(++n),
  });
  const target: UploadTarget = {
    key: "portal-task:t1",
    label: "56 Tamarack St",
    uploadKind: "portal-task-upload",
    parentId: "t1",
    access: "private",
    allowed: ["image", "video"],
    // The sheet is open with nothing held yet.
    maxFiles: trayRoom(true, 0),
    prepare: "display",
    record: async () => ({ ok: true, data: { id: "a" } }),
    whenAway: "post",
  };
  const files = Array.from({ length: 60 }, (_, i) => new File([new Uint8Array(10)], `IMG_${i + 1}.jpg`, { type: "image/jpeg" }));
  engine.add(target, files);
  const tiles = engine.uploadsFor(target.key);
  assert.equal(tiles.filter((u) => u.status !== "invalid").length, MAX_FILES_PER_POST, "50 going up");
  const capped = tiles.filter((u) => u.status === "invalid");
  assert.equal(capped.length, 10);
  assert.deepEqual([...new Set(capped.map((u) => u.error))], ["no more can be added here"], "each says why, with Remove");
  engine.dispose();
});
