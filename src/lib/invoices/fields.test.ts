import test from "node:test";
import assert from "node:assert/strict";
import {
  PAID_SETTLE_MS,
  TOTAL_ABOVE_ZERO,
  TOTAL_MAX_CENTS,
  TOTAL_MESSAGE,
  TOTAL_TOO_BIG,
  approveBlocker,
  centsToDecimal,
  cleanInvoiceNumber,
  contractorInvoiceWhere,
  contractorMaySee,
  contractorStage,
  contractorStageWord,
  decimalToCents,
  invoiceTitle,
  isPayMethod,
  isTotalCents,
  movedMessage,
  normalizeInvoiceNumber,
  readInvoiceView,
  readTotal,
  type VisibilityFields,
} from "./fields";

test("an invoice number saves without its leading #", () => {
  assert.equal(cleanInvoiceNumber("#1043"), "1043");
  assert.equal(cleanInvoiceNumber("  # 1043 "), "1043");
  assert.equal(cleanInvoiceNumber("##1043"), "1043");
  assert.equal(cleanInvoiceNumber("INV-0042"), "INV-0042");
  assert.equal(cleanInvoiceNumber("10#43"), "10#43");
  assert.equal(cleanInvoiceNumber("#"), null);
  assert.equal(cleanInvoiceNumber("   "), null);
  assert.equal(cleanInvoiceNumber(null), null);
});

test("numbers compare ignoring case, spaces, hyphens, a # and leading zeros", () => {
  assert.equal(normalizeInvoiceNumber("#1043"), "1043");
  assert.equal(normalizeInvoiceNumber("1043"), "1043");
  assert.equal(normalizeInvoiceNumber("#001043"), "1043");
  assert.equal(normalizeInvoiceNumber("10-43"), "1043");
  assert.equal(normalizeInvoiceNumber("10 43"), "1043");
  assert.equal(normalizeInvoiceNumber("INV-0042"), "inv0042");
  assert.equal(normalizeInvoiceNumber("inv 0042"), "inv0042");
  assert.equal(normalizeInvoiceNumber("000"), "0");
  assert.equal(normalizeInvoiceNumber("---"), null);
  assert.equal(normalizeInvoiceNumber(""), null);
  assert.equal(normalizeInvoiceNumber(null), null);
  // The same as the cleaned number normalizes to, so saving twice never changes it.
  assert.equal(normalizeInvoiceNumber(cleanInvoiceNumber("#0042-A")), normalizeInvoiceNumber("#0042-A"));
});

test("a typed total reads strictly, in exact cents", () => {
  const cents = (raw: string) => {
    const r = readTotal(raw);
    return r.ok ? r.cents : r.message;
  };
  assert.equal(cents("850"), 85000);
  assert.equal(cents("850.5"), 85050);
  assert.equal(cents("850.50"), 85050);
  assert.equal(cents("850."), 85000);
  assert.equal(cents("$1,043.10"), 104310);
  assert.equal(cents(" $ 1043.10 "), 104310);
  assert.equal(cents(".5"), 50);
  assert.equal(cents("0.01"), 1);
  assert.equal(cents("1,234,567.89"), 123456789);
  assert.equal(cents("0.1"), 10);
  // 0.1 + 0.2 in floats is 0.30000000000000004; read from the text it is 30 cents.
  assert.equal(cents("0.30"), 30);
  assert.equal(cents(""), null);
  assert.equal(cents("   "), null);
});

test("a total refuses k, m, a minus, zero, a third decimal and stray commas", () => {
  const message = (raw: string) => {
    const r = readTotal(raw);
    return r.ok ? `ok ${r.cents}` : r.message;
  };
  assert.equal(message("1.2k"), TOTAL_MESSAGE);
  assert.equal(message("2m"), TOTAL_MESSAGE);
  assert.equal(message("850.123"), TOTAL_MESSAGE);
  assert.equal(message("1,2"), TOTAL_MESSAGE);
  assert.equal(message("10,00"), TOTAL_MESSAGE);
  assert.equal(message("850 dollars"), TOTAL_MESSAGE);
  assert.equal(message("about 850"), TOTAL_MESSAGE);
  assert.equal(message("."), TOTAL_MESSAGE);
  assert.equal(message("$"), TOTAL_MESSAGE);
  assert.equal(message("-850"), TOTAL_ABOVE_ZERO);
  assert.equal(message("$-850"), TOTAL_ABOVE_ZERO);
  assert.equal(message("-$850"), TOTAL_ABOVE_ZERO);
  assert.equal(message("(850)"), TOTAL_ABOVE_ZERO);
  assert.equal(message("0"), TOTAL_ABOVE_ZERO);
  assert.equal(message("0.00"), TOTAL_ABOVE_ZERO);
  assert.equal(message("9999999999.99"), `ok ${TOTAL_MAX_CENTS}`);
  assert.equal(message("10000000000"), TOTAL_TOO_BIG);
});

