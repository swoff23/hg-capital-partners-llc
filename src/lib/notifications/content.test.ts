import test from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_EMAIL_CAP,
  MAX_ATTEMPTS,
  deliveryFor,
  easternDayStart,
  emailSubject,
  itemLines,
  itemText,
  openUrl,
  parseItems,
  reachedCapNow,
  refusedRetryAt,
  retryAt,
  sendBudget,
  sendFailureKind,
  taskEmail,
  type OutboxItem,
} from "./content";

const at = "2026-10-22T15:00:00.000Z";
const item = (kind: string, summary: string, actorLabel = "Connor Swofford"): OutboxItem => ({ kind, actorLabel, summary, at });

// The summaries below are the exact shapes src/lib/tasks/core.ts writes.
const TITLE = "Cabinet install";

test("subject: one person's changes read as an update", () => {
  assert.equal(
    emailSubject([item("TARGET", `moved "${TITLE}" to 2026-10-30`), item("COMMENT", '"Doors arrive Thu"')], TITLE),
    "Connor updated Cabinet install",
  );
});

test("subject: a contractor's Mark done says so", () => {
  const zack = "Zack (Outlaw Carpentry)";
  assert.equal(
    emailSubject([item("COMMENT", '"All done"', zack), item("STATUS", 'marked "Fix front steps" done', zack)], "Fix front steps"),
    "Zack marked Fix front steps done",
  );
});

test("subject: an assignment alone says assigned; two partners are both named", () => {
  assert.equal(emailSubject([item("ASSIGNED", `assigned you "${TITLE}"`)], TITLE), "Connor assigned you Cabinet install");
  assert.equal(
    emailSubject([item("NOTES", `updated the notes on "${TITLE}"`), item("COMMENT", '"Use the side door"', "Pieter Hoff")], TITLE),
    "Connor and Pieter updated Cabinet install",
  );
});

test("each change reads as one line without the title", () => {
  assert.equal(itemText(item("TARGET", `moved "${TITLE}" to 2026-10-30`)), "moved the target to Fri, Oct 30");
  assert.equal(itemText(item("TARGET", `moved "${TITLE}" to no date`)), "cleared the target date");
  assert.equal(itemText(item("NOTES", `updated the notes on "${TITLE}"`)), "updated the notes");
  assert.equal(itemText(item("ASSIGNED", `assigned you "${TITLE}"`)), "assigned you this job");
  assert.equal(itemText(item("STATUS", `set "${TITLE}" to in progress`)), "started the job");
  assert.equal(itemText(item("STATUS", `set "${TITLE}" to scheduled`)), "moved it to Scheduled");
  assert.equal(itemText(item("STATUS", `set "${TITLE}" to open`)), "moved it to To do");
  assert.equal(itemText(item("STATUS", `sent "${TITLE}" back: Level the uppers`)), "sent it back: Level the uppers");
  assert.equal(itemText(item("STATUS", `marked "${TITLE}" done`)), "marked it done");
  assert.equal(itemText(item("COMMENT", "added files (+2 files)")), "added 2 files");
  assert.equal(itemText(item("COMMENT", "added files (+1 file)")), "added 1 file");
  assert.equal(itemText(item("ATTACHMENT", "added IMG_0042.jpg")), "added IMG_0042.jpg");
});

test("lines: comments quote, oldest first, only the latest target and notes", () => {
  const lines = itemLines([
    item("TARGET", `moved "${TITLE}" to 2026-10-29`),
    item("COMMENT", '"Doors arrive Thu" (+1 file)'),
    item("TARGET", `moved "${TITLE}" to 2026-10-30`),
  ]);
  assert.deepEqual(lines, ['Connor: "Doors arrive Thu" (+1 file)', "Connor moved the target to Fri, Oct 30"]);
});

test("the whole email: job and street, the lines, one button to the right place", () => {
  const email = taskEmail({
    items: [item("COMMENT", '"Uppers in"', "Zack Smith")],
    title: TITLE,
    address: "23 Sherwood St, Buffalo, NY 14213",
    audience: "staff",
    appUrl: "https://hg.example.com/",
    taskId: "t1",
  });
  assert.deepEqual(email, {
    subject: "Zack updated Cabinet install",
    line: "Cabinet install, 23 Sherwood St",
    items: ['Zack: "Uppers in"'],
    buttonLabel: "Open task",
    buttonUrl: "https://hg.example.com/tasks/t1",
  });
  assert.equal(openUrl("https://hg.example.com", "contractor", "t1"), "https://hg.example.com/p/jobs/t1");
});

test("a title with line breaks can't break the subject", () => {
  assert.equal(emailSubject([item("NOTES", "updated the notes")], "Fix\nsteps"), "Connor updated Fix steps");
});

test("parseItems keeps only well-formed items", () => {
  assert.deepEqual(parseItems(null), []);
  assert.deepEqual(parseItems([{ kind: "COMMENT" }, item("NOTES", "x"), "junk"]), [item("NOTES", "x")]);
});

