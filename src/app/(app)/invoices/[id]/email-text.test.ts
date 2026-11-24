import test from "node:test";
import assert from "node:assert/strict";
import { linkParts, senderName } from "./email-text";

test("senderName: the name before the address, or the address itself", () => {
  assert.equal(senderName("Zack Reading <zack@example.com>"), "Zack Reading");
  assert.equal(senderName('"Reading, Zack" <zack@example.com>'), "Reading, Zack");
  assert.equal(senderName("zack@example.com"), "zack@example.com");
  assert.equal(senderName(null), "");
});

test("linkParts: keeps a link's words whole and leaves the full stop out of it", () => {
  assert.deepEqual(linkParts("See https://squareup.com/i/abc123. Thanks"), [
    { type: "text", text: "See " },
    { type: "link", text: "https://squareup.com/i/abc123", href: "https://squareup.com/i/abc123" },
    { type: "text", text: ". Thanks" },
  ]);
});

test("linkParts: plain text stays one part, and only web links link", () => {
  assert.deepEqual(linkParts("Oxford leak is done."), [{ type: "text", text: "Oxford leak is done." }]);
  assert.deepEqual(linkParts("javascript:alert(1)"), [{ type: "text", text: "javascript:alert(1)" }]);
  assert.deepEqual(linkParts(""), []);
});
