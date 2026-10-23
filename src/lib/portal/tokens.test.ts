import test from "node:test";
import assert from "node:assert/strict";
import {
  STARTING_PASSWORD_ALPHABET,
  generateStartingPassword,
  hashToken,
  isWellFormedToken,
  keyedHash,
  newToken,
} from "./tokens";

test("new tokens are 32 random bytes in base64url", () => {
  const a = newToken();
  const b = newToken();
  assert.equal(a.length, 43);
  assert.equal(Buffer.from(a, "base64url").length, 32);
  assert.notEqual(a, b);
  assert.ok(isWellFormedToken(a));
});

test("only tokens of our shape pass the shape check", () => {
  assert.equal(isWellFormedToken(undefined), false);
  assert.equal(isWellFormedToken(""), false);
  assert.equal(isWellFormedToken("a".repeat(42)), false);
  assert.equal(isWellFormedToken("a".repeat(44)), false);
  assert.equal(isWellFormedToken("a".repeat(42) + "="), false);
  assert.equal(isWellFormedToken("a".repeat(42) + "/"), false);
  assert.equal(isWellFormedToken("A-_".repeat(14) + "z"), true);
});

test("token hashes are SHA-256 hex and never the token itself", () => {
  const t = newToken();
  const h = hashToken(t);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, hashToken(t), "stable");
  assert.notEqual(h, hashToken(newToken()));
  assert.ok(!h.includes(t));
  // Known vector, so a change of algorithm can't slip through.
  assert.equal(hashToken("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("keyed hashes depend on the secret and the purpose", () => {
  const ip = "203.0.113.7";
  assert.equal(keyedHash("ip", ip, "s1"), keyedHash("ip", ip, "s1"));
  assert.notEqual(keyedHash("ip", ip, "s1"), keyedHash("ip", ip, "s2"));
  assert.notEqual(keyedHash("ip", ip, "s1"), keyedHash("email", ip, "s1"));
  assert.match(keyedHash("email", "a@b.c", "s"), /^[0-9a-f]{64}$/);
});

test("starting passwords are readable: three groups of four, no look-alikes", () => {
  for (let i = 0; i < 50; i++) {
    const p = generateStartingPassword();
    assert.match(p, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    assert.ok(p.length >= 12);
    assert.ok(![..."01ilo"].some((c) => p.includes(c)), p);
  }
});

test("starting passwords draw every character from the alphabet", () => {
  let n = 0;
  const p = generateStartingPassword(() => n++ % STARTING_PASSWORD_ALPHABET.length);
  assert.equal(p, "abcd-efgh-jkmn");
});
