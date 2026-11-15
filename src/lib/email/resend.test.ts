import test from "node:test";
import assert from "node:assert/strict";
import { parseEnv } from "@/lib/env";
import { resendBody } from "./resend";

const msg = { to: "zack@x.com", subject: "Connor updated Cabinet install", text: "Cabinet install", html: "<p>Cabinet install</p>" };
const env = { NODE_ENV: "production", RESEND_API_KEY: "re_x", EMAIL_FROM: "HG <jobs@mail.hg.com>" };

test("no EMAIL_REPLY_TO: no reply_to, so replies go to the From address", () => {
  const body = resendBody(parseEnv(env).email!, msg);
  assert.equal("reply_to" in body, false);
  assert.deepEqual(body, {
    from: "HG <jobs@mail.hg.com>",
    to: ["zack@x.com"],
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
});

test("EMAIL_REPLY_TO set: replies go there", () => {
  const body = resendBody(parseEnv({ ...env, EMAIL_REPLY_TO: "office@hg.com" }).email!, msg);
  assert.equal(body.reply_to, "office@hg.com");
  assert.equal(body.from, "HG <jobs@mail.hg.com>");
});

test("html is left out when there is none", () => {
  assert.equal("html" in resendBody({ from: "a@b.c", replyTo: null }, { to: "x@y.z", subject: "s", text: "t" }), false);
});

test("a bare EMAIL_FROM gets the company's name; one that names itself is kept", () => {
  assert.equal(resendBody({ from: "jobs@mail.hg.com", replyTo: null }, { to: "x@y.z", subject: "s", text: "t" }).from, "HG Capital Partners <jobs@mail.hg.com>");
  assert.equal(resendBody({ from: "HG <jobs@mail.hg.com>", replyTo: null }, { to: "x@y.z", subject: "s", text: "t" }).from, "HG <jobs@mail.hg.com>");
});

test("a thread key points every email for a job at one parent on the sending domain", () => {
  const body = resendBody({ from: "HG <jobs@mail.hg.com>", replyTo: null }, { to: "x@y.z", subject: "s", text: "t", threadKey: "job-t1" });
  assert.deepEqual(body.headers, { "In-Reply-To": "<job-t1@mail.hg.com>", References: "<job-t1@mail.hg.com>" });
  assert.equal("headers" in resendBody({ from: "jobs@mail.hg.com", replyTo: null }, { to: "x@y.z", subject: "s", text: "t" }), false);
});

test("an email's own reply address wins over EMAIL_REPLY_TO, and files ride along by URL", () => {
  const body = resendBody(
    { from: "HG <jobs@mail.hg.com>", replyTo: "office@hg.com" },
    { to: "x@y.z", subject: "s", text: "t", replyTo: "r+tok@mail.hg.com", attachments: [{ filename: "a.jpg", path: "https://files.example.com/a" }] },
  );
  assert.equal(body.reply_to, "r+tok@mail.hg.com");
  assert.deepEqual(body.attachments, [{ filename: "a.jpg", path: "https://files.example.com/a" }]);
  assert.equal(resendBody({ from: "a@b.c", replyTo: "office@hg.com" }, { to: "x@y.z", subject: "s", text: "t" }).reply_to, "office@hg.com");
});
