import test from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_EMAIL_CAP,
  MAX_ATTEMPTS,
  deliveryFor,
  easternDayStart,
  emailSubject,
  filePhrase,
  firstUpdateId,
  itemLine,
  itemLines,
  itemText,
  openUrl,
  parseItems,
  reachedCapNow,
  reconcileItems,
  refusedRetryAt,
  replyLine,
  retryAt,
  sendBudget,
  sendFailureKind,
  taskEmail,
  type EventSnapshot,
  type OutboxItem,
} from "./content";

const at = "2026-10-22T15:00:00.000Z";
const item = (kind: string, summary: string, actorLabel = "Connor Swofford"): OutboxItem => ({ kind, actorLabel, summary, at });

// The summaries below are the exact shapes src/lib/tasks/core.ts writes.
const TITLE = "Cabinet install";

test("subject: one person's changes read as an update", () => {
  assert.equal(
    emailSubject([item("TARGET", `moved "${TITLE}" to Fri, Oct 30`), item("COMMENT", '"Doors arrive Thu"')], TITLE),
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
  // A contractor reads a due date or a visit, never "target" (the job page's words). Core records which at enqueue.
  assert.equal(itemText({ ...item("TARGET", `moved "${TITLE}" to Fri, Oct 30`), visit: false }), "moved the due date to Fri, Oct 30");
  assert.equal(itemText({ ...item("TARGET", `moved "${TITLE}" to Fri, Oct 30`), visit: true }), "moved the visit to Fri, Oct 30");
  assert.equal(itemText({ ...item("TARGET", `moved "${TITLE}" to no date`), visit: false }), "cleared the due date");
  assert.equal(itemText({ ...item("TARGET", `moved "${TITLE}" to no date`), visit: true }), "cleared the visit date");
  // Rows queued before the flag read neutrally, and still parse.
  assert.equal(itemText(item("TARGET", `moved "${TITLE}" to Fri, Oct 30`)), "moved the date to Fri, Oct 30");
  assert.equal(itemText(item("TARGET", `moved "${TITLE}" to no date`)), "cleared the date");
  assert.equal(itemText(item("NOTES", `updated the notes on "${TITLE}"`)), "updated the notes");
  assert.equal(itemText(item("ASSIGNED", `assigned you "${TITLE}"`)), "assigned you this job");
  assert.equal(itemText(item("ASSIGNED", `assigned you "${TITLE}" for Thu, Oct 29`)), "assigned you this job for Thu, Oct 29");
  assert.equal(itemText(item("ASSIGNED", `assigned you "${TITLE}" for Tue, Jan 5, 2027`)), "assigned you this job for Tue, Jan 5, 2027");
  assert.equal(itemText(item("ASSIGNED", `assigned you "Quote \"A\" for B"`)), "assigned you this job");
  assert.equal(itemText(item("STATUS", `started "${TITLE}"`, "Zack Smith")), "started the job");
  assert.equal(itemText(item("STATUS", `scheduled "${TITLE}" for Thu, Oct 29`)), "scheduled it for Thu, Oct 29");
  assert.equal(itemText(item("STATUS", `set "${TITLE}" to open`)), "moved it to To do");
  assert.equal(itemText(item("STATUS", `sent "${TITLE}" back: Level the uppers`)), "sent it back: Level the uppers");
  assert.equal(itemText(item("STATUS", `marked "${TITLE}" done`)), "marked it done");
  assert.equal(itemText(item("COMMENT", "added files (+2 files)")), "added 2 files");
  assert.equal(itemText(item("COMMENT", "added files (+1 file)")), "added 1 file");
  assert.equal(itemText(item("ATTACHMENT", "added IMG_0042.jpg")), "added IMG_0042.jpg");
});

test("Approve says approved, and only the contractor's own Start says started (BCONTRACT-008)", () => {
  assert.equal(itemLines([item("STATUS", `approved "${TITLE}"`)])[0], "Connor approved it");
  // A partner moving the job to In progress didn't start the work.
  assert.equal(itemLines([item("STATUS", `set "${TITLE}" to in progress`)])[0], "Connor moved it to In progress");
  assert.equal(itemLines([item("STATUS", `started "${TITLE}"`, "Zack Smith")])[0], "Zack started the job");
  // A title with a quote in it still reads whole.
  assert.equal(itemText(item("STATUS", `approved "Hang 36" mirror"`)), "approved it");
});

test("subject: sent back, scheduled and approved say so (BCONTRACT-007)", () => {
  assert.equal(emailSubject([item("STATUS", `sent "${TITLE}" back: Level the uppers`)], TITLE), "Connor sent back Cabinet install");
  // The visit date moved again within the same email: the subject gives the new date, or none if it was cleared.
  const scheduled = item("STATUS", `scheduled "${TITLE}" for Thu, Oct 29`);
  assert.equal(emailSubject([scheduled, item("TARGET", `moved "${TITLE}" to Fri, Oct 30`)], TITLE), "Connor scheduled Cabinet install for Fri, Oct 30");
  assert.equal(emailSubject([scheduled, item("TARGET", `moved "${TITLE}" to no date`)], TITLE), "Connor updated Cabinet install");
  assert.equal(emailSubject([item("TARGET", `moved "${TITLE}" to Fri, Oct 30`), scheduled], TITLE), "Connor scheduled Cabinet install for Thu, Oct 29");
  assert.equal(
    emailSubject([item("STATUS", `scheduled "${TITLE}" for Thu, Oct 29`), item("COMMENT", '"Side door"', "Pieter Hoff")], TITLE),
    "Connor scheduled Cabinet install for Thu, Oct 29",
  );
  assert.equal(emailSubject([item("COMMENT", '"Looks great"'), item("STATUS", `approved "${TITLE}"`, "Pieter Hoff")], TITLE), "Pieter approved Cabinet install");
  // The latest status change decides: sent back, then approved, reads approved.
  assert.equal(
    emailSubject([item("STATUS", `sent "${TITLE}" back`), item("STATUS", `approved "${TITLE}"`)], TITLE),
    "Connor approved Cabinet install",
  );
  // Approved, then reopened: the job isn't approved any more.
  assert.equal(
    emailSubject([item("STATUS", `approved "${TITLE}"`), item("STATUS", `set "${TITLE}" to in progress`)], TITLE),
    "Connor updated Cabinet install",
  );
  // Assigned with a visit date: the assignment line already has the date.
  assert.equal(emailSubject([item("ASSIGNED", `assigned you "${TITLE}" for Thu, Oct 29`)], TITLE), "Connor assigned you Cabinet install");
});

test("the job line names the unit as My jobs does (BCONTRACT-V03)", () => {
  const base = { items: [item("NOTES", "updated the notes")], title: "Bathroom tile", audience: "contractor" as const, appUrl: "https://hg.example.com", taskId: "t1" };
  assert.equal(taskEmail({ ...base, address: "415 Crescent Ave, Buffalo, NY 14214", unitLabel: "Upper" }).line, "Bathroom tile, 415 Crescent Ave · Upper");
  assert.equal(taskEmail({ ...base, address: "415 Crescent Ave, Buffalo, NY 14214", unitLabel: " 2 " }).line, "Bathroom tile, 415 Crescent Ave · 2");
  assert.equal(taskEmail({ ...base, address: "415 Crescent Ave, Buffalo, NY 14214", unitLabel: null }).line, "Bathroom tile, 415 Crescent Ave");
  assert.equal(taskEmail({ ...base, address: null, unitLabel: null }).line, "Bathroom tile");
});

test("a scheduled job's email gives the visit date", () => {
  const email = taskEmail({
    items: [item("STATUS", `scheduled "${TITLE}" for Thu, Oct 29`)],
    title: TITLE,
    address: "23 Sherwood St, Buffalo, NY 14213",
    audience: "contractor",
    appUrl: "https://hg.example.com",
    taskId: "t1",
  });
  assert.deepEqual(email.items, ["Connor scheduled it for Thu, Oct 29"]);
  // Next year's date says the year.
  assert.equal(itemText(item("STATUS", `scheduled "${TITLE}" for Tue, Jan 5, 2027`)), "scheduled it for Tue, Jan 5, 2027");
});

test("a title with a quote in it comes out whole", () => {
  const t = 'Hang 36" mirror';
  assert.equal(itemText(item("STATUS", `scheduled "${t}" for Thu, Oct 29`)), "scheduled it for Thu, Oct 29");
  assert.equal(itemText({ ...item("TARGET", `moved "${t}" to Fri, Oct 30`), visit: false }), "moved the due date to Fri, Oct 30");
  assert.equal(itemText(item("STATUS", `marked "${t}" done`)), "marked it done");
  assert.equal(itemText(item("STATUS", `sent "${t}" back: Level it`)), "sent it back: Level it");
  assert.equal(itemText(item("STATUS", `sent "${t}" back`)), "sent it back");
  assert.equal(itemText(item("STATUS", `set "${t}" to done`)), "moved it to Done");
});

test("lines: comments quote, oldest first, only the latest target and notes", () => {
  const lines = itemLines([
    item("TARGET", `moved "${TITLE}" to Thu, Oct 29`),
    item("COMMENT", '"Doors arrive Thu" (+1 file)'),
    item("TARGET", `moved "${TITLE}" to Fri, Oct 30`),
  ]);
  assert.deepEqual(lines, ['Connor: "Doors arrive Thu" (+1 file)', "Connor moved the date to Fri, Oct 30"]);
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

test("an approval thanks the contractor by first name, and the button reads See job (BCONTRACT-008)", () => {
  const base = {
    title: TITLE,
    address: "23 Sherwood St, Buffalo, NY 14213",
    audience: "contractor" as const,
    appUrl: "https://hg.example.com",
    taskId: "t1",
    staffNames: ["Connor", "Pieter"],
  };
  const approved = [item("COMMENT", '"Looks great"', "Pieter Hoff"), item("STATUS", `approved "${TITLE}"`, "Pieter Hoff")];
  // Approved means Done: the job is closed by send time, so there's nowhere to reply.
  assert.deepEqual(taskEmail({ ...base, items: approved, recipientName: "Zack (Outlaw Carpentry)", jobOpen: false }), {
    subject: "Pieter approved Cabinet install",
    line: "Cabinet install, 23 Sherwood St",
    items: ['Pieter: "Looks great"', "Pieter approved it"],
    closing: "Thanks, Zack.",
    buttonLabel: "See job",
    buttonUrl: "https://hg.example.com/p/jobs/t1",
  });
  // The name he goes by; no name on the contact still thanks.
  assert.equal(taskEmail({ ...base, items: approved, recipientName: "Jacob (Jake) Hoak" }).closing, "Thanks, Jake.");
  assert.equal(taskEmail({ ...base, items: approved, recipientName: null }).closing, "Thanks.");
  // A comment after the approval doesn't take it back.
  const thenComment = [...approved, item("COMMENT", '"Invoice by Friday"')];
  assert.equal(taskEmail({ ...base, items: thenComment, recipientName: "Zack Smith" }).buttonLabel, "See job");
  // Approved, then reopened: the latest status change isn't an approval.
  const reopened = taskEmail({
    ...base,
    items: [item("STATUS", `approved "${TITLE}"`), item("STATUS", `set "${TITLE}" to in progress`)],
    recipientName: "Zack Smith",
  });
  assert.equal(reopened.closing, undefined);
  assert.equal(reopened.buttonLabel, "Open job");
  // Every other contractor email keeps Open job, with no thanks.
  const sentBack = taskEmail({ ...base, items: [item("STATUS", `sent "${TITLE}" back: Level the uppers`)], recipientName: "Zack Smith" });
  assert.equal(sentBack.closing, undefined);
  assert.equal(sentBack.buttonLabel, "Open job");
  // Staff never get the thanks or See job.
  const staff = taskEmail({ ...base, audience: "staff", items: approved, recipientName: "Zack Smith" });
  assert.equal(staff.closing, undefined);
  assert.equal(staff.buttonLabel, "Open task");
});

test("contractor emails say where to reply, naming the partners; staff emails don't", () => {
  assert.equal(replyLine(["Connor", "Pieter"]), "Reply in the job so Connor and Pieter both see it.");
  assert.equal(replyLine(["Connor"]), "Reply in the job so Connor sees it.");
  assert.equal(replyLine(["Connor", "Pieter", "Dana"]), "Reply in the job so Connor, Pieter and Dana all see it.");
  assert.equal(replyLine([]), "Reply in the job so HG sees it.");
  const base = { items: [item("NOTES", "updated the notes")], title: TITLE, address: null, appUrl: "https://hg.example.com", taskId: "t1" };
  assert.equal(
    taskEmail({ ...base, audience: "contractor", staffNames: ["Connor", "Pieter"] }).footnote,
    "Reply in the job so Connor and Pieter both see it.",
  );
  // Only while the job is still open when the email goes out.
  assert.equal(
    taskEmail({ ...base, audience: "contractor", staffNames: ["Connor", "Pieter"], jobOpen: true }).footnote,
    "Reply in the job so Connor and Pieter both see it.",
  );
  assert.ok(!("footnote" in taskEmail({ ...base, audience: "contractor", staffNames: ["Connor", "Pieter"], jobOpen: false })));
  assert.ok(!("footnote" in taskEmail({ ...base, audience: "staff", staffNames: ["Connor", "Pieter"] })));
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

/* ---------------- What a claimed row sends (activity 2.5 and 2.10) ---------------- */

const snap = (over: Partial<EventSnapshot> & { id: string }): EventSnapshot => ({
  visibility: "SHARED",
  deletedAt: null,
  body: "Doors are in",
  audienceContactId: "c-zack",
  files: [],
  ...over,
});
const withEvent = (it: OutboxItem, eventId: string, extra: Partial<OutboxItem> = {}): OutboxItem => ({ ...it, eventId, ...extra });
const toZack = { audience: "contractor" as const, recipientContactId: "c-zack" };
const events = (...list: EventSnapshot[]) => new Map(list.map((e) => [e.id, e]));

test("files read as '3 photos and 1 file', not '(+3 files)'", () => {
  assert.equal(filePhrase(["image", "image", "image", "file"]), "3 photos and 1 file");
  assert.equal(filePhrase(["image"]), "1 photo");
  assert.equal(filePhrase(["file", "file"]), "2 files");
  assert.equal(filePhrase(["video"]), "1 video");
  assert.equal(filePhrase(["image", "image", "video", "file", "file"]), "2 photos, 1 video and 2 files");
  assert.equal(filePhrase([]), "");
});

test("a comment is re-read when the row is claimed: the current words, up to 500 characters, with its line breaks", () => {
  const stored = withEvent(item("COMMENT", '"Doors are in"'), "e1");
  const [edited] = reconcileItems([stored], events(snap({ id: "e1", body: "Doors are in.\n\nTrim needs one more coat.\r\nFriday?" })), toZack);
  assert.equal(edited.summary, '"Doors are in.\n\nTrim needs one more coat.\nFriday?"');
  assert.equal(itemLine(edited), 'Connor: "Doors are in.\n\nTrim needs one more coat.\nFriday?"');
  // The cut: 500 characters, then an ellipsis. Not shorter than the old 140.
  const long = "word ".repeat(200);
  const [cut] = reconcileItems([stored], events(snap({ id: "e1", body: long })), toZack);
  const body = cut.summary.slice(1, cut.summary.lastIndexOf('"'));
  assert.ok(body.length > 140 && body.length <= 501, "500 characters of text, trimmed, then the ellipsis");
  assert.ok(body.endsWith("…") && !body.endsWith(" …"));
  const dense = "x".repeat(900);
  const [denseCut] = reconcileItems([stored], events(snap({ id: "e1", body: dense })), toZack);
  assert.equal(denseCut.summary, `"${"x".repeat(500)}…"`);
  const exact = "a".repeat(500);
  assert.equal(reconcileItems([stored], events(snap({ id: "e1", body: exact })), toZack)[0].summary, `"${exact}"`);
});

test("files after the words, or alone, are counted the new way", () => {
  const stored = withEvent(item("COMMENT", '"Doors are in" (+4 files)'), "e1");
  const photos = ["image", "image", "image", "file"] as const;
  assert.equal(reconcileItems([stored], events(snap({ id: "e1", files: [...photos] })), toZack)[0].summary, '"Doors are in" (3 photos and 1 file)');
  const only = reconcileItems([withEvent(item("COMMENT", "added files (+2 files)"), "e1")], events(snap({ id: "e1", body: null, files: ["image", "image"] })), toZack)[0];
  assert.equal(only.summary, "added 2 photos");
  assert.equal(itemLine(only), "Connor added 2 photos");
  assert.equal(itemLine(reconcileItems([stored], events(snap({ id: "e1", files: [...photos] })), toZack)[0]), 'Connor: "Doors are in" (3 photos and 1 file)');
  // Files removed since: just the words.
  assert.equal(reconcileItems([stored], events(snap({ id: "e1", files: [] })), toZack)[0].summary, '"Doors are in"');
});

test("the old forms still parse", () => {
  assert.equal(itemText(item("COMMENT", '"Doors are in" (+2 files)')), ': "Doors are in" (+2 files)');
  assert.equal(itemText(item("COMMENT", "added files (+3 files)")), "added 3 files");
  assert.equal(itemText(item("COMMENT", "added files (+1 file)")), "added 1 file");
  // A queued comment's line breaks survive the plain parse too.
  assert.equal(itemLine(item("COMMENT", '"one\ntwo"')), 'Connor: "one\ntwo"');
});

test("a deleted comment never reaches Zack; an edited one is what he gets", () => {
  const first = withEvent(item("COMMENT", '"Thursday?"'), "e1");
  const second = withEvent(item("COMMENT", '"Friday"'), "e2");
  const out = reconcileItems([first, second], events(snap({ id: "e1", deletedAt: new Date() }), snap({ id: "e2", body: "Friday at 9" })), toZack);
  assert.deepEqual(out.map((i) => i.summary), ['"Friday at 9"']);
  // An event the read didn't find is dropped like a deleted one; so is a comment emptied of its words and files.
  assert.deepEqual(reconcileItems([first], events(), toZack), []);
  assert.deepEqual(reconcileItems([first], events(snap({ id: "e1", body: null })), toZack), []);
  // The order of what stays is kept.
  const third = withEvent(item("COMMENT", '"c"'), "e3");
  assert.deepEqual(
    reconcileItems([first, second, third], events(snap({ id: "e1" }), snap({ id: "e2", deletedAt: new Date() }), snap({ id: "e3", body: "c2" })), toZack).map((i) => i.eventId),
    ["e1", "e3"],
  );
});

test("a row can mix new items and ones queued before they named events: the old send as stored", () => {
  const old = item("COMMENT", '"Old note" (+1 file)');
  const assigned = item("ASSIGNED", `assigned you "${TITLE}"`);
  const fresh = withEvent(item("COMMENT", '"Doors"'), "e1");
  const out = reconcileItems([old, assigned, fresh], events(snap({ id: "e1", body: "Doors, edited" })), toZack);
  assert.deepEqual(out.map((i) => i.summary), ['"Old note" (+1 file)', `assigned you "${TITLE}"`, '"Doors, edited"']);
  // Nothing needing a read means nothing changes.
  assert.deepEqual(reconcileItems([old, assigned], events(), toZack), [old, assigned]);
});

test("TARGET, NOTES and ASSIGNED are never filtered: they email contractors by design", () => {
  const rest = [
    { ...item("TARGET", `moved "${TITLE}" to Fri, Oct 30`), visit: true },
    item("NOTES", `updated the notes on "${TITLE}"`),
    item("ASSIGNED", `assigned you "${TITLE}"`),
  ];
  assert.deepEqual(reconcileItems(rest, events(), toZack), rest);
});

test("a comment that isn't Shared or isn't Zack's is not sent to Zack; partners get a contractor's as it is", () => {
  const stored = withEvent(item("COMMENT", '"Hmm"'), "e1");
  assert.deepEqual(reconcileItems([stored], events(snap({ id: "e1", visibility: "INTERNAL" })), toZack), []);
  assert.deepEqual(reconcileItems([stored], events(snap({ id: "e1", audienceContactId: "c-jose" })), toZack), []);
  assert.equal(reconcileItems([stored], events(snap({ id: "e1", audienceContactId: null })), toZack).length, 1);
  const toPartner = { audience: "staff" as const, recipientContactId: null };
  assert.equal(reconcileItems([stored], events(snap({ id: "e1", audienceContactId: null })), toPartner).length, 1);
  const status = withEvent(item("STATUS", `approved "${TITLE}"`), "s1");
  assert.deepEqual(reconcileItems([status], events(snap({ id: "s1", visibility: "INTERNAL", body: null })), toZack), []);
  assert.equal(reconcileItems([status], events(snap({ id: "s1", body: null })), toZack).length, 1);
});

test("an approval that was taken back (its Done line deleted) is dropped from the email", () => {
  const approved = withEvent(item("STATUS", `approved "${TITLE}"`), "s1");
  const comment = withEvent(item("COMMENT", '"Thanks"'), "e1");
  const out = reconcileItems([comment, approved], events(snap({ id: "e1", body: "Thanks" }), snap({ id: "s1", body: null, deletedAt: new Date() })), toZack);
  assert.deepEqual(out.map((i) => i.kind), ["COMMENT"]);
});

test("a send-back's note lives inside its status line: edited, the email follows; deleted, it comes out", () => {
  const back = withEvent(item("STATUS", `sent "${TITLE}" back: Level the uppers`), "s1", { noteEventId: "n1" });
  const status = snap({ id: "s1", body: null });
  assert.equal(reconcileItems([back], events(status, snap({ id: "n1", body: "Level the uppers and re-hang" })), toZack)[0].summary, `sent "${TITLE}" back: Level the uppers and re-hang`);
  assert.equal(itemLine(reconcileItems([back], events(status, snap({ id: "n1", body: "Level the uppers and re-hang" })), toZack)[0]), "Connor sent it back: Level the uppers and re-hang");
  assert.equal(reconcileItems([back], events(status, snap({ id: "n1", deletedAt: new Date() })), toZack)[0].summary, `sent "${TITLE}" back`);
  assert.equal(reconcileItems([back], events(status), toZack)[0].summary, `sent "${TITLE}" back`, "a note the read didn't find is taken out");
  // A title with quotes stays whole; the line is never listed twice.
  const odd = withEvent(item("STATUS", `sent "Hang 36" mirror" back: old`), "s1", { noteEventId: "n1" });
  assert.equal(reconcileItems([odd], events(status, snap({ id: "n1", body: "new" })), toZack)[0].summary, 'sent "Hang 36" mirror" back: new');
  assert.equal(reconcileItems([back], events(status, snap({ id: "n1", body: "x" })), toZack).length, 1);
  // Other status lines with a note id are untouched.
  const approved = withEvent(item("STATUS", `approved "${TITLE}"`), "s1", { noteEventId: "n1" });
  assert.equal(reconcileItems([approved], events(status, snap({ id: "n1" })), toZack)[0].summary, `approved "${TITLE}"`);
});

test("the button opens at the first update in the bundle; nothing to open at means the job", () => {
  const base = { title: TITLE, address: null, audience: "contractor" as const, appUrl: "https://hg.example.com", taskId: "t1" };
  const items = [item("ASSIGNED", `assigned you "${TITLE}"`), withEvent(item("COMMENT", '"Doors"'), "e7"), withEvent(item("STATUS", `approved "${TITLE}"`), "e8")];
  assert.equal(taskEmail({ ...base, items }).buttonUrl, "https://hg.example.com/p/jobs/t1#update-e7");
  assert.equal(taskEmail({ ...base, audience: "staff", items }).buttonUrl, "https://hg.example.com/tasks/t1#update-e7");
  // Old rows, and kinds that have no row in the timeline, open the page.
  assert.equal(taskEmail({ ...base, items: [item("COMMENT", '"Doors"')] }).buttonUrl, "https://hg.example.com/p/jobs/t1");
  assert.equal(taskEmail({ ...base, items: [withEvent(item("NOTES", "updated the notes"), "e9")] }).buttonUrl, "https://hg.example.com/p/jobs/t1");
  assert.equal(firstUpdateId(items), "e7");
  assert.equal(firstUpdateId([]), null);
  assert.equal(openUrl("https://hg.example.com/", "staff", "t1", "e7"), "https://hg.example.com/tasks/t1#update-e7");
});

test("a bundle with a comment and Mark done reads as before: the note, then marked it done", () => {
  const items = [withEvent(item("COMMENT", '"All done"', "Zack Smith"), "n1"), withEvent(item("STATUS", `marked "${TITLE}" done`, "Zack Smith"), "s1")];
  const email = taskEmail({ items, title: TITLE, address: null, audience: "staff", appUrl: "https://hg.example.com", taskId: "t1" });
  assert.equal(email.subject, "Zack marked Cabinet install done");
  assert.deepEqual(email.items, ['Zack: "All done"', "Zack marked it done"]);
  assert.equal(email.buttonUrl, "https://hg.example.com/tasks/t1#update-n1");
});
