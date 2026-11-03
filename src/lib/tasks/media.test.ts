import test from "node:test";
import assert from "node:assert/strict";
import {
  fileLink,
  finishPhotoIds,
  isDraftUpload,
  isMediaRow,
  markDoneComment,
  mediaItem,
  orderMedia,
  reviewPhotoSummary,
  reviewPhotos,
  taskMedia,
  taskMediaInclude,
  uploaderName,
  visitStart,
  type MediaEvent,
  type TaskMediaRow,
} from "./media";

const at = (min: number) => new Date(Date.UTC(2026, 9, 25, 18, min));

const row = (id: string, over: Partial<TaskMediaRow> = {}): TaskMediaRow => ({
  id,
  kind: "IMAGE",
  filename: `${id}.jpg`,
  size: 1000,
  linkUrl: null,
  visibility: "SHARED",
  thumbPathname: null,
  posterPathname: null,
  durationSec: null,
  eventId: "e1",
  asanaGid: null,
  createdAt: at(0),
  uploadedByUserId: null,
  uploadedByContactId: "zack",
  uploadedByUser: null,
  uploadedByContact: { fullName: "Zack Outlaw" },
  ...over,
});

const staff = { uploadedByUserId: "connor", uploadedByContactId: null, uploadedByUser: { name: "Connor", email: "c@hg.test" }, uploadedByContact: null };

test("taskMediaInclude: posted and drafted files, never removed ones, oldest first", () => {
  assert.deepEqual(taskMediaInclude.where, { deletedAt: null });
  assert.deepEqual(taskMediaInclude.orderBy, { createdAt: "asc" });
  for (const k of ["eventId", "asanaGid", "uploadedByUserId", "uploadedByContactId", "thumbPathname", "posterPathname"] as const) {
    assert.equal(taskMediaInclude.select[k], true, k);
  }
});

test("uploaderName: the staff name, else their email; the contractor's full name; null for an unmatched import", () => {
  assert.equal(uploaderName(row("a", staff)), "Connor");
  assert.equal(uploaderName(row("a", { ...staff, uploadedByUser: { name: null, email: "p@hg.test" } })), "p@hg.test");
  assert.equal(uploaderName(row("a")), "Zack Outlaw");
  assert.equal(uploaderName(row("a", { uploadedByContactId: null, uploadedByContact: null })), null);
});

test("isMediaRow and isDraftUpload: photos and videos go in the grid; a staff upload on no comment is a draft", () => {
  assert.equal(isMediaRow({ kind: "IMAGE" }), true);
  assert.equal(isMediaRow({ kind: "VIDEO" }), true);
  assert.equal(isMediaRow({ kind: "FILE" }), false);
  assert.equal(isMediaRow({ kind: "LINK" }), false);
  assert.equal(isDraftUpload(row("a", { ...staff, eventId: null })), true);
  assert.equal(isDraftUpload(row("a", { ...staff, eventId: "e2" })), false, "posted with a comment");
  assert.equal(isDraftUpload(row("a", { ...staff, eventId: null, asanaGid: "123" })), false, "imported");
  assert.equal(isDraftUpload(row("a", { eventId: null })), false, "a contractor's upload is never a draft");
});

test("mediaItem: a grid tile with its thumbnail, poster, uploader and Internal lock", () => {
  const photo = mediaItem(row("p", { thumbPathname: "tasks/t/thumb/p.jpg", visibility: "INTERNAL", ...staff }));
  assert.deepEqual(photo, {
    id: "p",
    kind: "IMAGE",
    filename: "p.jpg",
    hasThumb: true,
    hasPoster: false,
    durationSec: null,
    uploadedBy: "Connor",
    createdAt: at(0),
    internal: true,
  });
  const video = mediaItem(row("v", { kind: "VIDEO", posterPathname: "tasks/t/poster/v.jpg", durationSec: 42 }));
  assert.equal(video.kind, "VIDEO");
  assert.equal(video.hasPoster, true);
  assert.equal(video.durationSec, 42);
  assert.equal(video.internal, false);
});

test("fileLink: a document opens through the gated route; a link opens its URL; a link with no URL is left out", () => {
  const doc = fileLink(row("d", { kind: "FILE", filename: "Lease 2026.pdf", size: 1200 }));
  assert.deepEqual(doc, {
    id: "d",
    kind: "FILE",
    filename: "Lease 2026.pdf",
    href: "/api/files/task/d",
    size: 1200,
    internal: false,
    uploadedBy: "Zack Outlaw",
    createdAt: at(0),
  });
  const link = fileLink(row("l", { kind: "LINK", filename: "Drive folder", size: null, linkUrl: "https://drive.example/x" }));
  assert.equal(link?.href, "https://drive.example/x");
  assert.equal(link?.size, null);
  assert.equal(fileLink(row("l", { kind: "LINK", linkUrl: null })), null);
});

