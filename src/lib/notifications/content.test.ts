import test from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_EMAIL_CAP,
  EMAIL_COMMENT_MAX,
  MAX_ATTEMPTS,
  PREVIEW_MAX,
  aboutContactId,
  addressLines,
  asSentence,
  checklistFingerprint,
  claimedRowVerdict,
  deletedRowVerdict,
  deliveryFor,
  dueRowVerdict,
  easternDayStart,
  filePhrase,
  firstUpdateId,
  isResident,
  itemLine,
  itemLines,
  itemText,
  jobKey,
  jobSubject,
  jobWhere,
  leadsEmail,
  liveReminders,
  notesFingerprint,
  offItems,
  openUrl,
  parseItems,
  previewText,
  reachedCapNow,
  reconcileItems,
  refusedRetryAt,
  removedEmail,
  requestAnswers,
  retryAt,
  sendBudget,
  sendFailureKind,
  statusWords,
  taskEmail,
  undoneDropped,
  type ClaimedJob,
  type DueRow,
  type EventSnapshot,
  type OutboxItem,
  type TaskEmailInput,
} from "./content";

/*
 * docs/specs/emails-redesign.md: what each email says (Q9), what sends (Q2, Q6), the morning lines at send time (Q8),
 * and the send run's rules. The summaries below are the exact shapes src/lib/tasks/core.ts writes.
 */

const at = "2026-11-22T15:00:00.000Z";
const item = (kind: string, summary: string, actorLabel = "Connor Swofford", extra: Partial<OutboxItem> = {}): OutboxItem => ({ kind, actorLabel, summary, at, ...extra });
const T = "Vanity swap";
const APP = "https://hg.example.com";
const TOKEN = "t".repeat(43);

/** A contractor's job: Sun, Nov 22 in Buffalo, Due Thu, Nov 26, at a home that needs notice. */
const zackJob = (over: Partial<TaskEmailInput> = {}): TaskEmailInput => ({
  items: [],
  title: T,
  address: "118 Congress St, Buffalo, NY 14213",
  unitLabel: "Rear",
  audience: "contractor",
  appUrl: APP,
  taskId: "t1",
  status: "OPEN",
  due: "2026-11-26",
  scheduled: null,
  today: "2026-11-22",
  notes: "36-inch vanity, not 30.",
  checklist: [
    { title: "Pull the old vanity", done: false },
    { title: "Set and level the new one", done: true },
  ],
  gettingIn: { value: "The tenant must be home", note: "Call/text them 24 hours in advance" },
  staffNames: ["Connor", "Pieter"],
  linkToken: TOKEN,
  replyByEmail: true,
  ...over,
});
/** The same job as a partner reads it, Zack Miller on it. */
const partnerJob = (over: Partial<TaskEmailInput> = {}): TaskEmailInput => zackJob({ audience: "staff", contractorName: "Zack Miller", linkToken: null, gettingIn: null, ...over });
const scheduledOn = (day: string) => ({ status: "SCHEDULED" as const, scheduled: day });
const link = (step?: string) => `${APP}/j/${TOKEN}${step ? `?do=${step}` : ""}`;

// ---------------------------------------------------------------------------
// Subjects (Q9): "Word: title, street · unit"
// ---------------------------------------------------------------------------

test("subject: the word, then the job, street and unit; the due date is out of New's", () => {
  assert.equal(jobSubject({ word: "Update", title: "Replace kitchen faucet", where: "118 Congress St · Rear" }), "Update: Replace kitchen faucet, 118 Congress St · Rear");
  assert.equal(jobSubject({ word: "Update", title: "Replace kitchen faucet", where: "" }), "Update: Replace kitchen faucet");
  assert.equal(jobSubject({ word: "Error", title: "Fix\nsteps", where: "23 Sherwood St" }), "Error: Fix steps, 23 Sherwood St");
  assert.equal(jobWhere("118 Congress St, Buffalo, NY 14201", " Rear "), "118 Congress St · Rear");
  assert.equal(jobWhere(null, null), "");
  assert.equal(taskEmail(zackJob({ items: [item("ASSIGNED", `assigned you "${T}"`)] })).subject, "New: Vanity swap, 118 Congress St · Rear");
  // The word and the title land in the first 38 characters.
  assert.ok(taskEmail(zackJob({ items: [item("ASSIGNED", `assigned you "${T}"`)] })).subject.indexOf(T) + T.length <= 38);
});

test("the contractor's word, highest first when a bundle mixes kinds (Q9)", () => {
  const word = (items: OutboxItem[], over: Partial<TaskEmailInput> = {}) => taskEmail(zackJob({ items, ...over })).subject.split(":")[0];
  const sentBack = item("STATUS", `sent "${T}" back: Caulk it`, "Connor Swofford", { from: "REVIEW", to: "IN_PROGRESS" });
  const moved = item("DAY", `moved "${T}" to Fri, Nov 27`, "Connor Swofford", { from: "2026-11-25", day: "2026-11-27" });
  const notes = item("NOTES", `updated the notes on "${T}"`, "Connor Swofford", { from: "x" });
  const tell = item("TELL_TENANT", "tell the tenant", "HG", { due: "2026-11-24" });
  assert.equal(word([sentBack, notes], { status: "IN_PROGRESS" }), "Sent back");
  assert.equal(word([notes, moved], scheduledOn("2026-11-27")), "Rescheduled");
  assert.equal(word([item("HOLD", `put "${T}" on hold`, "Connor Swofford", { from: "OPEN" })], { status: "WAITING", waitingOn: "National Fuel" }), "On hold");
  assert.equal(word([item("ASSIGNED", `assigned you "${T}"`), notes]), "New");
  assert.equal(word([notes]), "Update");
  assert.equal(word([item("CHECKLIST", 'added "Hook up the drain" to the checklist', "Connor Swofford", { from: "x" })]), "Update");
  // The due date moved or cleared says so (section 8), unless the notes or checklist lead.
  assert.equal(word([item("TARGET", `moved "${T}" to Fri, Dec 4`, "Connor Swofford", { from: "2026-11-26" })], { due: "2026-12-04" }), "Due date moved");
  assert.equal(word([item("TARGET", `moved "${T}" to no date`, "Connor Swofford", { from: "2026-11-26" })], { due: null }), "Due date removed");
  assert.equal(word([notes, item("TARGET", `moved "${T}" to Fri, Dec 4`, "Connor Swofford", { from: "2026-11-26" })], { due: "2026-12-04" }), "Update");
  // Tell the tenant picks the word when it applies; the move goes in the headline.
  const both = taskEmail(zackJob({ items: [{ ...moved, day: "2026-11-24", summary: `moved "${T}" to Tue, Nov 24` }, tell], ...scheduledOn("2026-11-24") }));
  assert.equal(both.subject.split(":")[0], "Tell the tenant");
  assert.equal(both.headline, "Connor rescheduled it for Tue, Nov 24.");
  // The morning words, when nothing a partner did leads.
  assert.equal(word([tell], scheduledOn("2026-11-24")), "Tell the tenant");
  assert.equal(word([item("SCHEDULED_TODAY", "scheduled today", "HG", { due: "2026-11-22" })], scheduledOn("2026-11-22")), "Today");
  assert.equal(word([item("STILL_OPEN", "still open", "HG", { due: "2026-11-21" })], scheduledOn("2026-11-21")), "Not started");
  // No day yet names Due instead when there is one (Connor, Nov 23).
  assert.equal(word([item("NO_DAY", "no day yet", "HG", { due: "2026-11-22" })]), "Due Thu, Nov 26");
  assert.equal(word([item("NO_DAY", "no day yet", "HG", { due: "2026-11-22" })], { due: null }), "Not yet scheduled");
  assert.equal(word([item("DUE_TODAY", "due today", "HG", { due: "2026-11-22" })], { due: "2026-11-22" }), "Due today");
  assert.equal(word([item("OVERDUE", "due yesterday", "HG", { due: "2026-11-21" })], { due: "2026-11-21" }), "Past due");
  // A partner's change in the same bundle as a morning line leads it.
  assert.equal(word([notes, item("SCHEDULED_TODAY", "scheduled today", "HG", { due: "2026-11-22" })], scheduledOn("2026-11-22")), "Update");
  // Rows queued before Nov 22 under the old names read as what they became.
  assert.equal(word([item("SCHEDULED_TOMORROW", "scheduled tomorrow", "HG", { due: "2026-11-23" })], scheduledOn("2026-11-23")), "Tell the tenant");
  assert.equal(word([item("DUE_TOMORROW", "due tomorrow", "HG", { due: "2026-11-23" })], { due: "2026-11-23" }), "Due tomorrow");
  // A partner's day as what happened to it (Connor, Nov 23): a first day, a day taken off, a note on a finished job.
  assert.equal(word([item("STATUS", `scheduled "${T}" for Wed, Nov 25`, "Connor Swofford", { from: "OPEN", to: "SCHEDULED" })], scheduledOn("2026-11-25")), "Scheduled");
  assert.equal(word([item("STATUS", `unscheduled "${T}"`, "Connor Swofford", { from: "SCHEDULED", to: "OPEN", fromDay: "2026-11-25" })]), "Day removed");
  assert.equal(word([item("COMMENT", '"Thanks, it looks great."')], { status: "DONE" }), "Done");
  // Canceled is its own email (Connor, Nov 23: was Removed).
  assert.equal(word([item("OFF", `canceled "${T}"`, "Connor Swofford", { from: "OPEN" })]), "Canceled");
});

test("subjects shorten the street's last word; the unit and a street without a number stay as typed", () => {
  assert.equal(jobSubject({ word: "New", title: T, where: "933 Lafayette Avenue · Floor 1" }), "New: Vanity swap, 933 Lafayette Ave · Floor 1");
  assert.equal(jobSubject({ word: "New", title: T, where: "58 Mariner Street" }), "New: Vanity swap, 58 Mariner St");
  assert.equal(jobSubject({ word: "New", title: T, where: "Rear Court" }), "New: Vanity swap, Rear Court");
  assert.equal(jobSubject({ word: "New", title: T, where: "12 Avenue Rd" }), "New: Vanity swap, 12 Avenue Rd");
});

