import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UPLOAD_KINDS, UPLOAD_KIND_ACCESS, UPLOAD_KIND_PARENT, isUploadKind, uploadRequest } from "./upload-kinds";
import { requestedUploadRole } from "./paths";
import { uploadLimits } from "./limits";

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

test("every key the token route serves is one of UPLOAD_KINDS", () => {
  const route = readFileSync(join(__dirname, "..", "..", "app", "api", "blob", "[kind]", "route.ts"), "utf8");
  const table = route.slice(route.indexOf("const KINDS"), route.indexOf("async function currentUploader"));
  const keys = [...table.matchAll(/^ {2}"([a-z-]+)": \{/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 4, "found the route's kinds");
  for (const k of keys) assert.ok(isUploadKind(k), `${k} is in UPLOAD_KINDS`);
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

test("uploadRequest: property kinds name the property, as today's document and listing uploads do", () => {
  const doc = uploadRequest("property-upload", P, { name: "Lease 2026.pdf", contentType: "application/pdf", fileKind: "file" });
  assert.equal(doc.pathname, `properties/${P}/Lease 2026.pdf`);
  assert.deepEqual(JSON.parse(doc.clientPayload), { propertyId: P });

  const listing = uploadRequest("listing-photo-upload", P, { name: "IMG_6117.jpg", contentType: "image/jpeg", fileKind: "image" });
  assert.equal(listing.pathname, "IMG_6117.jpg");
  assert.deepEqual(JSON.parse(listing.clientPayload), { propertyId: P });

  const photo = uploadRequest("property-photo-upload", P, { name: "Front (2).JPG", contentType: "image/jpeg", fileKind: "image" });
  assert.equal(photo.pathname, `properties/${P}/photo/Front-2.jpg`);
  assert.deepEqual(JSON.parse(photo.clientPayload), { propertyId: P });
});
