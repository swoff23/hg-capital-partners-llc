import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  ConflictError,
  FIELD_FALLBACK,
  FieldError,
  GENERIC_ERROR,
  OFFLINE_ERROR,
  callAction,
  conflictBy,
  conflictKeepLabel,
  conflictMessage,
  conflictValueLine,
  isOfflineError,
  isPlainMessage,
  NUMBER_TOO_BIG,
  plainIssueMessage,
  toFailure,
  userMessage,
  zodFieldErrors,
} from "./action-result";

test("zod's own defaults never reach the screen: the rule comes out in plain words", () => {
  const r = z.object({ address: z.string().min(4) }).safeParse({ address: "ab" });
  assert.equal(r.success, false);
  assert.equal(userMessage(r.error), "Use at least 4 characters.");
});

test("the break-the-app cases: a long Next action, a long title, a long checklist item", () => {
  // deals: "Invalid nextAction: Too big: expected string to have <=300 characters"
  const deal = z.object({ nextAction: z.string().max(300).nullish() }).safeParse({ nextAction: "x".repeat(301) });
  assert.equal(deal.success, false);
  assert.equal(userMessage(deal.error), "Use 300 characters or fewer.");
  assert.deepEqual(toFailure(deal.error), {
    ok: false,
    error: "Use 300 characters or fewer.",
    fieldErrors: { nextAction: "Use 300 characters or fewer." },
  });
  // tasks: "Invalid description: Too big: expected string to have <=20000 characters"
  const notes = z.object({ description: z.string().max(20_000) }).safeParse({ description: "x".repeat(20_001) });
  assert.equal(notes.success, false);
  assert.equal(userMessage(notes.error), "Use 20,000 characters or fewer.");
  // a schema with no path at all: "Invalid input: Too big: …"
  const item = z.string().max(300).safeParse("x".repeat(301));
  assert.equal(item.success, false);
  assert.equal(userMessage(item.error), "Use 300 characters or fewer.");
});

test("plainIssueMessage: every common rule has plain words, and none is zod's text", () => {
  const schema = z.object({
    a: z.string().max(300),
    b: z.string().min(1),
    c: z.coerce.number().int(),
    d: z.coerce.number().max(10_000),
    e: z.string().email(),
    f: z.enum(["x", "y"]),
    g: z.array(z.string()).max(50),
    h: z.number().positive(),
    i: z.string().url(),
    j: z.number(),
    k: z.int(),
    l: z.number().lt(100),
    m: z.number().min(1),
    n: z.array(z.string()).min(1),
    o: z.number().multipleOf(1),
  });
  const r = schema.safeParse({
    a: "x".repeat(301),
    b: "",
    c: "1.5",
    d: "20000",
    e: "nope",
    f: "z",
    g: Array(51).fill("a"),
    h: 0,
    i: "nah",
    j: "text",
    k: 2 ** 60,
    l: 100,
    m: 0,
    n: [],
    o: 1.5,
  });
  assert.equal(r.success, false);
  assert.deepEqual(zodFieldErrors(r.error), {
    a: "Use 300 characters or fewer.",
    b: "Fill this in.",
    c: "Enter a whole number.",
    d: "Enter 10,000 or less.",
    e: "Enter a full email, like name@example.com.",
    f: "Pick one of the options.",
    g: "Use 50 or fewer.",
    h: "Enter more than 0.",
    i: "Enter a full link, like https://example.com.",
    j: "Enter a number.",
    k: NUMBER_TOO_BIG,
    l: "Enter less than 100.",
    m: "Enter 1 or more.",
    n: "Add at least one.",
    o: "Enter a whole number.",
  });
  for (const issue of r.error.issues) {
    const line = plainIssueMessage(issue);
    assert.equal(isPlainMessage(line), true, line);
    assert.doesNotMatch(line, /Invalid|expected|Too (big|small)|<=|>=/, line);
  }
  assert.equal(plainIssueMessage(undefined), FIELD_FALLBACK);
  assert.equal(plainIssueMessage({ code: "custom", message: "Invalid input" }), FIELD_FALLBACK);
});

