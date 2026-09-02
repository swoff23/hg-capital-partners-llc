import test from "node:test";
import assert from "node:assert/strict";
import { addressKey, normalizeAddress, shortAddress } from "./normalize";

test("normalizeAddress: lowercase, common street words, punctuation, whitespace", () => {
  assert.equal(normalizeAddress("725 Linwood Avenue, Buffalo, NY 14209"), "725 linwood ave buffalo ny 14209");
  assert.equal(normalizeAddress("118 Congress St.\nBuffalo"), "118 congress st buffalo");
  assert.equal(normalizeAddress("  23  Sherwood   Drive "), "23 sherwood dr");
  assert.equal(normalizeAddress("Apt #2, 15 Oxford Road"), "apt 2 15 oxford rd");
  assert.equal(normalizeAddress(null), "");
  assert.equal(normalizeAddress(""), "");
});

test("addressKey: leading number + street word; combined numbers keep the first", () => {
  assert.equal(addressKey("725 Linwood Avenue, Buffalo, NY 14209"), "725 linwood");
  assert.equal(addressKey("HGC 725 Linwood"), "hgc 725"); // no leading number -> first two tokens
  assert.equal(addressKey("765/767 Prospect Ave"), "765 prospect");
  assert.equal(addressKey("58 Mariner St"), "58 mariner");
  assert.equal(addressKey("15a Oxford"), "15a oxford");
  assert.equal(addressKey(""), "");
});

test("shortAddress strips the city/state tail", () => {
  assert.equal(shortAddress("725 Linwood Avenue, Buffalo, NY 14209"), "725 Linwood Avenue");
  assert.equal(shortAddress("118 Congress St Buffalo NY 14213"), "118 Congress St");
  assert.equal(shortAddress("58 Mariner St"), "58 Mariner St");
  assert.equal(shortAddress(null), "");
});
