import test from "node:test";
import assert from "node:assert/strict";
import { firstName, loginTextBody, smsHref } from "./login-text";

test("firstName takes the first word, before any company in parentheses", () => {
  assert.equal(firstName("Zack Reading"), "Zack");
  assert.equal(firstName("Zack(Outlaw Carpentry)"), "Zack");
  assert.equal(firstName(" Jacob "), "Jacob");
  assert.equal(firstName(null), "");
});

test("firstName uses the nickname someone goes by, never a company", () => {
  assert.equal(firstName("Jacob (Jake) hoak"), "Jake");
  assert.equal(firstName("Jacob(Jake) Hoak"), "Jake");
  // A company in parentheses, at the end or as more than one word, isn't a nickname.
  assert.equal(firstName("Zack (Outlaw)"), "Zack");
  assert.equal(firstName("Zack (Outlaw Carpentry) Reading"), "Zack");
  assert.equal(firstName("Mike Morris (Freedom Electric)"), "Mike");
});

test("the login text has the link, email and starting password, from the staff member", () => {
  const body = loginTextBody({
    contactName: "Zack Reading",
    staffName: "Connor Swofford",
    appUrl: "https://hgcapitalpartners.com/",
    email: "zack@example.com",
    password: "maple-river-42",
  });
  assert.equal(
    body,
    "Hi Zack, it's Connor. Your HG jobs: https://hgcapitalpartners.com/login. Email: zack@example.com. Starting password: maple-river-42. You'll pick your own when you sign in.",
  );
  assert.ok(!body.includes("—"));
});

test("smsHref keeps only the number's digits and encodes the body", () => {
  assert.equal(smsHref("+1 (716) 555-1234", "Hi & bye"), "sms:+17165551234?&body=Hi%20%26%20bye");
  assert.equal(smsHref("716.555.1234", "x"), "sms:7165551234?&body=x");
  assert.equal(smsHref(null, "x"), "sms:?&body=x");
  assert.equal(smsHref("+", "x"), "sms:?&body=x");
});
