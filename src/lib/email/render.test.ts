import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, renderPlainEmail } from "./render";

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

test("escapeHtml covers the five specials", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});
