import test from "node:test";
import assert from "node:assert/strict";
import { brandTokens } from "@/lib/brand-tokens";
import { escapeHtml, escapeWithBreaks, renderPlainEmail } from "./render";

const input = {
  line: "Choose a new password for your HG jobs login.",
  buttonLabel: "Choose a new password",
  buttonUrl: "https://hg.example.com/login/reset?token=abc_DEF-123",
};

test("text version carries the brand, the line and the link", () => {
  const { text } = renderPlainEmail(input);
  assert.match(text, /^HG Capital Partners\n/);
  assert.ok(text.includes(input.line));
  assert.ok(text.includes(`Choose a new password: ${input.buttonUrl}`));
});

test("html version has exactly one button pointing at the link", () => {
  const { html } = renderPlainEmail(input);
  const links = [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(links, [input.buttonUrl]);
  assert.ok(html.includes(">Choose a new password</a>"));
});

test("html declares its charset and a phone-width viewport, before the body", () => {
  const { html } = renderPlainEmail(input);
  const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
  assert.ok(html.indexOf("</head>") < html.indexOf("<body"));
  assert.ok(head.includes('<meta charset="utf-8">'));
  assert.ok(head.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
});

test("user-supplied text is escaped in html", () => {
  const { html } = renderPlainEmail({ ...input, line: `Fix <script>alert("x")</script> & go` });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Fix &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; go"));
});

test("footnote is optional", () => {
  assert.ok(!renderPlainEmail(input).text.includes("ignore"));
  const withNote = renderPlainEmail({ ...input, footnote: "Didn't ask for this? You can ignore it." });
  assert.ok(withNote.text.endsWith("Didn't ask for this? You can ignore it."));
  assert.ok(withNote.html.includes("Didn&#39;t ask for this? You can ignore it."));
});

test("non-http links are refused", () => {
  assert.throws(() => renderPlainEmail({ ...input, buttonUrl: "javascript:alert(1)" }));
  assert.throws(() => renderPlainEmail({ ...input, buttonUrl: "not a url" }));
});

test("item lines sit between the line and the button, escaped, still one button", () => {
  const items = ['Zack: "Uppers in" <b>', "Zack marked it done"];
  const { text, html } = renderPlainEmail({ ...input, items });
  assert.ok(text.includes(`${input.line}\n\n${items[0]}\n${items[1]}\n\n${input.buttonLabel}:`));
  assert.ok(html.includes("Zack: &quot;Uppers in&quot; &lt;b&gt;"));
  assert.ok(html.indexOf("Zack marked it done") < html.indexOf("<a href="));
  assert.equal([...html.matchAll(/<a href="/g)].length, 1);
  assert.equal(renderPlainEmail({ ...input, items: [] }).text, renderPlainEmail(input).text);
});

test("a closing line sits after the items and before the button, escaped", () => {
  const items = ["Pieter approved it"];
  const { text, html } = renderPlainEmail({ ...input, items, closing: "Thanks, <Zack>." });
  assert.ok(text.includes(`${items[0]}\n\nThanks, <Zack>.\n\n${input.buttonLabel}:`));
  assert.ok(html.indexOf("Pieter approved it") < html.indexOf("Thanks, &lt;Zack&gt;."));
  assert.ok(html.indexOf("Thanks, &lt;Zack&gt;.") < html.indexOf("<a href="));
  assert.equal(renderPlainEmail({ ...input, items }).text.includes("Thanks"), false);
});

test("escapeHtml covers the five specials", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

test("a comment's line breaks come through in the html as breaks, after the text is escaped", () => {
  const { html, text } = renderPlainEmail({ ...input, items: ['Zack: "Doors are in.\n\nTrim <b>needs</b> a coat.\r\nFriday?"'] });
  assert.ok(html.includes("Zack: &quot;Doors are in.<br><br>Trim &lt;b&gt;needs&lt;/b&gt; a coat.<br>Friday?&quot;"));
  assert.ok(!html.includes("<b>"), "the break is the only markup that gets in");
  // The text version keeps its newlines as they are.
  assert.ok(text.includes('Zack: "Doors are in.\n\nTrim <b>needs</b> a coat.'));
  assert.equal(escapeWithBreaks("a\nb\r\nc\rd"), "a<br>b<br>c<br>d");
});

test("every other byte of the email is the same when no line has a break", () => {
  const plain = { ...input, items: ["Zack started the job", 'Zack: "Uppers in" (2 photos)'], closing: "Thanks, Zack.", footnote: "Reply in the job." };
  const { html } = renderPlainEmail(plain);
  assert.ok(!html.includes("<br"));
  assert.ok(html.includes(`color:${brandTokens.fg2};">Zack started the job</td></tr>\n`));
  assert.equal(escapeWithBreaks(`Fix & "go" 'now'`), escapeHtml(`Fix & "go" 'now'`));
});

test("every color in the html is a brand token", () => {
  const { html } = renderPlainEmail({ ...input, items: ["One"], closing: "Thanks.", footnote: "Small print." });
  const allowed = new Set(Object.values(brandTokens).map((v) => v.toLowerCase()));
  const used = [...html.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase());
  assert.ok(used.length > 0);
  assert.deepEqual(used.filter((c) => !allowed.has(c)), []);
});

test("the letterhead is the HG tile and the company name over a gold-deep rule", () => {
  const { html } = renderPlainEmail(input);
  assert.ok(html.includes(`background:${brandTokens.inkTile}`));
  assert.ok(html.includes(">HG</td>"));
  assert.ok(html.includes(">HG Capital Partners</td>"));
  assert.ok(html.includes(`border-bottom:1px solid ${brandTokens.goldDeep}`));
  assert.ok(html.indexOf("HG Capital Partners") < html.indexOf(input.line));
});
