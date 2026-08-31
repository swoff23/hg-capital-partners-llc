import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { decryptSecret, encryptSecret, QboCryptoError, _resetKeyCache } from "./crypto";

process.env.QBO_TOKEN_SECRET = crypto.randomBytes(32).toString("base64");
_resetKeyCache();

test("round-trips a token", () => {
  const token = "AB11" + crypto.randomBytes(40).toString("hex");
  assert.equal(decryptSecret(encryptSecret(token)), token);
});

test("ciphertext is non-deterministic (random IV) but both decrypt", () => {
  const a = encryptSecret("same");
  const b = encryptSecret("same");
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), "same");
  assert.equal(decryptSecret(b), "same");
});

test("tampered ciphertext throws QboCryptoError, never returns garbage", () => {
  const ct = encryptSecret("secret");
  const buf = Buffer.from(ct, "base64");
  buf[buf.length - 1] ^= 0xff; // flip a ciphertext byte
  assert.throws(() => decryptSecret(buf.toString("base64")), QboCryptoError);
});

test("wrong key throws", () => {
  const ct = encryptSecret("secret");
  process.env.QBO_TOKEN_SECRET = crypto.randomBytes(32).toString("base64");
  _resetKeyCache();
  assert.throws(() => decryptSecret(ct), QboCryptoError);
});

test("a bad key length is rejected", () => {
  process.env.QBO_TOKEN_SECRET = Buffer.from("too short").toString("base64");
  _resetKeyCache();
  assert.throws(() => encryptSecret("x"), QboCryptoError);
});
