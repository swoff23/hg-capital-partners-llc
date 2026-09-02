import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./password";

test("hash round-trips and is salted", async () => {
  const a = await hashPassword("correct horse");
  const b = await hashPassword("correct horse");
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{32}\.[0-9a-f]{128}$/);
  assert.equal(await verifyPassword("correct horse", a), true);
  assert.equal(await verifyPassword("correct horse", b), true);
});

test("wrong password, missing hash, and malformed hash all fail", async () => {
  const h = await hashPassword("pw");
  assert.equal(await verifyPassword("pw ", h), false);
  assert.equal(await verifyPassword("PW", h), false);
  assert.equal(await verifyPassword("pw", null), false);
  assert.equal(await verifyPassword("pw", undefined), false);
  assert.equal(await verifyPassword("pw", ""), false);
  assert.equal(await verifyPassword("pw", "nodot"), false);
  assert.equal(await verifyPassword("pw", "abc.zz"), false);
});