test("the partner's word: Review, New request, Update, Canceled, Done (Q9)", () => {
  const word = (items: OutboxItem[], over: Partial<TaskEmailInput> = {}) => taskEmail(partnerJob({ items, ...over })).subject.split(":")[0];
  assert.equal(word([item("STATUS", `sent "${T}" for review`, "Zack Miller", { from: "IN_PROGRESS", to: "REVIEW" })], { status: "REVIEW" }), "Review");
  assert.equal(word([item("CREATED", "sent this request", "Dana Lee (resident)")]), "New request");
  assert.equal(word([item("COMMENT", '"Doors arrive Thursday."', "Zack Miller")], { status: "IN_PROGRESS" }), "Update");
  // A contractor's own day (section 8): picked, moved, taken off. Partners hear of it only after the due date (late),
  // or taken off close to it.
  assert.equal(word([item("STATUS", `scheduled "${T}" for Mon, Nov 30`, "Zack Miller", { from: "OPEN", to: "SCHEDULED" })], scheduledOn("2026-11-30")), "Scheduled late");
  assert.equal(word([item("DAY", `moved "${T}" to Mon, Nov 30 (was Tue, Nov 24)`, "Zack Miller", { from: "2026-11-24" })], scheduledOn("2026-11-30")), "Rescheduled late");
  assert.equal(word([item("STATUS", `unscheduled "${T}"`, "Zack Miller", { from: "SCHEDULED", to: "OPEN", fromDay: "2026-11-23" })], { due: "2026-11-24" }), "Day removed");
  assert.equal(word([item("COMMENT", "canceled the request", "Dana Lee (resident)")], { status: "CANCELED" }), "Canceled");
  assert.equal(word([item("COMMENT", '"Forgot the shutoff."', "Zack Miller")], { status: "DONE" }), "Done");
});

// ---------------------------------------------------------------------------
// Headlines and previews (Q9): the event only; one new fact the subject lacks
// ---------------------------------------------------------------------------

test("New: Connor sent you a new job; the preview carries the due date or the scheduled day; Schedule, or Start job with a day", () => {
  const email = taskEmail(zackJob({ items: [item("ASSIGNED", `assigned you "${T}"`)] }));
  assert.equal(email.headline, "Connor sent you a new job.");
  // The date only: Getting in stays in the body (section 8).
  assert.equal(email.preview, "Due Thu, Nov 26");
  assert.deepEqual(email.primary, { label: "Schedule", url: link("date") });
  assert.deepEqual(email.lines, []);
  // A day a partner set: Start job, and the preview says the day.
  const dayed = taskEmail(zackJob({ items: [item("ASSIGNED", `assigned you "${T}" for Wed, Nov 25`)], ...scheduledOn("2026-11-25") }));
  assert.deepEqual(dayed.primary, { label: "Start job", url: link() });
  assert.equal(dayed.preview, "Scheduled for Wed, Nov 25");
  // A new job's other edits in the bundle say nothing of their own: the job below is already as they left it.
  const busy = taskEmail(zackJob({ items: [item("ASSIGNED", `assigned you "${T}"`), item("NOTES", "updated the notes", "Connor Swofford", { from: "" })] }));
  assert.deepEqual(busy.lines, []);
  assert.equal(busy.job?.notes?.changed, false);
});

test("Update: notes, checklist and Due each say what changed, and the edited section is marked changed in place", () => {
  const notes = taskEmail(zackJob({ ...scheduledOn("2026-11-25"), items: [item("NOTES", `updated the notes on "${T}"`, "Connor Swofford", { from: "x" })] }));
  assert.equal(notes.headline, "Connor edited the notes.");
  assert.equal(notes.preview, 'Connor edited the notes: "36-inch vanity, not 30."');
  assert.equal(notes.job?.notes?.changed, true);
  assert.equal(notes.job?.checklist?.changed, false);
  const list = taskEmail(zackJob({ items: [item("CHECKLIST", 'added "Hook up the drain" to the checklist', "Connor Swofford", { from: "x" })] }));
  assert.equal(list.headline, "Connor edited the checklist.");
  assert.equal(list.preview, 'Connor added "Hook up the drain" to the checklist.');
  assert.equal(list.job?.checklist?.changed, true);
  // Every Due change: set, later, earlier (still on or after their day), cleared (Q2).
  const due = (from: string, now: string | null) => taskEmail(zackJob({ due: now, items: [item("TARGET", `moved "${T}" to x`, "Connor Swofford", { from })] }));
  assert.equal(due("2026-11-26", "2026-12-04").headline, "Connor moved the due date to Fri, Dec 4.");
  assert.equal(due("", "2026-12-04").headline, "Connor set the due date to Fri, Dec 4.");
  assert.equal(due("2026-11-26", null).headline, "Connor cleared the due date.");
  assert.equal(due("2026-11-26", "2026-12-04").job?.dates.find((d) => d.label === "Due date")?.changed, true);
});

test("a partner's words: their words are the preview and the quote, and the reply line sits right under it", () => {
  const email = taskEmail(zackJob({ ...scheduledOn("2026-11-25"), items: [item("COMMENT", '"Use the side door."', "Pieter Hoek")] }));
  assert.equal(email.headline, "Pieter sent you a note.");
  assert.deepEqual(email.quotes, ["Use the side door."]);
  assert.equal(email.preview, 'Pieter: "Use the side door."');
  assert.equal(email.quoteReply, "Reply to answer Pieter.");
  assert.equal(email.footnote, undefined, "the footer drops it");
  // In a bundle with an edit, the edit leads and the words are still the preview.
  const both = taskEmail(zackJob({ items: [item("NOTES", "updated the notes", "Connor Swofford", { from: "x" }), item("COMMENT", '"New vanity is in the garage."')] }));
  assert.equal(both.headline, "Connor edited the notes.");
  assert.equal(both.preview, 'Connor: "New vanity is in the garage."');
  // Line breaks stay in the quote.
  assert.deepEqual(taskEmail(zackJob({ items: [item("COMMENT", '"One\ntwo"')] })).quotes, ["One\ntwo"]);
});

test("Sent back: the note in full with its line breaks, then Send for review (section 7)", () => {
  const email = taskEmail(zackJob({ status: "IN_PROGRESS", items: [item("STATUS", `sent "${T}" back: Caulk the tub.\nHaul the old one.`, "Connor Swofford", { from: "REVIEW", to: "IN_PROGRESS" })] }));
  assert.equal(email.headline, "Connor sent this job back.");
  assert.deepEqual(email.quotes, ["Caulk the tub.\nHaul the old one."]);
  assert.equal(email.preview, 'Connor: "Caulk the tub. Haul the old one."');
  assert.deepEqual(email.primary, { label: "Send for review", url: link("done") });
  assert.equal(email.quoteReply, "Reply to answer Connor.");
  // No note: the headline alone.
  const bare = taskEmail(zackJob({ status: "IN_PROGRESS", items: [item("STATUS", `sent "${T}" back`, "Connor Swofford", { from: "REVIEW" })] }));
  assert.deepEqual([bare.quotes, bare.preview], [[], "Connor sent this job back."]);
  // A title that says `" back: ` itself keeps its words out of the note.
  const odd = 'Put "old" back: kitchen';
  assert.deepEqual(taskEmail(zackJob({ title: odd, status: "IN_PROGRESS", items: [item("STATUS", `sent "${odd}" back: Level it`, "Connor Swofford", { from: "REVIEW" })] })).quotes, ["Level it"]);
});

test("Scheduled, Rescheduled, Day removed, Due date moved: the headline names the day the job has now (section 7)", () => {
  const moved = taskEmail(zackJob({ ...scheduledOn("2026-11-27"), items: [item("DAY", `moved "${T}" to Fri, Nov 27`, "Connor Swofford", { from: "2026-11-25" })] }));
  assert.equal(moved.subject.split(":")[0], "Rescheduled");
  assert.equal(moved.headline, "Connor rescheduled it for Fri, Nov 27.");
  assert.deepEqual(moved.lines, ["It was Wed, Nov 25."]);
  assert.equal(moved.preview, "Connor rescheduled it for Fri, Nov 27 (was Wed, Nov 25).");
  // Add to calendar only here, in the day row; never Change day.
  assert.deepEqual(moved.job?.dayLink, { label: "Add to calendar", url: `${link()}/calendar` });
  assert.equal(moved.job?.dates[0].changed, true);
  // A first day.
  const first = taskEmail(zackJob({ ...scheduledOn("2026-11-27"), items: [item("STATUS", `scheduled "${T}" for Fri, Nov 27`, "Connor Swofford", { from: "OPEN", to: "SCHEDULED" })] }));
  assert.equal(first.headline, "Connor scheduled it for Fri, Nov 27.");
  assert.equal(first.preview, "Connor scheduled it for Fri, Nov 27.");
  assert.deepEqual(first.primary?.label, "Start job");
  // Moved twice in one bundle, or moved on from what the line said: the day the job has now, from the day they saw.
  const twice = taskEmail(
    zackJob({
      ...scheduledOn("2026-11-30"),
      items: [item("DAY", `moved "${T}" to Fri, Nov 27`, "Connor Swofford", { from: "2026-11-25" }), item("DAY", `moved "${T}" to Sat, Nov 28`, "Connor Swofford", { from: "2026-11-27" })],
    }),
  );
  assert.equal(twice.headline, "Connor rescheduled it for Mon, Nov 30.");
  assert.deepEqual(twice.lines, ["It was Wed, Nov 25."]);
  // Due before their day.
  const early = taskEmail(zackJob({ ...scheduledOn("2026-11-24"), due: "2026-11-23", items: [item("TARGET", `moved "${T}" to Mon, Nov 23`, "Connor Swofford", { from: "2026-11-26" })] }));
  assert.equal(early.subject.split(":")[0], "Due date moved");
  assert.equal(early.headline, "Connor moved the due date to Mon, Nov 23.");
  assert.equal(early.preview, "Now due Mon, Nov 23, before your scheduled day (Tue, Nov 24).");
  assert.deepEqual(early.job?.dayLink, { label: "Reschedule", url: link("date") });
  // Their day taken away.
  const gone = taskEmail(zackJob({ items: [item("STATUS", `set "${T}" to open`, "Connor Swofford", { from: "SCHEDULED", to: "OPEN", fromDay: "2026-11-25" })] }));
  assert.equal(gone.headline, "Connor removed the scheduled day.");
  assert.deepEqual(gone.lines, ["It was Wed, Nov 25."]);
  assert.equal(gone.job?.dayLink, null, "nothing under Not set");
  assert.equal(gone.primary?.label, "Schedule");
});

test("the day row: Reschedule under a set day, Add to calendar only on a partner's move, nothing under Not set", () => {
  const set = taskEmail(zackJob({ ...scheduledOn("2026-11-25"), items: [item("NOTES", "updated the notes", "Connor Swofford", { from: "x" })] }));
  assert.deepEqual(set.job?.dayLink, { label: "Reschedule", url: link("date") });
  assert.deepEqual(set.job?.dates.map((d) => [d.label, d.value]), [["Scheduled", "Wed, Nov 25"], ["Due date", "Thu, Nov 26"]]);
  const none = taskEmail(zackJob({ items: [item("NOTES", "updated the notes", "Connor Swofford", { from: "x" })] }));
  assert.equal(none.job?.dayLink, null);
  assert.equal(none.job?.dates[0].value, "Not set");
  // Started: the day it was planned for, and no link (they can't move it now).
  const started = taskEmail(zackJob({ status: "IN_PROGRESS", planned: "2026-11-21", items: [item("NOTES", "updated the notes", "Connor Swofford", { from: "x" })] }));
  assert.deepEqual([started.job?.dates[0].value, started.job?.dayLink, started.primary?.label], ["Sat, Nov 21", null, "Send for review"]);
});

