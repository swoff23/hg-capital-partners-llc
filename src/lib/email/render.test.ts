import test from "node:test";
import assert from "node:assert/strict";
import { brandTokens } from "@/lib/brand-tokens";
import { escapeHtml, escapeWithBreaks, renderJobEmail, renderPlainEmail, type JobEmailDetails, type JobEmailInput } from "./render";

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

// ---------------------------------------------------------------------------
// The job email (docs/specs/emails-redesign.md, Q3, Q4 and Q9)
// ---------------------------------------------------------------------------

const details: JobEmailDetails = {
  title: "Vanity swap",
  address: ["118 Congress St, Rear", "Buffalo, NY 14213"],
  addressLabel: true,
  dates: [
    { label: "Scheduled", value: "Wed, Nov 25" },
    { label: "Due", value: "Thu, Nov 26", changed: true },
  ],
  dayLink: { label: "Reschedule", url: "https://hg.example.com/j/tok?do=date" },
  notes: { text: "36-inch vanity.\nOld one goes to the curb.", changed: true },
  checklist: {
    items: [
      { title: "Pull the old vanity", done: false },
      { title: "Set the new one", done: true },
    ],
  },
  checklistLine: null,
  photos: [{ src: "https://hg.example.com/api/files/task/p1?v=thumb&l=tok", href: "https://hg.example.com/j/tok" }],
  morePhotos: 2,
  gettingIn: { value: "The tenant must be home", note: "Call/text them 24 hours in advance" },
};
const job: JobEmailInput = {
  preview: 'Connor: "Use the side door."',
  headline: "Connor edited the notes.",
  lines: ["Connor moved Due to Thu, Nov 26."],
  quotes: ["Use the side door."],
  quoteReply: "Reply to answer Connor.",
  primary: { label: "Start job", url: "https://hg.example.com/j/tok" },
  share: { label: "Share with crew", url: "https://hg.example.com/j/tok?do=share", icon: "https://hg.example.com/email/share.png" },
  job: details,
  footnote: "Reply to post an update or photos.",
};
const at = (html: string, s: string) => {
  const i = html.indexOf(s);
  assert.ok(i >= 0, `missing ${s}`);
  return i;
};

test("job email: the mark, the headline, the lines, the quote, one button, Share with crew, then the job with Getting in last", () => {
  const rendered = renderJobEmail(job);
  const text = rendered.text;
  // After the hidden preview line, which repeats the quote.
  const html = rendered.html.slice(rendered.html.indexOf("mso-hide:all") + 300);
  const order = [">HG Capital Partners</td>", "Connor edited the notes.", "Connor moved Due", "Use the side door.", "Reply to answer Connor.", ">Start job</a>", "Share with crew</a>", ">Vanity swap<", ">Address<", "Wed, Nov 25", "Reschedule", ">Notes<", ">Checklist<", ">Photos<", ">Getting in<", "Reply to post an update or photos."];
  const positions = order.map((s) => at(html, s));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "in that order");
  // The plain-text part, in the same order.
  const textOrder = ["HG Capital Partners", "Connor edited the notes.", "> Use the side door.", "Start job: https://hg.example.com/j/tok", "Share with crew:", "Vanity swap", "Address:", "Scheduled: Wed, Nov 25", "Due: Thu, Nov 26 (changed)", "Reschedule:", "Notes (changed):", "Checklist:", "[x] Set the new one", "Photos: 3 on the job", "Getting in:", "Reply to post an update or photos."];
  const tpos = textOrder.map((s) => at(text, s));
  assert.deepEqual([...tpos].sort((a, b) => a - b), tpos);
});

test("job email: the one-line mark has no gold rule; the account emails keep the letterhead", () => {
  const { html } = renderJobEmail(job);
  assert.ok(!html.includes(brandTokens.goldDeep), "no gold rule");
  assert.ok(html.includes("width:24px;height:24px"), "the 24px tile");
  assert.ok(html.includes("font-size:13px;line-height:20px;font-weight:600;color:"), "the name at 13px semibold");
  assert.ok(!html.includes("What&#39;s new") && !html.includes("What's new"));
  assert.ok(renderPlainEmail(input).html.includes(`border-bottom:1px solid ${brandTokens.goldDeep}`));
});

