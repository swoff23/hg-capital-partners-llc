import test from "node:test";
import assert from "node:assert/strict";
import {
  fileLink,
  finishPhotoIds,
  isDraftUpload,
  isMediaRow,
  mediaItem,
  orderMedia,
  reviewPhotos,
  taskMedia,
  taskMediaInclude,
  uploaderName,
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

test("orderMedia: oldest first, keeping the given order within the same instant, without touching the input", () => {
  const items = [
    { id: "c", createdAt: at(5) },
    { id: "a", createdAt: at(1) },
    { id: "b1", createdAt: at(3) },
    { id: "b2", createdAt: at(3).toISOString() },
  ];
  assert.deepEqual(
    orderMedia(items).map((i) => i.id),
    ["a", "b1", "b2", "c"],
  );
  assert.deepEqual(
    items.map((i) => i.id),
    ["c", "a", "b1", "b2"],
  );
});

test("taskMedia: drafts stay out; photos in grid order, then documents and links; no At finish set yet", () => {
  const rows = [
    row("p2", { createdAt: at(4) }),
    row("doc", { kind: "FILE", createdAt: at(2) }),
    row("draft", { ...staff, eventId: null, createdAt: at(1) }),
    row("p1", { createdAt: at(1) }),
    row("link", { kind: "LINK", linkUrl: null }),
  ];
  const events: MediaEvent[] = [{ id: "e1", kind: "STATUS", data: { to: "REVIEW" }, createdAt: at(6), actorContactId: "zack" }];
  const set = taskMedia(rows, { events });
  assert.deepEqual(
    set.media.map((m) => m.id),
    ["p1", "p2"],
  );
  assert.deepEqual(
    set.files.map((f) => f.id),
    ["doc"],
  );
  assert.deepEqual(set.atFinish, []);
  assert.deepEqual(finishPhotoIds(rows, events), []);
});

test("reviewPhotos: the photos and videos the contractor who marked it done added; none for staff", () => {
  const rows = [
    row("z2", { kind: "VIDEO", createdAt: at(3) }),
    row("z1", { createdAt: at(1) }),
    row("zdoc", { kind: "FILE" }),
    row("other", { uploadedByContactId: "luis" }),
    row("mine", { ...staff }),
  ];
  assert.deepEqual(
    reviewPhotos(rows, { contactId: "zack" }).map((r) => r.id),
    ["z1", "z2"],
  );
  assert.equal(reviewPhotos(rows, { contactId: "zack", events: [] }).length, 2, "the count the Review banner showed");
  assert.deepEqual(reviewPhotos(rows, { contactId: null }), []);
});