test("On hold: the headline names what it waits on, and the short form: no button, no job, no Share with crew", () => {
  const email = taskEmail(zackJob({ status: "WAITING", waitingOn: "National Fuel", items: [item("HOLD", `put "${T}" on hold`, "Connor Swofford", { from: "SCHEDULED" })] }));
  assert.equal(email.headline, "Connor put this job on hold.");
  assert.deepEqual(email.lines, ["Waiting on National Fuel."]);
  assert.equal(email.preview, "Connor put this on hold: waiting on National Fuel.");
  assert.deepEqual([email.primary, email.job, email.share ?? null], [null, null, null]);
  assert.equal(email.short, "Vanity swap, 118 Congress St, Rear");
});

test("Canceled: canceled, taken off, deleted, a resident's cancel; work under way asks what's done; no button, no footer", () => {
  const removed = (off: OutboxItem) => removedEmail({ off, title: T, where: "118 Congress St · Rear", short: "Vanity swap, 118 Congress St, Rear", taskId: "t1", today: "2026-11-22" });
  const canceled = removed(item("OFF", `canceled "${T}"`, "Connor Swofford", { from: "SCHEDULED" }));
  assert.equal(canceled.subject, "Canceled: Vanity swap, 118 Congress St · Rear");
  assert.equal(canceled.headline, "Connor canceled this job. No need to go.");
  assert.equal(canceled.preview, "Connor canceled this job. No need to go.");
  assert.deepEqual([canceled.primary, canceled.job, canceled.footnote, canceled.share ?? null], [null, null, undefined, null]);
  assert.equal(canceled.short, "Vanity swap, 118 Congress St, Rear");
  assert.equal(canceled.threadKey, "job-t1-off");
  assert.equal(removed(item("OFF", `took you off "${T}"`, "Connor Swofford", { from: "OPEN" })).headline, "Connor took you off this job. No need to go.");
  assert.equal(removed(item("OFF", `canceled "${T}"`, "Dana Lee (resident)", { from: "OPEN" })).headline, "Dana canceled the request. No need to go.");
  assert.equal(removed(item("OFF", `deleted "${T}"`, "Connor Swofford", { from: "OPEN", title: T })).headline, "Connor canceled this job. No need to go.");
  // In progress: two lines at most at 320, so the ask goes under the headline; the preview says both.
  const underway = removed(item("OFF", `canceled "${T}"`, "Connor Swofford", { from: "IN_PROGRESS" }));
  assert.deepEqual([underway.headline, underway.lines], ["Connor canceled this job.", ["Reply with what's done so far."]]);
  assert.equal(underway.preview, "Connor canceled this job. Reply with what's done so far.");
  // taskEmail hands an off line to it.
  assert.equal(taskEmail(zackJob({ items: [item("COMMENT", '"x"'), item("OFF", `canceled "${T}"`)] })).headline, "Connor canceled this job. No need to go.");
});

test("Tell the tenant: Scheduled for, They need 24 hours' notice, Text the tenant (Q9); no orange box", () => {
  const email = taskEmail(zackJob({ ...scheduledOn("2026-11-25"), items: [item("TELL_TENANT", "tell the tenant", "HG", { due: "2026-11-25" })] }));
  assert.equal(email.headline, "Scheduled for Wed, Nov 25.");
  assert.equal(email.preview, "Scheduled for Wed, Nov 25. They need 24 hours' notice.");
  assert.deepEqual(email.primary, { label: "Text the tenant", url: link("access") });
  assert.ok(!("notice" in email));
  // Folded into a partner's move: the move leads, the notice is a line.
  const both = taskEmail(
    zackJob({ ...scheduledOn("2026-11-24"), items: [item("STATUS", `scheduled "${T}" for Tue, Nov 24`, "Connor Swofford", { from: "OPEN", to: "SCHEDULED" }), item("TELL_TENANT", "tell the tenant", "HG", { due: "2026-11-24" })] }),
  );
  assert.equal(both.headline, "Connor scheduled it for Tue, Nov 24.");
  assert.deepEqual(both.lines, ["They need 24 hours' notice."]);
  assert.equal(both.primary?.label, "Text the tenant");
  assert.equal(both.job?.dayLink?.label, "Add to calendar");
});

test("the morning emails: Today, Not started, Not yet scheduled, Due today and Past due (section 8)", () => {
  const today = taskEmail(zackJob({ ...scheduledOn("2026-11-22"), gettingIn: { value: "Let yourself in", note: "No one lives here" }, items: [item("SCHEDULED_TODAY", "scheduled today", "HG", { due: "2026-11-22" })] }));
  assert.deepEqual([today.headline, today.preview, today.primary?.label], ["Scheduled for today.", "Tap Start job when you get there.", "Start job"]);
  const still = taskEmail(zackJob({ ...scheduledOn("2026-11-24"), today: "2026-11-25", items: [item("STILL_OPEN", "still open", "HG", { due: "2026-11-24" })] }));
  assert.deepEqual([still.subject.split(":")[0], still.headline, still.lines, still.preview, still.primary?.label], [
    "Not started",
    "Scheduled for Tue, Nov 24, not started.",
    ["Start the job or reschedule."],
    "Scheduled for Tue, Nov 24. Start the job or reschedule.",
    "Start job",
  ]);
  const noDay = taskEmail(zackJob({ items: [item("NO_DAY", "no day yet", "HG", { due: "2026-11-22" })] }));
  assert.deepEqual([noDay.headline, noDay.preview, noDay.primary?.label], ["Not yet scheduled.", "Not yet scheduled. Schedule a day to go.", "Schedule"]);
  assert.equal(noDay.subject, "Due Thu, Nov 26: Vanity swap, 118 Congress St · Rear");
  // The morning before the due date (Connor, Nov 23).
  assert.equal(taskEmail(zackJob({ due: "2026-11-23", items: [item("NO_DAY", "no day yet", "HG", { due: "2026-11-22" })] })).subject.split(":")[0], "Due tomorrow");
  const noDue = taskEmail(zackJob({ due: null, items: [item("NO_DAY", "no day yet", "HG", { due: "2026-11-22" })] }));
  assert.deepEqual([noDue.subject.split(":")[0], noDue.preview], ["Not yet scheduled", "Schedule a day to go."]);
  // Due today on any job not yet done: where it stands, and its next step.
  const dueToday = (over: Partial<TaskEmailInput>) => taskEmail(zackJob({ due: "2026-11-22", items: [item("DUE_TODAY", "due today", "HG", { due: "2026-11-22" })], ...over }));
  const open = dueToday({});
  assert.deepEqual([open.headline, open.lines, open.preview, open.primary?.label], ["This job is due today.", ["Not yet scheduled. Schedule a day to go."], "Not yet scheduled. Schedule a day to go.", "Schedule"]);
  assert.equal(dueToday(scheduledOn("2026-11-30")).preview, "Scheduled for Mon, Nov 30, after the due date.");
  assert.equal(dueToday(scheduledOn("2026-11-20")).preview, "Scheduled for Fri, Nov 20, not started.");
  const working = dueToday({ status: "IN_PROGRESS", planned: "2026-11-21" });
  assert.deepEqual([working.preview, working.primary?.label], ["In progress. Send for review when it's done.", "Send for review"]);
  // Past due: the due date that passed, then where it stands.
  const pastDue = (over: Partial<TaskEmailInput>) => taskEmail(zackJob({ due: "2026-11-21", items: [item("OVERDUE", "past due", "HG", { due: "2026-11-21" })], ...over }));
  const late = pastDue({});
  assert.deepEqual([late.subject.split(":")[0], late.headline, late.lines, late.preview], ["Past due", "This job was due Sat, Nov 21.", ["Not yet scheduled."], "Was due Sat, Nov 21. Not yet scheduled."]);
  assert.equal(pastDue(scheduledOn("2026-11-30")).preview, "Was due Sat, Nov 21. Scheduled for Mon, Nov 30.");
  assert.equal(pastDue(scheduledOn("2026-11-22")).preview, "Was due Sat, Nov 21. Scheduled for today.");
  assert.equal(pastDue(scheduledOn("2026-11-20")).preview, "Was due Sat, Nov 21. Scheduled for Fri, Nov 20, not started.");
  assert.equal(pastDue({ status: "IN_PROGRESS" }).preview, "Was due Sat, Nov 21. Send for review when it's done.");
  // No name in front of a morning line.
  assert.equal(itemLine(item("DUE_TODAY", "due today", "HG", { due: "2026-11-22" }), T, "contractor", "2026-11-22"), "This job is due today.");
});

test("Past due to the partners: who hasn't finished and when it was due; seeing the task in the app doesn't hold it back", () => {
  const line = item("OVERDUE", "past due", "HG", { due: "2026-11-21" });
  const email = taskEmail(partnerJob({ status: "IN_PROGRESS", due: "2026-11-21", items: [line] }));
  assert.equal(email.subject, "Past due: Vanity swap, 118 Congress St · Rear");
  assert.deepEqual([email.headline, email.lines, email.preview], ["Zack Miller hasn't finished.", ["It was due Sat, Nov 21."], "Zack Miller hasn't finished. Was due Sat, Nov 21."]);
  assert.equal(email.fromName, "HG Capital");
  assert.equal(email.actionNote, "In progress");
  // A contractor's words in the same bundle lead; the past due date rides along as a line.
  const both = taskEmail(partnerJob({ status: "IN_PROGRESS", due: "2026-11-21", items: [item("COMMENT", '"Parts arrive Thursday."', "Zack Miller"), line] }));
  assert.equal(both.subject.split(":")[0], "Update");
  assert.deepEqual(both.lines, ["This job was due Sat, Nov 21."]);
  // At send time: still true, and opened in the app since doesn't matter.
  const job = { status: "IN_PROGRESS" as const, dueDate: new Date("2026-11-21T00:00:00Z"), scheduledFor: null, description: null, assigneeContactId: "c-zack", assigneeUserId: null, checklist: [] };
  const verdict = claimedRowVerdict({ audience: "staff", items: [line], job, hasAccess: false, seenAt: new Date("2026-11-22T16:00:00Z"), today: "2026-11-22" });
  assert.equal(verdict.send, true);
  // Finished (in review) since it was queued: nothing.
  assert.deepEqual(claimedRowVerdict({ audience: "staff", items: [line], job: { ...job, status: "REVIEW" }, hasAccess: false, today: "2026-11-22" }), { send: false, reason: "nothing to send" });
});

