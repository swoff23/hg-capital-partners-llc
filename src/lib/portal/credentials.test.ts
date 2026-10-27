import test from "node:test";
import assert from "node:assert/strict";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_MESSAGES,
  checkNewPassword,
  isPasswordProblem,
  isStartingPasswordTry,
  looksLikeEmail,
  normalizeEmail,
  readResetForm,
} from "./credentials";

test("minimum length is 10, counted without surrounding spaces", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 10);
  assert.equal(checkNewPassword("short1234"), "short");
  assert.equal(checkNewPassword("   abcdefgh   "), "short");
  assert.equal(checkNewPassword("plumbing42"), null);
});

test("very long passwords are refused", () => {
  assert.equal(checkNewPassword("ab3".repeat(67)), "long");
  assert.equal(checkNewPassword("ab3d".repeat(50)), null);
});

test("one or two repeated characters are too simple", () => {
  assert.equal(checkNewPassword("aaaaaaaaaa"), "simple");
  assert.equal(checkNewPassword("1212121212"), "simple");
  assert.equal(checkNewPassword("AaAaAaAaAa"), "simple", "case doesn't add variety");
  assert.equal(checkNewPassword("abcabcabca"), "simple");
  assert.equal(checkNewPassword("abcdabcdab"), null);
});

test("the account's email, or its name part, is refused", () => {
  const email = "zack.builder@example.com";
  assert.equal(checkNewPassword("Zack.Builder@example.com", { email }), "email");
  assert.equal(checkNewPassword("zack.builder", { email }), "email");
  assert.equal(checkNewPassword("zack.builder.2026", { email }), null);
});

test("the password being replaced is refused", () => {
  assert.equal(checkNewPassword("k7mq-4vxp-2hzt", { current: "k7mq-4vxp-2hzt" }), "same");
  assert.equal(checkNewPassword("my own words 9", { current: "k7mq-4vxp-2hzt" }), null);
});

test("confirmation must match", () => {
  assert.equal(checkNewPassword("plumbing42", { confirm: "plumbing43" }), "mismatch");
  assert.equal(checkNewPassword("plumbing42", { confirm: "plumbing42" }), null);
});

test("every problem has a one-line message without em dashes", () => {
  for (const [code, msg] of Object.entries(PASSWORD_MESSAGES)) {
    assert.ok(isPasswordProblem(code));
    assert.ok(msg.length < 60, code);
    assert.ok(!msg.includes("—"), code);
  }
  assert.equal(isPasswordProblem("toString"), false);
  assert.equal(isPasswordProblem(undefined), false);
});

test("emails are trimmed and lowercased, and loosely shape-checked", () => {
  assert.equal(normalizeEmail("  Zack@Example.COM "), "zack@example.com");
  assert.equal(looksLikeEmail("zack@example.com"), true);
  assert.equal(looksLikeEmail("zack@example"), false);
  assert.equal(looksLikeEmail("zack example@x.com"), false);
  assert.equal(looksLikeEmail("@example.com"), false);
  assert.equal(looksLikeEmail(""), false);
});

test("an empty starting password is no try, so it never spends a strike", () => {
  assert.equal(isStartingPasswordTry(""), false);
  assert.equal(isStartingPasswordTry("k7mq-4vxp-2hzt"), true);
  // Anything typed is a try, even spaces: the throttle counts it.
  assert.equal(isStartingPasswordTry(" "), true);
});

test("the reset form's one password is its own confirmation", () => {
  const post = (fields: Record<string, string>) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return readResetForm(form);
  };
  // No confirm field, as the form sends now.
  assert.deepEqual(post({ token: "t", password: "plumbing42" }), { token: "t", password: "plumbing42", confirm: "plumbing42" });
  // The old server-rendered confirm="" (a submit before hydration) must not read as a second, different password.
  const early = post({ token: "t", password: "plumbing42", confirm: "" });
  assert.equal(checkNewPassword(early.password, { confirm: early.confirm }), null);
  // A confirm that is there and different is still a mismatch.
  const typo = post({ token: "t", password: "plumbing42", confirm: "plumbing43" });
  assert.equal(checkNewPassword(typo.password, { confirm: typo.confirm }), "mismatch");
  // Nothing sent at all: empty strings, which the strength check then refuses as short.
  const none = post({});
  assert.deepEqual(none, { token: "", password: "", confirm: "" });
  assert.equal(checkNewPassword(none.password, { confirm: none.confirm }), "short");
});