test("cents and Decimal text convert both ways without floats", () => {
  assert.equal(centsToDecimal(85050), "850.50");
  assert.equal(centsToDecimal(5), "0.05");
  assert.equal(centsToDecimal(100), "1.00");
  assert.equal(centsToDecimal(TOTAL_MAX_CENTS), "9999999999.99");
  assert.equal(decimalToCents("850.5"), 85050);
  assert.equal(decimalToCents("850.50"), 85050);
  assert.equal(decimalToCents("1043"), 104300);
  assert.equal(decimalToCents("0.07"), 7);
  assert.equal(decimalToCents("9999999999.99"), TOTAL_MAX_CENTS);
  assert.equal(decimalToCents({ toString: () => "12.3" }), 1230);
  assert.equal(decimalToCents(null), null);
  assert.equal(decimalToCents("n/a"), null);
  for (const c of [1, 99, 100, 101, 85050, 104310, TOTAL_MAX_CENTS]) assert.equal(decimalToCents(centsToDecimal(c)), c);
});

test("a stored total is whole cents above zero and within the column", () => {
  assert.equal(isTotalCents(85000), true);
  assert.equal(isTotalCents(TOTAL_MAX_CENTS), true);
  assert.equal(isTotalCents(0), false);
  assert.equal(isTotalCents(-100), false);
  assert.equal(isTotalCents(850.5), false);
  assert.equal(isTotalCents(TOTAL_MAX_CENTS + 1), false);
  assert.equal(isTotalCents("85000"), false);
  assert.equal(isTotalCents(Number.NaN), false);
});

test("the page title falls back from the number to the contractor to Invoice", () => {
  assert.equal(invoiceTitle({ invoiceNumber: "1043", contactName: "Zack Reading" }), "Invoice #1043");
  assert.equal(invoiceTitle({ invoiceNumber: "#1043" }), "Invoice #1043");
  assert.equal(invoiceTitle({ invoiceNumber: null, contactName: "Zack (Outlaw Carpentry)" }), "Invoice from Zack");
  assert.equal(invoiceTitle({ invoiceNumber: "  ", contactName: "Zack Reading" }), "Invoice from Zack");
  assert.equal(invoiceTitle({ invoiceNumber: null, contactName: null }), "Invoice");
  assert.equal(invoiceTitle({ invoiceNumber: null, contactName: "  " }), "Invoice");
});

test("a contractor reads Received, Approved and Paid with its date, once the Undo window passes", () => {
  const now = new Date("2026-11-18T17:00:00Z");
  const settled = new Date(now.getTime() - PAID_SETTLE_MS);
  const fresh = new Date(now.getTime() - PAID_SETTLE_MS + 1000);
  const today = "2026-11-18";
  assert.equal(contractorStage({ stage: "REVIEW" }, now), "RECEIVED");
  assert.equal(contractorStage({ stage: "TO_PAY" }, now), "APPROVED");
  assert.equal(contractorStage({ stage: "PAID", paidAt: settled }, now), "PAID");
  assert.equal(contractorStage({ stage: "PAID", paidAt: fresh }, now), "APPROVED");
  assert.equal(contractorStage({ stage: "PAID", paidAt: null }, now), "APPROVED");
  assert.equal(contractorStage({ stage: "NOT_INVOICE" }, now), null);
  assert.equal(contractorStageWord({ stage: "REVIEW" }, now, today), "Received");
  assert.equal(contractorStageWord({ stage: "TO_PAY" }, now, today), "Approved");
  assert.equal(contractorStageWord({ stage: "PAID", paidAt: settled, paidOn: new Date("2026-11-13T00:00:00Z") }, now, today), "Paid Nov 13");
  assert.equal(contractorStageWord({ stage: "PAID", paidAt: settled, paidOn: "2025-12-30" }, now, today), "Paid Dec 30, 2025");
  assert.equal(contractorStageWord({ stage: "PAID", paidAt: fresh, paidOn: "2026-11-18" }, now, today), "Approved");
  assert.equal(contractorStageWord({ stage: "NOT_INVOICE" }, now, today), "");
});