test("in review or closed: a partner's words go as the short form, with no button", () => {
  const review = taskEmail(zackJob({ status: "REVIEW", items: [item("COMMENT", '"Checking it Monday."')] }));
  assert.deepEqual([review.headline, review.quotes, review.primary, review.job, review.quoteReply], ["Connor sent you a note.", ["Checking it Monday."], null, null, "Reply to answer Connor."]);
  const closed = taskEmail(zackJob({ status: "DONE", items: [item("COMMENT", '"Thanks, it looks great."', "Pieter Hoek")] }));
  assert.deepEqual([closed.primary, closed.job, closed.quoteReply, closed.footnote], [null, null, undefined, "Reply to reach Connor and Pieter."]);
});

test("the open job below the button: Share with crew with its icon, the address on two lines, Getting in last, three photos then +N", () => {
  const email = taskEmail(zackJob({ newPhotoIds: ["n1"], jobPhotoIds: ["h1", "h2", "h3", "h4"], items: [item("NOTES", "updated the notes", "Connor Swofford", { from: "x" })] }));
  assert.deepEqual(email.share, { label: "Share with crew", url: link("share"), icon: `${APP}/email/share.png` });
  assert.deepEqual(email.job?.address, ["118 Congress St, Rear", "Buffalo, NY 14213"]);
  assert.equal(email.job?.addressLabel, true);
  assert.deepEqual(email.job?.gettingIn, { value: "The tenant must be home", note: "Call/text them 24 hours in advance" });
  assert.deepEqual(email.job?.tenants, []);
  // Who lives there, under Getting in: the number as typed, a tel: link when it dials.
  const lived = taskEmail(zackJob({ tenants: [{ name: "Dana Lee", phone: "(716) 555-0134", dial: "+17165550134" }, { name: "Sam Lee", phone: null, dial: null }], items: [item("NOTES", "updated the notes", "Connor Swofford", { from: "x" })] }));
  assert.deepEqual(lived.job?.tenants, [
    { name: "Dana Lee", phone: "(716) 555-0134", tel: "tel:+17165550134" },
    { name: "Sam Lee", phone: null, tel: null },
  ]);
  assert.deepEqual(email.job?.photos.map((p) => p.src), ["n1", "h1", "h2"].map((id) => `${APP}/api/files/task/${id}?v=thumb&l=${TOKEN}`));
  assert.equal(email.job?.morePhotos, 2);
  assert.equal(email.footnote, "Reply to post an update or photos.");
  assert.equal(email.fromName, "HG Capital");
  // No outline buttons, no Add photos, no Directions, no building photo.
  assert.ok(!("secondary" in email));
  assert.ok(!JSON.stringify(email).includes("Add photos"));
  assert.ok(!JSON.stringify(email).includes("maps.apple.com"));
  // Without a job link, the portal's page behind sign-in.
  const plain = taskEmail(zackJob({ linkToken: null, items: [item("NOTES", "updated the notes", "Connor Swofford", { from: "x" })] }));
  assert.equal(plain.primary?.url, `${APP}/p/jobs/t1?do=date`);
  assert.deepEqual(plain.job?.photos, []);
  assert.deepEqual(addressLines("23 Sherwood St, Buffalo, NY 14213", null), ["23 Sherwood St", "Buffalo, NY 14213"]);
  assert.deepEqual(addressLines(null, "Upper"), ["Upper"]);
});

test("footers: one line, what a reply does; none without a reply address", () => {
  assert.equal(taskEmail(zackJob({ items: [item("NOTES", "x", "Connor Swofford", { from: "x" })] })).footnote, "Reply to post an update or photos.");
  assert.equal(taskEmail(zackJob({ replyByEmail: false, items: [item("NOTES", "x", "Connor Swofford", { from: "x" })] })).footnote, undefined);
  assert.equal(taskEmail(partnerJob({ status: "IN_PROGRESS", items: [item("COMMENT", '"Doors"', "Zack Miller")] })).footnote, "Reply to answer Zack Miller.");
});

// ---------------------------------------------------------------------------
// A partner's emails (Q6, Q9)
// ---------------------------------------------------------------------------

test("Review: Zack Miller sent this for review, his note in full, two tiles, Approve with Send back under it", () => {
  const note = item("COMMENT", '"All set. Old vanity is at the curb."', "Zack Miller", { eventId: "n1", statusEventId: "s1", contactId: "c-zack" });
  const sent = item("STATUS", `sent "${T}" for review`, "Zack Miller", { eventId: "s1", from: "IN_PROGRESS", to: "REVIEW", contactId: "c-zack" });
  const email = taskEmail(
    partnerJob({ status: "REVIEW", ...{ scheduled: null }, linkToken: TOKEN, newPhotoIds: ["p1", "p2", "p3", "p4", "p5"], checklist: [{ title: "a", done: true }, { title: "b", done: true }, { title: "c", done: true }], items: [note, sent] }),
  );
  assert.equal(email.subject, "Review: Vanity swap, 118 Congress St · Rear");
  assert.equal(email.fromName, "Zack Miller via HG Capital");
  assert.equal(email.headline, "Zack Miller sent this for review.");
  assert.deepEqual(email.quotes, ["All set. Old vanity is at the curb."]);
  assert.equal(email.preview, '"All set. Old vanity is at the curb."');
  assert.equal(email.tiles?.length, 2);
  assert.equal(email.tilesNote, "+3 more · Checklist 3 of 3 done");
  assert.deepEqual(email.primary, { label: "Approve", url: `${APP}/tasks/t1?do=approve` });
  assert.deepEqual(email.link, { label: "Send back", url: `${APP}/tasks/t1?do=send-back` });
  assert.deepEqual(email.job?.dates.map((d) => d.label), ["Due date", "Scheduled"]);
  assert.deepEqual(email.job?.address, ["118 Congress St, Rear"]);
  assert.equal(email.footnote, "Reply to answer Zack Miller.");
  assert.deepEqual(email.lines, [], "the note is the quote, not a line");
  assert.equal(aboutContactId([note, sent]), "c-zack");
});

test("New request: Dana · 52 Elm St, Upper, her words in full, her answers, Assign; no footer and no reply while unassigned", () => {
  const request = { whatsWrong: "Sink drips", details: "The kitchen sink drips when the dishwasher runs. ".repeat(6).trim(), letUsIn: false, pets: null, petsNote: null };
  const email = taskEmail(
    partnerJob({
      title: "Sink drips",
      address: "52 Elm St, Buffalo, NY 14222",
      unitLabel: "Upper",
      due: "2026-11-22",
      request,
      assigned: false,
      replyByEmail: false,
      linkToken: TOKEN,
      newPhotoIds: ["q1"],
      items: [item("CREATED", "sent this request with 1 photo", "Dana Lee (resident)", { eventId: "q" })],
    }),
  );
  assert.equal(email.subject, "New request: Sink drips, 52 Elm St · Upper");
  assert.equal(email.fromName, "HG Capital", "a resident never gets via");
  assert.equal(email.headline, "Dana · 52 Elm St, Upper");
  assert.deepEqual(email.quotes, [request.details], "the 200-character cut goes");
  assert.equal(email.note, "Dana must be home");
  assert.deepEqual(email.primary, { label: "Assign", url: `${APP}/tasks/t1?do=assign` });
  assert.equal(email.actionNote, "Due today");
  assert.equal(email.footnote, undefined);
  assert.equal(email.job, null);
  assert.ok(email.preview.length <= PREVIEW_MAX && email.preview.startsWith('"The kitchen sink drips'));
  assert.equal(requestAnswers("Dana", { letUsIn: true, pets: false, petsNote: null }), "Dana said it's OK to come in · No pets");
  assert.equal(requestAnswers("Dana", { letUsIn: true, pets: true, petsNote: "a cat" }), "Dana said it's OK to come in · Pets: a cat");
  // An addition: Assign while nobody has it, Open task once someone does; her note quoted.
  const addition = item("COMMENT", "added a note", "Dana Lee (resident)", { words: "It's worse at night." });
  assert.equal(taskEmail(partnerJob({ assigned: false, items: [addition] })).primary?.label, "Assign");
  const assigned = taskEmail(partnerJob({ assigned: true, items: [addition] }));
  assert.deepEqual([assigned.primary?.label, assigned.headline, assigned.quotes, assigned.preview, assigned.footnote], ["Open task", "Dana added a note.", ["It's worse at night."], 'Dana: "It\'s worse at night."', undefined]);
  // Her cancel.
  const canceled = taskEmail(partnerJob({ status: "CANCELED", items: [item("COMMENT", "canceled the request", "Dana Lee (resident)")] }));
  assert.deepEqual([canceled.subject.split(":")[0], canceled.headline, canceled.primary], ["Canceled", "Dana canceled the request.", null]);
  assert.ok(isResident(addition) && !isResident(item("COMMENT", "x", "Zack Miller")));
});

test("a partner's Update: a contractor's words by full name, the status in the button's place, Due | Scheduled and the checklist", () => {
  const email = taskEmail(partnerJob({ status: "IN_PROGRESS", items: [item("COMMENT", '"Doors arrive Thursday."', "Zack Miller"), item("STATUS", `started "${T}"`, "Zack Miller", { from: "SCHEDULED", to: "IN_PROGRESS" })] }));
  assert.equal(email.fromName, "Zack Miller via HG Capital");
  assert.equal(email.headline, "Zack Miller sent a note.");
  assert.equal(email.preview, 'Zack Miller: "Doors arrive Thursday."');
  assert.deepEqual(email.lines, ["Zack Miller started this."], "the task's words: this, not it or the job");
  assert.equal(email.primary, null);
  assert.equal(email.actionNote, "In progress");
  assert.equal(email.job?.checklistLine, "Checklist 1 of 2 done");
  assert.equal(statusWords("SCHEDULED", { scheduled: "2026-11-24", today: "2026-11-22" }), "Scheduled Tue, Nov 24");
  assert.equal(statusWords("WAITING", { scheduled: null, waitingOn: "National Fuel", today: "2026-11-22" }), "Waiting on National Fuel");
});

