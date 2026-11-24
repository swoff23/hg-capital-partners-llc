import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INVOICE_FILE_RULES, invoiceFileKind, invoiceSendParent, invoiceUploadLimits, storedInvoiceUploadPath } from "@/lib/attachments/limits";
import { TOAST_ACTION_MS } from "@/lib/toast-time";
import { REVIEW_LINES_MAX, formatCents, paidEmail, paidSubject, paidToastDetail, reviewEmail, reviewLine, reviewSubject } from "./email-content";
import { PAID_SETTLE_MS, mayOpenInvoiceFile, type VisibilityFields } from "./fields";
import { INVOICE_PAID_KIND, INVOICE_REVIEW_KIND, isInvoiceRow, paidKey, reviewBundleKey } from "./notify";

/*
 * The invoice emails' words, the Mark paid toast's clause, who may open an invoice's file, and where invoice uploads
 * may go (docs/contractor-invoices-plan.md, 5.2 and 5.3). The rows and the drain on a real database are in
 * notify.pg.test.ts.
 */

const APP = "https://hgcapitalpartners.com/";

test("formatCents: dollars with commas and two cents, from integer cents", () => {
  assert.equal(formatCents(85000), "$850.00");
  assert.equal(formatCents(104310), "$1,043.10");
  assert.equal(formatCents(123456789), "$1,234,567.89");
  assert.equal(formatCents(5), "$0.05");
});

test("the Paid subject: number and total, or Invoice with no number", () => {
  assert.equal(paidSubject({ invoiceNumber: "1043", totalCents: 85000 }), "Paid: Invoice #1043, $850.00");
  assert.equal(paidSubject({ invoiceNumber: "#1043", totalCents: 85000 }), "Paid: Invoice #1043, $850.00");
  assert.equal(paidSubject({ invoiceNumber: null, totalCents: 85000 }), "Paid: Invoice, $850.00");
  assert.equal(paidSubject({ invoiceNumber: " ", totalCents: 85000 }), "Paid: Invoice, $850.00");
});

test("the Paid email: the day and the method in the body, one button to Your invoices, no job link", () => {
  const e = paidEmail({
    contactName: "Zack Brown",
    invoiceNumber: "1043",
    totalCents: 85000,
    paidOn: "2026-11-13",
    method: "BASELANE",
    today: "2026-11-21",
    appUrl: APP,
  });
  assert.equal(e.subject, "Paid: Invoice #1043, $850.00");
  assert.equal(e.line, "Hi Zack, HG Capital paid your invoice #1043.");
  assert.deepEqual(e.items, ["$850.00 paid on Nov 13 by Baselane transfer."]);
  assert.equal(e.buttonLabel, "See your invoices");
  assert.equal(e.buttonUrl, "https://hgcapitalpartners.com/p/invoices");
  const cash = paidEmail({ contactName: null, invoiceNumber: null, totalCents: 5000, paidOn: "2026-11-13", method: "CASH", today: "2026-11-21", appUrl: APP });
  assert.equal(cash.line, "HG Capital paid your invoice.");
  assert.deepEqual(cash.items, ["$50.00 paid on Nov 13 in cash."]);
  const other = paidEmail({ contactName: "Zack", invoiceNumber: null, totalCents: 5000, paidOn: "2026-11-13", method: "OTHER", today: "2026-11-21", appUrl: APP });
  assert.deepEqual(other.items, ["$50.00 paid on Nov 13."]);
  for (const s of [e.line, ...e.items, cash.line, ...cash.items]) assert.doesNotMatch(s, /—/);
});

