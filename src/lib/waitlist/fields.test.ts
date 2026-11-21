import test from "node:test";
import assert from "node:assert/strict";
import { EMAIL_INVALID, PHONE_INVALID } from "@/lib/contractors/contact-fields";
import {
  FIRST_NAME_MAX,
  FIRST_NAME_REQUIRED,
  WAITLIST_FIELDS,
  cleanEmail,
  cleanFirstName,
  cleanPhone,
  deleteListingBody,
  emailsCopiedToast,
  honeypotFilled,
  readSignUp,
  removedToast,
  toWaitlistRow,
  waitingClause,
  waitlistCsv,
  waitlistCsvName,
  waitlistEmails,
  waitlistFieldProblem,
  waitlistProblems,
  type WaitlistRow,
} from "./fields";

const row = (over: Partial<WaitlistRow> = {}): WaitlistRow => ({
  id: "w1",
  firstName: "Dana",
  email: "dana@hg.localhost",
  phone: "716-555-1234",
  signedUp: "2026-11-03",
  ...over,
});

/* ---------------- The form's fields ---------------- */

test("the first name is one line, capped at 60 and capitalized when typed all lowercase", () => {
  assert.equal(cleanFirstName("  dana  "), "Dana");
  assert.equal(cleanFirstName("mary   ann"), "Mary Ann");
  assert.equal(cleanFirstName("Dana\n"), "Dana");
  // A capital already typed is left alone.
  assert.equal(cleanFirstName("DeShawn"), "DeShawn");
  assert.equal(cleanFirstName("DANA"), "DANA");
  const long = "a".repeat(FIRST_NAME_MAX + 20);
  assert.equal(cleanFirstName(long).length, FIRST_NAME_MAX);
  // The cap counts characters, not UTF-16 halves, and doesn't leave a trailing space.
  assert.equal([...cleanFirstName("😀".repeat(70))].length, FIRST_NAME_MAX);
  assert.equal(cleanFirstName(`${"b".repeat(FIRST_NAME_MAX - 1)} c`), `B${"b".repeat(FIRST_NAME_MAX - 2)}`);
  assert.equal(cleanFirstName("   "), "");
});

test("the email is trimmed and lowercased", () => {
  assert.equal(cleanEmail("  Dana@Example.COM "), "dana@example.com");
});

test("the phone keeps readPhone's display form; blank is none and a bad one doesn't read", () => {
  assert.equal(cleanPhone("(716) 555-1234"), "716-555-1234");
  assert.equal(cleanPhone("1 716 555 1234"), "716-555-1234");
  assert.equal(cleanPhone("716-555-1234 (cell)"), "716-555-1234 (cell)");
  assert.equal(cleanPhone(""), null);
  assert.equal(cleanPhone("   "), null);
  assert.equal(cleanPhone("555-1234"), undefined);
  assert.equal(cleanPhone("call me"), undefined);
  assert.equal(cleanPhone(`716-555-1234 ${"x".repeat(40)}`), undefined);
});

test("each field's line: a blank name or email, a bad email or phone", () => {
  assert.equal(waitlistFieldProblem("firstName", ""), FIRST_NAME_REQUIRED);
  assert.equal(waitlistFieldProblem("firstName", "  "), FIRST_NAME_REQUIRED);
  assert.equal(waitlistFieldProblem("firstName", "Dana"), null);
  assert.equal(waitlistFieldProblem("email", ""), EMAIL_INVALID);
  assert.equal(waitlistFieldProblem("email", "dana@"), EMAIL_INVALID);
  assert.equal(waitlistFieldProblem("email", "dana@example"), EMAIL_INVALID);
  assert.equal(waitlistFieldProblem("email", `${"a".repeat(250)}@x.com`), EMAIL_INVALID);
  assert.equal(waitlistFieldProblem("email", " Dana@Example.com "), null);
  assert.equal(waitlistFieldProblem("phone", ""), null);
  assert.equal(waitlistFieldProblem("phone", "555"), PHONE_INVALID);
  assert.equal(waitlistFieldProblem("phone", "716.555.1234"), null);
});