test("a contractor's day after the due date, or taken off close to it: Zack Miller scheduled it for Mon, Nov 30.", () => {
  const picked = taskEmail(partnerJob({ status: "SCHEDULED", due: "2026-11-27", scheduled: "2026-11-30", items: [item("STATUS", `scheduled "${T}" for Mon, Nov 30`, "Zack Miller", { from: "OPEN", to: "SCHEDULED" })] }));
  assert.deepEqual([picked.headline, picked.lines, picked.preview], [
    "Zack Miller scheduled it for Mon, Nov 30.",
    ["Due date is Fri, Nov 27."],
    "Zack Miller scheduled it for Mon, Nov 30. Due date is Fri, Nov 27.",
  ]);
  // No status line: it would only repeat the Scheduled day the details show.
  assert.equal(picked.actionNote, undefined);
  const moved = taskEmail(partnerJob({ status: "SCHEDULED", due: "2026-11-27", scheduled: "2026-11-30", items: [item("DAY", `moved "${T}" to Mon, Nov 30 (was Tue, Nov 24)`, "Zack Miller", { from: "2026-11-24" })] }));
  assert.deepEqual([moved.headline, moved.lines], ["Zack Miller rescheduled it for Mon, Nov 30.", ["It was Tue, Nov 24.", "Due date is Fri, Nov 27."]]);
  // Remove day names the day it had (section 7).
  const removed = taskEmail(partnerJob({ status: "OPEN", due: "2026-11-24", items: [item("STATUS", `unscheduled "${T}"`, "Zack Miller", { from: "SCHEDULED", to: "OPEN", fromDay: "2026-11-23" })] }));
  assert.deepEqual([removed.headline, removed.lines], ["Zack Miller removed the scheduled day.", ["It was Mon, Nov 23.", "Due date is Tue, Nov 24."]]);
  assert.equal(removed.preview, "Zack Miller removed the scheduled day (was Mon, Nov 23). Due date is Tue, Nov 24.");
});

test("the partner's line words read like the task's Activity, the day move with its period after the bracket (section 7)", () => {
  const move = item("DAY", `moved "${T}" to Fri, Nov 27 (was Tue, Nov 24)`, "Zack Miller", { from: "2026-11-24" });
  assert.deepEqual(itemLines([move], T, "staff", "2026-11-22"), ["Zack Miller moved the scheduled day to Fri, Nov 27 (was Tue, Nov 24)."]);
  assert.equal(asSentence("Zack moved it (was Tue)"), "Zack moved it (was Tue).");
  assert.equal(asSentence('Zack: "Done"'), 'Zack: "Done"');
  // Moved twice: from the day the partners last saw.
  const second = item("DAY", `moved "${T}" to Sat, Nov 28 (was Fri, Nov 27)`, "Zack Miller", { from: "2026-11-27" });
  assert.deepEqual(itemLines([move, second], T, "staff", "2026-11-22"), ["Zack Miller moved the scheduled day to Sat, Nov 28 (was Tue, Nov 24)."]);
  // Remove day names its day, from the line's fromDay or its own words.
  assert.equal(itemText(item("STATUS", `unscheduled "${T}"`, "Zack Miller", { fromDay: "2026-11-23" }), T, "staff", "2026-11-22"), "removed the scheduled day (was Mon, Nov 23)");
  assert.equal(itemText(item("DAY", `unscheduled "${T}" (was Tue, Nov 17)`, "Zack Miller"), T, "staff", "2026-11-22"), "removed the scheduled day (was Tue, Nov 17)");
  // The task's words, and the contractor's.
  assert.equal(itemText(item("STATUS", `started "${T}"`, "Zack Miller"), T, "staff"), "started this");
  assert.equal(itemText(item("STATUS", `marked "${T}" done`, "Zack Miller"), T, "staff"), "sent this for review");
  assert.equal(itemText(item("STATUS", `set "${T}" to in progress`), T, "contractor"), "moved this job to In progress");
  assert.equal(itemText(item("STATUS", `sent "${T}" back: redo the "trim" for review`), T, "staff"), 'sent this back: redo the "trim" for review');
  assert.equal(itemText(item("COMMENT", "added files (+2 files)")), "added 2 files");
  assert.equal(itemText(item("ATTACHMENT", "added IMG_0042.jpg")), "added IMG_0042.jpg");
  // Rows queued before Nov 21, when a pick moved Due, still read neutrally.
  assert.equal(itemLines([{ ...item("TARGET", `moved "${T}" to Mon, Nov 23 (was Thu, Nov 19)`, "Zack Reading"), visit: false }], T, "staff")[0], "Zack Reading moved the due date to Mon, Nov 23 (was Thu, Nov 19).");
});

// ---------------------------------------------------------------------------
// What sends (Q2, Q6): a line leads an email of its own, or only rides along
// ---------------------------------------------------------------------------

const JOB_NOW: Parameters<typeof leadsEmail>[2] = { status: "SCHEDULED", due: "2026-11-27", scheduled: "2026-11-25", today: "2026-11-22" };

test("a contractor's lines: what changes the trip leads; photos with no words and a status a partner sets ride along", () => {
  const leads = (i: OutboxItem) => leadsEmail(i, "contractor", JOB_NOW);
  assert.equal(leads(item("ASSIGNED", "x")), true);
  assert.equal(leads(item("COMMENT", '"Side door"')), true);
  assert.equal(leads(item("COMMENT", "added 3 photos")), false);
  assert.equal(leads(item("ATTACHMENT", "added quote.pdf")), false);
  assert.equal(leads(item("NOTES", "x")), true);
  assert.equal(leads(item("CHECKLIST", "x")), true);
  assert.equal(leads(item("TARGET", "x")), true);
  assert.equal(leads(item("DAY", "x")), true);
  assert.equal(leads(item("HOLD", "x")), true);
  assert.equal(leads(item("OFF", "x")), true);
  assert.equal(leads(item("TELL_TENANT", "x", "HG")), true);
  // Status: a send-back, their day set or taken away lead; anything else a partner sets for them rides along.
  assert.equal(leads(item("STATUS", `sent "${T}" back`, "Connor Swofford", { from: "REVIEW", to: "IN_PROGRESS" })), true);
  assert.equal(leads(item("STATUS", `scheduled "${T}" for Wed, Nov 25`, "Connor Swofford", { from: "OPEN", to: "SCHEDULED" })), true);
  assert.equal(leads(item("STATUS", `set "${T}" to open`, "Connor Swofford", { from: "SCHEDULED", to: "OPEN" })), true);
  assert.equal(leads(item("STATUS", `set "${T}" to in progress`, "Connor Swofford", { from: "SCHEDULED", to: "IN_PROGRESS" })), false);
  assert.equal(leads(item("STATUS", `set "${T}" to open`, "Connor Swofford", { from: "WAITING", to: "OPEN" })), false);
  // A legacy send-back with no from or to still reads as one.
  assert.equal(leads(item("STATUS", `sent "${T}" back: x`)), true);
});

test("a partner's lines: words, Review, a request and a risky day lead; Start, an on-time day and photos ride along", () => {
  const leads = (i: OutboxItem, job = JOB_NOW) => leadsEmail(i, "staff", job);
  assert.equal(leads(item("COMMENT", '"Doors"', "Zack Miller")), true);
  assert.equal(leads(item("COMMENT", "added 3 photos", "Zack Miller")), false);
  assert.equal(leads(item("ATTACHMENT", "added a.jpg", "Zack Miller")), false);
  assert.equal(leads(item("STATUS", `started "${T}"`, "Zack Miller", { from: "SCHEDULED", to: "IN_PROGRESS" })), false);
  assert.equal(leads(item("STATUS", `sent "${T}" for review`, "Zack Miller", { from: "IN_PROGRESS", to: "REVIEW" })), true);
  assert.equal(leads(item("CREATED", "sent this request", "Dana Lee (resident)")), true);
  assert.equal(leads(item("COMMENT", "added 2 photos", "Dana Lee (resident)")), true, "a resident's addition");
  // Their day: on or before Due rides along; after Due leads, judged on the day the job has now.
  const pick = item("STATUS", `scheduled "${T}" for Wed, Nov 25`, "Zack Miller", { from: "OPEN", to: "SCHEDULED" });
  assert.equal(leads(pick), false);
  assert.equal(leads(pick, { ...JOB_NOW, scheduled: "2026-11-27" }), false, "on Due");
  assert.equal(leads(pick, { ...JOB_NOW, scheduled: "2026-11-30" }), true);
  assert.equal(leads(item("DAY", `moved "${T}" to Mon, Nov 30 (was Wed, Nov 25)`, "Zack Miller", { from: "2026-11-25" }), { ...JOB_NOW, scheduled: "2026-11-30" }), true);
  assert.equal(leads(pick, { ...JOB_NOW, due: null, scheduled: "2026-11-30" }), false, "no Due, no risk");
  // Their day taken off: with Due 3 days out or less (or past), it leads; further out, it rides along.
  const removed = item("STATUS", `unscheduled "${T}"`, "Zack Miller", { from: "SCHEDULED", to: "OPEN", fromDay: "2026-11-24" });
  const noDay = { ...JOB_NOW, status: "OPEN" as const, scheduled: null };
  assert.equal(leads(removed, { ...noDay, due: "2026-11-25" }), true);
  assert.equal(leads(removed, { ...noDay, due: "2026-11-21" }), true);
  assert.equal(leads(removed, { ...noDay, due: "2026-11-26" }), false);
  // Picked again since: judged as a pick.
  assert.equal(leads(removed, JOB_NOW), false);
});

const JOB: ClaimedJob = { status: "OPEN", dueDate: new Date("2026-11-26T00:00:00Z"), scheduledFor: null, description: "Bring the tall ladder." };
const claimed = (over: Partial<Parameters<typeof claimedRowVerdict>[0]> = {}) =>
  claimedRowVerdict({ audience: "contractor", items: [item("ASSIGNED", `assigned you "${T}"`)], job: JOB, hasAccess: true, today: "2026-11-22", ...over });

test("a row whose lines only ride along closes unsent; with something that leads, they go with it", () => {
  const photos = item("COMMENT", "added 3 photos");
  assert.deepEqual(claimed({ items: [photos] }), { send: false, reason: "nothing to send" });
  assert.deepEqual(claimed({ items: [item("STATUS", `set "${T}" to in progress`, "Connor Swofford", { from: "OPEN", to: "IN_PROGRESS" })], job: { ...JOB, status: "IN_PROGRESS" } }), { send: false, reason: "nothing to send" });
  const goes = claimed({ items: [photos, item("NOTES", "x", "Connor Swofford", { from: "y" })] });
  assert.deepEqual(goes.send && goes.items.map((i) => i.kind), ["COMMENT", "NOTES"]);
  // A partner's: a Start alone stays in the app.
  assert.deepEqual(claimed({ audience: "staff", items: [item("STATUS", `started "${T}"`, "Zack Miller", { from: "OPEN", to: "IN_PROGRESS" })], job: { ...JOB, status: "IN_PROGRESS" } }), { send: false, reason: "nothing to send" });
});

