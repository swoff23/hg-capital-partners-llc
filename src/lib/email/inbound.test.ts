import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  REPLY_MAX,
  forwardFilesLine,
  forwardHeadline,
  forwardedFilesLine,
  fromAddress,
  htmlToText,
  isAutoReply,
  isOutOfOfficeReply,
  linkedFile,
  residentForwardHeadline,
  postedFilesLine,
  replyAddress,
  replyBody,
  replyToken,
  residentReplyWords,
  singleAddress,
  threadTaskId,
  verifyWebhook,
} from "./inbound";
import { updateEmail } from "@/lib/residents/emails";

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
  // One id per job since Nov 15; the older ids above still match.
  assert.equal(threadTaskId("<abc@x> <job-cmvk123@mail.hg.com>"), "cmvk123");
  // The off email's thread is its own and names no job a reply could post to.
  assert.equal(threadTaskId("<job-cmvk123-off@mail.hg.com>"), null);
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

test("the invoice inbox drops only true automatic replies, never a billing tool's invoice", () => {
  assert.equal(isOutOfOfficeReply({ "auto-submitted": "auto-replied" }, "Invoice 1043"), true);
  assert.equal(isOutOfOfficeReply({ "x-autoreply": "yes" }, "Invoice 1043"), true);
  assert.equal(isOutOfOfficeReply({}, "Out of office: back Monday"), true);
  assert.equal(isOutOfOfficeReply({}, "Undeliverable: Invoice 1043"), true);
  // QuickBooks, Square and Jobber send their invoices like this, and a Gmail filter's forward keeps the headers.
  assert.equal(isOutOfOfficeReply({ "auto-submitted": "auto-generated" }, "Invoice 1043 from Zack's Plumbing"), false);
  assert.equal(isOutOfOfficeReply({ precedence: "bulk" }, "Invoice 1043"), false);
  assert.equal(isOutOfOfficeReply({ "x-auto-response-suppress": "All" }, "Invoice 1043"), false);
  assert.equal(isOutOfOfficeReply({ "auto-submitted": "no" }, "Invoice 1043"), false);
});


// docs/specs/emails-redesign.md, section 7.

test("only a Mail Drop, iCloud Drive or Google Drive link counts as a file sent as a link", () => {
  assert.equal(linkedFile("Here it is https://www.icloud.com/attachment/?u=https%3A%2F%2Fcvws&uk=abc"), "mail-drop");
  assert.equal(linkedFile("https://icloud.com/iclouddrive/0a1b2c#Kitchen"), "icloud");
  assert.equal(linkedFile("https://drive.google.com/file/d/1AbC/view?usp=drive_web"), "drive");
  assert.equal(linkedFile("https://drive.google.com/open?id=1AbC"), "drive");
  assert.equal(linkedFile("Photos on https://www.icloud.com/photos/ and https://example.com/drive.google.com/file"), null);
  assert.equal(linkedFile("Done, see you Thursday."), null);
});

test("a reply that posted without some files says the rest posted, and only an actual oversized file is too big", () => {
  const base = { tooBig: [], tooMany: false, max: 50, linked: null } as const;
  assert.equal(postedFilesLine(base), null, "every file came through");
  assert.equal(postedFilesLine({ ...base, tooBig: ["video"] }), "Your reply posted, but your video was too big for email. Add it on the job.");
  assert.equal(postedFilesLine({ ...base, tooBig: ["image", "image"] }), "Your reply posted, but 2 photos were too big for email. Add them on the job.");
  assert.equal(postedFilesLine({ ...base, tooBig: ["video", "file"] }), "Your reply posted, but 2 files were too big for email. Add them on the job.");
  assert.equal(postedFilesLine({ ...base, tooMany: true }), "Your reply posted with its first 50 files. Add the rest on the job.");
  // A link is never "too big": it gets words for what it is.
  assert.equal(postedFilesLine({ ...base, linked: "mail-drop" }), "Your reply posted. Its iCloud link stops working in 30 days, so add the file on the job.");
  assert.equal(postedFilesLine({ ...base, linked: "icloud" }), "Your reply posted with an iCloud link. Add the file itself on the job.");
  assert.equal(postedFilesLine({ ...base, linked: "drive" }), "Your reply posted with a Drive link. Add the file itself on the job.");
  assert.match(postedFilesLine({ ...base, tooBig: ["video"], linked: "drive" }) ?? "", /too big/, "an oversized file comes first");
  // Only files, all too big: nothing posted, and the line doesn't say it did.
  assert.equal(postedFilesLine({ ...base, tooBig: ["video"], posted: false }), "Your video was too big for email. Add it on the job.");
  assert.equal(postedFilesLine({ ...base, linked: "drive", posted: false }), null);
  for (const line of [postedFilesLine({ ...base, tooBig: ["video"] }), postedFilesLine({ ...base, linked: "mail-drop" })]) {
    assert.ok((line ?? "").length <= 90, `one short line: ${line}`);
    assert.doesNotMatch(line ?? "", /\u2014/, "no em dash");
  }
});

test("files left out of a forward are said to the sender, with what to send instead", () => {
  assert.equal(forwardedFilesLine("Connor and Pieter", []), null);
  assert.equal(forwardedFilesLine("Connor and Pieter", ["video"]), "Your reply reached Connor and Pieter, but a video didn't fit in the email. Send it as an iCloud or Drive link.");
  assert.equal(forwardedFilesLine("Connor and Pieter", ["image", "image", "image"]), "Your reply reached Connor and Pieter, but 3 photos didn't fit in the email. Send them as an iCloud or Drive link.");
});

