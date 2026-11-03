import test from "node:test";
import assert from "node:assert/strict";
import { GENERIC_ERROR, OFFLINE_ERROR } from "@/lib/action-result";
import { MAX_FILES_PER_POST } from "./job-view";
import {
  drainEveryKept,
  drainKept,
  failedPostToast,
  postInBatches,
  postKeepable,
  postOrKeep,
  RecordedUploads,
  recordedUploadsOf,
  toldOf,
  type PieceResult,
  type RecordedUpload,
} from "./recorded-uploads";

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
  // Everything was posted already (the answer was lost): the quiet answer told HG of nothing, so its toast says nothing.
  assert.deepEqual(toldOf(piece, []), []);
});

test("every job page shares one registry for each queue's owner, and one owner's kept files never reach another's", () => {
  const zack = recordedUploadsOf("portal:c-zack-reg");
  assert.ok(zack instanceof RecordedUploads);
  assert.equal(recordedUploadsOf("portal:c-zack-reg"), zack, "the same registry every time, for every page of the tab");
  zack.keep("t-reg", [photo("z1")]);
  zack.note("t-reg", photo("z2"));
  const mike = recordedUploadsOf("portal:c-mike-reg");
  assert.deepEqual(mike.take("t-reg", []), [], "Mike's page on the same tab and job gets none of Zack's kept files");
  assert.deepEqual(mike.take("t-reg", ["z2"])[0].kind, null, "nor what Zack's queue noted");
  assert.deepEqual(zack.take("t-reg", []).map((r) => r.id), ["z1"], "Zack's stay his");
});

/* ---------------- drainKept: the kept files post as a page opens and goes, one drain at a time ---------------- */

test("drainKept hands the job's kept files to one post and keeps the ones it answers didn't go", async () => {
  const scope = "portal:c-drain-1";
  recordedUploadsOf(scope).keep("t1", [photo("a1"), photo("a2"), photo("a3")]);
  const posted: string[][] = [];
  await drainKept(scope, "t1", async (kept) => {
    posted.push(kept.map((r) => r.id));
    return kept.slice(2);
  });
  assert.deepEqual(posted, [["a1", "a2", "a3"]]);
  assert.deepEqual(recordedUploadsOf(scope).take("t1", []).map((r) => r.id), ["a3"], "the one that didn't post waits for the next drain");
  let called = false;
  await drainKept(scope, "t1", async () => ((called = true), []));
  assert.equal(called, false, "nothing kept, nothing posted");
});

test("drainKept: a second call while one is posting does nothing, so a closed job's page opening as the composer goes posts each file once", async () => {
  const scope = "portal:c-drain-2";
  recordedUploadsOf(scope).keep("t1", [photo("a1"), photo("a2")]);
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  const calls: string[][] = [];
  // The composer's unmount starts the drain, and the finished job's page mounts while it is still posting.
  const first = drainKept(scope, "t1", async (kept) => {
    calls.push(kept.map((r) => r.id));
    await held;
    return [];
  });
  const second = drainKept(scope, "t1", async (kept) => (calls.push(kept.map((r) => r.id)), []));
  await second;
  assert.deepEqual(calls, [["a1", "a2"]], "the second didn't post");
  release();
  await first;
  // Another job, or another owner's same job, drains on its own meanwhile.
  recordedUploadsOf(scope).keep("t2", [photo("b1")]);
  recordedUploadsOf("portal:c-drain-other").keep("t1", [photo("c1")]);
  await Promise.all([
    drainKept(scope, "t2", async (kept) => (calls.push(kept.map((r) => r.id)), [])),
    drainKept("portal:c-drain-other", "t1", async (kept) => (calls.push(kept.map((r) => r.id)), [])),
  ]);
  assert.deepEqual(calls, [["a1", "a2"], ["b1"], ["c1"]]);
});

test("drainKept lets go once it ends, even when the post throws, and keeps what it took for the next page's drain", async () => {
  const scope = "portal:c-drain-3";
  recordedUploadsOf(scope).keep("t1", [photo("a1")]);
  await assert.rejects(
    drainKept(scope, "t1", async () => {
      throw new Error("boom");
    }),
  );
  recordedUploadsOf(scope).keep("t1", [photo("a2")]);
  const seen: string[] = [];
  await drainKept(scope, "t1", async (kept) => (seen.push(...kept.map((r) => r.id)), []));
  assert.deepEqual(seen, ["a1", "a2"], "the next drain ran, and the file the throw left behind (a redirect on a session that ended) is still kept");
});

test("postOrKeep: a batch with no tray keeps what didn't post, and all of it when the post throws (a redirect)", async () => {
  const scope = "portal:c-or-keep";
  await postOrKeep(scope, "t1", [photo("a1"), photo("a2")], async () => [photo("a2")]);
  assert.deepEqual(recordedUploadsOf(scope).keptJobs(), ["t1"]);
  await assert.rejects(
    postOrKeep(scope, "t2", [photo("b1")], async () => {
      throw new Error("NEXT_REDIRECT");
    }),
  );
  const seen: string[][] = [];
  await drainEveryKept(scope, async (taskId, kept) => (seen.push([taskId, ...kept.map((r) => r.id)]), []));
  assert.deepEqual(seen, [["t1", "a2"], ["t2", "b1"]], "the one that didn't post and the one the throw left are both kept");
  assert.deepEqual(recordedUploadsOf(scope).keptJobs(), [], "both posted, nothing left");
  // Nothing to post asks nothing.
  let asked = false;
  await postOrKeep(scope, "t3", [], async () => ((asked = true), []));
  assert.equal(asked, false);
});

