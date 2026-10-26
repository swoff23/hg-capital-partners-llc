import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_MAX_AGE_DAYS,
  DRAFT_PREFIX,
  decodeDraft,
  draftLabel,
  draftStorageKey,
  draftWrittenAt,
  encodeDraft,
  isDraftExpired,
  isStoredDraftExpired,
  stableJson,
  trackDraft,
  type DraftTrack,
} from "./drafts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 26, 15, 0);

test("a draft's storage key is the editor's key under the hg-draft prefix", () => {
  assert.equal(DRAFT_PREFIX, "hg-draft:");
  assert.equal(draftStorageKey("new-task:prop_1"), "hg-draft:new-task:prop_1");
});

test("a draft round-trips with when it was written", () => {
  const raw = encodeDraft({ title: "Fix porch light", units: ["Unit 2"] }, NOW - 60_000);
  const back = decodeDraft<{ title: string; units: string[] }>(raw, NOW);
  assert.deepEqual(back?.value, { title: "Fix porch light", units: ["Unit 2"] });
  assert.equal(back?.savedAt.getTime(), NOW - 60_000);
});

test("drafts expire after 7 days by default, or the hook's own limit", () => {
  assert.equal(DRAFT_MAX_AGE_DAYS, 7);
  const sixDays = encodeDraft("x", NOW - 6 * DAY);
  const eightDays = encodeDraft("x", NOW - 8 * DAY);
  assert.equal(decodeDraft(sixDays, NOW)?.value, "x");
  assert.equal(decodeDraft(eightDays, NOW), null);
  // Exactly seven days old is still kept; a moment more is not.
  assert.equal(isDraftExpired(NOW - 7 * DAY, NOW), false);
  assert.equal(isDraftExpired(NOW - 7 * DAY - 1, NOW), true);
  // A one-day limit, for something short-lived.
  assert.equal(decodeDraft(sixDays, NOW, 1), null);
  assert.equal(decodeDraft(encodeDraft("x", NOW - DAY / 2), NOW, 1)?.value, "x");
});

test("anything that isn't a draft of this format reads as none", () => {
  assert.equal(decodeDraft(null, NOW), null);
  assert.equal(decodeDraft("", NOW), null);
  assert.equal(decodeDraft("not json", NOW), null);
  // The task composer's plain text drafts live under their own prefix and look nothing like this.
  assert.equal(decodeDraft(JSON.stringify("Running late"), NOW), null);
  assert.equal(decodeDraft(JSON.stringify({ v: 2, at: NOW, value: "x" }), NOW), null);
  assert.equal(decodeDraft(JSON.stringify({ v: 1, at: "yesterday", value: "x" }), NOW), null);
  assert.equal(decodeDraft(JSON.stringify({ v: 1, at: NOW }), NOW), null);
});

test("stableJson ignores key order but not array order", () => {
  assert.equal(stableJson({ b: 1, a: { d: 2, c: [3, 1] } }), stableJson({ a: { c: [3, 1], d: 2 }, b: 1 }));
  assert.notEqual(stableJson({ a: [1, 3] }), stableJson({ a: [3, 1] }));
  assert.equal(stableJson(undefined), "undefined");
  assert.equal(stableJson(null), "null");
});

const json = (v: unknown) => stableJson(v);

test("opening an editor writes nothing, even when its first value isn't blank", () => {
  const opened = trackDraft(null, "unit:1", json({ name: "Unit 2" }));
  assert.equal(opened.action, "none");
  assert.deepEqual(opened.track, { key: "unit:1", baseline: json({ name: "Unit 2" }), last: json({ name: "Unit 2" }), touched: false });
});

test("a change is written; the same value again is not", () => {
  let t: DraftTrack | null = trackDraft(null, "k", json({ title: "" })).track;
  const typed = trackDraft(t, "k", json({ title: "Fix" }));
  assert.equal(typed.action, "write");
  t = typed.track;
  assert.equal(trackDraft(t, "k", json({ title: "Fix" })).action, "none");
  const more = trackDraft(t, "k", json({ title: "Fix porch" }));
  assert.equal(more.action, "write");
  assert.equal(more.track.touched, true);
});

test("changing back to what it opened with lets the draft go", () => {
  let t = trackDraft(null, "k", json({ title: "" })).track;
  t = trackDraft(t, "k", json({ title: "Fix" })).track;
  const back = trackDraft(t, "k", json({ title: "" }));
  assert.equal(back.action, "remove");
  // Typing again after that writes again.
  assert.equal(trackDraft(back.track, "k", json({ title: "F" })).action, "write");
});

test("a draft waiting to be restored survives the editor's first render", () => {
  // The editor renders its loaded values first, then puts the restored draft in.
  let t = trackDraft(null, "k", json({ title: "" })).track;
  assert.equal(trackDraft(t, "k", json({ title: "" })).action, "none");
  const restored = trackDraft(t, "k", json({ title: "Fix porch light" }));
  assert.equal(restored.action, "write");
  t = restored.track;
  assert.equal(t.baseline, json({ title: "" }));
});

test("the draft line says when, in Buffalo time", () => {
  // 2:10 PM in Buffalo (EDT in October) is 18:10 UTC.
  const at = new Date(Date.UTC(2026, 9, 26, 18, 10));
  assert.equal(draftLabel(at, new Date(Date.UTC(2026, 9, 26, 21, 0))), "Draft from 2:10 PM");
  // Written the evening before, Buffalo time, though it is already the 27th in UTC.
  const lastNight = new Date(Date.UTC(2026, 9, 27, 1, 30));
  assert.equal(draftLabel(lastNight, new Date(Date.UTC(2026, 9, 27, 15, 0))), "Draft from Oct 26");
  assert.equal(draftLabel(new Date(Date.UTC(2025, 11, 30, 15, 0)), new Date(Date.UTC(2026, 0, 3, 15, 0))), "Draft from Dec 30, 2025");
});

test("a new key is a new editor: a saved record's next version starts clean", () => {
  let t = trackDraft(null, "unit:1:v1", json({ name: "Unit 2" })).track;
  t = trackDraft(t, "unit:1:v1", json({ name: "Unit 2B" })).track;
  const saved = trackDraft(t, "unit:1:v2", json({ name: "Unit 2B" }));
  assert.equal(saved.action, "none");
  assert.equal(saved.track.baseline, json({ name: "Unit 2B" }));
  assert.equal(saved.track.touched, false);
});

test("a draft written again unchanged keeps the time it was typed", () => {
  const opened = { json: stableJson({ title: "Fix gutter" }), at: 1_000 };
  assert.equal(draftWrittenAt(opened, stableJson({ title: "Fix gutter" }), 9_000), 1_000);
  assert.equal(draftWrittenAt(opened, stableJson({ title: "Fix gutters" }), 9_000), 9_000);
  assert.equal(draftWrittenAt(null, stableJson({ title: "Fix gutter" }), 9_000), 9_000);
});

test("the sweep finds a draft past its age by its raw text, and leaves what it can't read", () => {
  const now = 100 * 86_400_000;
  assert.equal(isStoredDraftExpired(encodeDraft({ a: 1 }, now - 8 * 86_400_000), now), true);
  assert.equal(isStoredDraftExpired(encodeDraft({ a: 1 }, now - 6 * 86_400_000), now), false);
  assert.equal(isStoredDraftExpired("not json", now), false);
  assert.equal(isStoredDraftExpired(JSON.stringify({ v: 1, value: 1 }), now), false);
  assert.equal(isStoredDraftExpired(null, now), false);
});