test("a number too big for its column says so, since trying again can't fix it", () => {
  // deals and portfolio: Units 3000000000 into an INT4, $20,000,000,000 into a Decimal(12, 2)
  const int4 = Object.assign(new Error("Unable to fit integer value '3000000000' into an INT4 (32-bit signed integer)."), {
    name: "PrismaClientUnknownRequestError",
  });
  const numeric = Object.assign(new Error("Invalid `prisma.deal.update()` invocation: numeric field overflow"), {
    name: "PrismaClientKnownRequestError",
    code: "P2020",
  });
  assert.equal(userMessage(int4), NUMBER_TOO_BIG);
  assert.equal(userMessage(numeric), NUMBER_TOO_BIG);
  assert.deepEqual(toFailure(numeric), { ok: false, error: NUMBER_TOO_BIG });
});

test("a thrown message passes through only when it's written for people", () => {
  assert.equal(userMessage(new Error("This job is closed.")), "This job is closed.");
  // A config check's or a library's text, which would name env vars or internals.
  assert.equal(userMessage(new Error("QuickBooks needs QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI and QBO_TOKEN_SECRET set")), GENERIC_ERROR);
  assert.equal(userMessage(new TypeError("Cannot read properties of undefined (reading 'id')")), GENERIC_ERROR);
  assert.equal(userMessage(new Error("Not a date: 2026-02-30")), GENERIC_ERROR);
});

test("our own thrown messages pass through", () => {
  assert.equal(userMessage(new Error("Keep at least one equipment rule.")), "Keep at least one equipment rule.");
});

test("infrastructure errors become the generic line", () => {
  const prisma = new Error("Invalid `prisma.task.update()` invocation");
  prisma.name = "PrismaClientKnownRequestError";
  assert.equal(userMessage(prisma), GENERIC_ERROR);
  assert.equal(userMessage(new Error("connect ECONNREFUSED 127.0.0.1:5432")), GENERIC_ERROR);
  assert.equal(userMessage(new Error("x".repeat(500))), GENERIC_ERROR);
  assert.equal(userMessage(new Error("")), GENERIC_ERROR);
  assert.equal(userMessage("string"), GENERIC_ERROR);
  assert.equal(userMessage(undefined), GENERIC_ERROR);
});

test("callAction passes a result through, ok or refused", async () => {
  assert.deepEqual(await callAction(async () => ({ ok: true, data: { id: "t1" } })), { ok: true, data: { id: "t1" } });
  assert.deepEqual(await callAction(async () => ({ ok: false, error: "This job is closed." })), {
    ok: false,
    error: "This job is closed.",
  });
});

test("callAction turns a dropped connection into the offline line", async () => {
  // What each browser's fetch rejects with when there's no signal.
  for (const message of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "fetch failed"]) {
    const res = await callAction(() => Promise.reject(new TypeError(message)));
    assert.deepEqual(res, { ok: false, error: OFFLINE_ERROR }, message);
  }
});

test("callAction turns anything else thrown into the generic line", async () => {
  const unexpected = new Error("An unexpected response was received from the server.");
  assert.deepEqual(await callAction(() => Promise.reject(unexpected)), { ok: false, error: GENERIC_ERROR });
  // A bug, not the network.
  const bug = new TypeError("Cannot read properties of undefined (reading 'id')");
  assert.deepEqual(await callAction(() => Promise.reject(bug)), { ok: false, error: GENERIC_ERROR });
  assert.deepEqual(
    await callAction(() => {
      throw "boom";
    }),
    { ok: false, error: GENERIC_ERROR },
  );
});

test("callAction lets Next's redirect and notFound through", async () => {
  // An action that redirects rejects on the client with Next's redirect error (server-action-reducer).
  const redirectErr = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/tasks;307;" });
  await assert.rejects(
    callAction(() => Promise.reject(redirectErr)),
    (e) => e === redirectErr,
  );
  let missing: unknown;
  try {
    notFound();
  } catch (e) {
    missing = e;
  }
  await assert.rejects(
    callAction(() => Promise.reject(missing)),
    (e) => e === missing,
  );
});