test("the lines are the spec's words", () => {
  assert.equal(FIRST_NAME_REQUIRED, "Enter your first name.");
  assert.equal(EMAIL_INVALID, "Enter a full email, like name@example.com.");
  assert.equal(PHONE_INVALID, "Enter the full number, like 716-555-1234.");
});

test("problems come back for every field, in the form's order", () => {
  assert.deepEqual(waitlistProblems({ firstName: "", email: "nope", phone: "12" }), {
    firstName: FIRST_NAME_REQUIRED,
    email: EMAIL_INVALID,
    phone: PHONE_INVALID,
  });
  assert.deepEqual(Object.keys(waitlistProblems({ firstName: "", email: "", phone: "1" })), [...WAITLIST_FIELDS]);
  assert.deepEqual(waitlistProblems({ firstName: "Dana", email: "dana@example.com", phone: "" }), {});
});

test("a sign-up that reads comes back as stored", () => {
  assert.deepEqual(readSignUp({ firstName: " dana ", email: " Dana@Example.com", phone: "(716) 555-1234" }), {
    ok: true,
    data: { firstName: "Dana", email: "dana@example.com", phone: "716-555-1234" },
  });
  assert.deepEqual(readSignUp({ firstName: "Dana", email: "dana@example.com", phone: "" }), {
    ok: true,
    data: { firstName: "Dana", email: "dana@example.com", phone: null },
  });
  assert.deepEqual(readSignUp({ firstName: "", email: "dana@example.com", phone: "" }), { ok: false, problems: { firstName: FIRST_NAME_REQUIRED } });
});

test("the honeypot: any text in it is a bot", () => {
  assert.equal(honeypotFilled(undefined), false);
  assert.equal(honeypotFilled(null), false);
  assert.equal(honeypotFilled(""), false);
  assert.equal(honeypotFilled("Acme"), true);
  assert.equal(honeypotFilled(" "), true);
});

/* ---------------- The Waiting section ---------------- */

test("a stored row's sign-up day is read in Buffalo", () => {
  // 2:30 UTC on Nov 4 is still Nov 3 in Buffalo.
  assert.deepEqual(toWaitlistRow({ id: "w1", firstName: "Dana", email: "dana@hg.localhost", phone: null, createdAt: new Date("2026-11-04T02:30:00Z") }), {
    id: "w1",
    firstName: "Dana",
    email: "dana@hg.localhost",
    phone: null,
    signedUp: "2026-11-03",
  });
  assert.equal(toWaitlistRow({ ...row(), createdAt: "2026-11-04T12:00:00.000Z" }).signedUp, "2026-11-04");
});

test("Copy emails joins every address for Gmail's BCC", () => {
  assert.equal(waitlistEmails([row(), row({ email: "sam@hg.localhost" })]), "dana@hg.localhost, sam@hg.localhost");
  assert.equal(waitlistEmails([row()]), "dana@hg.localhost");
  assert.equal(waitlistEmails([]), "");
});

test("the .csv has a header, one line per person and CRLF line ends, after a byte-order mark", () => {
  const csv = waitlistCsv([row(), row({ id: "w2", firstName: "Sam", email: "sam@hg.localhost", phone: null, signedUp: "2026-11-01" })]);
  assert.ok(csv.startsWith("﻿"));
  assert.equal(csv.slice(1), "First name,Email,Phone,Signed up\r\nDana,dana@hg.localhost,716-555-1234,2026-11-03\r\nSam,sam@hg.localhost,,2026-11-01\r\n");
  assert.equal(waitlistCsv([]), "﻿First name,Email,Phone,Signed up\r\n");
});

test("the .csv quotes a cell with a quote, comma or line break", () => {
  const line = (r: WaitlistRow) => waitlistCsv([r]).split("\r\n")[1];
  assert.equal(line(row({ firstName: 'Dana "D"' })), '"Dana ""D""",dana@hg.localhost,716-555-1234,2026-11-03');
  assert.equal(line(row({ firstName: "Smith, Dana" })), '"Smith, Dana",dana@hg.localhost,716-555-1234,2026-11-03');
  assert.equal(waitlistCsv([row({ firstName: "Dana\nLee" })]).split("\r\n")[1], '"Dana\nLee",dana@hg.localhost,716-555-1234,2026-11-03');
});

