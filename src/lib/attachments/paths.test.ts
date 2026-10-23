import test from "node:test";
import assert from "node:assert/strict";
import {
  isPrivateStoreUrl,
  privateStoreHost,
  requestedUploadRole,
  safeUploadName,
  storeIdFromToken,
  storedUploadRole,
  taskUploadPath,
} from "./paths";

const T = "cm1abc2def3ghi";

test("requestedUploadRole: accepts exactly tasks/<taskId>/(orig|thumb|poster)/<name>", () => {
  assert.equal(requestedUploadRole(`tasks/${T}/orig/photo.jpg`, T), "orig");
  assert.equal(requestedUploadRole(`tasks/${T}/thumb/photo.jpg`, T), "thumb");
  assert.equal(requestedUploadRole(`tasks/${T}/poster/clip.jpg`, T), "poster");
  assert.equal(requestedUploadRole(`tasks/${T}/orig/${"a".repeat(100)}`, T), "orig");
});

test("requestedUploadRole: refuses everything else", () => {
  const refused = [
    `tasks/other/orig/photo.jpg`, // another task
    `tasks/${T}/photo.jpg`, // no role (the old layout)
    `tasks/${T}/originals/photo.jpg`,
    `tasks/${T}/orig/`,
    `tasks/${T}/orig/a/b.jpg`,
    `tasks/${T}/orig/../../properties/x.pdf`,
    `tasks/${T}/orig/..`,
    `tasks/${T}/orig/.`,
    `tasks/${T}/orig/photo one.jpg`,
    `tasks/${T}/orig/photo%2F.jpg`,
    `tasks/${T}/orig/${"a".repeat(101)}`,
    `/tasks/${T}/orig/photo.jpg`,
    `properties/${T}/photo.jpg`,
    `tasks/${T}/orig/photo.jpg/`,
  ];
  for (const p of refused) assert.equal(requestedUploadRole(p, T), null, p);
});

test("requestedUploadRole: a task id that could escape its folder is refused outright", () => {
  assert.equal(requestedUploadRole("tasks/../orig/x.jpg", ".."), null);
  assert.equal(requestedUploadRole("tasks/a/b/orig/x.jpg", "a/b"), null);
  assert.equal(requestedUploadRole("tasks//orig/x.jpg", ""), null);
});

test("storedUploadRole allows Blob's random suffix but nothing outside the task", () => {
  assert.equal(storedUploadRole(`tasks/${T}/orig/${"a".repeat(96)}-oYnXSVczoLa9yBYMFJOSNdaiiervF5.jpg`, T), "orig");
  assert.equal(storedUploadRole(`tasks/other/orig/photo.jpg`, T), null);
  assert.equal(storedUploadRole(`tasks/${T}/photo-abc.jpg`, T), null);
  assert.equal(storedUploadRole(`tasks/${T}/orig/${"a".repeat(161)}`, T), null);
});

test("safeUploadName keeps the extension and fits the path character set", () => {
  assert.equal(safeUploadName("Kitchen (after) é.HEIC"), "Kitchen-after-e.heic");
  assert.equal(safeUploadName("IMG_0001.jpg"), "IMG_0001.jpg");
  assert.equal(safeUploadName("../../etc/passwd"), "etc-passwd");
  assert.equal(safeUploadName("..."), "file");
  assert.equal(safeUploadName("файл.pdf"), "file.pdf");
  assert.equal(safeUploadName("README"), "README");
  const long = safeUploadName(`${"x".repeat(300)}.jpeg`);
  assert.equal(long.length, 100);
  assert.equal(long.endsWith(".jpeg"), true);
  for (const name of ["a b.c d.png", "😀.jpg", "x".repeat(500), " .pdf", "a--b__c.txt"]) {
    const safe = safeUploadName(name);
    assert.equal(requestedUploadRole(`tasks/${T}/orig/${safe}`, T), "orig", `${name} → ${safe}`);
  }
});

test("taskUploadPath builds a path the token route accepts", () => {
  assert.equal(taskUploadPath(T, "Roof leak.MOV"), `tasks/${T}/orig/Roof-leak.mov`);
  assert.equal(requestedUploadRole(taskUploadPath(T, "x.jpg", "thumb"), T), "thumb");
});

test("taskUploadPath with a type gives the name that type's extension", () => {
  assert.equal(taskUploadPath(T, "payload.html", "orig", "text/plain"), `tasks/${T}/orig/payload.txt`);
  assert.equal(taskUploadPath(T, "IMG_0001", "orig", "image/heic"), `tasks/${T}/orig/IMG_0001.heic`);
  assert.equal(taskUploadPath(T, "Roof leak.MOV", "orig", "video/quicktime"), `tasks/${T}/orig/Roof-leak.mov`);
});

test("storeIdFromToken reads vercel_blob_rw_<storeId>_<secret>", () => {
  assert.equal(storeIdFromToken("vercel_blob_rw_AbC123xyz_s3cr3tValue"), "AbC123xyz");
  assert.equal(storeIdFromToken(""), null);
  assert.equal(storeIdFromToken(undefined), null);
  assert.equal(storeIdFromToken("vercel_blob_ro_AbC123_x"), null);
  assert.equal(storeIdFromToken("vercel_blob_rw_bad.id_x"), null);
});

test("isPrivateStoreUrl: our private store only, at the exact path when given", () => {
  const ok = `https://${privateStoreHost("AbC123")}/tasks/${T}/orig/a-xyz.jpg`;
  assert.equal(privateStoreHost("AbC123"), "abc123.private.blob.vercel-storage.com");
  assert.equal(isPrivateStoreUrl(ok, "AbC123"), true);
  assert.equal(isPrivateStoreUrl(ok, "AbC123", `tasks/${T}/orig/a-xyz.jpg`), true);
  assert.equal(isPrivateStoreUrl(ok, "AbC123", `tasks/${T}/orig/other.jpg`), false);
  assert.equal(isPrivateStoreUrl(`https://abc123.public.blob.vercel-storage.com/x.jpg`, "AbC123"), false);
  assert.equal(isPrivateStoreUrl(`https://other.private.blob.vercel-storage.com/x.jpg`, "AbC123"), false);
  assert.equal(isPrivateStoreUrl(`http://abc123.private.blob.vercel-storage.com/x.jpg`, "AbC123"), false);
  assert.equal(isPrivateStoreUrl(`https://abc123.private.blob.vercel-storage.com.evil.test/x.jpg`, "AbC123"), false);
  assert.equal(isPrivateStoreUrl(`https://user@abc123.private.blob.vercel-storage.com/x.jpg`, "AbC123"), false);
  assert.equal(isPrivateStoreUrl("not a url", "AbC123"), false);
  assert.equal(isPrivateStoreUrl(ok, null), false);
  assert.equal(isPrivateStoreUrl(null, "AbC123"), false);
});
