import test from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_EMAIL_CAP,
  MAX_ATTEMPTS,
  deliveryFor,
  easternDayStart,
  jobSubject,
  jobWhere,
  liveReminders,
  notesFingerprint,
  jobKey,
  offItems,
  previewText,
  whatsNew,
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
  undoneDropped,
  type EventSnapshot,
  type OutboxItem,
} from "./content";


const at = "2026-10-22T15:00:00.000Z";
const item = (kind: string, summary: string, actorLabel = "Connor Swofford"): OutboxItem => ({ kind, actorLabel, summary, at });

// The summaries below are the exact shapes src/lib/tasks/core.ts writes.
const TITLE = "Cabinet install";

const STATUS_OPEN = { status: "OPEN" as const, today: "2026-10-22" };

test("subject: a word for what the email is, then the job, street and unit", () => {
  assert.equal(jobSubject({ word: "Update", title: "Replace kitchen faucet", where: "118 Congress St · Rear" }), "Update: Replace kitchen faucet, 118 Congress St · Rear");
  assert.equal(jobSubject({ word: "Update", title: "Replace kitchen faucet", where: "" }), "Update: Replace kitchen faucet");
  // A title with line breaks can't break the subject.
  assert.equal(jobSubject({ word: "Error", title: "Fix\nsteps", where: "23 Sherwood St" }), "Error: Fix steps, 23 Sherwood St");
  assert.equal(jobWhere("118 Congress St, Buffalo, NY 14201", " Rear "), "118 Congress St · Rear");
  assert.equal(jobWhere(null, null), "");
});

test("subject word: Done once the job is, Review for partners, New with its due date, the 8 am lines, else Update (Connor, Nov 15)", () => {
  // Thu, Oct 22 in Buffalo.
  const base = { title: TITLE, address: "23 Sherwood St, Buffalo, NY 14213", unitLabel: "Upper", audience: "contractor" as const, appUrl: "https://hg.example.com", taskId: "t1", ...STATUS_OPEN, due: "2026-10-30" };
  const subject = (items: OutboxItem[], over: Partial<Parameters<typeof taskEmail>[0]> = {}) => taskEmail({ ...base, ...over, items }).subject;
  const job = "Cabinet install, 23 Sherwood St · Upper";
  const assigned = item("ASSIGNED", `assigned you "${TITLE}"`);

  // Anything else on an open job is an Update, whatever changed, a date move included.
  for (const items of [
    [item("COMMENT", '"Doors arrive Thu"')],
    [item("NOTES", "updated the notes")],
    [{ ...item("TARGET", `moved "${TITLE}" to Mon, Nov 2`), visit: false }],
    [item("STATUS", `scheduled "${TITLE}" for Thu, Oct 29`)],
    [item("STATUS", `sent "${TITLE}" back: Level it`)],
  ]) assert.equal(subject(items), `Update: ${job}`);
  assert.equal(subject([item("STATUS", `set "${TITLE}" to in progress`)], { status: "IN_PROGRESS", due: null }), `Update: ${job}`);

  // Done while the job is Done when it goes: approved, closed by a partner, a comment after, or handed over and closed in one bundle.
  assert.equal(subject([item("STATUS", `approved "${TITLE}"`)], { status: "DONE" }), `Done: ${job}`);
  assert.equal(subject([item("STATUS", `set "${TITLE}" to done`)], { status: "DONE" }), `Done: ${job}`);
  assert.equal(subject([item("COMMENT", '"Looks great"')], { status: "DONE" }), `Done: ${job}`);
  assert.equal(subject([assigned, item("STATUS", `set "${TITLE}" to done`)], { status: "DONE" }), `Done: ${job}`);

  // The 8 am lines say when, and lead over a change bundled with them.
  assert.equal(subject([item("COMMENT", '"Side door"'), { ...item("DUE_TODAY", "due today", "HG"), due: "2026-10-22" }], { due: "2026-10-22" }), `Due today: ${job}`);
  assert.equal(subject([{ ...item("OVERDUE", "due yesterday", "HG"), due: "2026-10-21" }], { status: "IN_PROGRESS", due: "2026-10-21" }), `Due yesterday: ${job}`);

  // New, with the due date the brand's way: today, tomorrow, the weekday within six days, then the date. A past
  // date is the real one, and next year's says the year.
  const handed = [assigned, item("COMMENT", '"Use the side door"')];
  assert.equal(subject(handed, { due: "2026-10-22" }), `New, due today: ${job}`);
  assert.equal(subject(handed, { due: "2026-10-23" }), `New, due tomorrow: ${job}`);
  assert.equal(subject(handed, { due: "2026-10-28" }), `New, due Wednesday: ${job}`);
  assert.equal(subject(handed, { due: "2026-10-29" }), `New, due Oct 29: ${job}`);
  assert.equal(subject(handed, { due: "2026-10-20" }), `New, due Oct 20: ${job}`);
  assert.equal(subject(handed, { due: "2027-01-05" }), `New, due Jan 5, 2027: ${job}`);
  assert.equal(subject(handed, { due: null }), `New: ${job}`);
  // Handed over on its date, the 8 am line in the same bundle: New already says today.
  assert.equal(subject([assigned, { ...item("DUE_TODAY", "due today", "HG"), due: "2026-10-22" }], { due: "2026-10-22" }), `New, due today: ${job}`);
  // A partner's copy of a job waiting on their review reads Review (docs/specs/send-for-review.md, section 4), a
  // late photo after the Send for review included; Done wins once the other partner approved; else Update.
  const sent = item("STATUS", `sent "${TITLE}" for review`, "Zack Smith");
  assert.equal(subject([sent], { audience: "staff", status: "REVIEW" }), `Review: ${job}`);
  assert.equal(subject([item("COMMENT", "added files (+2 files)", "Zack Smith")], { audience: "staff", status: "REVIEW" }), `Review: ${job}`);
  assert.equal(subject([sent], { audience: "staff", status: "DONE" }), `Done: ${job}`);
  assert.equal(subject([item("COMMENT", '"Doors in"', "Zack Smith")], { audience: "staff", status: "IN_PROGRESS" }), `Update: ${job}`);
  // A contractor's copy never reads Review: a partner's shared comment while it waits is an Update.
  assert.equal(subject([item("COMMENT", '"Checking it today"', "Connor Swofford")], { status: "REVIEW" }), `Update: ${job}`);
  // A resident's request from their link reads New request on a partner's copy (docs/specs/maintenance-requests.md, 4.3).
  assert.equal(subject([item("CREATED", "sent this request", "Dana Lee (resident)")], { audience: "staff", status: "OPEN" }), `New request: ${job}`);
});