test("orderMedia: newest first, ties keep the order given, the input untouched", () => {
  const items = [
    { id: "a", createdAt: at(1) },
    { id: "b1", createdAt: at(3) },
    { id: "b2", createdAt: at(3).toISOString() },
    { id: "c", createdAt: at(5) },
  ];
  assert.deepEqual(
    orderMedia(items).map((i) => i.id),
    ["c", "b1", "b2", "a"],
  );
  assert.deepEqual(
    items.map((i) => i.id),
    ["a", "b1", "b2", "c"],
  );
});

test("orderMedia: the At finish set leads, each run newest first", () => {
  const items = [
    { id: "old-other", createdAt: at(1) },
    { id: "finish-1", createdAt: at(10) },
    { id: "late-other", createdAt: at(12) },
    { id: "finish-2", createdAt: at(11) },
    { id: "mid-other", createdAt: at(5) },
  ];
  assert.deepEqual(
    orderMedia(items, { atFinish: ["finish-1", "finish-2"] }).map((i) => i.id),
    ["finish-2", "finish-1", "late-other", "mid-other", "old-other"],
  );
  assert.deepEqual(
    orderMedia(items, { atFinish: [] }).map((i) => i.id),
    ["late-other", "finish-2", "finish-1", "mid-other", "old-other"],
  );
});

// A job's life as the page reads it: started at :00, a comment with the Mark done sheet's photos and a move to Review at :30
// (one transaction, so within milliseconds of each other), sent back at :40, started again at :41, done again at :50.
const evt = (id: string, kind: string, createdAt: Date, over: Partial<MediaEvent> = {}): MediaEvent => ({
  id,
  kind,
  data: {},
  createdAt,
  actorContactId: "zack",
  ...over,
});
const started = (id: string, min: number) => evt(id, "STATUS", at(min), { data: { to: "IN_PROGRESS" } });
const review = (id: string, min: number, over: Partial<MediaEvent> = {}) => evt(id, "STATUS", new Date(at(min).getTime() + 5), { data: { to: "REVIEW" }, ...over });
const markDoneNote = (id: string, min: number) => evt(id, "COMMENT", at(min));

test("finishPhotoIds: the photos posted on the comment written with the latest Mark done", () => {
  const rows = [
    row("during-1", { createdAt: at(10), eventId: "c-mid" }),
    row("finish-1", { createdAt: at(28), eventId: "c-done" }),
    row("finish-2", { createdAt: at(29), eventId: "c-done" }),
    row("after", { createdAt: at(35), eventId: null }),
  ];
  const events = [started("s1", 0), evt("c-mid", "COMMENT", at(10)), markDoneNote("c-done", 30), review("r1", 30)];
  assert.deepEqual(finishPhotoIds(rows, events), ["finish-1", "finish-2"]);
});

test("finishPhotoIds: the latest Mark done only, and nothing without photos on its comment", () => {
  const rows = [row("first-visit", { createdAt: at(28), eventId: "c1" }), row("second-visit", { createdAt: at(49), eventId: "c2" })];
  const events = [started("s1", 0), markDoneNote("c1", 30), review("r1", 30), started("s2", 41), markDoneNote("c2", 50), review("r2", 50)];
  assert.deepEqual(finishPhotoIds(rows, events), ["second-visit"]);
  // Mark done with no note and no photos writes only the move to Review.
  assert.deepEqual(finishPhotoIds(rows, [started("s1", 0), review("r1", 30)]), []);
  // Another contractor's comment, or one from long before, isn't this Mark done's.
  assert.deepEqual(finishPhotoIds(rows, [evt("c1", "COMMENT", at(30), { actorContactId: "luis" }), review("r1", 30)]), []);
  assert.deepEqual(finishPhotoIds(rows, [markDoneNote("c1", 10), review("r1", 30)]), []);
  // A job a staff member moved to Review has no finish set, and neither does a job never marked done.
  assert.deepEqual(finishPhotoIds(rows, [markDoneNote("c1", 30), review("r1", 30, { actorContactId: null })]), []);
  assert.deepEqual(finishPhotoIds(rows, []), []);
});