test("a file a refusal turned down for good is not kept, so a return to the tab doesn't post and toast it again; one that failed offline is", async () => {
  const scope = "portal:c-final";
  const tab = recordedUploadsOf(scope);
  const posts: string[][] = [];
  // The contractor was taken off the job: every post of its file answers "You don't have access to this job."
  const refused = (piece: RecordedUpload[]) => (posts.push(piece.map((r) => r.id)), Promise.resolve("refused" as const));
  const offline = (piece: RecordedUpload[]) => (posts.push(piece.map((r) => r.id)), Promise.resolve("failed" as const));
  tab.keep("t-gone", [photo("g1")]);
  await drainKept(scope, "t-gone", (kept) => postKeepable(kept, refused));
  assert.deepEqual(tab.keptJobs(), [], "refused for good: not kept");
  // Three returns to the tab post nothing more.
  for (let i = 0; i < 3; i++) await drainEveryKept(scope, (taskId, kept) => postKeepable(kept, refused));
  assert.deepEqual(posts, [["g1"]], "one post, one refusal, then nothing is left to post");
  // No signal is a different failure: another try may work, so the file stays kept for the next wake.
  tab.keep("t-flaky", [photo("f1")]);
  await drainKept(scope, "t-flaky", (kept) => postKeepable(kept, offline));
  assert.deepEqual(tab.keptJobs(), ["t-flaky"]);
  assert.deepEqual(tab.take("t-flaky", []).map((r) => r.id), ["f1"]);
  // A batch with no tray (postOrKeep) follows the same rule, and a throw (a redirect) still keeps everything.
  await postOrKeep(scope, "t-away", [photo("a1")], (batch) => postKeepable(batch, refused));
  assert.deepEqual(tab.keptJobs(), [], "the refused batch is not kept");
  await postOrKeep(scope, "t-away", [photo("a2")], (batch) => postKeepable(batch, offline));
  assert.deepEqual(tab.keptJobs(), ["t-away"]);
  await assert.rejects(
    postOrKeep(scope, "t-redirect", [photo("r1")], () => {
      throw new Error("NEXT_REDIRECT");
    }),
  );
  assert.deepEqual(tab.keptJobs().sort(), ["t-away", "t-redirect"]);
});

test("postKeepable: a piece refused for good turns down the rest with it; a piece that failed offline leaves it kept; every piece that went is gone", async () => {
  const many = Array.from({ length: MAX_FILES_PER_POST + 10 }, (_, i) => photo(`p${i}`));
  const results: PieceResult[] = ["posted", "refused"];
  assert.deepEqual(await postKeepable(many, async () => results.shift() ?? "posted"), [], "the second piece's 10 files are turned down, none kept");
  const flaky: PieceResult[] = ["posted", "failed"];
  assert.deepEqual(
    (await postKeepable(many, async () => flaky.shift() ?? "posted")).map((r) => r.id),
    many.slice(MAX_FILES_PER_POST).map((r) => r.id),
    "the 10 that didn't post stay for another try",
  );
  assert.deepEqual(await postKeepable(many, async () => "posted"), []);
});

test("drainEveryKept: the signal back drains every job the tab kept files for, once each, and keeps what still didn't go", async () => {
  const scope = "portal:c-every";
  const tab = recordedUploadsOf(scope);
  tab.keep("t1", [photo("a1")]);
  tab.keep("t2", [photo("b1"), photo("b2")]);
  recordedUploadsOf("portal:c-every-other").keep("t1", [photo("z1")]);
  const posted: string[][] = [];
  // Still no signal for t2's second photo.
  await drainEveryKept(scope, async (taskId, kept) => {
    posted.push([taskId, ...kept.map((r) => r.id)]);
    return taskId === "t2" ? kept.filter((r) => r.id === "b2") : [];
  });
  assert.deepEqual(posted, [["t1", "a1"], ["t2", "b1", "b2"]], "each job once, and only this owner's");
  assert.deepEqual(tab.keptJobs(), ["t2"]);
  assert.deepEqual(tab.take("t2", []).map((r) => r.id), ["b2"]);
  assert.deepEqual(recordedUploadsOf("portal:c-every-other").keptJobs(), ["t1"], "another owner's kept files wait for them");
});

test("failedPostToast: a post that failed offline or on a hiccup gets Retry; one trying again can't change says only why", () => {
  let retried = 0;
  const retry = () => void retried++;
  const offline = failedPostToast(OFFLINE_ERROR, retry);
  assert.equal(offline.message, OFFLINE_ERROR);
  assert.equal(offline.action?.label, "Retry");
  offline.action?.onAction();
  assert.equal(retried, 1);
  assert.equal(failedPostToast(GENERIC_ERROR, retry).action?.label, "Retry");
  assert.deepEqual(failedPostToast("You don't have access to this job.", retry), { message: "You don't have access to this job." });
  // A tray with a Send to try again from gets no Retry of its own.
  assert.deepEqual(failedPostToast(OFFLINE_ERROR), { message: OFFLINE_ERROR });
});
