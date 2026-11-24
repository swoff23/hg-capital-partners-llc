import test from "node:test";
import assert from "node:assert/strict";
import { ADDED_TO_INVOICES, closedReplyItems } from "@/lib/email/inbound";
import type { ReceivedAttachment } from "@/lib/email/received";
import {
  INVOICE_EMAILS_PER_DAY,
  INVOICE_EMAILS_PER_SENDER,
  INVOICE_EMAIL_MAX_FILES,
  htmlLinks,
  invoiceAttachments,
  JOB_LINK_MASK,
  REPLY_ADDRESS_MASK,
  invoiceEmailText,
  isPartnerLine,
  overInvoiceCap,
  replyMakesInvoice,
} from "./inbound";

function att(over: Partial<ReceivedAttachment>): ReceivedAttachment {
  return { id: "a1", filename: "bill.pdf", size: 120_000, content_type: "application/pdf", content_disposition: "attachment", content_id: null, download_url: "https://x/a1", ...over };
}

test("an invoice keeps the whole body, the forwarded part included", () => {
  const text = "FYI\n\n---------- Forwarded message ---------\nFrom: Zack <zack@gmail.com>\n\nInvoice #1043\nTotal $850.00\r\n";
  const kept = invoiceEmailText(text, null)!;
  assert.match(kept, /Forwarded message/);
  assert.match(kept, /Invoice #1043\nTotal \$850\.00$/);
});

test("links the HTML held are kept when the text lost them", () => {
  const html = '<p>Hi</p><a href="https://squareup.com/pay-invoice/abc?x=1&amp;y=2">View invoice</a> <a href=\'mailto:zack@x.com\'>mail</a> <a href=https://jobber.com/i/9>Pay</a>';
  assert.deepEqual(htmlLinks(html), ["https://squareup.com/pay-invoice/abc?x=1&y=2", "https://jobber.com/i/9"]);
  // No text part: the HTML's words, then its links on their own lines.
  assert.equal(invoiceEmailText(null, html), "Hi\nView invoice mail Pay\n\nhttps://squareup.com/pay-invoice/abc?x=1&y=2\nhttps://jobber.com/i/9");
  // A text part that already shows a link doesn't get it twice.
  assert.equal(invoiceEmailText("View invoice: https://jobber.com/i/9", html), "View invoice: https://jobber.com/i/9\n\nhttps://squareup.com/pay-invoice/abc?x=1&y=2");
  assert.equal(invoiceEmailText("  ", ""), null);
});

test("a quoted job email's login links and reply address are masked, and other links stay", () => {
  const tok = "A".repeat(20) + "b_-" + "9".repeat(20);
  const text = `Bill attached.\n\nOn Nov 20, HG Capital <r+${tok}@mail.hg.com> wrote:\n> Send for review: https://hg.test/j/${tok}?do=done\n> https://zoom.us/j/123456789`;
  const html = `<a href="https://hg.test/j/${tok}/calendar">Calendar</a><img src="x"><a href="https://hg.test/api/files/task/a1?v=thumb&amp;l=${tok}">photo</a><a href="https://jobber.com/i/9">Pay</a>`;
  const kept = invoiceEmailText(text, html)!;
  assert.ok(!kept.includes(tok), kept);
  assert.ok(kept.includes(`<${REPLY_ADDRESS_MASK}mail.hg.com>`), kept);
  assert.ok(kept.includes(`Send for review: ${JOB_LINK_MASK}`));
  assert.ok(kept.includes("https://zoom.us/j/123456789"), "someone else's /j/ link stays");
  assert.ok(kept.endsWith("https://jobber.com/i/9"), "the HTML's own invoice link is still added");
  assert.ok(!kept.includes("/calendar") && !kept.includes("thumb"), "our buttons' hrefs aren't added");
});

test("an invoice takes PDFs and photos, not videos, Word files or a signature's logo", () => {
  const picked = invoiceAttachments([
    att({ id: "pdf" }),
    att({ id: "jpg", filename: "photo.jpg", content_type: "image/jpeg" }),
    att({ id: "octet", filename: "scan.PDF", content_type: "application/octet-stream" }),
    att({ id: "heic", filename: "IMG_1.HEIC", content_type: "image/heic" }),
    att({ id: "mov", filename: "walk.mov", content_type: "video/quicktime" }),
    att({ id: "doc", filename: "bill.docx", content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
    att({ id: "logo", filename: "logo.png", content_type: "image/png", size: 4000, content_disposition: "inline", content_id: "logo@x" }),
    att({ id: "huge", size: 900 * 1024 * 1024 }),
  ]);
  assert.deepEqual(
    picked.map((p) => [p.a.id, p.type]),
    [
      ["pdf", "application/pdf"],
      ["jpg", "image/jpeg"],
      ["octet", "application/pdf"],
      ["heic", "image/heic"],
    ],
  );
  const many = invoiceAttachments(Array.from({ length: INVOICE_EMAIL_MAX_FILES + 5 }, (_, i) => att({ id: `p${i}` })));
  assert.equal(many.length, INVOICE_EMAIL_MAX_FILES);
});

test("only a Done job's reply with a PDF or photo makes an invoice", () => {
  const bill = invoiceAttachments([att({})]);
  assert.equal(replyMakesInvoice("DONE", bill), true);
  assert.equal(replyMakesInvoice("DONE", []), false, "words alone");
  assert.equal(replyMakesInvoice("CANCELED", bill), false);
  for (const active of ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW"] as const) assert.equal(replyMakesInvoice(active, bill), false, active);
});

test("a closed job's forward says when the reply made an invoice", () => {
  assert.equal(ADDED_TO_INVOICES, "Added to Invoices to review");
  assert.deepEqual(closedReplyItems("Here's the bill", true), ["Here's the bill", ADDED_TO_INVOICES]);
  assert.deepEqual(closedReplyItems("", true), [ADDED_TO_INVOICES]);
  assert.deepEqual(closedReplyItems("Thanks", false), ["Thanks"]);
});

test("a partner's forward is a DMARC pass on a single-address From that is a partner's", () => {
  const partners = new Set(["connor@hg.com"]);
  assert.equal(isPartnerLine("Connor <Connor@HG.com>", "pass", partners), true);
  assert.equal(isPartnerLine("Connor <connor@hg.com>", "fail", partners), false, "forged");
  assert.equal(isPartnerLine("connor@hg.com, x@evil.com", "pass", partners), false, "two addresses");
  assert.equal(isPartnerLine('"connor@hg.com" <x@evil.com>', "pass", partners), false, "a disguise");
  assert.equal(isPartnerLine("zack@gmail.com", "pass", partners), false);
  assert.equal(isPartnerLine(null, "pass", partners), false);
});

test("the caps: 50 a day and 10 a sender, with partners' forwards outside both", () => {
  const from = (f: string, n: number, partner = false) => Array.from({ length: n }, () => ({ from: f, partner }));
  const zack = { from: "zack@x.com", partner: false };
  assert.equal(overInvoiceCap(from("zack@x.com", INVOICE_EMAILS_PER_SENDER - 1), zack), false);
  assert.equal(overInvoiceCap(from("zack@x.com", INVOICE_EMAILS_PER_SENDER), zack), true);
  assert.equal(overInvoiceCap(from("zack@x.com", INVOICE_EMAILS_PER_SENDER), { from: "mike@x.com", partner: false }), false);
  const day = Array.from({ length: INVOICE_EMAILS_PER_DAY }, (_, i) => ({ from: `s${i}@x.com`, partner: false }));
  assert.equal(overInvoiceCap(day.slice(1), zack), false);
  assert.equal(overInvoiceCap(day, zack), true);
  // A partner's forward is never capped, and the partner's own earlier ones count toward nothing.
  assert.equal(overInvoiceCap(day, { from: "connor@hg.com", partner: true }), false);
  assert.equal(overInvoiceCap([...day.slice(1), ...from("connor@hg.com", 200, true)], zack), false);
});
