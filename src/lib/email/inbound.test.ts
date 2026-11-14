import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { REPLY_MAX, fromAddress, htmlToText, isAutoReply, replyAddress, replyBody, replyToken, singleAddress, threadTaskId, verifyWebhook } from "./inbound";

const secretBytes = crypto.randomBytes(24);
const secret = `whsec_${secretBytes.toString("base64")}`;
const sign = (id: string, ts: string, body: string, key = secretBytes) =>
  `v1,${crypto.createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;

test("a webhook verifies only with its own secret, body and a fresh timestamp", () => {
  const now = new Date("2026-11-14T16:00:00Z");
  const ts = String(Math.floor(now.getTime() / 1000));
  const body = '{"type":"email.received"}';
  const good = { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) };
  assert.equal(verifyWebhook(body, good, secret, now), true);
  // Any one of several signatures may match.
  assert.equal(verifyWebhook(body, { ...good, signature: `v1,AAAA ${good.signature}` }, secret, now), true);
  assert.equal(verifyWebhook(`${body} `, good, secret, now), false, "a changed body");
  assert.equal(verifyWebhook(body, { ...good, id: "msg_2" }, secret, now), false, "another message's id");
  assert.equal(verifyWebhook(body, good, `whsec_${crypto.randomBytes(24).toString("base64")}`, now), false, "another secret");
  assert.equal(verifyWebhook(body, good, secret, new Date(now.getTime() + 6 * 60_000)), false, "too old");
  assert.equal(verifyWebhook(body, { ...good, signature: null }, secret, now), false);
  assert.equal(verifyWebhook(body, { ...good, signature: good.signature.replace("v1,", "v2,") }, secret, now), false);
});

test("a reply finds its job by the r+ address, or by the thread it answers", () => {
  const T = "a".repeat(20) + "_-" + "b".repeat(21);
  assert.equal(replyToken([`Jobs <r+${T}@mail.hg.com>`]), T);
  assert.equal(replyToken(["jobs@mail.hg.com", `R+${T}@mail.hg.com`]), T);
  assert.equal(replyToken(["jobs@mail.hg.com", "r+short@mail.hg.com"]), null);
  assert.equal(replyAddress(T, "HG Capital Partners <jobs@mail.hg.com>"), `r+${T}@mail.hg.com`);
  assert.equal(threadTaskId("<abc@x> <job-cmvk123-2026-11-23@mail.hg.com>"), "cmvk123");
  assert.equal(threadTaskId("<job-cmvk123-none@mail.hg.com>"), "cmvk123");
  assert.equal(threadTaskId("<something@else>"), null);
  assert.equal(threadTaskId(null), null);
});

test("a reply is cut to what the person wrote", () => {
  const gmail = "Done, no leaks.\nPhotos attached.\n\nOn Mon, Nov 23, 2026 at 9:31 AM HG Capital Partners <jobs@mail.hg.com> wrote:\n> What's new\n> Connor moved the due date";
  assert.equal(replyBody(gmail), "Done, no leaks.\nPhotos attached.");
  const wrapped = "Be there at 9\n\nOn Mon, Nov 23, 2026 at 9:31 AM HG Capital Partners <\njobs@mail.hg.com> wrote:\n\n> stuff";
  assert.equal(replyBody(wrapped), "Be there at 9");
  const iphone = "Tenant can do Monday\n\nSent from my iPhone\n\n> On Nov 23, 2026, at 9:31 AM, HG wrote:";
  assert.equal(replyBody(iphone), "Tenant can do Monday");
  const outlook = "Invoice attached.\r\n\r\n________________________________\r\nFrom: HG Capital Partners <jobs@mail.hg.com>\r\nSent: Monday\r\n";
  assert.equal(replyBody(outlook), "Invoice attached.");
  assert.equal(replyBody("Thanks\n-- \nZack Reading\nOutlaw Carpentry"), "Thanks");
  // Words that only look like a quote's start stay.
  assert.equal(replyBody("On it, there Monday.\nOn the way."), "On it, there Monday.\nOn the way.");
  // Nothing written: empty, so photos post alone.
  assert.equal(replyBody("\n\nSent from my iPhone"), "");
  assert.equal(replyBody("a\n\n\n\nb"), "a\n\nb");
  assert.ok(replyBody("x".repeat(REPLY_MAX + 50)).length <= REPLY_MAX);
});

test("HTML-only replies read as text, quoted blocks left out", () => {
  assert.equal(htmlToText("<div>Done &amp; dusted<br>see photos</div><blockquote>old email</blockquote>").trim(), "Done & dusted\nsee photos");
});

test("out-of-office notices, lists and delivery reports never post", () => {
  assert.equal(isAutoReply({ "auto-submitted": "auto-replied" }, "Re: Due Mon"), true);
  assert.equal(isAutoReply({ "auto-submitted": "no" }, "Re: Due Mon"), false);
  assert.equal(isAutoReply({ precedence: "bulk" }, "x"), true);
  assert.equal(isAutoReply({}, "Out of Office: Zack Reading"), true);
  assert.equal(isAutoReply({}, "Automatic reply: Due Mon, Nov 23"), true);
  assert.equal(isAutoReply({}, "Re: Due Mon, Nov 23: Replace kitchen faucet"), false);
});

test("the sender is the address at the end of the From line, never one a display name holds", () => {
  assert.equal(fromAddress("Zack Reading <Zack@OutlawCarpentry.com>"), "zack@outlawcarpentry.com");
  assert.equal(fromAddress("zack@outlawcarpentry.com"), "zack@outlawcarpentry.com");
  assert.equal(fromAddress('"<pieter@hg.com>" <attacker@evil.example>'), "attacker@evil.example");
  assert.equal(singleAddress("Zack <zack@x.com>"), true);
  assert.equal(singleAddress('"pieter@hg.com" <attacker@evil.example>'), false);
  assert.equal(singleAddress(null), false);
});

test("From lines with a comment or the same address twice still read as that one sender", () => {
  assert.equal(fromAddress("zack@x.com (Zack Reading)"), "zack@x.com");
  assert.equal(singleAddress("zack@x.com (Zack Reading)"), true);
  assert.equal(singleAddress('"zack@x.com" <zack@x.com>'), true);
  assert.equal(singleAddress("<a@x.com>, <b@x.com>"), false);
});

test("an @ the address pattern can't place makes the line more than one address", () => {
  assert.equal(singleAddress('"a b"@evil.com, <pieter@hg.com>'), false);
  assert.equal(singleAddress("attacker(c)@evil.com, <pieter@hg.com>"), false);
  assert.equal(singleAddress("attacker @evil.com, <pieter@hg.com>"), false);
});