test("a contractor sees their portal invoices at once and the rest only once approved", () => {
  const zack = "c_zack";
  const inv = (over: Partial<VisibilityFields>): VisibilityFields => ({
    contactId: zack,
    createdByContactId: null,
    source: "EMAIL",
    stage: "REVIEW",
    ...over,
  });
  const sent = { source: "PORTAL" as const, createdByContactId: zack };
  // Sent from the portal: every stage but Not an invoice.
  assert.equal(contractorMaySee(inv({ ...sent, stage: "REVIEW" }), zack), true);
  assert.equal(contractorMaySee(inv({ ...sent, stage: "TO_PAY" }), zack), true);
  assert.equal(contractorMaySee(inv({ ...sent, stage: "PAID" }), zack), true);
  assert.equal(contractorMaySee(inv({ ...sent, stage: "NOT_INVOICE" }), zack), false);
  // Emailed, replied or entered by staff: only To pay and Paid.
  for (const source of ["EMAIL", "REPLY", "STAFF"] as const) {
    assert.equal(contractorMaySee(inv({ source, stage: "REVIEW" }), zack), false, source);
    assert.equal(contractorMaySee(inv({ source, stage: "TO_PAY" }), zack), true, source);
    assert.equal(contractorMaySee(inv({ source, stage: "PAID" }), zack), true, source);
    assert.equal(contractorMaySee(inv({ source, stage: "NOT_INVOICE" }), zack), false, source);
  }
  // Never someone else's, whoever sent it; a portal invoice staff moved to Mike waits for approval for Mike.
  assert.equal(contractorMaySee(inv({ ...sent, contactId: "c_mike", stage: "PAID" }), zack), false);
  assert.equal(contractorMaySee(inv({ ...sent, contactId: "c_mike", stage: "REVIEW" }), "c_mike"), false);
  assert.equal(contractorMaySee(inv({ ...sent, contactId: "c_mike", stage: "TO_PAY" }), "c_mike"), true);
  assert.equal(contractorMaySee(inv({ contactId: null, stage: "PAID" }), zack), false);
  assert.equal(contractorMaySee(inv({ stage: "PAID" }), ""), false);
});

test("the portal's filter says the same as the rule", () => {
  assert.deepEqual(contractorInvoiceWhere("c_zack"), {
    contactId: "c_zack",
    deletedAt: null,
    stage: { not: "NOT_INVOICE" },
    OR: [{ source: "PORTAL", createdByContactId: "c_zack" }, { stage: { in: ["TO_PAY", "PAID"] } }],
  });
});

test("Approve says what's missing in one line", () => {
  assert.equal(approveBlocker({ contactId: null, totalCents: null }), "Add a contractor and a total to approve.");
  assert.equal(approveBlocker({ contactId: null, totalCents: 85000 }), "Add a contractor to approve.");
  assert.equal(approveBlocker({ contactId: "c1", totalCents: null }), "Add a total to approve.");
  assert.equal(approveBlocker({ contactId: "c1", totalCents: 0 }), "Add a total to approve.");
  assert.equal(approveBlocker({ contactId: "c1", totalCents: 85000 }), null);
});

test("a lost move names who made the other one", () => {
  assert.equal(movedMessage("PAID", "PAID", "Pieter"), "Pieter already marked this paid.");
  assert.equal(movedMessage("PAID", "PAID", "You"), "You already marked this paid.");
  assert.equal(movedMessage("TO_PAY", "APPROVED", "Pieter"), "Pieter already approved this.");
  assert.equal(movedMessage("TO_PAY", "UNDONE", "Pieter"), "Pieter moved this back to To pay.");
  assert.equal(movedMessage("REVIEW", "REOPENED", "Connor"), "Connor moved this back to To review.");
  assert.equal(movedMessage("REVIEW", "RESTORED", "Connor"), "Connor already put this back.");
  assert.equal(movedMessage("NOT_INVOICE", "NOT_INVOICE", "Connor"), "Connor marked this not an invoice.");
  assert.equal(movedMessage("PAID", null, null), "Someone already marked this paid.");
  for (const line of [movedMessage("PAID", "PAID", "Pieter"), movedMessage("TO_PAY", "UNDONE", "Pieter")]) assert.doesNotMatch(line, /\u2014/);
});

test("the view comes from the URL, To review by default", () => {
  assert.equal(readInvoiceView("pay"), "pay");
  assert.equal(readInvoiceView("paid"), "paid");
  assert.equal(readInvoiceView("review"), "review");
  assert.equal(readInvoiceView("PAID"), "review");
  assert.equal(readInvoiceView(["paid", "pay"]), "review");
  assert.equal(readInvoiceView(undefined), "review");
});

test("only the listed methods are methods", () => {
  assert.equal(isPayMethod("BASELANE"), true);
  assert.equal(isPayMethod("CARD"), true);
  assert.equal(isPayMethod("WIRE"), false);
  assert.equal(isPayMethod(undefined), false);
});
