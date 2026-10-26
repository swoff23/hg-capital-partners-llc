import test from "node:test";
import assert from "node:assert/strict";
import { telHref, textHref } from "@/lib/contacts";
import { EMAIL_INVALID, NAME_REQUIRED, PHONE_INVALID, readContactPatch, readNewContact, readPhone } from "./contact-fields";

test("readNewContact: the name alone is enough, and blank fields are left out", () => {
  assert.deepEqual(readNewContact({ fullName: "  Zack   Reading ", company: "", phone: " ", email: "", trades: "", comments: "" }), {
    ok: true,
    data: { fullName: "Zack Reading" },
  });
  assert.deepEqual(readNewContact({ fullName: "Zack Reading" }), { ok: true, data: { fullName: "Zack Reading" } });
});

test("readNewContact: every field reads as an edit would, phone with its dialable copy", () => {
  const r = readNewContact({
    fullName: "Zack Reading",
    company: "Outlaw Carpentry",
    trades: "Carpentry / Framing / carpentry",
    phone: "(716) 555-1234",
    email: "Zack@Example.com",
    mailingAddress: "12 Elm St\nBuffalo, NY 14209",
    billingInfo: "Zelle",
    availability: "Weekdays",
    comments: "Prefers texts.",
  });
  assert.deepEqual(r, {
    ok: true,
    data: {
      fullName: "Zack Reading",
      company: "Outlaw Carpentry",
      // The same trade twice is kept once.
      trades: "Carpentry / Framing",
      phone: "716-555-1234",
      phoneE164: "+17165551234",
      email: "zack@example.com",
      mailingAddress: "12 Elm St\nBuffalo, NY 14209",
      billingInfo: "Zelle",
      availability: "Weekdays",
      comments: "Prefers texts.",
    },
  });
});

test("readNewContact: a missing name and a bad email or phone are all reported, each on its field", () => {
  assert.deepEqual(readNewContact({ fullName: " ", email: "zack@", phone: "555" }), {
    ok: false,
    problems: { fullName: NAME_REQUIRED, phone: PHONE_INVALID, email: EMAIL_INVALID },
  });
  assert.deepEqual(readNewContact({ company: "Outlaw Carpentry" }), { ok: false, problems: { fullName: NAME_REQUIRED } });
});

test("readContactPatch: every empty optional field saves as null", () => {
  const blank = { company: "", trades: " ", phone: "", email: "  ", mailingAddress: "\n", billingInfo: "", availability: "", comments: " \r\n " };
  assert.deepEqual(readContactPatch(blank), {
    ok: true,
    data: {
      company: null,
      trades: null,
      phone: null,
      phoneE164: null,
      email: null,
      mailingAddress: null,
      billingInfo: null,
      availability: null,
      comments: null,
    },
  });
});

test("readContactPatch: only the fields sent are read; anything else is ignored", () => {
  assert.deepEqual(readContactPatch({ billingInfo: "Zelle" }), { ok: true, data: { billingInfo: "Zelle" } });
  // The documents, active and anything unknown never reach the write.
  assert.deepEqual(readContactPatch({ w9Url: "https://x.test/w9.pdf", coiUrl: "x", active: "no", id: "c2", portalAccount: "x" }), {
    ok: true,
    data: {},
  });
});

test("readContactPatch: the name is required, trimmed and kept on one line", () => {
  assert.deepEqual(readContactPatch({ fullName: "" }), { ok: false, field: "fullName", message: NAME_REQUIRED });
  assert.deepEqual(readContactPatch({ fullName: "   " }), { ok: false, field: "fullName", message: NAME_REQUIRED });
  assert.deepEqual(readContactPatch({ fullName: "  Zack   Hoak \n" }), { ok: true, data: { fullName: "Zack Hoak" } });
});

test("readContactPatch: email is trimmed and lowercased, and has to look like one", () => {
  assert.deepEqual(readContactPatch({ email: "  Zack.Hoak@Example.COM " }), { ok: true, data: { email: "zack.hoak@example.com" } });
  for (const bad of ["zack", "zack@example", "zack @example.com", "@example.com", "zack@@example.com"]) {
    assert.deepEqual(readContactPatch({ email: bad }), { ok: false, field: "email", message: EMAIL_INVALID }, bad);
  }
});

test("readContactPatch: a phone saves with its E.164 copy, and clearing it clears both", () => {
  assert.deepEqual(readContactPatch({ phone: "(716) 555-1234" }), { ok: true, data: { phone: "716-555-1234", phoneE164: "+17165551234" } });
  assert.deepEqual(readContactPatch({ phone: "" }), { ok: true, data: { phone: null, phoneE164: null } });
  assert.deepEqual(readContactPatch({ phone: "555-1234" }), { ok: false, field: "phone", message: PHONE_INVALID });
});

test("readPhone: US numbers read 716-555-1234 with +1 in E.164", () => {
  for (const typed of ["7165551234", "716.555.1234", "716 555 1234", "(716) 555-1234", "1-716-555-1234", "+1 716 555 1234", "+17165551234"]) {
    assert.deepEqual(readPhone(typed), { phone: "716-555-1234", phoneE164: "+17165551234" }, typed);
  }
});