test("the .csv guards a cell a spreadsheet would run as a formula", () => {
  const line = (r: WaitlistRow) => waitlistCsv([r]).split("\r\n")[1];
  assert.equal(line(row({ firstName: "=HYPERLINK(\"x\")" })), "\"'=HYPERLINK(\"\"x\"\")\",dana@hg.localhost,716-555-1234,2026-11-03");
  assert.equal(line(row({ firstName: "+Dana" })), "'+Dana,dana@hg.localhost,716-555-1234,2026-11-03");
  assert.equal(line(row({ firstName: "-Dana" })), "'-Dana,dana@hg.localhost,716-555-1234,2026-11-03");
  assert.equal(line(row({ firstName: "@Dana" })), "'@Dana,dana@hg.localhost,716-555-1234,2026-11-03");
  assert.equal(line(row({ firstName: "\tDana" })), "'\tDana,dana@hg.localhost,716-555-1234,2026-11-03");
  // A number typed with its country code keeps its plus as text.
  assert.equal(line(row({ phone: "+44 20 7946 0958" })), "Dana,dana@hg.localhost,'+44 20 7946 0958,2026-11-03");
  // Only the first character counts.
  assert.equal(line(row({ firstName: "Dana-Lee" })), "Dana-Lee,dana@hg.localhost,716-555-1234,2026-11-03");
});

test("the file is named after the home", () => {
  assert.equal(waitlistCsvName("56 Tamarack St", "Upper"), "56-tamarack-st-upper-sign-ups.csv");
  assert.equal(waitlistCsvName("118 Congress St.", "Lower Front"), "118-congress-st-lower-front-sign-ups.csv");
  assert.equal(waitlistCsvName("12 Peña Ave", ""), "12-pena-ave-sign-ups.csv");
  assert.equal(waitlistCsvName("", ""), "sign-ups.csv");
});

test("the listing row's clause counts who's waiting, and says nothing for nobody", () => {
  assert.equal(waitingClause(3), "3 waiting");
  assert.equal(waitingClause(1), "1 waiting");
  assert.equal(waitingClause(0), null);
});

test("Delete listing's confirm names what goes with it", () => {
  const dana = [{ firstName: "Dana" }];
  const three = [{ firstName: "Dana" }, { firstName: "Sam" }, { firstName: "Lee" }];
  // Today's photo-only lines.
  assert.equal(deleteListingBody(0, []), undefined);
  assert.equal(deleteListingBody(1, []), "Its 1 photo goes too.");
  assert.equal(deleteListingBody(4, []), "Its 4 photos go too.");
  // With people waiting.
  assert.equal(deleteListingBody(4, three), "Its 4 photos and the 3 people waiting go too.");
  assert.equal(deleteListingBody(0, three), "The 3 people waiting go too.");
  assert.equal(deleteListingBody(0, dana), "Dana, who's waiting, goes too.");
  assert.equal(deleteListingBody(1, dana), "Its 1 photo and Dana, who's waiting, go too.");
});

test("the toasts", () => {
  assert.equal(emailsCopiedToast(3), "3 emails copied");
  assert.equal(emailsCopiedToast(1), "1 email copied");
  assert.equal(removedToast("Dana"), "Dana removed from the list");
});

test("a phone's cap applies to its stored display form, so Remove then Undo reads every row back", () => {
  const raw = `7165551234 ${"a".repeat(29)}`;
  assert.equal(raw.length, 40);
  const stored = cleanPhone(raw);
  assert.equal(stored, undefined);
  // 38 typed characters grow to 40 stored and still read.
  const ok = cleanPhone(`7165551234 ${"a".repeat(27)}`);
  assert.ok(typeof ok === "string" && ok.length <= 40);
  const again = readSignUp({ firstName: "Dana", email: "d@x.com", phone: ok as string });
  assert.equal(again.ok, true);
});

test("an email with a comma, semicolon or angle bracket is refused, since it would split the BCC list", () => {
  for (const bad of ["dana,smith@gmail.com", "dana;x@y.com", "<dana@y.com>"]) {
    assert.equal(waitlistFieldProblem("email", bad), EMAIL_INVALID, bad);
  }
  assert.equal(waitlistFieldProblem("email", "dana.smith@gmail.com"), null);
});