test("isOfflineError believes the browser when it says it's offline", () => {
  const unexpected = new Error("An unexpected response was received from the server.");
  assert.equal(isOfflineError(unexpected), false);
  const saved = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
  try {
    assert.equal(isOfflineError(unexpected), true);
  } finally {
    if (saved) Object.defineProperty(globalThis, "navigator", saved);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
  assert.equal(isOfflineError(unexpected), false);
});

/* ---------------- The save pipeline's richer failures (forms 2.12) ---------------- */

test("a message written for people reaches the screen as written", () => {
  const r = z
    .object({ address: z.string().min(4, "Enter the full address, like 123 Main St.") })
    .safeParse({ address: "ab" });
  assert.equal(r.success, false);
  assert.equal(userMessage(r.error), "Enter the full address, like 123 Main St.");
});

test("zod issues become each field's own line, keyed by path", () => {
  const schema = z.object({
    address: z.string().min(4, "Enter the address."),
    units: z.coerce.number().int("Enter a whole number.").positive("Enter 1 or more."),
    rate: z.coerce.number().max(30),
    items: z.array(z.object({ label: z.string().min(1, "Name the item.") })),
  });
  const r = schema.safeParse({ address: "", units: "1.5", rate: "99", items: [{ label: "ok" }, { label: "" }] });
  assert.equal(r.success, false);
  const fieldErrors = zodFieldErrors(r.error);
  assert.deepEqual(fieldErrors, {
    address: "Enter the address.",
    units: "Enter a whole number.",
    // zod's own default is developer text, so the field gets the rule in plain words.
    rate: "Enter 30 or less.",
    "items.1.label": "Name the item.",
  });
});

test("the first issue for a field wins, and a form-wide issue has no field", () => {
  const schema = z
    .object({ title: z.string().min(2, "Enter at least 2 characters.").max(3, "Keep it short.") })
    .refine(() => false, { message: "Something about the whole form." });
  const r = schema.safeParse({ title: "a" });
  assert.equal(r.success, false);
  assert.deepEqual(zodFieldErrors(r.error), { title: "Enter at least 2 characters." });
});

test("toFailure carries fieldErrors from a zod failure, with the first plain line as the error", () => {
  const r = z.object({ address: z.string().min(4, "Enter the address.") }).safeParse({ address: "" });
  assert.equal(r.success, false);
  assert.deepEqual(toFailure(r.error), { ok: false, error: "Enter the address.", fieldErrors: { address: "Enter the address." } });
  // A thrown rule error is one line, no fields.
  assert.deepEqual(toFailure(new Error("Keep at least one equipment rule.")), {
    ok: false,
    error: "Keep at least one equipment rule.",
  });
  assert.deepEqual(toFailure(new Error("connect ECONNREFUSED 127.0.0.1:5432")), { ok: false, error: GENERIC_ERROR });
});

test("isPlainMessage: a sentence is written for people, zod's defaults aren't", () => {
  assert.equal(isPlainMessage("Enter the address."), true);
  assert.equal(isPlainMessage("Too small: expected string to have >=4 characters"), false);
  assert.equal(isPlainMessage("Invalid email address"), false);
  assert.equal(isPlainMessage(""), false);
  assert.equal(isPlainMessage(undefined), false);
});

// Buffalo is on daylight time in late October: 18:14 UTC is 2:14 PM there.
const NOW = new Date("2026-10-26T20:00:00Z");

/**
 * ConflictError writes its line against the real clock, so its tests pin Date
 * to NOW (and put it back after); otherwise they'd read "on Oct 26" from Oct 27.
 */
function pinClock(t: TestContext) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  t.after(() => t.mock.timers.reset());
}

test("ConflictError names who and when", (t) => {
  pinClock(t);
  const err = new ConflictError(
    { fields: ["loanRate"], by: "Pieter Smith", at: new Date("2026-10-26T18:14:00Z"), theirs: { loanRate: "7.25" } },
  );
  assert.ok(err instanceof Error);
  assert.equal(err.name, "ConflictError");
  assert.match(err.message, /^Pieter changed this at 2:14\sPM\.$/);
  assert.deepEqual(err.conflict, {
    fields: ["loanRate"],
    by: "Pieter Smith",
    at: "2026-10-26T18:14:00.000Z",
    theirs: { loanRate: "7.25" },
  });
  const failure = toFailure(err);
  assert.equal(failure.ok, false);
  assert.equal(failure.error, err.message);
  assert.deepEqual(failure.conflict, err.conflict);
  assert.equal(failure.fieldErrors, undefined);
  assert.equal(userMessage(err), err.message);
});