test("the partners' bundle: a count in the subject, one line per invoice, then and N more", () => {
  assert.equal(reviewSubject(1), "1 new invoice to review");
  assert.equal(reviewSubject(3), "3 new invoices to review");
  assert.equal(reviewLine({ contactName: "Zack Brown", senderEmail: null, invoiceNumber: "1043", totalCents: 85000 }), "Zack Brown · #1043 · $850.00");
  assert.equal(reviewLine({ contactName: null, senderEmail: "zack@gmail.com", invoiceNumber: null, totalCents: null }), "zack@gmail.com");
  assert.equal(reviewLine({ contactName: null, senderEmail: null, invoiceNumber: null, totalCents: null }), "No contractor yet");

  const one = reviewEmail({ recipientName: "Connor Swofford", lines: [{ contactName: "Zack", senderEmail: null, invoiceNumber: null, totalCents: null }], appUrl: APP });
  assert.equal(one.line, "Hi Connor, a new invoice came in.");
  assert.equal(one.buttonUrl, "https://hgcapitalpartners.com/invoices?view=review");
  assert.equal(one.buttonLabel, "Review invoices");

  const many = Array.from({ length: REVIEW_LINES_MAX + 2 }, (_, i) => ({ contactName: `C${i}`, senderEmail: null, invoiceNumber: null, totalCents: null }));
  const bundle = reviewEmail({ recipientName: null, lines: many, appUrl: APP });
  assert.equal(bundle.subject, `${REVIEW_LINES_MAX + 2} new invoices to review`);
  assert.equal(bundle.line, `${REVIEW_LINES_MAX + 2} new invoices came in.`);
  assert.equal(bundle.items.length, REVIEW_LINES_MAX + 1);
  assert.equal(bundle.items.at(-1), "and 2 more");
});

test("Mark paid's toast clause speaks the delivery line's words", () => {
  assert.equal(paidToastDetail("Zack Brown", "on"), "Zack gets an email");
  assert.equal(paidToastDetail("Zack Brown", "not-signed-in"), "Zack hasn't signed in yet");
  assert.equal(paidToastDetail("Zack Brown", "off"), "Zack's emails are off");
  assert.equal(paidToastDetail("Zack Brown", "no-login"), "Zack has no login yet");
  assert.equal(paidToastDetail(null, "on"), null);
  assert.equal(paidToastDetail("Zack", null), null);
  // The same words as comment-card.tsx's DeliveryLine.
  const card = readFileSync(join(import.meta.dirname, "..", "..", "components", "comment-card.tsx"), "utf8");
  for (const words of [" has no login yet", " hasn't signed in yet", "'s emails are off", " gets an email"]) assert.ok(card.includes(`"${words}"`), words);
});

test("the Paid email waits at least as long as the toast's Undo", () => {
  assert.ok(PAID_SETTLE_MS >= TOAST_ACTION_MS);
});

test("an invoice row is told from a task row by its invoice or its lines, never when it has a task", () => {
  assert.equal(isInvoiceRow({ taskId: null, invoiceId: "inv1", items: [] }), true);
  assert.equal(isInvoiceRow({ taskId: null, invoiceId: null, items: [{ kind: INVOICE_REVIEW_KIND, invoiceId: "a" }] }), true);
  assert.equal(isInvoiceRow({ taskId: null, invoiceId: null, items: [{ kind: INVOICE_PAID_KIND }] }), true);
  assert.equal(isInvoiceRow({ taskId: "t1", invoiceId: null, items: [{ kind: INVOICE_REVIEW_KIND }] }), false);
  assert.equal(isInvoiceRow({ taskId: null, invoiceId: null, items: [{ kind: "COMMENT", actorLabel: "", summary: "" }] }), false);
  assert.equal(isInvoiceRow({ taskId: null, invoiceId: null, items: [] }), false);
  assert.equal(reviewBundleKey("u1"), "u:u1:invoices");
  assert.equal(paidKey("c1", "inv1"), "c:c1:invoice:inv1");
});

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const theirs = (over: Partial<VisibilityFields> = {}): VisibilityFields => ({ contactId: "zack", createdByContactId: "zack", source: "PORTAL", stage: "REVIEW", ...over });