test("readPhone: an extension or note after the number stays in the display copy only", () => {
  assert.deepEqual(readPhone("716-555-1234 ext 22"), { phone: "716-555-1234 ext 22", phoneE164: "+17165551234" });
  assert.deepEqual(readPhone("(716) 555 1234  cell"), { phone: "716-555-1234 cell", phoneE164: "+17165551234" });
  assert.deepEqual(readPhone("716-555-1234 #3"), { phone: "716-555-1234 #3", phoneE164: "+17165551234" });
  // A note in parentheses stays whole; a separator before a note goes.
  assert.deepEqual(readPhone("716-555-1234 (cell)"), { phone: "716-555-1234 (cell)", phoneE164: "+17165551234" });
  assert.deepEqual(readPhone("(716) 555-1234 (office)"), { phone: "716-555-1234 (office)", phoneE164: "+17165551234" });
  assert.deepEqual(readPhone("716-555-1234, cell"), { phone: "716-555-1234 cell", phoneE164: "+17165551234" });
  assert.deepEqual(readPhone("716-555-1234 - cell"), { phone: "716-555-1234 cell", phoneE164: "+17165551234" });
});

test("readPhone: a number with a + and its country code is kept as typed", () => {
  assert.deepEqual(readPhone(" +44 20 7946 0958 "), { phone: "+44 20 7946 0958", phoneE164: "+442079460958" });
  assert.deepEqual(readPhone("+44 20 7946 0958 (mobile)"), { phone: "+44 20 7946 0958 (mobile)", phoneE164: "+442079460958" });
  assert.equal(readPhone("+44 20"), null);
  assert.equal(readPhone("+1234567890123456"), null);
});

test("readPhone: every number it takes gets Call and Text links", () => {
  // A +1 number is exactly 11 digits, and any other the 10 to 15 the links dial.
  for (const bad of ["+12345678", "+1 716 555 12", "+1 716 555 12345", "+44 207 946"]) {
    assert.equal(readPhone(bad), null, bad);
  }
  for (const typed of ["716-555-1234 (cell)", "+1 716 555 1234", "+44 20 7946 0958", "+354 555 1234"]) {
    const read = readPhone(typed);
    assert.ok(read?.phoneE164 && telHref(read.phoneE164) && textHref(read.phoneE164), typed);
  }
});

test("readPhone: blank is no phone; anything that can't be dialed is refused", () => {
  assert.deepEqual(readPhone(""), { phone: null, phoneE164: null });
  assert.deepEqual(readPhone("   "), { phone: null, phoneE164: null });
  for (const bad of ["555-1234", "cell", "716-555-12345", "27165551234", "716-555-1234 / 716-555-9999"]) {
    assert.equal(readPhone(bad), null, bad);
  }
});

test("readContactPatch: trades drop a trade typed twice, as the directory shows them", () => {
  assert.deepEqual(readContactPatch({ trades: "HVAC / hvac / Plumbing" }), { ok: true, data: { trades: "HVAC / Plumbing" } });
  assert.deepEqual(readContactPatch({ trades: " Plumbing / HVAC " }), { ok: true, data: { trades: "Plumbing / HVAC" } });
});

test("readContactPatch: multi-line fields keep their lines, with the ends trimmed", () => {
  assert.deepEqual(readContactPatch({ mailingAddress: " 12 Elm St\r\nBuffalo, NY 14201 \n", comments: "W-9 on file: zack.pdf\r\nPrefers texts.\n\n" }), {
    ok: true,
    data: { mailingAddress: "12 Elm St\nBuffalo, NY 14201", comments: "W-9 on file: zack.pdf\nPrefers texts." },
  });
});

test("readContactPatch: Tenant fixes is yes or no", () => {
  assert.deepEqual(readContactPatch({ tenantFixes: "yes" }), { ok: true, data: { tenantFixes: true } });
  assert.deepEqual(readContactPatch({ tenantFixes: "no" }), { ok: true, data: { tenantFixes: false } });
  assert.deepEqual(readContactPatch({ tenantFixes: "" }), { ok: true, data: { tenantFixes: false } });
});

test("readContactPatch: a value past its limit says the limit, on one short line under its field", () => {
  assert.deepEqual(readContactPatch({ fullName: "A".repeat(121) }), {
    ok: false,
    field: "fullName",
    message: "Use 120 characters or fewer.",
  });
  assert.deepEqual(readContactPatch({ comments: "x".repeat(10_001) }), {
    ok: false,
    field: "comments",
    message: "Use 10,000 characters or fewer.",
  });
  assert.equal(readContactPatch({ comments: "x".repeat(10_000) }).ok, true);
});

test("readContactPatch: the first problem in the editor's order wins", () => {
  assert.deepEqual(readContactPatch({ email: "nope", fullName: "", phone: "12" }), { ok: false, field: "fullName", message: NAME_REQUIRED });
  assert.deepEqual(readContactPatch({ email: "nope", phone: "12" }), { ok: false, field: "phone", message: PHONE_INVALID });
});