test("the forward to the partners names the contractor in full and says why it didn't post", () => {
  assert.equal(forwardHeadline("Zack Miller", "closed"), "Zack Miller replied after this closed.");
  assert.equal(forwardHeadline("Zack Miller", "off-task"), "Zack Miller replied, but they're no longer on this task.");
  assert.equal(forwardHeadline("Zack Miller", "login-off"), "Zack Miller replied, but their login is off.");
  assert.equal(forwardHeadline("Zack Miller", "old-link"), "Zack Miller replied to an old email, so it didn't post.");
  assert.equal(forwardHeadline("Zack Miller", "no-job"), "Zack Miller wrote to the jobs address. It isn't on a task.");
  assert.equal(forwardFilesLine(0, 0), null);
  assert.equal(forwardFilesLine(1, 0), "Their file is attached.");
  assert.equal(forwardFilesLine(3, 2), "Their 3 files are attached. 2 more didn't fit.");
  assert.equal(forwardFilesLine(0, 1), "Their file didn't fit in this email.");
});


test("a tenant's reply that can't post reaches the partners with why, the tenant by full name (tenant-welcome-email.md, Q2)", () => {
  assert.equal(residentForwardHeadline("Dana Lee", "no-request"), "Dana Lee replied by email. It isn't about a request.");
  assert.equal(residentForwardHeadline("Dana Lee", "closed"), "Dana Lee replied after this closed.");
  assert.equal(residentForwardHeadline("Dana Lee", "moved-out"), "Dana Lee replied after moving out.");
  assert.equal(residentForwardHeadline("Dana Lee", "files"), "Dana Lee replied with files that can't go on the request.");
});

test("a resident email's reply address is the same r+ shape, so the one parser finds its token", () => {
  const token = "a".repeat(43);
  assert.equal(replyToken([`HG Capital <${replyAddress(token, "HG Capital <jobs@mail.hg.test>")}>`]), token);
});

test("quotes in Spanish, French and Portuguese mail apps are cut like English ones", () => {
  assert.equal(replyBody("Gracias\n\nEl lun, 23 nov 2026 a las 9:31, HG Capital (<jobs@mail.hg.test>) escribió:\nScheduled"), "Gracias");
  assert.equal(replyBody("Gracias\n\nEnviado desde mi Galaxy\n\nstuff"), "Gracias");
  assert.equal(replyBody("Gracias\n\n-------- Mensaje original --------\nstuff"), "Gracias");
  assert.equal(replyBody("Gracias\n\nDe: HG Capital <jobs@mail.hg.test>\nEnviado: lunes\nstuff"), "Gracias");
  assert.equal(replyBody("Merci\n\nLe lun. 23 nov. 2026 à 09:31, HG Capital <jobs@mail.hg.test> a\u00a0écrit\u00a0:\nstuff"), "Merci");
  assert.equal(replyBody("Obrigado\n\nEm seg., 23 de nov. de 2026, HG Capital escreveu:\nstuff"), "Obrigado");
  // Words that only look like one stay.
  assert.equal(replyBody("El grifo sigue goteando.\nDe nada."), "El grifo sigue goteando.\nDe nada.");
});

test("a tenant's reply never posts their form link, whatever quoted our email (tenant-welcome-email.md, Q2)", () => {
  const ours = { appUrl: "https://hgcapitalpartners.com", addresses: ["jobs@mail.hgcapitalpartners.com"] };
  const token = "Ab3_".repeat(10) + "xyz";
  const update = updateEmail({
    whatsWrong: "Kitchen sink leaks", home: "56 Tamarack St · Upper", details: null, letUsIn: true, pets: null, petsNote: null,
    url: `https://hgcapitalpartners.com/r/${token}/req1`, closedNote: null, today: "2026-11-21", moved: false, step: "scheduled", day: "2026-11-25",
  });
  assert.ok(update.text.includes(`/r/${token}/`), "the update email carries the form link");
  // A quote header replyBody doesn't know (a made-up language), without ">" on its lines: the words stop at our email.
  const quoted = (header: string) => `Gracias, estaré en casa.\n\n${header}\n${update.text}`;
  for (const header of [
    "------ Ursprüngliche Nachricht ------\nVon: HG Capital <jobs@mail.hgcapitalpartners.com>\nBetreff: Scheduled",
    "------ Исходное сообщение ------\nОт: HG Capital\nТема: Scheduled",
  ]) {
    const words = residentReplyWords(replyBody(quoted(header)), ours);
    assert.ok(!words.includes(token) && !/\/r\/[A-Za-z0-9_-]{32,}/.test(words), header);
    assert.ok(words.startsWith("Gracias, estaré en casa."), words);
    assert.ok(!words.includes("hgcapitalpartners.com"), words);
  }
  // A link or reply address on another host, or pasted mid-sentence, is taken out; their words stay.
  assert.equal(residentReplyWords(`The link https://preview.vercel.app/r/${token}/new is broken`, ours), "The link is broken");
  assert.equal(residentReplyWords(`Write to r+${token}@mail.other.test please`, ours), "Write to please");
  // Wrapped inside another link (Outlook's Safe Links), percent-encoded, on a host that isn't ours.
  assert.equal(residentReplyWords(`See https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fpreview.vercel.app%2Fr%2F${token}%2Freq1&data=x ok`, ours), "See ok");
  assert.equal(residentReplyWords(`mailto:r%2B${token}%40mail.other.test ok`, ours), "ok");
  // On our own host the words stop there, whatever the wrapping.
  assert.equal(residentReplyWords(`Thanks\nhttps://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.hgcapitalpartners.com%2Fr%2F${token}\nmore`, ours), "Thanks");
  assert.equal(residentReplyWords("Sink still drips.\nThanks", ours), "Sink still drips.\nThanks");
  assert.equal(residentReplyWords("", ours), "");
});
