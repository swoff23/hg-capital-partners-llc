import test from "node:test";
import assert from "node:assert/strict";
import { brandTokens } from "@/lib/brand-tokens";
import { escapeHtml, escapeWithBreaks, renderJobEmail, renderPlainEmail } from "./render";

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

const job = {
  preview: 'Connor moved the due date to Mon, Nov 23. Connor: "Faucet\'s in the garage."',
  headline: "Connor moved the due date to Mon, Nov 23.",
  lines: ['Connor: "Faucet\'s in the garage."'],
  primary: { label: "Start job", url: "https://hg.example.com/p/jobs/t1" },
  secondary: [{ label: "Add photos", url: "https://hg.example.com/p/jobs/t1" }],
  job: {
    title: "Replace kitchen faucet",
    where: "118 Congress St · Rear",
    directionsUrl: "https://maps.apple.com/?daddr=118%20Congress%20St",
    photoUrl: "https://blob.example.com/front.jpg",
    due: "Mon, Nov 23",
    notes: "New faucet is in the garage.\nShut-off sticks.",
    checklist: [
      { title: "Swap faucet", done: false },
      { title: "Check for leaks", done: true },
    ],
    contractor: null,
    checklistLine: null,
  },
  footnote: "Reply in the job so Connor and Pieter both see it.",
};

test("job email: What's new, then the buttons, then the job, in that order", () => {
  const rendered = renderJobEmail(job);
  const { text } = rendered;
  // After the hidden preview line, which repeats What's new.
  const html = rendered.html.slice(rendered.html.indexOf("<table"));
  const order = ["What's new", job.headline, "Faucet&#39;s in the garage", ">Start job</a>", ">Add photos</a>", "The job", 'src="https://blob.example.com/front.jpg"', "Replace kitchen faucet", ">Directions</a>", "Mon, Nov 23</td>", "Shut-off sticks", "Check for leaks", job.footnote];
  const at = order.map((s) => html.indexOf(s));
  assert.ok(at.every((i) => i >= 0), `missing: ${order.filter((_, i) => at[i] < 0).join(", ")}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at);
  assert.ok(text.indexOf("What's new") < text.indexOf("Start job: https://hg.example.com/p/jobs/t1"));
  assert.ok(text.indexOf("Add photos: https://hg.example.com/p/jobs/t1") < text.indexOf("The job"));
  assert.ok(text.includes("Notes:\nNew faucet is in the garage.\nShut-off sticks."));
  assert.ok(text.includes("[ ] Swap faucet\n[x] Check for leaks"));
});

test("job email: the preview line is hidden at the very top of the body", () => {
  const { html } = renderJobEmail(job);
  const body = html.slice(html.indexOf("<body"));
  const hidden = body.indexOf('<div style="display:none;');
  assert.ok(hidden > 0 && hidden < body.indexOf("<table"));
  assert.ok(body.includes("Connor moved the due date to Mon, Nov 23. Connor: &quot;Faucet&#39;s in the garage.&quot;"));
});

test("job email: what isn't there isn't drawn, and every link is http(s)", () => {
  const bare = renderJobEmail({ ...job, secondary: [], footnote: undefined, job: { ...job.job, photoUrl: null, directionsUrl: null, due: null, notes: null, checklist: [] } });
  assert.ok(!bare.html.includes("<img"));
  assert.ok(!bare.html.includes("Directions"));
  assert.ok(!bare.html.includes(">Due<"));
  assert.equal([...bare.html.matchAll(/<a href="/g)].length, 1);
  assert.throws(() => renderJobEmail({ ...job, primary: { label: "x", url: "javascript:alert(1)" } }));
  assert.throws(() => renderJobEmail({ ...job, job: { ...job.job, photoUrl: "data:image/png;base64,AAAA" } }));
});

test("job email: a partner's copy names the contractor and the checklist's progress", () => {
  const { html } = renderJobEmail({ ...job, job: { ...job.job, notes: null, checklist: [], contractor: "Zack Smith", checklistLine: "1 of 2 done" } });
  assert.ok(html.indexOf(">Contractor<") < html.indexOf("Zack Smith"));
  assert.ok(html.includes("1 of 2 done"));
});

test("job email: user text is escaped, comments keep their breaks, and colors are brand tokens", () => {
  const { html } = renderJobEmail({ ...job, headline: 'Zack: "<b>Done</b>\nall set"', job: { ...job.job, title: "Fix <script>" } });
  assert.ok(!html.includes("<script>") && !html.includes("<b>Done"));
  assert.ok(html.includes("Zack: &quot;&lt;b&gt;Done&lt;/b&gt;<br>all set&quot;"));
  const hexes = new Set([...html.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()));
  const tokens = new Set(Object.values(brandTokens).map((v) => String(v).toLowerCase()));
  for (const hex of hexes) assert.ok(tokens.has(hex), `${hex} is not a brand token`);
});

test("job email: photo strips link each thumbnail, Due carries Add to calendar, and Access says Show access", () => {
  const T = "https://hg.example.com/j/tok";
  const { html, text } = renderJobEmail({
    ...job,
    photos: [{ src: "https://hg.example.com/api/files/task/p1?v=thumb&l=tok", href: T }],
    morePhotos: 3,
    job: {
      ...job.job,
      calendarUrl: `${T}/calendar`,
      accessUrl: `${T}?do=access`,
      photos: [{ src: "https://hg.example.com/api/files/task/h1?v=thumb&l=tok", href: T }],
      morePhotos: 0,
    },
  });
  assert.ok(html.includes(`<a href="${T}" style="display:inline-block;margin:0 6px 6px 0;text-decoration:none;"><img src="https://hg.example.com/api/files/task/p1?v=thumb&amp;l=tok"`));
  assert.ok(html.includes(">+3</span>"));
  assert.ok(html.indexOf(">Add to calendar</a>") > html.indexOf("Mon, Nov 23"));
  assert.ok(html.includes(`href="${T}?do=access"`) && html.includes(">Show access</a>"));
  assert.ok(html.indexOf("api/files/task/h1") > html.indexOf(">Photos<"));
  assert.ok(text.includes(`Add to calendar: ${T}/calendar`));
  assert.ok(text.includes(`Show access: ${T}?do=access`));
  // The photos' lines never put a thumbnail's own URL in the text.
  assert.ok(!text.includes("v=thumb"));
});

test("job email: an email with nothing to do has no buttons, and the Scheduled row can offer Change day", () => {
  const off = renderJobEmail({ ...job, primary: null, secondary: [], footnote: undefined });
  assert.equal([...off.html.matchAll(/<a href="/g)].length, 1, "only Directions");
  assert.ok(!off.text.includes("Start job"));
  const url = "https://hg.example.com/j/tok?do=date";
  // No scheduled day yet: the row reads "Not set" and offers Schedule.
  const open = renderJobEmail({ ...job, job: { ...job.job, dateUrl: url } });
  assert.ok(open.html.includes(">Schedule</a>"));
  assert.ok(open.text.includes(`Schedule: ${url}`));
  assert.ok(open.text.includes("Not set"));
  // With a day, the same link reads Change day and sits in the Scheduled row, not the Due row.
  const dated = renderJobEmail({ ...job, job: { ...job.job, scheduled: "Thu, Oct 29", dateUrl: url } });
  assert.ok(dated.html.includes(">Change day</a>"));
  assert.ok(dated.text.includes(`Change day: ${url}`));
  assert.ok(dated.text.indexOf("Change day") > dated.text.indexOf("Scheduled"));
});