test("job email: one dark full-width button, about 46px tall; text links 44px tall and never wrapped; nothing under 13px", () => {
  const { html } = renderJobEmail({ ...job, link: { label: "Send back", url: "https://hg.example.com/tasks/t1?do=send-back" } });
  const buttons = [...html.matchAll(/<a href="[^"]+" style="display:block;text-align:center;[^"]*"/g)];
  assert.equal(buttons.length, 1);
  assert.match(buttons[0][0], /font-size:15px;line-height:20px;[^"]*padding:13px 16px/);
  const links = [...html.matchAll(/<a href="[^"]+" style="display:inline-block;padding:12px 0;font-size:15px;line-height:20px;[^"]*white-space:nowrap;"/g)];
  assert.equal(links.length, 3, "Send back, Share with crew and Reschedule");
  // Every font size in the email, but the mark's letters, is 13px or more.
  const sizes = [...html.matchAll(/font-size:(\d+)px/g)].map((m) => Number(m[1]));
  assert.deepEqual(sizes.filter((n) => n < 13), [10], "only the HG tile's letters");
  assert.ok(html.includes("-webkit-text-size-adjust:100%"));
  // The share icon is a hosted PNG with empty alt text, so the link reads "Share with crew".
  assert.match(html, /<img src="https:\/\/hg\.example\.com\/email\/share\.png" width="16" height="16" alt=""/);
  assert.ok(!html.includes("<svg"));
  // No dark-mode styles and no outline buttons.
  assert.ok(!html.includes("prefers-color-scheme") && !html.includes("<style"));
  assert.ok(!html.includes(`border:1px solid ${brandTokens.lineStrong};margin:8px`));
});

test("job email: labels over values, the changed marks, Scheduled | Due side by side, at most the photos it is given", () => {
  const { html } = renderJobEmail(job);
  assert.ok(!html.includes('width="88"'), "no 88px label column");
  assert.equal([...html.matchAll(/>changed</g)].length, 2, "Due and Notes");
  assert.match(html, /<td width="50%" valign="top" style="width:50%;">.*Scheduled.*<\/td><td width="50%" valign="top" style="width:50%;padding-left:12px;">.*Due/);
  assert.ok(html.includes('width="64" height="48"'));
  assert.ok(html.includes(">+2</span>"));
  // No green ticks: the done item's mark is muted.
  assert.ok(!html.includes(brandTokens.ok));
  assert.ok(html.includes("36-inch vanity.<br>Old one goes to the curb."));
});

test("job email: the short form is the headline and one line, no button, no job, no Share with crew", () => {
  const { html, text } = renderJobEmail({ preview: "Connor canceled this job. No need to go.", headline: "Connor canceled this job. No need to go.", lines: [], quotes: [], primary: null, job: null, short: "Vanity swap, 118 Congress St, Rear" });
  assert.equal([...html.matchAll(/<a /g)].length, 0);
  assert.ok(html.includes(">Vanity swap, 118 Congress St, Rear</td>"));
  assert.equal(text, "HG Capital Partners\n\nConnor canceled this job. No need to go.\n\nVanity swap, 118 Congress St, Rear");
});

test("job email: Review's two tiles at half the column, its note, Approve with Send back under it, a partner's details", () => {
  const { html } = renderJobEmail({
    preview: '"All set."',
    headline: "Zack Miller sent this for review.",
    lines: [],
    quotes: ["All set."],
    tiles: [
      { src: "https://hg.example.com/api/files/task/a?v=thumb&l=t", href: "https://hg.example.com/tasks/t1" },
      { src: "https://hg.example.com/api/files/task/b?v=thumb&l=t", href: "https://hg.example.com/tasks/t1" },
    ],
    tilesNote: "+3 more · Checklist 3 of 3 done",
    primary: { label: "Approve", url: "https://hg.example.com/tasks/t1?do=approve" },
    link: { label: "Send back", url: "https://hg.example.com/tasks/t1?do=send-back" },
    job: { ...details, address: ["118 Congress St, Rear"], addressLabel: false, dayLink: null, notes: null, checklist: null, photos: [], morePhotos: 0, gettingIn: null, dates: [{ label: "Due", value: "Thu, Nov 26" }, { label: "Scheduled", value: "Wed, Nov 25" }] },
    footnote: "Reply to answer Zack Miller.",
  });
  assert.equal([...html.matchAll(/<td width="50%" valign="top" style="width:50%;padding-(right|left):4px;">/g)].length, 2);
  assert.ok(at(html, "+3 more · Checklist 3 of 3 done") < at(html, ">Approve</a>"));
  assert.ok(at(html, ">Approve</a>") < at(html, ">Send back</a>"));
  assert.ok(!html.includes(">Address<"), "a partner's street sits under the title");
  assert.ok(at(html, ">Due<") < at(html, ">Scheduled<"));
});

test("job email: user text is escaped, quotes keep their breaks, every link is http(s), and colors are brand tokens", () => {
  const { html } = renderJobEmail({ ...job, headline: "Fix <b>it</b>", quotes: ['He said "hi"\nthen <i>left</i>'] });
  assert.ok(html.includes("Fix &lt;b&gt;it&lt;/b&gt;"));
  assert.ok(html.includes("He said &quot;hi&quot;<br>then &lt;i&gt;left&lt;/i&gt;"));
  assert.throws(() => renderJobEmail({ ...job, primary: { label: "x", url: "javascript:alert(1)" } }));
  assert.throws(() => renderJobEmail({ ...job, share: { label: "x", url: "https://hg.example.com", icon: "data:image/png;base64,AA" } }));
  const allowed = new Set(Object.values(brandTokens).map((v) => v.toLowerCase()));
  const used = [...html.matchAll(/(?<!&)#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase());
  assert.ok(used.length > 0);
  assert.deepEqual(used.filter((c) => !allowed.has(c)), []);
});

test("job email: the preview line is hidden at the very top of the body, and the column is 480 wide", () => {
  const { html } = renderJobEmail(job);
  const body = html.slice(html.indexOf("<body"));
  assert.match(body, /^<body[^>]*>\n<div style="display:none;[^"]*">Connor: &quot;Use the side door.&quot;/);
  assert.ok(html.includes("max-width:480px"));
  assert.ok(html.includes("padding:16px;"), "16px around the card");
  assert.ok(html.includes("padding:20px 24px 24px;"), "24px inside it: 238px of content at 320");
});