test("finishPhotoIds: the Mark done's note is the comment that names its move (chunk 7), never an update sent just before", () => {
  // Zack posts a written update with two photos ten seconds before a Mark done with no note and no photos.
  const rows = [row("progress-1", { createdAt: at(29), eventId: "c-update" }), row("progress-2", { createdAt: at(29), eventId: "c-update" })];
  const update = evt("c-update", "COMMENT", new Date(at(30).getTime() - 10_000), { data: { clientId: "send-1" } });
  assert.deepEqual(finishPhotoIds(rows, [started("s1", 0), update, review("r1", 30)]), [], "a written update isn't the Mark done's");
  // A batch post or a late line in the seconds before isn't either.
  for (const data of [{ batch: true }, { late: true }]) {
    assert.deepEqual(finishPhotoIds(rows, [started("s1", 0), { ...update, data }, review("r1", 30)]), [], JSON.stringify(data));
  }
  // The note tied to the move by id is, however far from it, and an update in between doesn't take its place.
  const tied = [row("finish", { createdAt: at(20), eventId: "c-done" }), ...rows];
  const note = evt("c-done", "COMMENT", at(20), { data: { statusEventId: "r1" } });
  assert.deepEqual(finishPhotoIds(tied, [started("s1", 0), note, update, review("r1", 30)]), ["finish"]);
  // A note tied to an earlier move is that one's, not this Mark done's.
  const earlier = evt("c-old", "COMMENT", new Date(at(30).getTime() - 5_000), { data: { statusEventId: "r0" } });
  assert.deepEqual(finishPhotoIds([row("old", { createdAt: at(29), eventId: "c-old" })], [earlier, review("r1", 30)]), []);
  // A job marked done before chunk 7: its note named nothing, so the comment just before the move still counts.
  assert.deepEqual(finishPhotoIds([row("legacy", { createdAt: at(29), eventId: "c-legacy" })], [evt("c-legacy", "COMMENT", at(30)), review("r1", 30)]), ["legacy"]);
});

test("taskMedia: drafts stay out; photos newest first with the At finish set leading, then documents and links", () => {
  const rows = [
    row("p2", { createdAt: at(4), eventId: "c-mid" }),
    row("doc", { kind: "FILE", createdAt: at(2) }),
    row("draft", { ...staff, eventId: null, createdAt: at(1) }),
    row("p1", { createdAt: at(1), eventId: "c-mid" }),
    row("f1", { createdAt: at(28), eventId: "c-done" }),
    row("link", { kind: "LINK", linkUrl: null }),
  ];
  const events = [started("s1", 0), evt("c-mid", "COMMENT", at(4)), markDoneNote("c-done", 30), review("r1", 30)];
  const set = taskMedia(rows, { events });
  assert.deepEqual(
    set.media.map((m) => m.id),
    ["f1", "p2", "p1"],
  );
  assert.deepEqual(set.atFinish, ["f1"]);
  assert.deepEqual(
    set.files.map((f) => f.id),
    ["doc"],
  );
  // With no Mark done there are no labels and no set.
  const plain = taskMedia(rows.slice(0, 4), { events: [] });
  assert.deepEqual(plain.atFinish, []);
  assert.deepEqual(
    plain.media.map((m) => m.id),
    ["p2", "p1"],
  );
});

test("reviewPhotos: this visit's photos and videos by the contractor who marked it done, the Mark done set first", () => {
  const rows = [
    row("old-visit", { createdAt: at(5) }),
    row("v1", { kind: "VIDEO", createdAt: at(45) }),
    row("p1", { createdAt: at(43) }),
    row("finish", { createdAt: at(49), eventId: "c2" }),
    row("zdoc", { kind: "FILE", createdAt: at(46) }),
    row("other", { createdAt: at(47), uploadedByContactId: "luis" }),
    row("staff-photo", { createdAt: at(47), ...staff }),
  ];
  const events = [started("s1", 0), markDoneNote("c1", 30), review("r1", 30), started("s2", 41), markDoneNote("c2", 50), review("r2", 50)];
  const photos = reviewPhotos(rows, { contactId: "zack", events });
  assert.deepEqual(
    photos.map((r) => r.id),
    ["finish", "v1", "p1"],
  );
  assert.equal(reviewPhotoSummary(photos), "2 photos and 1 video", "videos are named as videos");
  assert.equal(reviewPhotoSummary([]), "0 files");
});

test("reviewPhotos: with no earlier start every photo of theirs counts; none for staff or without a contractor", () => {
  const rows = [row("z2", { kind: "VIDEO", createdAt: at(3) }), row("z1", { createdAt: at(1) }), row("zdoc", { kind: "FILE" }), row("other", { uploadedByContactId: "luis" })];
  assert.deepEqual(
    reviewPhotos(rows, { contactId: "zack" }).map((r) => r.id),
    ["z2", "z1"],
  );
  assert.deepEqual(reviewPhotos(rows, { contactId: "zack", events: [review("r1", 30)] }).map((r) => r.id), ["z2", "z1"]);
  assert.deepEqual(reviewPhotos(rows, { contactId: null }), []);
});