test("recipients: staff, a contractor with an active login and access, or skipped", () => {
  const access = { contractorHasAccess: true };
  assert.deepEqual(deliveryFor({ recipientUser: { email: "c@hg.com" }, recipientContact: null }, access), {
    ok: true,
    to: "c@hg.com",
    audience: "staff",
  });
  const contact = (active: boolean, status: string | null) => ({
    recipientUser: null,
    recipientContact: { active, portalAccount: status ? { email: "zack@x.com", status } : null },
  });
  assert.deepEqual(deliveryFor(contact(true, "ACTIVE"), access), { ok: true, to: "zack@x.com", audience: "contractor" });
  assert.deepEqual(deliveryFor(contact(true, null), access), { ok: false, reason: "no login" });
  assert.deepEqual(deliveryFor(contact(true, "DISABLED"), access), { ok: false, reason: "no login" });
  assert.deepEqual(deliveryFor(contact(false, "ACTIVE"), access), { ok: false, reason: "no login" });
  assert.deepEqual(deliveryFor({ recipientUser: null, recipientContact: null }, access), { ok: false, reason: "no recipient" });
});

test("recipients: a contractor taken off the job before the send gets nothing (D12)", () => {
  const zack = { recipientUser: null, recipientContact: { active: true, portalAccount: { email: "zack@x.com", status: "ACTIVE" } } };
  assert.deepEqual(deliveryFor(zack, { contractorHasAccess: false }), { ok: false, reason: "no access" });
  // Staff rows don't depend on contractor access.
  assert.deepEqual(deliveryFor({ recipientUser: { email: "c@hg.com" }, recipientContact: null }, { contractorHasAccess: false }), {
    ok: true,
    to: "c@hg.com",
    audience: "staff",
  });
});

test("refused sends: Resend's quota is retried hourly and its rate limit in a minute; anything else is a failed try", () => {
  assert.equal(sendFailureKind({ status: 429, code: "daily_quota_exceeded" }), "quota");
  assert.equal(sendFailureKind({ status: 429, code: "monthly_quota_exceeded" }), "quota");
  assert.equal(sendFailureKind({ status: 429, code: "rate_limit_exceeded" }), "rate");
  assert.equal(sendFailureKind({ status: 429 }), "rate");
  assert.equal(sendFailureKind({ status: 422, code: "validation_error" }), "error");
  assert.equal(sendFailureKind({}), "error");
  const now = new Date("2026-10-22T15:00:00Z");
  assert.equal(refusedRetryAt("quota", now).toISOString(), "2026-10-22T16:00:00.000Z");
  assert.equal(refusedRetryAt("rate", now).toISOString(), "2026-10-22T15:01:00.000Z");
});

test("daily cap: the batch shrinks to what's left, and the crossing is seen once", () => {
  assert.equal(DAILY_EMAIL_CAP, 100);
  assert.equal(sendBudget(0, 50), 50);
  assert.equal(sendBudget(80, 50), 20);
  assert.equal(sendBudget(100, 50), 0);
  assert.equal(sendBudget(130, 50), 0);
  assert.equal(reachedCapNow(80, 20), true);
  assert.equal(reachedCapNow(80, 19), false);
  assert.equal(reachedCapNow(100, 0), false);
  assert.equal(reachedCapNow(100, 3), false);
});

test("retries back off, then give up after the fifth try", () => {
  const now = new Date("2026-10-22T15:00:00Z");
  const mins = (d: Date | null) => (d ? (d.getTime() - now.getTime()) / 60_000 : null);
  assert.deepEqual([1, 2, 3, 4].map((a) => mins(retryAt(a, now))), [1, 5, 15, 60]);
  assert.equal(retryAt(MAX_ATTEMPTS, now), null);
});

test("the Buffalo day starts at local midnight, in daylight and standard time", () => {
  // 2pm EDT, Oct 22: midnight was 04:00Z.
  assert.equal(easternDayStart(new Date("2026-10-22T18:00:00Z")).toISOString(), "2026-10-22T04:00:00.000Z");
  // 11pm EDT, Oct 22 is 03:00Z on the 23rd: still the 22nd in Buffalo.
  assert.equal(easternDayStart(new Date("2026-10-23T03:00:00Z")).toISOString(), "2026-10-22T04:00:00.000Z");
  // Dec 1, standard time: midnight is 05:00Z.
  assert.equal(easternDayStart(new Date("2026-12-01T12:00:00Z")).toISOString(), "2026-12-01T05:00:00.000Z");
  // Fall back (Nov 1, 2026): the day began in daylight time.
  assert.equal(easternDayStart(new Date("2026-11-01T20:00:00Z")).toISOString(), "2026-11-01T04:00:00.000Z");
  // Spring forward (Mar 8, 2026): the day began in standard time.
  assert.equal(easternDayStart(new Date("2026-03-08T20:00:00Z")).toISOString(), "2026-03-08T05:00:00.000Z");
});
