import test from "node:test";
import assert from "node:assert/strict";
import { fullLoadHref, updateState, UPDATE_LINE, UPDATE_LINE_PHONE, type ClickLike, type LinkLike } from "./app-version";

test("updateState: the same version, or either side unknown, is current", () => {
  assert.equal(updateState("aaa", "aaa", null), "current");
  assert.equal(updateState(null, "bbb", null), "current");
  assert.equal(updateState("aaa", null, null), "current");
  assert.equal(updateState(null, null, null), "current");
});

test("updateState: a new live version shows the toast", () => {
  assert.equal(updateState("aaa", "bbb", null), "toast");
});

test("updateState: closed for this version keeps only the link rule; closed for an older one shows it again", () => {
  assert.equal(updateState("aaa", "bbb", "bbb"), "link-only");
  assert.equal(updateState("aaa", "ccc", "bbb"), "toast");
});

test("the toast's lines stay as short as they were measured: whole from 375, and at 320 for the phone line", () => {
  // 164px and 98px in Geist at 16px, against 179px of room at 375 and 124px at 320 (app-version.ts).
  assert.ok(UPDATE_LINE.length <= 22);
  assert.ok(UPDATE_LINE_PHONE.length <= 12);
});

const plain: ClickLike = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const here = "https://hgcapitalpartners.com/tasks?view=mine";
const link = (href: string, extra: Partial<LinkLike> = {}): LinkLike => ({ href, target: "", download: false, ...extra });

test("fullLoadHref: a plain click on a link to another page here loads it in full", () => {
  assert.equal(fullLoadHref(plain, link("https://hgcapitalpartners.com/tasks/abc"), here), "https://hgcapitalpartners.com/tasks/abc");
  assert.equal(fullLoadHref(plain, link("/deals"), here), "https://hgcapitalpartners.com/deals");
  assert.equal(fullLoadHref(plain, link("/tasks?view=all"), here), "https://hgcapitalpartners.com/tasks?view=all");
  assert.equal(fullLoadHref(plain, link("/deals", { target: "_self" }), here), "https://hgcapitalpartners.com/deals");
});

test("fullLoadHref: modifier keys, other buttons and handled clicks are left alone", () => {
  for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) {
    assert.equal(fullLoadHref({ ...plain, [key]: true }, link("/deals"), here), null, key);
  }
  assert.equal(fullLoadHref({ ...plain, button: 1 }, link("/deals"), here), null);
  assert.equal(fullLoadHref({ ...plain, defaultPrevented: true }, link("/deals"), here), null);
});

test("fullLoadHref: new tabs, downloads, other sites and other schemes are left alone", () => {
  assert.equal(fullLoadHref(plain, link("/deals", { target: "_blank" }), here), null);
  assert.equal(fullLoadHref(plain, link("/api/files/x", { download: true }), here), null);
  assert.equal(fullLoadHref(plain, link("https://example.com/"), here), null);
  assert.equal(fullLoadHref(plain, link("mailto:office@example.com"), here), null);
  assert.equal(fullLoadHref(plain, link("tel:+17165550100"), here), null);
});

test("fullLoadHref: the same page, or a hash on it, is left alone", () => {
  assert.equal(fullLoadHref(plain, link(here), here), null);
  assert.equal(fullLoadHref(plain, link("/tasks?view=mine#notes"), here), null);
});

test("fullLoadHref: no link, or an href that doesn't parse, is left alone", () => {
  assert.equal(fullLoadHref(plain, null, here), null);
  assert.equal(fullLoadHref(plain, link("http://[bad"), here), null);
});

test("fullLoadHref: a link that opens a create sheet over the page opens it as usual", () => {
  for (const path of ["/tasks/new", "/deals/new", "/properties/new", "/contractors/new", "/tasks/new/"]) {
    assert.equal(fullLoadHref(plain, link(path), here), null, path);
  }
  assert.equal(fullLoadHref(plain, link("/tasks/new-roof"), here), "https://hgcapitalpartners.com/tasks/new-roof");
});