test("reviewPhotos: a start after the latest Mark done belongs to a later visit and doesn't cut this one", () => {
  const rows = [row("a", { createdAt: at(20) }), row("b", { createdAt: at(35) })];
  const events = [started("s1", 10), markDoneNote("c1", 30), review("r1", 30), started("s2", 40)];
  assert.deepEqual(
    reviewPhotos(rows, { contactId: "zack", events }).map((r) => r.id),
    ["b", "a"],
  );
});

test("visitStart: the latest move to In progress before a time, the one rule Mark done and the Review card count a visit by", () => {
  const events = [started("s1", 0), markDoneNote("c1", 30), review("r1", 30), started("s2", 41), evt("x", "STATUS", at(45), { data: { to: "WAITING" } })];
  assert.deepEqual(visitStart(events), at(41), "Mark done, now: the visit that began at the latest start");
  assert.deepEqual(visitStart(events, at(30).getTime()), at(0), "the Review card, before the latest Mark done");
  assert.equal(visitStart([review("r1", 30)]), null, "an older job with no start: every file counts");
  assert.equal(visitStart([]), null);
});

test("markDoneComment: the Review card's note is the same comment At finish takes its photos from", () => {
  // Zack sends a written update ten seconds before a Mark done with no note: the card has no note, and At finish no photos.
  const update = evt("c-update", "COMMENT", new Date(at(30).getTime() - 10_000), { data: { clientId: "send-1" } });
  const done = review("r1", 30);
  assert.equal(markDoneComment([started("s1", 0), update, done], done), null, "a written update isn't the Mark done's note");
  for (const data of [{ batch: true }, { late: true }]) {
    assert.equal(markDoneComment([{ ...update, data }, done], done), null, JSON.stringify(data));
  }
  // The note that names the move is it, however far before, and the card and At finish agree on which comment that is.
  const note = evt("c-done", "COMMENT", at(20), { data: { statusEventId: "r1" } });
  assert.equal(markDoneComment([started("s1", 0), note, update, done], done)?.id, "c-done");
  const rows = [row("finish", { createdAt: at(20), eventId: "c-done" }), row("progress", { createdAt: at(29), eventId: "c-update" })];
  assert.deepEqual(finishPhotoIds(rows, [started("s1", 0), note, update, done]), ["finish"]);
  // A staff move to Review is tied to its note by id too, but a staff member has no contractor comment just before it.
  const staffMove = review("r2", 30, { actorContactId: null });
  assert.equal(markDoneComment([evt("c-staff", "COMMENT", at(30), { actorContactId: null }), staffMove], staffMove), null);
  assert.equal(markDoneComment([evt("c-staff", "COMMENT", at(25), { data: { statusEventId: "r2" }, actorContactId: null }), staffMove], staffMove)?.id, "c-staff");
  // Before chunk 7 the note named nothing: the contractor's comment just before the move, the latest of them.
  const legacy = [evt("c-a", "COMMENT", new Date(at(30).getTime() - 20_000)), evt("c-b", "COMMENT", new Date(at(30).getTime() - 2_000))];
  assert.equal(markDoneComment(legacy, done)?.id, "c-b");
  assert.equal(markDoneComment([evt("c-far", "COMMENT", at(10))], done), null);
});

test("finishPhotoIds: photos a batch post had told HG of that the Mark done counted are in the set, named on its move to Review", () => {
  const rows = [
    row("batch-1", { createdAt: at(20), eventId: "c-batch" }),
    row("batch-2", { createdAt: at(21), eventId: "c-batch" }),
    row("finish", { createdAt: at(29), eventId: "c-done" }),
    row("other", { createdAt: at(22), eventId: "c-batch" }),
  ];
  const counted = review("r1", 30, { data: { to: "REVIEW", finishIds: ["batch-1", "batch-2", "gone"] } });
  assert.deepEqual(finishPhotoIds(rows, [started("s1", 0), markDoneNote("c-done", 30), counted]), ["batch-1", "batch-2", "finish"]);
  // A Mark done with no note and no new photo: only the counted ones.
  assert.deepEqual(finishPhotoIds(rows, [started("s1", 0), counted]), ["batch-1", "batch-2"]);
  // Only the latest Mark done's, and never a staff move to Review's.
  assert.deepEqual(finishPhotoIds(rows, [counted, started("s2", 41), review("r2", 50)]), []);
  assert.deepEqual(finishPhotoIds(rows, [review("r1", 30, { actorContactId: null, data: { to: "REVIEW", finishIds: ["batch-1"] } })]), []);
  // The Review card leads with them too.
  const photos = reviewPhotos(rows, { contactId: "zack", events: [started("s1", 0), markDoneNote("c-done", 30), counted] });
  assert.deepEqual(photos.slice(0, 3).map((r) => r.id).sort(), ["batch-1", "batch-2", "finish"]);
});