test("ConflictError without a person says what changed and when", (t) => {
  pinClock(t);
  const err = new ConflictError({ fields: ["status"], by: null, at: "2026-10-26T18:14:00.000Z" });
  assert.match(err.message, /^This changed at 2:14\sPM\.$/);
  assert.deepEqual(err.conflict, { fields: ["status"], at: "2026-10-26T18:14:00.000Z" });
  assert.equal("by" in err.conflict, false);
  assert.equal("theirs" in err.conflict, false);
  // A blank name is no name.
  assert.equal(new ConflictError({ fields: [], by: "  ", at: NOW }).by, undefined);
  // A caller's own words win.
  assert.equal(new ConflictError({ fields: [], at: NOW }, "Unit 2 changed.").message, "Unit 2 changed.");
});

test("the pinned clock is put back after each test", () => {
  assert.notEqual(Date.now(), NOW.getTime());
  assert.ok(Math.abs(Date.now() - (performance.timeOrigin + performance.now())) < 60_000);
});

test("conflictMessage: today is a time, an earlier day is the date", () => {
  assert.match(conflictMessage({ by: "Connor Swofford", at: "2026-10-26T18:14:00Z" }, NOW), /^Connor changed this at 2:14\sPM\.$/);
  assert.equal(conflictMessage({ by: "Connor Swofford", at: "2026-10-24T18:14:00Z" }, NOW), "Connor changed this on Oct 24.");
  assert.equal(conflictMessage({ at: "2025-10-24T18:14:00Z" }, NOW), "This changed on Oct 24, 2025.");
  // Late evening in Buffalo is the next day in UTC, and still today here.
  assert.match(conflictMessage({ at: "2026-10-27T01:30:00Z" }, new Date("2026-10-27T02:00:00Z")), /^This changed at 9:30\sPM\.$/);
  assert.equal(conflictMessage({ at: "not a date" }, NOW), "This changed since you opened it.");
});

test("conflictValueLine: who set it, to what, and when; or what changed when the row doesn't say who", () => {
  const at = "2026-10-26T18:14:00Z";
  assert.match(conflictValueLine({ by: "Pieter Louw", at }, "$410,000", NOW), /^Pieter set this to \$410,000 at 2:14\sPM$/);
  assert.match(conflictValueLine({ at }, "$410,000", NOW), /^This changed to \$410,000 at 2:14\sPM$/);
  assert.equal(conflictValueLine({ by: "Pieter Louw", at: "2026-10-24T18:14:00Z" }, "7.25%", NOW), "Pieter set this to 7.25% on Oct 24");
  // They cleared it.
  assert.match(conflictValueLine({ by: "Pieter Louw", at }, "", NOW), /^Pieter cleared this at 2:14\sPM$/);
  assert.match(conflictValueLine({ at }, "", NOW), /^This was cleared at 2:14\sPM$/);
});

test("conflictKeepLabel: names the other person, or says current", () => {
  assert.equal(conflictKeepLabel({ by: "Pieter Louw" }), "Keep Pieter's");
  assert.equal(conflictKeepLabel({ by: "pieter@hgcapital.com" }), "Keep Pieter's");
  assert.equal(conflictKeepLabel({}), "Keep current");
});

test("FieldError: a service's refusal lands on its own fields, the first line as the form's", () => {
  const err = new FieldError({ email: "Enter a full email, like name@example.com.", phone: "Enter the full number, like 716-555-1234." });
  assert.equal(userMessage(err), "Enter a full email, like name@example.com.");
  assert.deepEqual(toFailure(err), {
    ok: false,
    error: "Enter a full email, like name@example.com.",
    fieldErrors: { email: "Enter a full email, like name@example.com.", phone: "Enter the full number, like 716-555-1234." },
  });
  // No lines at all still reads as something to fix, not as nothing.
  assert.equal(new FieldError({}).message, FIELD_FALLBACK);
});

test("conflictBy: a first name, or an email's name part", () => {
  assert.equal(conflictBy("Pieter Smith"), "Pieter");
  assert.equal(conflictBy("pieter@hgcapital.com"), "Pieter");
  assert.equal(conflictBy(""), undefined);
  assert.equal(conflictBy(null), undefined);
});