test("a contractor's row on a job in review or closed keeps only a partner's words; on hold, the hold and the words", () => {
  const words = item("COMMENT", '"Checking Monday"');
  const due = item("TARGET", `moved "${T}" to Fri, Dec 4`, "Connor Swofford", { from: "2026-11-26" });
  const inReview = claimed({ items: [due, words], job: { ...JOB, status: "REVIEW" } });
  assert.deepEqual(inReview.send && inReview.items, [words]);
  assert.deepEqual(claimed({ items: [due], job: { ...JOB, status: "REVIEW" } }), { send: false, reason: "nothing to send" });
  const done = claimed({ items: [due, words], job: { ...JOB, status: "DONE" } });
  assert.deepEqual(done.send && done.items, [words]);
  const hold = item("HOLD", `put "${T}" on hold`, "Connor Swofford", { from: "OPEN" });
  const held = claimed({ items: [due, hold], job: { ...JOB, status: "WAITING" } });
  assert.deepEqual(held.send && held.items, [hold]);
  // On hold and taken back off it before the email went: nothing changed.
  assert.deepEqual(claimed({ items: [hold] }), { send: false, reason: "nothing to send" });
});

test("a partner's row: Review drops once decided, with its note; a request drops once assigned; a request and its cancel say nothing", () => {
  const note = item("COMMENT", '"All set"', "Zack Miller", { eventId: "n1", statusEventId: "s1" });
  const sent = item("STATUS", `sent "${T}" for review`, "Zack Miller", { eventId: "s1", from: "IN_PROGRESS", to: "REVIEW" });
  const partner = (items: OutboxItem[], job: Partial<ClaimedJob>) => claimed({ audience: "staff", items, job: { ...JOB, ...job } });
  const waiting = partner([note, sent], { status: "REVIEW" });
  assert.deepEqual(waiting.send && waiting.items, [note, sent]);
  // The other partner approved inside the bundle: no stale Done email, the note with it.
  assert.deepEqual(partner([note, sent], { status: "DONE" }), { send: false, reason: "nothing to send" });
  // Sent back already: the same. A comment of his own later still goes.
  const later = item("COMMENT", '"Also, the trap"', "Zack Miller", { eventId: "n2", at: "2026-11-22T15:05:00.000Z" });
  const back = partner([note, sent, later], { status: "IN_PROGRESS" });
  assert.deepEqual(back.send && back.items, [later]);
  // A note queued before it named its status line goes by its moment.
  const oldNote = item("COMMENT", '"All set"', "Zack Miller");
  assert.deepEqual(partner([oldNote, { ...sent, statusEventId: undefined }], { status: "DONE" }), { send: false, reason: "nothing to send" });
  // A new request goes only while nobody has it.
  const created = item("CREATED", "sent this request", "Dana Lee (resident)");
  assert.equal(partner([created], {}).send, true);
  assert.deepEqual(partner([created], { assigneeContactId: "c-zack" }), { send: false, reason: "nothing to send" });
  // A request and its cancel in one bundle.
  assert.deepEqual(partner([created, item("COMMENT", "canceled the request", "Dana Lee (resident)")], { status: "CANCELED" }), { send: false, reason: "nothing to send" });
});

test("a partner who opened the task since its newest line saw it in the app: no email", () => {
  const words = item("COMMENT", '"Doors"', "Zack Miller");
  const partner = (seenAt: Date | null) => claimed({ audience: "staff", items: [words], seenAt });
  assert.deepEqual(partner(new Date("2026-11-22T15:00:00.000Z")), { send: false, reason: "seen in app" });
  assert.deepEqual(partner(new Date("2026-11-22T15:10:00.000Z")), { send: false, reason: "seen in app" });
  assert.equal(partner(new Date("2026-11-22T14:59:59.000Z")).send, true);
  assert.equal(partner(null).send, true);
  // Contractors have no read state here.
  assert.equal(claimed({ seenAt: new Date("2026-11-23T00:00:00Z") }).send, true);
});

test("the morning lines at send time: each only while still true, old kinds as what they became", () => {
  const now = { status: "SCHEDULED" as const, due: "2026-11-27", scheduled: "2026-11-24", needsNotice: true, today: "2026-11-22" };
  const tell = item("TELL_TENANT", "tell the tenant", "HG", { due: "2026-11-24" });
  const words = item("COMMENT", '"Doors"');
  assert.deepEqual(liveReminders([tell, words], now), [tell, words]);
  assert.deepEqual(liveReminders([tell, words], { ...now, scheduled: "2026-11-25" }), [words], "the day moved");
  assert.deepEqual(liveReminders([tell], { ...now, needsNotice: false }), [], "permission given since");
  assert.deepEqual(liveReminders([tell], { ...now, status: "IN_PROGRESS" }), []);
  // Today, also on a job started that morning.
  const today = item("SCHEDULED_TODAY", "scheduled today", "HG", { due: "2026-11-22" });
  assert.deepEqual(liveReminders([today], { ...now, scheduled: "2026-11-22" }), [today]);
  assert.deepEqual(liveReminders([today], { ...now, status: "IN_PROGRESS", scheduled: null, planned: "2026-11-22" }), [today]);
  assert.deepEqual(liveReminders([today], { ...now, status: "WAITING", scheduled: null }), []);
  // Not started only while never started.
  const still = item("STILL_OPEN", "still open", "HG", { due: "2026-11-21" });
  assert.deepEqual(liveReminders([still], { ...now, scheduled: "2026-11-21" }), [still]);
  assert.deepEqual(liveReminders([still], { ...now, status: "IN_PROGRESS", scheduled: null }), []);
  // Not yet scheduled only while no day is set; Due today and Past due while the job isn't done (section 8).
  const noDay = item("NO_DAY", "no day yet", "HG", { due: "2026-11-22" });
  const open = { ...now, status: "OPEN" as const, scheduled: null, due: "2026-11-22" };
  assert.deepEqual(liveReminders([noDay], open), [noDay]);
  assert.deepEqual(liveReminders([noDay], now), []);
  const dueToday = item("DUE_TODAY", "due today", "HG", { due: "2026-11-22" });
  assert.deepEqual(liveReminders([dueToday], open), [dueToday]);
  assert.deepEqual(liveReminders([dueToday], { ...open, status: "IN_PROGRESS" }), [dueToday], "started isn't done");
  assert.deepEqual(liveReminders([dueToday], { ...open, status: "SCHEDULED", scheduled: "2026-11-30" }), [dueToday], "scheduled after the due date");
  assert.deepEqual(liveReminders([dueToday], { ...open, status: "SCHEDULED", scheduled: "2026-11-22" }), [], "Today says it");
  assert.deepEqual(liveReminders([dueToday], { ...open, status: "WAITING" }), [], "nothing on hold");
  assert.deepEqual(liveReminders([dueToday], { ...open, status: "REVIEW" }), [], "nothing in review");
  assert.deepEqual(liveReminders([dueToday], { ...open, today: "2026-11-23" }), [], "the day turned over");
  const pastDue = item("OVERDUE", "past due", "HG", { due: "2026-11-21" });
  const late = { ...open, due: "2026-11-21" };
  assert.deepEqual(liveReminders([pastDue], late), [pastDue]);
  assert.deepEqual(liveReminders([pastDue], { ...late, status: "IN_PROGRESS" }), [pastDue]);
  assert.deepEqual(liveReminders([pastDue], { ...late, status: "SCHEDULED", scheduled: "2026-11-30" }), [pastDue]);
  assert.deepEqual(liveReminders([pastDue], { ...late, status: "REVIEW" }), [], "done since");
  assert.deepEqual(liveReminders([pastDue], { ...late, due: "2026-11-30" }), [], "a new due date");
  // Legacy kinds: the day-before heads-up as Tell the tenant, Due tomorrow as No day yet.
  const legacy = item("SCHEDULED_TOMORROW", "scheduled tomorrow", "HG", { due: "2026-11-23" });
  assert.deepEqual(liveReminders([legacy], { ...now, scheduled: "2026-11-23" }), [legacy]);
  const legacyDue = item("DUE_TOMORROW", "due tomorrow", "HG", { due: "2026-11-23" });
  assert.deepEqual(liveReminders([legacyDue], { ...open, due: "2026-11-23" }), [legacyDue]);
});

test("a deleted job's Removed row goes to its contractor with nothing but its line", () => {
  const off = item("OFF", `deleted "${T}"`, "Connor Swofford", { from: "SCHEDULED", title: T, where: "118 Congress St · Rear" });
  const zack = { recipientUser: null, recipientContact: { active: true, portalAccount: { email: "zack@x.com", status: "ACTIVE", jobEmails: true } } };
  assert.deepEqual(deletedRowVerdict({ ...zack, taskId: null, items: [off] }), { send: true, to: "zack@x.com", off });
  assert.deepEqual(deletedRowVerdict({ ...zack, taskId: null, items: [item("OFF", `took you off "${T}"`)] }), { send: false, reason: "no task" });
  assert.deepEqual(deletedRowVerdict({ ...zack, taskId: "t1", items: [off] }), { send: false, reason: "no task" });
  assert.deepEqual(deletedRowVerdict({ recipientUser: null, recipientContact: { ...zack.recipientContact, portalAccount: { ...zack.recipientContact.portalAccount, jobEmails: false } }, taskId: null, items: [off] }), { send: false, reason: "emails off" });
});

// ---------------------------------------------------------------------------
// The send run's rules, as before
// ---------------------------------------------------------------------------

test("parseItems keeps only well-formed items", () => {
  assert.deepEqual(parseItems(null), []);
  assert.deepEqual(parseItems([{ kind: "COMMENT" }, item("NOTES", "x"), "junk"]), [item("NOTES", "x")]);
});

test("recipients: staff, a contractor with an active login and access, or skipped", () => {
  const access = { contractorHasAccess: true };
  assert.deepEqual(deliveryFor({ recipientUser: { email: "c@hg.com" }, recipientContact: null }, access), { ok: true, to: "c@hg.com", audience: "staff" });
  const contact = (active: boolean, status: string | null, jobEmails = true) => ({
    recipientUser: null,
    recipientContact: { active, portalAccount: status ? { email: "zack@x.com", status, jobEmails } : null },
  });
  assert.deepEqual(deliveryFor(contact(true, "ACTIVE"), access), { ok: true, to: "zack@x.com", audience: "contractor" });
  assert.deepEqual(deliveryFor(contact(true, null), access), { ok: false, reason: "no login" });
  assert.deepEqual(deliveryFor(contact(true, "DISABLED"), access), { ok: false, reason: "no login" });
  assert.deepEqual(deliveryFor(contact(false, "ACTIVE"), access), { ok: false, reason: "no login" });
  assert.deepEqual(deliveryFor({ recipientUser: null, recipientContact: null }, access), { ok: false, reason: "no recipient" });
  assert.deepEqual(deliveryFor(contact(true, "ACTIVE", false), access), { ok: false, reason: "emails off" });
  assert.deepEqual(deliveryFor(contact(true, "DISABLED", false), access), { ok: false, reason: "no login" });
  assert.deepEqual(deliveryFor(contact(true, "ACTIVE"), { contractorHasAccess: false }), { ok: false, reason: "no access" });
});

