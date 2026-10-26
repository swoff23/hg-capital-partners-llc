import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UPLOAD_KINDS,
  UPLOAD_KIND_ACCESS,
  UPLOAD_KIND_ALLOWED,
  UPLOAD_KIND_PARENT,
  UPLOAD_KIND_PREVIEWS,
  isUploadKind,
  uploadRequest,
  uploadTargetHref,
  uploadTargetKey,
} from "./upload-kinds";
import { requestedUploadRole } from "./paths";
import { propertyUploadLimits, uploadLimits } from "./limits";

const T = "cm1abc2def3ghi";
const P = "cm9prop8erty7";

test("UPLOAD_KINDS: the five token routes the uploads spec names, each with a parent and an access", () => {
  assert.deepEqual(
    [...UPLOAD_KINDS],
    ["task-upload", "portal-task-upload", "property-upload", "listing-photo-upload", "property-photo-upload"],
  );
  for (const k of UPLOAD_KINDS) {
    assert.ok(UPLOAD_KIND_PARENT[k], k);
    assert.ok(UPLOAD_KIND_ACCESS[k], k);
  }
  // Public Blob only where the public site or PhotoThumb reads the photo.
  assert.deepEqual(
    UPLOAD_KINDS.filter((k) => UPLOAD_KIND_ACCESS[k] === "public"),
    ["listing-photo-upload", "property-photo-upload"],
  );
});

test("isUploadKind: only the listed keys", () => {
  assert.equal(isUploadKind("task-upload"), true);
  assert.equal(isUploadKind("property-photo-upload"), true);
  assert.equal(isUploadKind("contractor-doc-upload"), false);
  assert.equal(isUploadKind(""), false);
  assert.equal(isUploadKind(undefined), false);
});