test("an invoice's file: any partner; the contractor only while they may see it; never another contractor or a link session", () => {
  assert.equal(mayOpenInvoiceFile({ kind: "staff" }, theirs()), true);
  assert.equal(mayOpenInvoiceFile({ kind: "staff" }, theirs({ stage: "NOT_INVOICE" })), true);
  assert.equal(mayOpenInvoiceFile({ kind: "contractor", contactId: "zack", onlyTaskId: null }, theirs()), true);
  // Another contractor.
  assert.equal(mayOpenInvoiceFile({ kind: "contractor", contactId: "mike", onlyTaskId: null }, theirs()), false);
  // A one-job link session, even the invoice's own contractor's (M16).
  assert.equal(mayOpenInvoiceFile({ kind: "contractor", contactId: "zack", onlyTaskId: "t1" }, theirs()), false);
  assert.equal(mayOpenInvoiceFile({ kind: "staff", onlyTaskId: "t1" }, theirs()), false);
  // An emailed one only once approved (M14), and never Not an invoice.
  assert.equal(mayOpenInvoiceFile({ kind: "contractor", contactId: "zack", onlyTaskId: null }, theirs({ source: "EMAIL", createdByContactId: null })), false);
  assert.equal(mayOpenInvoiceFile({ kind: "contractor", contactId: "zack", onlyTaskId: null }, theirs({ source: "EMAIL", createdByContactId: null, stage: "TO_PAY" })), true);
  assert.equal(mayOpenInvoiceFile({ kind: "contractor", contactId: "zack", onlyTaskId: null }, theirs({ stage: "NOT_INVOICE" })), false);
});

test("the file route's invoice kind asks mayOpenInvoiceFile and serves only our private copy", () => {
  const route = readFileSync(join(import.meta.dirname, "..", "..", "app", "api", "files", "[kind]", "[id]", "route.ts"), "utf8");
  assert.match(route, /invoice: \["staff", "contractor"\]/);
  const branch = route.slice(route.indexOf('if (kind === "invoice"'), route.indexOf('if (kind === "lease"'));
  assert.match(branch, /if \(!f \|\| !mayOpenInvoiceFile\(viewer, f\.invoice\)\) return null;/);
  assert.match(branch, /isPrivateStoreUrl\(f\.url, storeId, f\.pathname\)/);
  assert.match(branch, /publicFallback: false/);
  // A job email's link opens task thumbnails only, never an invoice's file.
  assert.match(route, /if \(kind !== "task" \|\| variant !== "thumb"\) return null;/);
});

test("invoice uploads: a PDF or a photo, in the kind's own folder", () => {
  const ok = invoiceUploadLimits("invoice-upload", "inv1", "invoices/inv1/bill.pdf", "file");
  assert.deepEqual(ok, { maximumSizeInBytes: INVOICE_FILE_RULES.file.maxBytes, allowedContentTypes: ["application/pdf"] });
  assert.equal(typeof invoiceUploadLimits("invoice-upload", "inv1", "invoices/inv1/bill.docx", "file"), "string");
  assert.equal(typeof invoiceUploadLimits("invoice-upload", "inv1", "invoices/inv2/bill.pdf", "file"), "string");
  assert.equal(typeof invoiceUploadLimits("invoice-upload", "inv1", "invoices/inv1/clip.mp4", "video"), "string");
  const send = invoiceSendParent("t1", "c1");
  assert.equal(typeof invoiceUploadLimits("portal-invoice-upload", send, "invoice-sends/t1/c1/photo.jpg", "image"), "object");
  assert.equal(typeof invoiceUploadLimits("portal-invoice-upload", send, "invoices/t1/photo.jpg", "image"), "string");
  assert.equal(storedInvoiceUploadPath("portal-invoice-upload", "invoice-sends/t1/c1/photo-Ab12.jpg", send), true);
  assert.equal(storedInvoiceUploadPath("portal-invoice-upload", "invoice-sends/t2/c1/photo-Ab12.jpg", send), false);
  assert.equal(storedInvoiceUploadPath("invoice-upload", "invoices/inv1/a/b.pdf", "inv1"), false);
  assert.equal(invoiceFileKind("application/pdf"), "file");
  assert.equal(invoiceFileKind("image/heic"), "image");
  assert.equal(invoiceFileKind("video/mp4"), null);
  assert.equal(invoiceFileKind("text/csv"), null);
});