test("refused sends, the daily cap, retries and the Buffalo day", () => {
  assert.equal(sendFailureKind({ status: 429, code: "daily_quota_exceeded" }), "quota");
  assert.equal(sendFailureKind({ status: 429, code: "monthly_quota_exceeded" }), "quota");
  assert.equal(sendFailureKind({ status: 429, code: "rate_limit_exceeded" }), "rate");
  assert.equal(sendFailureKind({ status: 422, code: "validation_error" }), "error");
  const now = new Date("2026-10-22T15:00:00Z");
  assert.equal(refusedRetryAt("quota", now).toISOString(), "2026-10-22T16:00:00.000Z");
  assert.equal(refusedRetryAt("rate", now).toISOString(), "2026-10-22T15:01:00.000Z");
  assert.equal(DAILY_EMAIL_CAP, 100);
  assert.deepEqual([sendBudget(0, 50), sendBudget(80, 50), sendBudget(100, 50), sendBudget(130, 50)], [50, 20, 0, 0]);
  assert.deepEqual([reachedCapNow(80, 20), reachedCapNow(80, 19), reachedCapNow(100, 0)], [true, false, false]);
  const mins = (d: Date | null) => (d ? (d.getTime() - now.getTime()) / 60_000 : null);
  assert.deepEqual([1, 2, 3, 4].map((a) => mins(retryAt(a, now))), [1, 5, 15, 60]);
  assert.equal(retryAt(MAX_ATTEMPTS, now), null);
  assert.equal(easternDayStart(new Date("2026-10-22T18:00:00Z")).toISOString(), "2026-10-22T04:00:00.000Z");
  assert.equal(easternDayStart(new Date("2026-10-23T03:00:00Z")).toISOString(), "2026-10-22T04:00:00.000Z");
  assert.equal(easternDayStart(new Date("2026-12-01T12:00:00Z")).toISOString(), "2026-12-01T05:00:00.000Z");
  assert.equal(easternDayStart(new Date("2026-11-01T20:00:00Z")).toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(easternDayStart(new Date("2026-03-08T20:00:00Z")).toISOString(), "2026-03-08T05:00:00.000Z");
});

test("the preview is one line under about 90 characters, cut on a word", () => {
  assert.equal(previewText("Connor moved Due to Mon, Nov 23."), "Connor moved Due to Mon, Nov 23.");
  const long = previewText("word ".repeat(60));
  assert.ok(long.length <= PREVIEW_MAX && long.endsWith("…") && !long.endsWith(" …"));
  assert.equal(previewText("a\nb", "c"), "a b c");
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

test("a file post whose files were taken off since is dropped, and Open task never anchors at it", () => {
  const post: OutboxItem = { kind: "ATTACHMENT", actorLabel: "Connor Swofford", summary: "added quote.pdf", at, eventId: "a1" };
  const comment = withEvent(item("COMMENT", '"Doors are in"'), "e1");
  const live = reconcileItems([post, comment], events(snap({ id: "a1", files: ["file"] }), snap({ id: "e1" })), toZack);
  assert.deepEqual(live.map((i) => i.eventId), ["a1", "e1"]);
  const gone = reconcileItems([post, comment], events(snap({ id: "a1", files: [] }), snap({ id: "e1" })), toZack);
  assert.deepEqual(gone.map((i) => i.eventId), ["e1"]);
  assert.equal(firstUpdateId(gone), "e1");
  assert.deepEqual(reconcileItems([post], events(snap({ id: "a1", files: [] })), toZack), []);
});

test("files read as '3 photos and 1 file'", () => {
  assert.equal(filePhrase(["image", "image", "image", "file"]), "3 photos and 1 file");
  assert.equal(filePhrase(["image"]), "1 photo");
  assert.equal(filePhrase(["file", "file"]), "2 files");
  assert.equal(filePhrase(["image", "image", "video", "file", "file"]), "2 photos, 1 video and 2 files");
  assert.equal(filePhrase([]), "");
});

test("a comment is re-read when the row is claimed: the current words in full, with its line breaks", () => {
  const stored = withEvent(item("COMMENT", '"Doors are in"'), "e1");
  const [edited] = reconcileItems([stored], events(snap({ id: "e1", body: "Doors are in.\n\nTrim needs one more coat.\r\nFriday?" })), toZack);
  assert.equal(edited.summary, '"Doors are in.\n\nTrim needs one more coat.\nFriday?"');
  assert.equal(itemLine(edited), 'Connor: "Doors are in.\n\nTrim needs one more coat.\nFriday?"');
  // Quoted in full (Q9), up to a long cap that only stops a pasted essay.
  const long = "word ".repeat(300).trim();
  assert.equal(reconcileItems([stored], events(snap({ id: "e1", body: long })), toZack)[0].summary, `"${long}"`);
  const essay = "x".repeat(EMAIL_COMMENT_MAX + 100);
  assert.equal(reconcileItems([stored], events(snap({ id: "e1", body: essay })), toZack)[0].summary, `"${"x".repeat(EMAIL_COMMENT_MAX)}…"`);
  // A resident's comment keeps its own line; their note comes along as words.
  const resident = withEvent(item("COMMENT", "added a note and 1 photo", "Dana Lee (resident)"), "e2");
  const [r] = reconcileItems([resident], events(snap({ id: "e2", body: "Worse at night", audienceContactId: null, files: ["image"] })), { audience: "staff", recipientContactId: null });
  assert.deepEqual([r.summary, r.words], ["added a note and 1 photo", "Worse at night"]);
});

test("files after the words, or alone, are counted the new way", () => {
  const stored = withEvent(item("COMMENT", '"Doors are in" (+4 files)'), "e1");
  const photos = ["image", "image", "image", "file"] as const;
  assert.equal(reconcileItems([stored], events(snap({ id: "e1", files: [...photos] })), toZack)[0].summary, '"Doors are in" (3 photos and 1 file)');
  const only = reconcileItems([withEvent(item("COMMENT", "added files (+2 files)"), "e1")], events(snap({ id: "e1", body: null, files: ["image", "image"] })), toZack)[0];
  assert.equal(only.summary, "added 2 photos");
  assert.equal(itemLine(only), "Connor added 2 photos");
  assert.equal(reconcileItems([stored], events(snap({ id: "e1", files: [] })), toZack)[0].summary, '"Doors are in"');
});

test("a deleted comment never reaches Zack; an edited one is what he gets; the order is kept", () => {
  const first = withEvent(item("COMMENT", '"Thursday?"'), "e1");
  const second = withEvent(item("COMMENT", '"Friday"'), "e2");
  assert.deepEqual(reconcileItems([first, second], events(snap({ id: "e1", deletedAt: new Date() }), snap({ id: "e2", body: "Friday at 9" })), toZack).map((i) => i.summary), ['"Friday at 9"']);
  assert.deepEqual(reconcileItems([first], events(), toZack), []);
  assert.deepEqual(reconcileItems([first], events(snap({ id: "e1", body: null })), toZack), []);
  const third = withEvent(item("COMMENT", '"c"'), "e3");
  assert.deepEqual(
    reconcileItems([first, second, third], events(snap({ id: "e1" }), snap({ id: "e2", deletedAt: new Date() }), snap({ id: "e3", body: "c2" })), toZack).map((i) => i.eventId),
    ["e1", "e3"],
  );
  // Rows that mix old items (no event) and new ones: the old send as stored.
  const old = item("COMMENT", '"Old note" (+1 file)');
  const assigned = item("ASSIGNED", `assigned you "${T}"`);
  assert.deepEqual(reconcileItems([old, assigned], events(), toZack), [old, assigned]);
});

test("a comment that isn't Shared or isn't Zack's is not sent to Zack; partners get a contractor's as it is", () => {
  const stored = withEvent(item("COMMENT", '"Hmm"'), "e1");
  assert.deepEqual(reconcileItems([stored], events(snap({ id: "e1", visibility: "INTERNAL" })), toZack), []);
  assert.deepEqual(reconcileItems([stored], events(snap({ id: "e1", audienceContactId: "c-jose" })), toZack), []);
  assert.equal(reconcileItems([stored], events(snap({ id: "e1", audienceContactId: null })), toZack).length, 1);
  assert.equal(reconcileItems([stored], events(snap({ id: "e1", audienceContactId: null })), { audience: "staff", recipientContactId: null }).length, 1);
  const approved = withEvent(item("STATUS", `approved "${T}"`), "s1");
  assert.deepEqual(reconcileItems([approved], events(snap({ id: "s1", body: null, deletedAt: new Date() })), toZack), [], "Approve's Undo");
});

test("a send-back's note lives inside its status line: edited, the email follows with its line breaks; deleted, it comes out", () => {
  const back = withEvent(item("STATUS", `sent "${T}" back: Level the uppers`), "s1", { noteEventId: "n1" });
  const status = snap({ id: "s1", body: null });
  assert.equal(reconcileItems([back], events(status, snap({ id: "n1", body: "Level the uppers\nand re-hang" })), toZack)[0].summary, `sent "${T}" back: Level the uppers\nand re-hang`);
  assert.equal(reconcileItems([back], events(status, snap({ id: "n1", deletedAt: new Date() })), toZack)[0].summary, `sent "${T}" back`);
  assert.equal(reconcileItems([back], events(status), toZack)[0].summary, `sent "${T}" back`);
  const odd = withEvent(item("STATUS", `sent "Hang 36" mirror" back: old`), "s1", { noteEventId: "n1" });
  assert.equal(reconcileItems([odd], events(status, snap({ id: "n1", body: "new" })), toZack)[0].summary, 'sent "Hang 36" mirror" back: new');
  const quoted = withEvent(item("STATUS", `sent "Paint" back: put the "old" back`), "s1", { noteEventId: "n1" });
  assert.equal(reconcileItems([quoted], events(status, snap({ id: "n1", body: "Use the new one" })), toZack)[0].summary, 'sent "Paint" back: Use the new one');
  const approved = withEvent(item("STATUS", `approved "${T}"`), "s1", { noteEventId: "n1" });
  assert.equal(reconcileItems([approved], events(status, snap({ id: "n1" })), toZack)[0].summary, `approved "${T}"`);
});

test("Open task opens at the first update in the bundle", () => {
  const items = [item("ASSIGNED", `assigned you "${T}"`), withEvent(item("COMMENT", '"Doors"', "Dana Lee (resident)"), "e7")];
  assert.equal(firstUpdateId(items), "e7");
  assert.equal(firstUpdateId([]), null);
  assert.equal(taskEmail(partnerJob({ assigned: true, items })).primary?.url, `${APP}/tasks/t1#update-e7`);
  assert.equal(openUrl(`${APP}/`, "staff", "t1", "e7"), `${APP}/tasks/t1#update-e7`);
  assert.equal(openUrl(APP, "contractor", "t1"), `${APP}/p/jobs/t1`);
});

test("at send time: taken off, only the off line goes; put back on, it's dropped; canceled stands while canceled", () => {
  const comment = item("COMMENT", '"Doors"');
  const tookOff = item("OFF", `took you off "${T}"`);
  const canceled = item("OFF", `canceled "${T}"`);
  assert.deepEqual(offItems([comment, tookOff], { hasAccess: false, canceled: false }), [tookOff]);
  assert.deepEqual(offItems([comment, tookOff], { hasAccess: true, canceled: false }), [comment]);
  assert.deepEqual(offItems([comment, canceled], { hasAccess: true, canceled: true }), [comment, canceled]);
  assert.deepEqual(offItems([comment, canceled], { hasAccess: true, canceled: false }), [comment]);
  // Handed the job and taken off it inside one bundle: nothing goes.
  const assigned = item("ASSIGNED", `assigned you "${T}"`);
  assert.deepEqual(offItems([assigned, tookOff], { hasAccess: false, canceled: false }), []);
  assert.deepEqual(offItems([assigned, canceled], { hasAccess: true, canceled: true }), []);
});

test("taken off and given back inside one bundle (an Undo of a reassignment): nothing goes, unless the job changed meanwhile", () => {
  const job = jobKey({ status: "SCHEDULED", due: "2026-11-23", scheduled: null, notes: "Side door" });
  const assigned = item("ASSIGNED", `assigned you "${T}"`);
  const tookOff = { ...item("OFF", `took you off "${T}"`), job };
  const comment = item("COMMENT", '"Doors"');
  assert.deepEqual(offItems([tookOff, assigned], { hasAccess: true, canceled: false, job }), []);
  assert.deepEqual(offItems([comment, tookOff, assigned], { hasAccess: true, canceled: false, job }), [comment]);
  const moved = jobKey({ status: "SCHEDULED", due: "2026-11-24", scheduled: null, notes: "Side door" });
  assert.deepEqual(offItems([tookOff, assigned], { hasAccess: true, canceled: false, job: moved }), [assigned]);
  assert.deepEqual(offItems([item("OFF", `took you off "${T}"`), assigned], { hasAccess: true, canceled: false, job }), [assigned]);
  assert.deepEqual(offItems([assigned, tookOff, assigned], { hasAccess: true, canceled: false, job }), [assigned, assigned]);
});

test("a change put back before the email goes says nothing (Connor, Nov 15): dates, notes, the checklist, a status, on hold", () => {
  const now = { due: "2026-10-30", scheduled: null, notes: "Paint is in the basement.", status: "IN_PROGRESS" as const };
  const moved = (to: string, from: string): OutboxItem => ({ ...item("TARGET", `moved "${T}" to ${to}`), visit: false, from });
  const comment = item("COMMENT", '"Doors"');
  assert.deepEqual(undoneDropped([moved("Mon, Nov 2", "2026-10-30"), comment, moved("Fri, Oct 30", "2026-11-02")], now), [comment]);
  const twice = [moved("Mon, Nov 2", "2026-10-30"), moved("Tue, Nov 3", "2026-11-02")];
  assert.deepEqual(undoneDropped(twice, { ...now, due: "2026-11-03" }), twice);
  assert.deepEqual(undoneDropped([moved("Mon, Nov 2", ""), moved("no date", "2026-11-02")], { ...now, due: null }), []);
  const notes = (was: string): OutboxItem => ({ ...item("NOTES", `updated the notes on "${T}"`), from: notesFingerprint(was) });
  assert.deepEqual(undoneDropped([notes("Paint is in the basement."), notes("Paint is in the garage.")], now), []);
  assert.deepEqual(undoneDropped([notes("Paint is in the basement.")], { ...now, notes: "Paint is in the garage." }), [notes("Paint is in the basement.")]);
  // The checklist: an item added and taken off again; compared only when the caller read the list.
  const list = [{ title: "Pull the old vanity" }];
  const added = item("CHECKLIST", 'added "x" to the checklist', "Connor Swofford", { from: checklistFingerprint(list) });
  assert.deepEqual(undoneDropped([added], { ...now, checklist: list }), []);
  assert.deepEqual(undoneDropped([added], { ...now, checklist: [...list, { title: "x" }] }), [added]);
  assert.deepEqual(undoneDropped([added], now), [added]);
  assert.equal(checklistFingerprint([{ title: " a  b " }]), checklistFingerprint([{ title: "a b" }]));
  // A status changed and changed back; on hold and back.
  const waiting: OutboxItem = { ...item("STATUS", `set "${T}" to waiting`), eventId: "s1", from: "IN_PROGRESS" };
  const back: OutboxItem = { ...item("STATUS", `set "${T}" to in progress`), eventId: "s2", from: "WAITING" };
  assert.deepEqual(undoneDropped([waiting, comment, back], now), [comment]);
  const hold = item("HOLD", `put "${T}" on hold`, "Connor Swofford", { from: "IN_PROGRESS" });
  assert.deepEqual(undoneDropped([hold], now), []);
  assert.deepEqual(undoneDropped([hold], { ...now, status: "WAITING" }), [hold]);
  // The scheduled day.
  const day = (to: string, from: string): OutboxItem => ({ ...item("DAY", `moved "${T}" to ${to}`), from });
  assert.deepEqual(undoneDropped([day("Mon, Nov 2", "2026-10-31"), day("Sat, Oct 31", "2026-11-02")], { ...now, scheduled: "2026-10-31" }), []);
  // Remove day and a new day: a real move.
  const sched = { due: "2026-11-17", scheduled: "2026-11-18" as const, notes: null, status: "SCHEDULED" as const };
  const removed: OutboxItem = { ...item("STATUS", `unscheduled "${T}"`), eventId: "s1", from: "SCHEDULED", fromDay: "2026-11-17" };
  const repicked: OutboxItem = { ...item("STATUS", `scheduled "${T}" for Wed, Nov 18`), eventId: "s2", from: "OPEN" };
  assert.deepEqual(undoneDropped([removed, repicked], sched), [removed, repicked]);
  assert.deepEqual(undoneDropped([removed, { ...repicked, summary: `scheduled "${T}" for Tue, Nov 17` }], { ...sched, scheduled: "2026-11-17" }), []);
});

test("notes fingerprint: the same notes print the same, trimmed as stored, and none prints empty", () => {
  assert.equal(notesFingerprint("Paint is in the basement."), notesFingerprint("  Paint is in the basement. "));
  assert.notEqual(notesFingerprint("Paint is in the basement."), notesFingerprint("Paint is in the basement!"));
  assert.match(notesFingerprint("Lockbox 4321"), /^[0-9a-z]{1,11}$/);
  assert.equal(notesFingerprint(null), "");
});

// ---------------------------------------------------------------------------
// The send run's two decisions
// ---------------------------------------------------------------------------

const ZACK_LOGIN = { active: true, portalAccount: { email: "zack@example.test", status: "ACTIVE", jobEmails: true } };
const dueRow = (over: Partial<DueRow> = {}): DueRow => ({
  taskId: "t1",
  recipientContactId: "c-zack",
  recipientUser: null,
  recipientContact: ZACK_LOGIN,
  items: [item("ASSIGNED", `assigned you "${T}"`)],
  task: { status: "OPEN", access: [{ contactId: "c-zack" }] },
  ...over,
});
const toPartner = (over: Partial<DueRow> = {}) => dueRow({ recipientContactId: null, recipientContact: null, recipientUser: { email: "connor@example.test" }, ...over });

test("the first decision: a row goes to a contractor who can open the job, or to a partner", () => {
  const zack = dueRowVerdict(dueRow());
  assert.deepEqual(zack.send && [zack.delivery, zack.taskId, zack.task.status], [{ ok: true, to: "zack@example.test", audience: "contractor" }, "t1", "OPEN"]);
  const connor = dueRowVerdict(toPartner());
  assert.deepEqual(connor.send && connor.delivery, { ok: true, to: "connor@example.test", audience: "staff" });
  assert.deepEqual(dueRowVerdict(dueRow({ task: null })), { send: false, reason: "no task" });
  assert.deepEqual(dueRowVerdict(dueRow({ task: { status: "OPEN", access: [{ contactId: "c-amy" }] } })), { send: false, reason: "no access" });
  assert.deepEqual(dueRowVerdict(dueRow({ recipientContact: { active: false, portalAccount: ZACK_LOGIN.portalAccount } })), { send: false, reason: "no login" });
  assert.deepEqual(dueRowVerdict(dueRow({ recipientContact: { active: true, portalAccount: { ...ZACK_LOGIN.portalAccount, jobEmails: false } } })), { send: false, reason: "emails off" });
  assert.deepEqual(dueRowVerdict(dueRow({ taskId: null })), { send: false, reason: "no recipient" });
  assert.equal(dueRowVerdict(dueRow({ items: [item("OFF", `took you off "${T}"`)], task: { status: "OPEN", access: [] } })).send, true);
});

test("the first decision closes any row whose task is a draft, a contractor's and a partner's alike", () => {
  const draft = { status: "DRAFT" as const, access: [{ contactId: "c-zack" }] };
  assert.deepEqual(dueRowVerdict(dueRow({ task: draft })), { send: false, reason: "draft" });
  assert.deepEqual(dueRowVerdict(toPartner({ task: draft })), { send: false, reason: "draft" });
  assert.deepEqual(dueRowVerdict(dueRow({ task: draft, items: [item("OFF", `took you off "${T}"`)] })), { send: false, reason: "draft" });
});

test("the second decision, on the job read again after the claim: what is left to say, the date they see, or why nothing goes", () => {
  const goes = claimed();
  assert.deepEqual(goes.send && [goes.items.map((i) => i.kind), goes.due, goes.job], [["ASSIGNED"], "2026-11-26", JOB]);
  const visit = claimed({ job: { ...JOB, status: "SCHEDULED", scheduledFor: new Date("2026-11-30T00:00:00Z") } });
  assert.deepEqual(visit.send && [visit.due, visit.scheduled], ["2026-11-26", "2026-11-30"]);
  assert.deepEqual(claimed({ job: null }), { send: false, reason: "no task" });
  assert.deepEqual(claimed({ hasAccess: false }), { send: false, reason: "nothing to send" });
  const partner = claimed({ audience: "staff", hasAccess: false, items: [item("COMMENT", '"Doors"', "Zack Reading")] });
  assert.deepEqual(partner.send && partner.items.map((i) => i.kind), ["COMMENT"]);
  assert.deepEqual(claimed({ items: [{ ...item("DUE_TODAY", "due today", "HG"), due: "2026-11-21" }] }), { send: false, reason: "nothing to send" });
  const draft: ClaimedJob = { ...JOB, status: "DRAFT" };
  assert.deepEqual(claimed({ job: draft }), { send: false, reason: "draft" });
  assert.deepEqual(claimed({ job: draft, audience: "staff", items: [item("COMMENT", '"x"', "Zack Reading")] }), { send: false, reason: "draft" });
});
