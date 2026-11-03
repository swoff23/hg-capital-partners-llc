import test from "node:test";
import assert from "node:assert/strict";
import { MARK_DONE_TIED_SINCE, MARK_DONE_WINDOW_MS, finishPhotoIds, markDoneComment, reviewPhotos, type MediaEvent } from "./media";
import { READ_STATE_SINCE } from "./read-state-core";

/**
 * merge-L4 (Nov 3 review): the "At finish" set and the Review card's note found a Mark done's comment by the 30 s
 * window on every move to Review, so a comment Zack sent just before a bare Mark done (no note, no photos) could
 * pass for its note. Since chunk 7 a Mark done's note names its move (`data.statusEventId`); the window now holds
 * only for a move from before that (MARK_DONE_TIED_SINCE).
 */

const after = (ms: number) => new Date(MARK_DONE_TIED_SINCE.getTime() + ms);
const before = (ms: number) => new Date(MARK_DONE_TIED_SINCE.getTime() - ms);

const evt = (id: string, kind: string, createdAt: Date, over: Partial<MediaEvent> = {}): MediaEvent => ({
  id,
  kind,
  data: null,
  createdAt,
  actorContactId: "zack",
  ...over,
});
const review = (id: string, createdAt: Date, over: Partial<MediaEvent> = {}) => evt(id, "STATUS", createdAt, { data: { from: "IN_PROGRESS", to: "REVIEW" }, ...over });
const started = (createdAt: Date) => evt("s1", "STATUS", createdAt, { data: { to: "IN_PROGRESS" }, actorContactId: null });
const photo = (id: string, createdAt: Date, eventId: string) => ({ id, kind: "IMAGE" as const, createdAt, eventId, uploadedByContactId: "zack" });

test("the release the window ends at is chunk 7's, the one staff read state starts at", () => {
  assert.equal(MARK_DONE_TIED_SINCE.getTime(), READ_STATE_SINCE.getTime());
});

test("a bare Mark done since chunk 7: a comment sent 20 s before it isn't its note, however it was sent", () => {
  const done = review("r1", after(60 * 60_000));
  const sentAt = new Date(done.createdAt.getTime() - 20_000);
  assert.ok(done.createdAt.getTime() - sentAt.getTime() < MARK_DONE_WINDOW_MS, "inside the window");
  const rows = [photo("p1", sentAt, "c-send"), photo("p2", sentAt, "c-send")];
  // A send with no marks at all (the job page's action takes clientId as optional), a batch post and a late line.
  for (const data of [null, { batch: true }, { late: true }, { clientId: "send-1" }]) {
    const comment = evt("c-send", "COMMENT", sentAt, { data });
    const events = [started(after(0)), comment, done];
    assert.equal(markDoneComment(events, done), null, JSON.stringify(data));
    assert.deepEqual(finishPhotoIds(rows, events), [], JSON.stringify(data));
    // The Review card still holds this visit's photos, just not as the Mark done's set: newest first.
    assert.deepEqual(reviewPhotos(rows, { contactId: "zack", events }).map((r) => r.id), ["p1", "p2"], JSON.stringify(data));
  }
});

test("since chunk 7 the note is the comment that names the move, wherever it sits", () => {
  const done = review("r1", after(60 * 60_000));
  const note = evt("c-note", "COMMENT", new Date(done.createdAt.getTime() - 1), { data: { statusEventId: "r1" } });
  const update = evt("c-send", "COMMENT", new Date(done.createdAt.getTime() - 5_000));
  const rows = [photo("finish", note.createdAt, "c-note"), photo("progress", update.createdAt, "c-send")];
  assert.equal(markDoneComment([update, note, done], done)?.id, "c-note");
  assert.deepEqual(finishPhotoIds(rows, [update, note, done]), ["finish"]);
});

test("a Mark done from before chunk 7 keeps the window: its note named nothing", () => {
  const done = review("r1", before(60 * 60_000));
  const note = evt("c-legacy", "COMMENT", new Date(done.createdAt.getTime() - 2_000));
  const rows = [photo("legacy", note.createdAt, "c-legacy")];
  assert.equal(markDoneComment([note, done], done)?.id, "c-legacy");
  assert.deepEqual(finishPhotoIds(rows, [note, done]), ["legacy"]);
  // The last instant before the release is still the old rule; the release itself is the new one.
  const edge = review("r2", before(1));
  const edgeNote = evt("c-edge", "COMMENT", new Date(edge.createdAt.getTime() - 1_000));
  assert.equal(markDoneComment([edgeNote, edge], edge)?.id, "c-edge");
  const at = review("r3", MARK_DONE_TIED_SINCE);
  const atNote = evt("c-at", "COMMENT", new Date(at.createdAt.getTime() - 1_000));
  assert.equal(markDoneComment([atNote, at], at), null);
});