test("every key the token route serves is one of UPLOAD_KINDS, and it serves every one", () => {
  const route = readFileSync(join(__dirname, "..", "..", "app", "api", "blob", "[kind]", "route.ts"), "utf8");
  const table = route.slice(route.indexOf("const KINDS"), route.indexOf("async function currentUploader"));
  const keys = [...table.matchAll(/^ {2}"([a-z-]+)": \{/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 5, "found the route's kinds");
  for (const k of keys) assert.ok(isUploadKind(k), `${k} is in UPLOAD_KINDS`);
  assert.deepEqual([...keys].sort(), [...UPLOAD_KINDS].sort());
});

test("UPLOAD_KIND_ALLOWED: what each target takes, and previews only where the record step keeps them", () => {
  assert.deepEqual(UPLOAD_KIND_ALLOWED["task-upload"], ["image", "video", "file"]);
  assert.deepEqual(UPLOAD_KIND_ALLOWED["portal-task-upload"], ["image", "video"]);
  assert.deepEqual(UPLOAD_KIND_ALLOWED["property-upload"], ["image", "file"]);
  assert.deepEqual(UPLOAD_KIND_ALLOWED["listing-photo-upload"], ["image"]);
  assert.deepEqual(UPLOAD_KIND_ALLOWED["property-photo-upload"], ["image"]);
  assert.deepEqual(
    UPLOAD_KINDS.filter((k) => UPLOAD_KIND_PREVIEWS[k]),
    ["task-upload", "portal-task-upload"],
  );
});

test("uploadTargetKey and uploadTargetHref: the queue key and the page for each kind", () => {
  assert.equal(uploadTargetKey("task-upload", "t1"), "task:t1");
  assert.equal(uploadTargetKey("portal-task-upload", "t1"), "portal-task:t1");
  assert.equal(uploadTargetKey("property-upload", "p1"), "property-doc:p1");
  assert.equal(uploadTargetKey("listing-photo-upload", "p1"), "listing:p1");
  assert.equal(uploadTargetKey("property-photo-upload", "p1"), "property-photo:p1");
  assert.equal(uploadTargetHref("task-upload", "t1"), "/tasks/t1");
  assert.equal(uploadTargetHref("portal-task-upload", "t1"), "/p/jobs/t1");
  assert.equal(uploadTargetHref("property-upload", "p1"), "/properties/p1");
  assert.equal(uploadTargetHref("listing-photo-upload", "p1"), "/properties/p1");
});

test("uploadRequest: task files go to tasks/<id>/orig with their fileKind, a path the token route accepts", () => {
  for (const kind of ["task-upload", "portal-task-upload"] as const) {
    const r = uploadRequest(kind, T, { name: "Kitchen (after).HEIC", contentType: "image/heic", fileKind: "image" });
    assert.equal(r.pathname, `tasks/${T}/orig/Kitchen-after.heic`);
    assert.deepEqual(JSON.parse(r.clientPayload), { taskId: T, fileKind: "image" });
    assert.equal(requestedUploadRole(r.pathname, T), "orig");
    assert.equal(typeof uploadLimits(T, r.pathname, "image"), "object");
  }
});

test("uploadRequest: a task file's extension follows its checked type, so the route doesn't refuse it", () => {
  const r = uploadRequest("task-upload", T, { name: "scan", contentType: "application/pdf", fileKind: "file" });
  assert.equal(r.pathname, `tasks/${T}/orig/scan.pdf`);
  assert.equal(typeof uploadLimits(T, r.pathname, "file"), "object");
});

test("uploadRequest: property kinds name the property; a document's payload carries its fileKind so the token holds it to its cap", () => {
  const doc = uploadRequest("property-upload", P, { name: "Lease 2026.pdf", contentType: "application/pdf", fileKind: "file" });
  assert.equal(doc.pathname, `properties/${P}/Lease-2026.pdf`);
  assert.deepEqual(JSON.parse(doc.clientPayload), { propertyId: P, fileKind: "file" });
  assert.equal(typeof propertyUploadLimits("property-upload", P, doc.pathname, "file"), "object");

  const listing = uploadRequest("listing-photo-upload", P, { name: "IMG_6117.jpg", contentType: "image/jpeg", fileKind: "image" });
  assert.equal(listing.pathname, "IMG_6117.jpg");
  assert.deepEqual(JSON.parse(listing.clientPayload), { propertyId: P });
  assert.equal(typeof propertyUploadLimits("listing-photo-upload", P, listing.pathname), "object");

  const photo = uploadRequest("property-photo-upload", P, { name: "Front (2).JPG", contentType: "image/jpeg", fileKind: "image" });
  assert.equal(photo.pathname, `properties/${P}/photo/Front-2.jpg`);
  assert.deepEqual(JSON.parse(photo.clientPayload), { propertyId: P });
  assert.equal(typeof propertyUploadLimits("property-photo-upload", P, photo.pathname), "object");
});

test("uploadRequest: a camera file's path is its dated slug, whichever kind", () => {
  const name = "Photo 2026-10-25 at 2.14 PM 2.jpg";
  const file = { name, contentType: "image/jpeg", fileKind: "image" as const };
  assert.equal(uploadRequest("task-upload", T, file).pathname, `tasks/${T}/orig/photo-2026-10-25-214pm-2.jpg`);
  assert.equal(uploadRequest("property-upload", P, file).pathname, `properties/${P}/photo-2026-10-25-214pm-2.jpg`);
  assert.equal(uploadRequest("listing-photo-upload", P, file).pathname, "photo-2026-10-25-214pm-2.jpg");
  assert.equal(uploadRequest("property-photo-upload", P, file).pathname, `properties/${P}/photo/photo-2026-10-25-214pm-2.jpg`);
});

test("uploadRequest: a thumbnail or poster is its own role, always an image the token route accepts", () => {
  for (const role of ["thumb", "poster"] as const) {
    const r = uploadRequest("task-upload", T, { name: "Kitchen.jpg", contentType: "image/jpeg", fileKind: "image" }, { role });
    assert.equal(r.pathname, `tasks/${T}/${role}/Kitchen.jpg`);
    assert.equal(requestedUploadRole(r.pathname, T), role);
    assert.equal(typeof uploadLimits(T, r.pathname, JSON.parse(r.clientPayload).fileKind), "object");
  }
});

test("uploadRequest: a contractor's token request carries queuedAt, nobody else's", () => {
  const file = { name: "a.jpg", contentType: "image/jpeg", fileKind: "image" as const };
  const at = "2026-10-25T18:14:00.000Z";
  assert.deepEqual(JSON.parse(uploadRequest("portal-task-upload", T, file, { queuedAt: at }).clientPayload), { taskId: T, fileKind: "image", queuedAt: at });
  assert.deepEqual(JSON.parse(uploadRequest("portal-task-upload", T, file).clientPayload), { taskId: T, fileKind: "image" });
  assert.deepEqual(JSON.parse(uploadRequest("task-upload", T, file, { queuedAt: at }).clientPayload), { taskId: T, fileKind: "image" });
});
