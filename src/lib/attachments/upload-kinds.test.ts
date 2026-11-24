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
  contactDocParent,
  isUploadKind,
  readContactDocParent,
  uploadRequest,
  uploadTargetHref,
  uploadTargetKey,
} from "./upload-kinds";
import { requestedUploadRole } from "./paths";
import { invoiceSendParent, invoiceUploadLimits, propertyUploadLimits, storedInvoiceUploadPath, uploadLimits } from "./limits";

const T = "cm1abc2def3ghi";
const P = "cm9prop8erty7";

test("UPLOAD_KINDS: the five token routes the uploads spec names, the lockbox photo, the contractor's documents, signed leases, a resident's request photos, New task's files and invoices, each with a parent and an access", () => {
  assert.deepEqual(
    [...UPLOAD_KINDS],
    [
      "task-upload",
      "portal-task-upload",
      "property-upload",
      "listing-photo-upload",
      "property-photo-upload",
      "lockbox-photo-upload",
      "portal-contact-upload",
      "contact-upload",
      "lease-upload",
      "invoice-upload",
      "portal-invoice-upload",
      "resident-upload",
      "new-task-upload",
    ],
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
  assert.deepEqual(UPLOAD_KIND_ALLOWED["lockbox-photo-upload"], ["image"]);
  // A resident's request (docs/specs/maintenance-requests.md): photos and videos, kept with their previews like a task's.
  assert.deepEqual(UPLOAD_KIND_ALLOWED["resident-upload"], ["image", "video"]);
  // New task's files (docs/specs/new-task-checklist-photos.md) become the task's own, so they take what a task takes.
  assert.deepEqual(UPLOAD_KIND_ALLOWED["new-task-upload"], ["image", "video", "file"]);
  // The lockbox photo keeps its thumbnail (properties/photo.ts recordLockboxPhoto) for the tile and the job page.
  assert.deepEqual(
    UPLOAD_KINDS.filter((k) => UPLOAD_KIND_PREVIEWS[k]),
    ["task-upload", "portal-task-upload", "lockbox-photo-upload", "resident-upload", "new-task-upload"],
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
  assert.equal(uploadTargetKey("new-task-upload", "f1"), "new-task:f1");
  assert.equal(uploadTargetHref("new-task-upload", "f1"), "/tasks/new");
});

test("uploadRequest: New task's files go to new-tasks/<formId>/<role> with their fileKind", () => {
  const r = uploadRequest("new-task-upload", "f-1", { name: "Quote (final).PDF", contentType: "application/pdf", fileKind: "file" }, { owner: "app:u1" });
  assert.equal(r.pathname, "new-tasks/f-1/orig/Quote-final.pdf");
  assert.deepEqual(JSON.parse(r.clientPayload), { formId: "f-1", fileKind: "file", owner: "app:u1" });
  const thumb = uploadRequest("new-task-upload", "f-1", { name: "Porch.jpg", contentType: "image/jpeg", fileKind: "image" }, { role: "thumb" });
  assert.equal(thumb.pathname, "new-tasks/f-1/thumb/Porch.jpg");
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

  // A unit's lockbox photo, private, with its thumbnail in the folder's thumb/ (docs/specs/lockbox-location.md).
  const lockbox = uploadRequest("lockbox-photo-upload", P, { name: "Gate.JPG", contentType: "image/jpeg", fileKind: "image" });
  assert.equal(lockbox.pathname, `properties/${P}/lockbox/Gate.jpg`);
  assert.deepEqual(JSON.parse(lockbox.clientPayload), { propertyId: P });
  assert.equal(typeof propertyUploadLimits("lockbox-photo-upload", P, lockbox.pathname), "object");
  const thumb = uploadRequest("lockbox-photo-upload", P, { name: "Gate.jpg", contentType: "image/jpeg", fileKind: "image" }, { role: "thumb" });
  assert.equal(thumb.pathname, `properties/${P}/lockbox/thumb/Gate.jpg`);
  assert.equal(typeof propertyUploadLimits("lockbox-photo-upload", P, thumb.pathname), "object");
  assert.equal(UPLOAD_KIND_ACCESS["lockbox-photo-upload"], "private");
});

test("uploadRequest: the queue's owner rides in every kind's payload when it is given, and in none when it isn't", () => {
  const img = { name: "a.jpg", contentType: "image/jpeg", fileKind: "image" as const };
  const owner = "portal:c-zack";
  for (const [kind, parent, key] of [
    ["task-upload", T, "taskId"],
    ["portal-task-upload", T, "taskId"],
    ["property-upload", P, "propertyId"],
    ["listing-photo-upload", P, "propertyId"],
    ["property-photo-upload", P, "propertyId"],
  ] as const) {
    const named = JSON.parse(uploadRequest(kind, parent, img, { owner }).clientPayload);
    assert.equal(named.owner, owner, kind);
    assert.equal(named[key], parent, kind);
    assert.ok(!("owner" in JSON.parse(uploadRequest(kind, parent, img).clientPayload)), `${kind} without one`);
  }
  // Beside queuedAt, not instead of it.
  assert.deepEqual(JSON.parse(uploadRequest("portal-task-upload", T, img, { queuedAt: "2026-10-26T20:00:00.000Z", owner }).clientPayload), {
    taskId: T,
    fileKind: "image",
    queuedAt: "2026-10-26T20:00:00.000Z",
    owner,
  });
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

test("a contractor's W-9 and insurance are two targets, each in its own private folder", () => {
  const w9 = contactDocParent("c123", "w9");
  assert.equal(w9, "c123:w9");
  assert.deepEqual(readContactDocParent(w9), { contactId: "c123", docKind: "w9" });
  assert.deepEqual(readContactDocParent("c123:insurance"), { contactId: "c123", docKind: "insurance" });
  assert.equal(readContactDocParent("c123:passport"), null);
  assert.equal(readContactDocParent("../x:w9"), null);
  assert.notEqual(uploadTargetKey("portal-contact-upload", w9), uploadTargetKey("portal-contact-upload", contactDocParent("c123", "insurance")));
  assert.equal(UPLOAD_KIND_ACCESS["portal-contact-upload"], "private");
  const req = uploadRequest("portal-contact-upload", w9, { name: "W9 signed.pdf", contentType: "application/pdf", fileKind: "file" }, { owner: "portal:c123" });
  assert.match(req.pathname, /^contacts\/c123\/w9\/[A-Za-z0-9._-]+$/);
  assert.deepEqual(JSON.parse(req.clientPayload), { contactId: "c123", docKind: "w9", fileKind: "file", owner: "portal:c123" });
});

test("staff add a contractor's W-9 to the same folder, under their own queue target, landing on the contractor's page", () => {
  const parent = contactDocParent("c123", "w9");
  assert.notEqual(uploadTargetKey("contact-upload", parent), uploadTargetKey("portal-contact-upload", parent));
  assert.equal(uploadTargetHref("contact-upload", parent), "/contractors/c123");
  assert.equal(UPLOAD_KIND_ACCESS["contact-upload"], "private");
  const req = uploadRequest("contact-upload", parent, { name: "w9.jpg", contentType: "image/jpeg", fileKind: "image" }, { owner: "app:u1" });
  assert.match(req.pathname, /^contacts\/c123\/w9\/[A-Za-z0-9._-]+$/);
});

test("lease-upload: one target per term, all in the lease's folder, a token the lease-upload rule accepts", async () => {
  const { leaseDocParent, readLeaseDocParent, uploadRequest, uploadTargetHref, uploadTargetKey } = await import("./upload-kinds");
  const { leaseUploadLimits, storedLeaseDocumentPath } = await import("./limits");
  const parent = leaseDocParent("lease1", "term1");
  assert.deepEqual(readLeaseDocParent(parent), { leaseId: "lease1", termId: "term1" });
  assert.equal(readLeaseDocParent("lease1"), null);
  assert.equal(uploadTargetKey("lease-upload", parent), "lease-doc:lease1:term1");
  assert.equal(uploadTargetHref("lease-upload", parent), "/tenants/lease1");
  const req = uploadRequest("lease-upload", parent, { name: "Lease 2026.pdf", contentType: "application/pdf", fileKind: "file" });
  assert.equal(req.pathname, "leases/lease1/Lease-2026.pdf");
  assert.deepEqual(JSON.parse(req.clientPayload), { leaseId: "lease1", termId: "term1", fileKind: "file" });
  assert.equal(typeof leaseUploadLimits("lease1", req.pathname, "file"), "object");
  assert.equal(typeof leaseUploadLimits("lease1", "leases/other/lease-2026.pdf", "file"), "string", "another lease's folder");
  assert.equal(typeof leaseUploadLimits("lease1", req.pathname, "video"), "string");
  assert.ok(storedLeaseDocumentPath("leases/lease1/lease-2026-AbC123.pdf", "lease1"));
  assert.ok(!storedLeaseDocumentPath("leases/lease2/lease-2026.pdf", "lease1"));
});

test("invoice uploads: a partner's go to the invoice's folder, a contractor's to their own folder on the job until the send records them", () => {
  const pdf = { name: "Invoice 1043.pdf", contentType: "application/pdf", fileKind: "file" as const };
  const staff = uploadRequest("invoice-upload", "inv1", pdf);
  assert.equal(staff.pathname, "invoices/inv1/Invoice-1043.pdf");
  assert.deepEqual(JSON.parse(staff.clientPayload), { invoiceId: "inv1", fileKind: "file" });
  const portal = uploadRequest("portal-invoice-upload", invoiceSendParent(T, "zack1"), pdf);
  assert.equal(portal.pathname, `invoice-sends/${T}/zack1/Invoice-1043.pdf`);
  assert.deepEqual(JSON.parse(portal.clientPayload), { taskId: T, fileKind: "file" });
  assert.equal(UPLOAD_KIND_ACCESS["invoice-upload"], "private");
  assert.equal(UPLOAD_KIND_ACCESS["portal-invoice-upload"], "private");
  assert.deepEqual(UPLOAD_KIND_ALLOWED["portal-invoice-upload"], ["image", "file"]);
  assert.equal(uploadTargetKey("invoice-upload", "inv1"), "invoice:inv1");
  assert.equal(uploadTargetHref("invoice-upload", "inv1"), "/invoices/inv1");
  assert.equal(uploadTargetHref("portal-invoice-upload", invoiceSendParent(T, "zack1")), `/p/jobs/${T}`);
});

test("a contractor's Send invoice folder names them: another contractor on the same job can't stage into it or claim from it", () => {
  const mine = invoiceSendParent(T, "zack1");
  const theirs = invoiceSendParent(T, "mike2");
  assert.equal(typeof invoiceUploadLimits("portal-invoice-upload", mine, `invoice-sends/${T}/zack1/bill.pdf`, "file"), "object");
  assert.equal(invoiceUploadLimits("portal-invoice-upload", theirs, `invoice-sends/${T}/zack1/bill.pdf`, "file"), "That upload path isn't allowed.");
  // The job's folder alone, as the first build had it, is no longer a place a send can come from.
  assert.equal(invoiceUploadLimits("portal-invoice-upload", mine, `invoice-sends/${T}/bill.pdf`, "file"), "That upload path isn't allowed.");
  assert.ok(storedInvoiceUploadPath("portal-invoice-upload", `invoice-sends/${T}/zack1/bill-Ab1.pdf`, mine));
  assert.ok(!storedInvoiceUploadPath("portal-invoice-upload", `invoice-sends/${T}/zack1/bill-Ab1.pdf`, theirs));
  assert.ok(!storedInvoiceUploadPath("portal-invoice-upload", `invoice-sends/${T}/zack1/bill-Ab1.pdf`, T), "a bare job id isn't a parent");
});