test("one thread per job, so a date move doesn't split it", () => {
  const base = { title: TITLE, address: null, audience: "contractor" as const, appUrl: "https://hg.example.com", taskId: "t1", ...STATUS_OPEN, items: [item("NOTES", "updated the notes")] };
  assert.equal(taskEmail({ ...base, due: "2026-10-30" }).threadKey, "job-t1");
  assert.equal(taskEmail({ ...base, due: "2026-11-02" }).threadKey, "job-t1");
  assert.equal(taskEmail({ ...base, due: null }).threadKey, "job-t1");
});

test("each change reads as one line without the title", () => {
  // Every job has one date and emails call it the due date, a scheduled job's included: never "visit" or "target".
  assert.equal(itemText({ ...item("TARGET", `moved "${TITLE}" to Fri, Oct 30`), visit: false }), "moved the due date to Fri, Oct 30");
  assert.equal(itemText({ ...item("TARGET", `moved "${TITLE}" to Fri, Oct 30`), visit: true }), "moved the due date to Fri, Oct 30");
  assert.equal(itemText({ ...item("TARGET", `moved "${TITLE}" to no date`), visit: false }), "cleared the due date");
  assert.equal(itemText({ ...item("TARGET", `moved "${TITLE}" to no date`), visit: true }), "cleared the due date");
  // Rows queued before the flag read neutrally, and still parse.
  assert.equal(itemText(item("TARGET", `moved "${TITLE}" to Fri, Oct 30`)), "moved the date to Fri, Oct 30");
  assert.equal(itemText(item("TARGET", `moved "${TITLE}" to no date`)), "cleared the date");
  assert.equal(itemText(item("NOTES", `updated the notes on "${TITLE}"`)), "updated the notes");
  assert.equal(itemText(item("ASSIGNED", `assigned you "${TITLE}"`)), "assigned you this job");
  assert.equal(itemText(item("ASSIGNED", `assigned you "${TITLE}" for Thu, Oct 29`)), "assigned you this job for Thu, Oct 29");
  assert.equal(itemText(item("ASSIGNED", `assigned you "${TITLE}" for Tue, Jan 5, 2027`)), "assigned you this job for Tue, Jan 5, 2027");
  assert.equal(itemText(item("ASSIGNED", `assigned you "Quote \"A\" for B"`)), "assigned you this job");
  assert.equal(itemText(item("STATUS", `started "${TITLE}"`, "Zack Smith")), "started the job");
  assert.equal(itemText(item("STATUS", `scheduled "${TITLE}" for Thu, Oct 29`)), "set the due date to Thu, Oct 29");
  assert.equal(itemText(item("STATUS", `set "${TITLE}" to open`)), "moved it to To do");
  assert.equal(itemText(item("STATUS", `sent "${TITLE}" back: Level the uppers`)), "sent it back: Level the uppers");
  assert.equal(itemText(item("STATUS", `sent "${TITLE}" for review`)), "sent it for review");
  // Rows queued before Nov 15 still carry the old words.
  assert.equal(itemText(item("STATUS", `marked "${TITLE}" done`)), "sent it for review");
  // A send-back whose note ends in "for review" stays a send-back.
  assert.equal(itemText(item("STATUS", `sent "${TITLE}" back: redo the "trim" for review`)), 'sent it back: redo the "trim" for review');
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

test("What's new leads with the latest status change, else the assignment, else the date, else the first line (BCONTRACT-007)", () => {
  assert.deepEqual(whatsNew([item("COMMENT", '"Side door"'), item("STATUS", `sent "${TITLE}" back: Level the uppers`)], TITLE), {
    headline: "Connor sent it back: Level the uppers.",
    lines: ['Connor: "Side door"'],
  });
  // The latest status change decides: sent back, then approved, leads with approved.
  assert.equal(whatsNew([item("STATUS", `sent "${TITLE}" back`), item("STATUS", `approved "${TITLE}"`)], TITLE).headline, "Connor approved it.");
  assert.equal(whatsNew([item("COMMENT", '"Use the side door"'), item("ASSIGNED", `assigned you "${TITLE}"`)], TITLE).headline, "Connor assigned you this job.");
  // Only the latest date is said, and it leads over a comment.
  assert.deepEqual(
    whatsNew([item("TARGET", `moved "${TITLE}" to Thu, Oct 29`), item("COMMENT", '"Doors"'), item("TARGET", `moved "${TITLE}" to Fri, Oct 30`)], TITLE),
    { headline: "Connor moved the date to Fri, Oct 30.", lines: ['Connor: "Doors"'] },
  );
  assert.deepEqual(whatsNew([item("COMMENT", '"Doors"'), item("NOTES", "updated the notes")], TITLE), {
    headline: 'Connor: "Doors"',
    lines: ["Connor updated the notes."],
  });
});

test("the preview line is What's new on one line, cut on a word", () => {
  assert.equal(previewText("Connor moved the due date to Mon, Nov 23.", ['Connor: "Faucet\'s in the garage."']), 'Connor moved the due date to Mon, Nov 23. Connor: "Faucet\'s in the garage."');
  const long = previewText("Connor assigned you this job.", ["word ".repeat(60)]);
  assert.ok(long.length <= 140 && long.endsWith("…") && !long.endsWith(" …"));
});

test("the job line names the unit as My jobs does (BCONTRACT-V03)", () => {
  const base = { items: [item("NOTES", "updated the notes")], title: "Bathroom tile", audience: "contractor" as const, appUrl: "https://hg.example.com", taskId: "t1", ...STATUS_OPEN };
  assert.equal(taskEmail({ ...base, address: "415 Crescent Ave, Buffalo, NY 14214", unitLabel: "Upper" }).job.where, "415 Crescent Ave · Upper");
  assert.equal(taskEmail({ ...base, address: "415 Crescent Ave, Buffalo, NY 14214", unitLabel: " 2 " }).job.where, "415 Crescent Ave · 2");
  assert.equal(taskEmail({ ...base, address: "415 Crescent Ave, Buffalo, NY 14214", unitLabel: null }).subject, "Update: Bathroom tile, 415 Crescent Ave");
  assert.equal(taskEmail({ ...base, address: null, unitLabel: null }).subject, "Update: Bathroom tile");
  assert.equal(taskEmail({ ...base, address: null, unitLabel: null }).job.directionsUrl, null);
  assert.equal(
    taskEmail({ ...base, address: "415 Crescent Ave, Buffalo, NY 14214", unitLabel: null }).job.directionsUrl,
    "https://maps.apple.com/?daddr=415%20Crescent%20Ave%2C%20Buffalo%2C%20NY%2014214",
  );
});

test("a scheduled job's email gives its date as the due date", () => {
  const email = taskEmail({
    items: [item("STATUS", `scheduled "${TITLE}" for Thu, Oct 29`)],
    title: TITLE,
    address: "23 Sherwood St, Buffalo, NY 14213",
    audience: "contractor",
    appUrl: "https://hg.example.com",
    taskId: "t1",
    status: "SCHEDULED",
    due: "2026-10-29",
    today: "2026-10-22",
  });
  assert.equal(email.headline, "Connor set the due date to Thu, Oct 29.");
  assert.equal(email.subject, "Update: Cabinet install, 23 Sherwood St");
  assert.equal(email.job.due, "Thu, Oct 29");
  assert.equal(email.primary?.label, "Start job");
  // Next year's date says the year.
  assert.equal(itemText(item("STATUS", `scheduled "${TITLE}" for Tue, Jan 5, 2027`)), "set the due date to Tue, Jan 5, 2027");
});

test("a title with a quote in it comes out whole", () => {
  const t = 'Hang 36" mirror';
  assert.equal(itemText(item("STATUS", `scheduled "${t}" for Thu, Oct 29`)), "set the due date to Thu, Oct 29");
  assert.equal(itemText({ ...item("TARGET", `moved "${t}" to Fri, Oct 30`), visit: false }), "moved the due date to Fri, Oct 30");
  assert.equal(itemText(item("STATUS", `sent "${t}" for review`)), "sent it for review");
  assert.equal(itemText(item("STATUS", `marked "${t}" done`)), "sent it for review");
  assert.equal(itemText(item("STATUS", `sent "${t}" back: Level it`)), "sent it back: Level it");
  assert.equal(itemText(item("STATUS", `sent "${t}" back`)), "sent it back");
  // A note that says `" back` itself keeps its words: the title ends at the first `" back`.
  assert.equal(itemText(item("STATUS", `sent "${t}" back: Put the "old" back`)), 'sent it back: Put the "old" back');
  assert.equal(itemText(item("STATUS", `sent "Paint" back: put the "old" back`)), 'sent it back: put the "old" back');
  assert.equal(itemText(item("STATUS", `set "${t}" to done`)), "moved it to Done");
});

test("a send-back on a title that says `\" back: ` itself comes out whole when the job's title is known", () => {
  const t = 'Put "old" back: kitchen';
  const noNote = item("STATUS", `sent "${t}" back`);
  const withNote = item("STATUS", `sent "${t}" back: Level it`);
  assert.equal(itemText(noNote, t), "sent it back");
  assert.equal(itemText(withNote, t), "sent it back: Level it");
  assert.equal(itemLines([noNote, withNote], t)[0], "Connor sent it back");
  // The title is compared as the email writes it, with its runs of spaces collapsed.
  assert.equal(itemText(item("STATUS", `sent "${t}" back: Level it`), 'Put  "old" back:   kitchen'), "sent it back: Level it");
  // A job renamed since the line was queued falls back to the first `" back`, as before.
  assert.equal(itemText(item("STATUS", 'sent "Paint" back: put the "old" back'), "Paint the hall"), 'sent it back: put the "old" back');
  assert.equal(itemText(item("STATUS", 'sent "Paint" back'), "Paint the hall"), "sent it back");
  // The narrow case sendBackTail's note keeps: renamed from a title that says `" back` itself, the old title is cut at
  // that first `" back` and its rest reads as the note.
  assert.equal(itemText(item("STATUS", `sent "${t}" back`), "Kitchen faucet"), 'sent it back: kitchen" back');
  // The note after an exact title may say `" back: ` too.
  assert.equal(itemText(item("STATUS", `sent "${t}" back: Put it "back: here"`), t), 'sent it back: Put it "back: here"');
  // taskEmail hands its title down.
  const email = taskEmail({ items: [noNote], title: t, address: null, audience: "contractor", appUrl: "https://hg.example.com", taskId: "t1", ...STATUS_OPEN });
  assert.equal(email.headline, "Connor sent it back.");
});

test("lines: comments quote, oldest first, only the latest target and notes", () => {
  const lines = itemLines([
    item("TARGET", `moved "${TITLE}" to Thu, Oct 29`),
    item("COMMENT", '"Doors arrive Thu" (+1 file)'),
    item("TARGET", `moved "${TITLE}" to Fri, Oct 30`),
  ]);
  assert.deepEqual(lines, ['Connor: "Doors arrive Thu" (+1 file)', "Connor moved the date to Fri, Oct 30"]);
});

test("the whole email: subject, preview, What's new, the next step's buttons and the job", () => {
  const staff = taskEmail({
    items: [item("COMMENT", '"Uppers in"', "Zack Smith")],
    title: TITLE,
    address: "23 Sherwood St, Buffalo, NY 14213",
    audience: "staff",
    appUrl: "https://hg.example.com/",
    taskId: "t1",
    status: "IN_PROGRESS",
    due: "2026-10-30",
    today: "2026-10-22",
    notes: "Side door code is on the lockbox.",
    checklist: [
      { title: "Hang uppers", done: true },
      { title: "Hang lowers", done: false },
    ],
    contractorName: "Zack Smith",
  });
  assert.deepEqual(staff, {
    subject: "Update: Cabinet install, 23 Sherwood St",
    preview: 'Zack: "Uppers in"',
    headline: 'Zack: "Uppers in"',
    lines: [],
    photos: [],
    morePhotos: 0,
    primary: { label: "Open task", url: "https://hg.example.com/tasks/t1" },
    secondary: [],
    job: {
      title: TITLE,
      where: "23 Sherwood St",
      directionsUrl: "https://maps.apple.com/?daddr=23%20Sherwood%20St%2C%20Buffalo%2C%20NY%2014213",
      photoUrl: null,
      due: "Fri, Oct 30",
      // A partner's copy names the contractor and the checklist's progress, not the notes or items.
      notes: null,
      checklist: [],
      contractor: "Zack Smith",
      checklistLine: "1 of 2 done",
      accessUrl: null,
      calendarUrl: null,
      dateUrl: null,
      photos: [],
      morePhotos: 0,
    },
    threadKey: "job-t1",
  });
  // The contractor's copy carries the notes and checklist, with Start job or Mark done and Add photos.
  const zack = taskEmail({ ...staffInput(), audience: "contractor", status: "IN_PROGRESS", photoUrl: "https://blob.example.com/front.jpg" });
  assert.equal(zack.job.notes, "Side door\nin back.");
  assert.deepEqual(zack.job.checklist, [{ title: "Hang uppers", done: true }]);
  assert.equal(zack.job.contractor, null);
  assert.equal(zack.job.photoUrl, "https://blob.example.com/front.jpg");
  assert.deepEqual([zack.primary?.label, ...zack.secondary.map((b) => b.label)], ["Send for review", "Add photos"]);
  assert.equal(taskEmail({ ...staffInput(), audience: "contractor", status: "OPEN" }).primary?.label, "Start job");
  assert.equal(taskEmail({ ...staffInput(), audience: "contractor", status: "WAITING" }).primary?.label, "Start job");
  assert.deepEqual(taskEmail({ ...staffInput(), audience: "contractor", status: "REVIEW" }).secondary, []);
  assert.equal(taskEmail({ ...staffInput(), audience: "contractor", status: "REVIEW" }).primary?.label, "See job");
  // A partner's copy of a job waiting in Review asks for the decision.
  const review = taskEmail({ ...staffInput(), status: "REVIEW" });
  assert.deepEqual([review.primary?.label, ...review.secondary.map((b) => b.label)], ["Approve", "Send back"]);
  // Approve opens the task (it acts on one tap, so the link never presses it); Send back opens with its sheet up.
  assert.deepEqual([review.primary?.url, review.secondary[0].url], ["https://hg.example.com/tasks/t1?do=approve", "https://hg.example.com/tasks/t1?do=send-back"]);
  assert.equal(openUrl("https://hg.example.com", "contractor", "t1"), "https://hg.example.com/p/jobs/t1");
});

function staffInput() {
  return {
    items: [item("COMMENT", '"Uppers in"', "Zack Smith")],
    title: TITLE,
    address: "23 Sherwood St, Buffalo, NY 14213",
    audience: "staff" as const,
    appUrl: "https://hg.example.com",
    taskId: "t1",
    status: "IN_PROGRESS" as const,
    due: "2026-10-30",
    today: "2026-10-22",
    notes: "  Side door  \r\n in back.  ",
    checklist: [{ title: "Hang uppers", done: true }],
    contractorName: "Zack Smith",
  };
}

test("a contractor's email about a closed job reads See job, with no thanks and nowhere to reply (send-for-review.md)", () => {
  const base = {
    title: TITLE,
    address: "23 Sherwood St, Buffalo, NY 14213",
    audience: "contractor" as const,
    appUrl: "https://hg.example.com",
    taskId: "t1",
    staffNames: ["Connor", "Pieter"],
    status: "DONE" as const,
    today: "2026-10-22",
  };
  // An approval emails nobody (rules.ts notifyAudience); a shared comment in the same minutes still does.
  const email = taskEmail({ ...base, items: [item("COMMENT", '"Looks great"', "Pieter Hoff")] });
  assert.equal(email.subject, "Done: Cabinet install, 23 Sherwood St");
  assert.ok(!("closing" in email));
  assert.deepEqual(email.primary, { label: "See job", url: "https://hg.example.com/p/jobs/t1" });
  assert.deepEqual(email.secondary, []);
  assert.ok(!("footnote" in email));
  // A row queued before Nov 15 that still names the approval sends without a thanks.
  const old = taskEmail({ ...base, items: [item("STATUS", `approved "${TITLE}"`, "Pieter Hoff")] });
  assert.equal(old.headline, "Pieter approved it.");
  assert.ok(!("closing" in old));
  // Approved, then reopened: the job's next step leads.
  const reopened = taskEmail({ ...base, status: "IN_PROGRESS", items: [item("STATUS", `approved "${TITLE}"`), item("STATUS", `set "${TITLE}" to in progress`)] });
  assert.equal(reopened.primary?.label, "Send for review");
  // Sent back: the issue's note, and Send for review again.
  const sentBack = taskEmail({ ...base, status: "IN_PROGRESS", items: [item("STATUS", `sent "${TITLE}" back: Level the uppers`)] });
  assert.equal(sentBack.headline, "Connor sent it back: Level the uppers.");
  assert.equal(sentBack.primary?.label, "Send for review");
  // Staff get Open task on a closed job.
  assert.equal(taskEmail({ ...base, audience: "staff", items: [item("COMMENT", '"Looks great"', "Zack Smith")] }).primary?.label, "Open task");
});

test("contractor emails say where to reply, naming the partners; staff emails don't", () => {
  assert.equal(replyLine(["Connor", "Pieter"]), "Reply in the job so Connor and Pieter both see it.");
  assert.equal(replyLine(["Connor"]), "Reply in the job so Connor sees it.");
  assert.equal(replyLine(["Connor", "Pieter", "Dana"]), "Reply in the job so Connor, Pieter and Dana all see it.");
  assert.equal(replyLine([]), "Reply in the job so HG Capital sees it.");
  const base = { items: [item("NOTES", "updated the notes")], title: TITLE, address: null, appUrl: "https://hg.example.com", taskId: "t1", ...STATUS_OPEN };
  assert.equal(
    taskEmail({ ...base, audience: "contractor", staffNames: ["Connor", "Pieter"] }).footnote,
    "Reply in the job so Connor and Pieter both see it.",
  );
  // Only while the job is still open when the email goes out.
  assert.ok(!("footnote" in taskEmail({ ...base, audience: "contractor", staffNames: ["Connor", "Pieter"], status: "DONE" })));
  assert.ok(!("footnote" in taskEmail({ ...base, audience: "contractor", staffNames: ["Connor", "Pieter"], status: "CANCELED" })));
  assert.ok(!("footnote" in taskEmail({ ...base, audience: "staff", staffNames: ["Connor", "Pieter"] })));
});

test("parseItems keeps only well-formed items", () => {
  assert.deepEqual(parseItems(null), []);
  assert.deepEqual(parseItems([{ kind: "COMMENT" }, item("NOTES", "x"), "junk"]), [item("NOTES", "x")]);
});

test("an item's eventId changes no word of the email, only where its button opens, and a row mixing old and new items sends every line", () => {
  // core.ts puts eventId on a comment's line (so a contractor's Undo finds it); rows queued before it carry none.
  const zack = "Zack Outlaw";
  const old = item("COMMENT", "added files (+2 files)", zack);
  const tagged: OutboxItem = { ...item("COMMENT", '"Tile set" (+1 file)', zack), eventId: "e-2" };
  const stored = [old, tagged, item("STATUS", `marked "${TITLE}" done`, zack)];
  const parsed = parseItems(JSON.parse(JSON.stringify(stored)));
  assert.deepEqual(parsed, stored, "kept as stored, eventId and all");
  const withIds = taskEmail({ items: parsed, title: TITLE, address: null, audience: "staff", appUrl: "https://hg.example.com", taskId: "t1", ...STATUS_OPEN });
  const without = taskEmail({
    items: parsed.map((i) => ({ kind: i.kind, actorLabel: i.actorLabel, summary: i.summary, at: i.at })),
    title: TITLE,
    address: null,
    audience: "staff",
    appUrl: "https://hg.example.com",
    taskId: "t1",
    ...STATUS_OPEN,
  });
  // Every line, the subject and the rest read the same; the button opens at the first update an item names
  // (activity 2.6), and a row of old items opens the job as it always did.
  const { primary: anchored, ...said } = withIds;
  const { primary: plain, ...saidWithout } = without;
  assert.deepEqual(said, saidWithout);
  assert.equal(anchored?.url, "https://hg.example.com/tasks/t1#update-e-2");
  assert.equal(plain?.url, "https://hg.example.com/tasks/t1");
  assert.equal(withIds.lines.length + 1, 3);
});

test("recipients: staff, a contractor with an active login and access, or skipped", () => {
  const access = { contractorHasAccess: true };
  assert.deepEqual(deliveryFor({ recipientUser: { email: "c@hg.com" }, recipientContact: null }, access), {
    ok: true,
    to: "c@hg.com",
    audience: "staff",
  });
  const contact = (active: boolean, status: string | null, jobEmails = true) => ({
    recipientUser: null,
    recipientContact: { active, portalAccount: status ? { email: "zack@x.com", status, jobEmails } : null },
  });
  assert.deepEqual(deliveryFor(contact(true, "ACTIVE"), access), { ok: true, to: "zack@x.com", audience: "contractor" });
  assert.deepEqual(deliveryFor(contact(true, null), access), { ok: false, reason: "no login" });
  assert.deepEqual(deliveryFor(contact(true, "DISABLED"), access), { ok: false, reason: "no login" });
  assert.deepEqual(deliveryFor(contact(false, "ACTIVE"), access), { ok: false, reason: "no login" });
  assert.deepEqual(deliveryFor({ recipientUser: null, recipientContact: null }, access), { ok: false, reason: "no recipient" });
  // Job emails switched off after the line was queued: the send run drops it (docs/specs/contractor-email-switch.md).
  assert.deepEqual(deliveryFor(contact(true, "ACTIVE", false), access), { ok: false, reason: "emails off" });
  // A login that can't sign in reads "no login" first, whatever its switch says.
  assert.deepEqual(deliveryFor(contact(true, "DISABLED", false), access), { ok: false, reason: "no login" });
});

test("recipients: a contractor taken off the job before the send gets nothing (D12)", () => {
  const zack = { recipientUser: null, recipientContact: { active: true, portalAccount: { email: "zack@x.com", status: "ACTIVE", jobEmails: true } } };
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

test("a file post whose files were taken off since is dropped, and no button anchors at it", () => {
  const post: OutboxItem = { kind: "ATTACHMENT", actorLabel: "Connor Swofford", summary: "added quote.pdf", at: "2026-10-26T15:00:00Z", eventId: "a1" };
  const comment = withEvent({ kind: "COMMENT", actorLabel: "Connor Swofford", summary: '"Doors are in"', at: "2026-10-26T15:01:00Z" }, "e1");
  const live = reconcileItems([post, comment], events(snap({ id: "a1", files: ["file"] }), snap({ id: "e1" })), toZack);
  assert.deepEqual(live.map((i) => i.eventId), ["a1", "e1"], "a file still up is sent as stored");
  const gone = reconcileItems([post, comment], events(snap({ id: "a1", files: [] }), snap({ id: "e1" })), toZack);
  assert.deepEqual(gone.map((i) => i.eventId), ["e1"]);
  assert.equal(firstUpdateId(gone), "e1", "the button opens at the comment, not the post that is gone");
  assert.deepEqual(reconcileItems([post], events(snap({ id: "a1", files: [] })), toZack), [], "nothing left sends nothing");
});

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
  // An old note that said `" back` itself is replaced whole, never kept as part of the title.
  const quoted = withEvent(item("STATUS", `sent "Paint" back: put the "old" back`), "s1", { noteEventId: "n1" });
  assert.equal(reconcileItems([quoted], events(status, snap({ id: "n1", body: "Use the new one" })), toZack)[0].summary, 'sent "Paint" back: Use the new one');
  assert.equal(reconcileItems([quoted], events(status, snap({ id: "n1", deletedAt: new Date() })), toZack)[0].summary, 'sent "Paint" back');
  assert.equal(reconcileItems([back], events(status, snap({ id: "n1", body: "x" })), toZack).length, 1);
  // Other status lines with a note id are untouched.
  const approved = withEvent(item("STATUS", `approved "${TITLE}"`), "s1", { noteEventId: "n1" });
  assert.equal(reconcileItems([approved], events(status, snap({ id: "n1" })), toZack)[0].summary, `approved "${TITLE}"`);
});

test("the button opens at the first update in the bundle; nothing to open at means the job", () => {
  const base = { title: TITLE, address: null, audience: "contractor" as const, appUrl: "https://hg.example.com", taskId: "t1", status: "DONE" as const, today: "2026-10-22" };
  const items = [item("ASSIGNED", `assigned you "${TITLE}"`), withEvent(item("COMMENT", '"Doors"'), "e7"), withEvent(item("STATUS", `approved "${TITLE}"`), "e8")];
  assert.equal(taskEmail({ ...base, items }).primary?.url, "https://hg.example.com/p/jobs/t1#update-e7");
  assert.equal(taskEmail({ ...base, audience: "staff", items }).primary?.url, "https://hg.example.com/tasks/t1#update-e7");
  // Old rows, and kinds that have no row in the timeline, open the page.
  assert.equal(taskEmail({ ...base, items: [item("COMMENT", '"Doors"')] }).primary?.url, "https://hg.example.com/p/jobs/t1");
  assert.equal(taskEmail({ ...base, items: [withEvent(item("NOTES", "updated the notes"), "e9")] }).primary?.url, "https://hg.example.com/p/jobs/t1");
  // The next step's buttons open the job itself.
  assert.equal(taskEmail({ ...base, status: "OPEN", items: [withEvent(item("COMMENT", '"Doors"'), "e7")] }).primary?.url, "https://hg.example.com/p/jobs/t1");
  assert.equal(firstUpdateId(items), "e7");
  assert.equal(firstUpdateId([]), null);
  assert.equal(openUrl("https://hg.example.com/", "staff", "t1", "e7"), "https://hg.example.com/tasks/t1#update-e7");
});

test("a bundle with a comment and Send for review reads as before: the note, then sent it for review", () => {
  const items = [withEvent(item("COMMENT", '"All done"', "Zack Smith"), "n1"), withEvent(item("STATUS", `sent "${TITLE}" for review`, "Zack Smith"), "s1")];
  const email = taskEmail({ items, title: TITLE, address: null, audience: "staff", appUrl: "https://hg.example.com", taskId: "t1", status: "REVIEW", today: "2026-10-22" });
  assert.equal(email.subject, "Review: Cabinet install");
  assert.equal(email.headline, "Zack sent it for review.");
  assert.deepEqual(email.lines, ['Zack: "All done"']);
  assert.equal(email.preview, 'Zack sent it for review. Zack: "All done"');
  assert.deepEqual([email.primary?.label, ...email.secondary.map((b) => b.label)], ["Approve", "Send back"]);
});

test("with a job link, a contractor's buttons open the job as them, each ready for its step (spec 3)", () => {
  const T = "a".repeat(43);
  const base = { ...staffInput(), audience: "contractor" as const, linkToken: T, hasAccess: true };
  const working = taskEmail({ ...base, status: "IN_PROGRESS" });
  assert.deepEqual(
    [working.primary, ...working.secondary],
    [
      { label: "Send for review", url: `https://hg.example.com/j/${T}?do=done` },
      { label: "Add photos", url: `https://hg.example.com/j/${T}?do=photos` },
      { label: "Text to my crew", url: `https://hg.example.com/j/${T}?do=share` },
    ],
  );
  assert.equal(taskEmail({ ...base, status: "OPEN" }).primary?.url, `https://hg.example.com/j/${T}`);
  // See job opens at the first update, through the link.
  const seen = taskEmail({ ...base, status: "DONE", items: [withEvent(item("STATUS", `approved "${TITLE}"`), "e8")] });
  assert.equal(seen.primary?.url, `https://hg.example.com/j/${T}?u=e8`);
  // Show access only for a job with a code, Add to calendar only with a date, and neither once it's closed.
  assert.equal(working.job.accessUrl, `https://hg.example.com/j/${T}?do=access`);
  assert.equal(working.job.calendarUrl, `https://hg.example.com/j/${T}/calendar`);
  assert.equal(taskEmail({ ...base, status: "IN_PROGRESS", hasAccess: false }).job.accessUrl, null);
  assert.equal(taskEmail({ ...base, status: "IN_PROGRESS", due: null }).job.calendarUrl, null);
  assert.equal(seen.job.accessUrl, null);
  assert.equal(seen.job.calendarUrl, null);
  // Without a link nothing changes: the portal's page, no crew text, no access or calendar.
  const plain = taskEmail({ ...base, linkToken: null, status: "IN_PROGRESS" });
  assert.deepEqual(plain.secondary.map((b) => b.label), ["Add photos"]);
  assert.equal(plain.primary?.url, "https://hg.example.com/p/jobs/t1");
  assert.equal(plain.job.accessUrl, null);
});

test("photos: What's new shows the bundle's, four then +N; the job shows HG's others; both through the email's link", () => {
  const T = "b".repeat(43);
  const base = { ...staffInput(), audience: "contractor" as const, linkToken: T, status: "IN_PROGRESS" as const };
  const email = taskEmail({ ...base, newPhotoIds: ["p1", "p2", "p3", "p4", "p5", "p6"], jobPhotoIds: ["h1"] });
  assert.deepEqual(email.photos.map((p) => p.src), ["p1", "p2", "p3", "p4"].map((id) => `https://hg.example.com/api/files/task/${id}?v=thumb&l=${T}`));
  assert.equal(email.morePhotos, 2);
  assert.ok(email.photos.every((p) => p.href === `https://hg.example.com/j/${T}`));
  assert.deepEqual(email.job.photos.map((p) => p.src), [`https://hg.example.com/api/files/task/h1?v=thumb&l=${T}`]);
  // A partner's copy shows the bundle's photos, opening the task, and never the job's others.
  const staff = taskEmail({ ...staffInput(), linkToken: T, newPhotoIds: ["p1"], jobPhotoIds: ["h1"] });
  assert.deepEqual(staff.photos, [{ src: `https://hg.example.com/api/files/task/p1?v=thumb&l=${T}`, href: "https://hg.example.com/tasks/t1" }]);
  assert.deepEqual(staff.job.photos, []);
  // No link, no photos: a mail app can't open them without one.
  assert.deepEqual(taskEmail({ ...base, linkToken: null, newPhotoIds: ["p1"] }).photos, []);
});

test("taken off a job or canceled: the job and that there's no need to go, nothing else", () => {
  const off = taskEmail({ ...staffInput(), audience: "contractor", status: "OPEN", linkToken: "c".repeat(43), hasAccess: true, items: [item("OFF", `took you off "${TITLE}"`)] });
  assert.equal(off.subject, "Removed: Cabinet install, 23 Sherwood St");
  assert.equal(off.headline, "You're off this job. No need to go.");
  assert.equal(off.primary, null);
  assert.deepEqual(off.secondary, []);
  assert.deepEqual([off.job.notes, off.job.accessUrl, off.job.calendarUrl, off.job.due, off.job.directionsUrl], [null, null, null, null, null]);
  assert.equal(off.threadKey, "job-t1-off");
  assert.ok(!("footnote" in off));
});

test("at send time: taken off, only the off line goes; put back on, it's dropped; canceled stands while canceled", () => {
  const comment = item("COMMENT", '"Doors"');
  const tookOff = item("OFF", `took you off "${TITLE}"`);
  const canceled = item("OFF", `canceled "${TITLE}"`);
  assert.deepEqual(offItems([comment, tookOff], { hasAccess: false, canceled: false }), [tookOff]);
  assert.deepEqual(offItems([comment, tookOff], { hasAccess: true, canceled: false }), [comment]);
  assert.deepEqual(offItems([comment, canceled], { hasAccess: true, canceled: true }), [comment, canceled]);
  assert.deepEqual(offItems([comment, canceled], { hasAccess: true, canceled: false }), [comment]);
  assert.deepEqual(offItems([comment], { hasAccess: true, canceled: false }), [comment]);
});

test("the 8 am emails: Due today or Due yesterday leads, with no name in front", () => {
  const today = { ...item("DUE_TODAY", "due today", "HG"), due: "2026-10-30" };
  assert.equal(whatsNew([today], TITLE).headline, "Due today.");
  assert.equal(whatsNew([item("COMMENT", '"Side door"'), today], TITLE).headline, "Due today.");
  // A status change still leads.
  assert.equal(whatsNew([item("STATUS", `sent "${TITLE}" back`), today], TITLE).headline, "Connor sent it back.");
  const overdue = { ...item("OVERDUE", "due yesterday", "HG"), due: "2026-10-29" };
  assert.equal(whatsNew([overdue], TITLE).headline, "Due yesterday.");
});

test("the morning after the due date: the next step and Change date; Change date sits in the Due row while the job takes one", () => {
  const T = "d".repeat(43);
  const base = { ...staffInput(), audience: "contractor" as const, linkToken: T };
  const overdue = taskEmail({ ...base, status: "IN_PROGRESS", items: [{ ...item("OVERDUE", "due yesterday", "HG"), due: "2026-10-29" }] });
  assert.deepEqual([overdue.primary?.label, ...overdue.secondary.map((b) => b.label)], ["Send for review", "Change date"]);
  assert.equal(overdue.secondary[0].url, `https://hg.example.com/j/${T}?do=date`);
  assert.equal(overdue.job.dateUrl, `https://hg.example.com/j/${T}?do=date`);
  // In Review or closed, the date is HG's again.
  assert.equal(taskEmail({ ...base, status: "REVIEW" }).job.dateUrl, null);
  assert.equal(taskEmail({ ...base, status: "DONE" }).job.dateUrl, null);
  // A partner's copy never offers it.
  assert.equal(taskEmail({ ...staffInput(), linkToken: T }).job.dateUrl, null);
});

test("a contractor's new date reads with the old one in the partners' email", () => {
  const line = itemLines([{ ...item("TARGET", `moved "${TITLE}" to Mon, Nov 23 (was Thu, Nov 19)`, "Zack Reading"), visit: false }])[0];
  assert.equal(line, "Zack moved the due date to Mon, Nov 23 (was Thu, Nov 19)");
});

test("with replies by email, the footer says what a reply does", () => {
  const open = taskEmail({ ...staffInput(), audience: "contractor", status: "IN_PROGRESS", staffNames: ["Connor", "Pieter"], replyByEmail: true });
  assert.equal(open.footnote, "Reply to add a comment. Photos you attach go on the job.");
  const closed = taskEmail({ ...staffInput(), audience: "contractor", status: "DONE", staffNames: ["Connor", "Pieter"], replyByEmail: true });
  assert.equal(closed.footnote, "Reply to reach Connor and Pieter.");
  assert.equal(taskEmail({ ...staffInput(), replyByEmail: true }).footnote, "Reply to answer Zack. It goes on the job.");
  // Without replies by email: as before.
  assert.equal(taskEmail({ ...staffInput(), audience: "contractor", status: "IN_PROGRESS", staffNames: ["Connor", "Pieter"] }).footnote, "Reply in the job so Connor and Pieter both see it.");
  assert.ok(!("footnote" in taskEmail({ ...staffInput() })));
});

test("handed the job and taken off it inside one bundle: nothing goes", () => {
  const assigned = item("ASSIGNED", `assigned you "${TITLE}"`);
  const tookOff = item("OFF", `took you off "${TITLE}"`);
  const canceled = item("OFF", `canceled "${TITLE}"`);
  assert.deepEqual(offItems([assigned, tookOff], { hasAccess: false, canceled: false }), []);
  assert.deepEqual(offItems([assigned, canceled], { hasAccess: true, canceled: true }), []);
  // Told earlier, in another email: the off line still goes.
  assert.deepEqual(offItems([tookOff], { hasAccess: false, canceled: false }), [tookOff]);
});

test("taken off and given back inside one bundle (an Undo of a reassignment): nothing goes, unless the job changed meanwhile", () => {
  const job = jobKey({ status: "SCHEDULED", target: "2026-11-23", notes: "Side door" });
  const assigned = item("ASSIGNED", `assigned you "${TITLE}"`);
  const tookOff = { ...item("OFF", `took you off "${TITLE}"`), job };
  const comment = item("COMMENT", '"Doors"');
  // Jose had it, Connor gave it to Zack, then Undo gave it back, the job as Jose knew it: he had it all along.
  assert.deepEqual(offItems([tookOff, assigned], { hasAccess: true, canceled: false, job }), []);
  assert.deepEqual(offItems([comment, tookOff, assigned], { hasAccess: true, canceled: false, job }), [comment]);
  // The visit moved while it was Zack's: the "assigned you" is the one line that tells Jose.
  const moved = jobKey({ status: "SCHEDULED", target: "2026-11-24", notes: "Side door" });
  assert.deepEqual(offItems([tookOff, assigned], { hasAccess: true, canceled: false, job: moved }), [assigned]);
  // The notes changed, or it was started: the same.
  assert.deepEqual(offItems([tookOff, assigned], { hasAccess: true, canceled: false, job: jobKey({ status: "SCHEDULED", target: "2026-11-23", notes: "Back door" }) }), [assigned]);
  assert.deepEqual(offItems([tookOff, assigned], { hasAccess: true, canceled: false, job: jobKey({ status: "IN_PROGRESS", target: "2026-11-23", notes: "Side door" }) }), [assigned]);
  // A line queued before it carried the job: as before Nov 20, the "assigned you" goes.
  assert.deepEqual(offItems([item("OFF", `took you off "${TITLE}"`), assigned], { hasAccess: true, canceled: false, job }), [assigned]);
  // New to the job, taken off and given it again: they still hear they have it.
  assert.deepEqual(offItems([assigned, tookOff, assigned], { hasAccess: true, canceled: false, job }), [assigned, assigned]);
});

test("8 am lines go only while still true when they send", () => {
  const today = { ...item("DUE_TODAY", "due today", "HG"), due: "2026-11-23" };
  const comment = item("COMMENT", '"Doors"');
  const live = { status: "IN_PROGRESS" as const, due: "2026-11-23", today: "2026-11-23" };
  assert.deepEqual(liveReminders([today, comment], live), [today, comment]);
  // The date moved, the job went to Review, or the day turned over: the line goes, the comment stays.
  assert.deepEqual(liveReminders([today, comment], { ...live, due: "2026-11-25" }), [comment]);
  assert.deepEqual(liveReminders([today, comment], { ...live, status: "REVIEW" }), [comment]);
  assert.deepEqual(liveReminders([today], { ...live, today: "2026-11-24" }), []);
  const overdue = { ...item("OVERDUE", "due yesterday", "HG"), due: "2026-11-22" };
  assert.deepEqual(liveReminders([overdue], { status: "OPEN", due: "2026-11-22", today: "2026-11-23" }), [overdue]);
});

test("photos: none on a closed job's contractor email, and up to six of HG's in the job section", () => {
  const T = "e".repeat(43);
  const base = { ...staffInput(), audience: "contractor" as const, linkToken: T };
  const closed = taskEmail({ ...base, status: "DONE", newPhotoIds: ["p1"], jobPhotoIds: ["h1"] });
  assert.deepEqual([closed.photos, closed.job.photos], [[], []]);
  const open = taskEmail({ ...base, status: "IN_PROGRESS", jobPhotoIds: ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"] });
  assert.equal(open.job.photos.length, 6);
  assert.equal(open.job.morePhotos, 2);
});

test("an assignment handed over twice in one bundle reads once", () => {
  const assigned = item("ASSIGNED", `assigned you "${TITLE}"`);
  assert.deepEqual(itemLines([assigned, item("COMMENT", '"Doors"'), assigned], TITLE), ['Connor: "Doors"', "Connor assigned you this job"]);
});

test("a change put back before the email goes says nothing (Connor, Nov 15)", () => {
  const now = { due: "2026-10-30", notes: "Paint is in the basement.", status: "IN_PROGRESS" as const };
  const moved = (to: string, from: string): OutboxItem => ({ ...item("TARGET", `moved "${TITLE}" to ${to}`), visit: false, from });
  const comment = item("COMMENT", '"Doors"');
  // Moved and moved back: the date lines go, anything else in the bundle stays.
  assert.deepEqual(undoneDropped([moved("Mon, Nov 2", "2026-10-30"), comment, moved("Fri, Oct 30", "2026-11-02")], now), [comment]);
  // Moved twice to somewhere new: kept (the email says only the latest).
  const twice = [moved("Mon, Nov 2", "2026-10-30"), moved("Tue, Nov 3", "2026-11-02")];
  assert.deepEqual(undoneDropped(twice, { ...now, due: "2026-11-03" }), twice);
  // A date set on a job that had none, then cleared again.
  assert.deepEqual(undoneDropped([moved("Mon, Nov 2", ""), moved("no date", "2026-11-02")], { ...now, due: null }), []);

  // Notes edited and put back (trimmed, as they're stored), or edited to something new.
  const notes = (was: string): OutboxItem => ({ ...item("NOTES", `updated the notes on "${TITLE}"`), from: notesFingerprint(was) });
  assert.deepEqual(undoneDropped([notes("Paint is in the basement."), notes("Paint is in the garage.")], now), []);
  assert.deepEqual(undoneDropped([notes("Paint is in the basement.")], { ...now, notes: "  Paint is in the basement.\n" }), []);
  assert.deepEqual(undoneDropped([notes("Paint is in the basement.")], { ...now, notes: "Paint is in the garage." }), [notes("Paint is in the basement.")]);

  // A status changed and changed back: both lines go.
  const waiting: OutboxItem = { ...item("STATUS", `set "${TITLE}" to waiting`), eventId: "s1", from: "IN_PROGRESS" };
  const back: OutboxItem = { ...item("STATUS", `set "${TITLE}" to in progress`), eventId: "s2", from: "WAITING" };
  assert.deepEqual(undoneDropped([waiting, comment, back], now), [comment]);
  // Sent back, then moved to Review again: the send-back and its note go.
  const sentBack: OutboxItem = { ...item("STATUS", `sent "${TITLE}" back: Drip under the sink`), eventId: "s4", noteEventId: "n4", from: "REVIEW" };
  const toReview: OutboxItem = { ...item("STATUS", `set "${TITLE}" to review`), eventId: "s5", from: "IN_PROGRESS" };
  assert.deepEqual(undoneDropped([sentBack, toReview], { ...now, status: "REVIEW" }), []);
  // Changed, changed back, then on to somewhere new: every line stays, as before.
  const done: OutboxItem = { ...item("STATUS", `set "${TITLE}" to done`), eventId: "s3", from: "IN_PROGRESS" };
  assert.deepEqual(undoneDropped([waiting, back, done], { ...now, status: "DONE" }), [waiting, back, done]);

  // Each kind on its own: a date put back doesn't take a real status change with it.
  assert.deepEqual(undoneDropped([moved("Mon, Nov 2", "2026-10-30"), waiting, moved("Fri, Oct 30", "2026-11-02")], { ...now, status: "WAITING" }), [waiting]);
  // Lines queued before Nov 15 carry no `from` and send as before.
  const old = item("TARGET", `moved "${TITLE}" to Fri, Oct 30`);
  assert.deepEqual(undoneDropped([old], now), [old]);
});

test("notes fingerprint: the same notes print the same, trimmed as stored, and none prints empty", () => {
  assert.equal(notesFingerprint("Paint is in the basement."), notesFingerprint("  Paint is in the basement. "));
  assert.notEqual(notesFingerprint("Paint is in the basement."), notesFingerprint("Paint is in the basement!"));
  assert.match(notesFingerprint("Lockbox 4321"), /^[0-9a-z]{1,11}$/);
  assert.equal(notesFingerprint(null), "");
  assert.equal(notesFingerprint("   "), "");
});
