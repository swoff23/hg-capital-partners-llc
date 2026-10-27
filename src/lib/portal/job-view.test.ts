import test from "node:test";
import assert from "node:assert/strict";
import type { TaskStatus } from "@prisma/client";
import { STATUS_ORDER } from "@/lib/task-scope";
import { statusEventVisibility } from "@/lib/tasks/rules";
import {
  PORTAL_STATUS_UPDATES,
  addMorePhotosLine,
  addedText,
  addressLine,
  dayLabel,
  finishCountLabel,
  finishPhotoCount,
  finishPhotosNeeded,
  finishSlots,
  finishingLabel,
  firstName,
  groupByDate,
  groupByProperty,
  groupJobs,
  joinNames,
  lateUploadsEndsIn,
  lateUploadsOpen,
  markDoneButton,
  nextStep,
  parseJobsGroup,
  parseJobsTab,
  portalActorLabel,
  postedText,
  rowUploadLine,
  statusUpdateText,
  stillUploading,
  dueDateParts,
  stripCounts,
  updateTimeLabel,
  type JobCard,
} from "./job-view";

const TODAY = "2026-10-22"; // a Thursday

const job = (id: string, over: Partial<JobCard> = {}): JobCard => ({
  id,
  title: id,
  status: "OPEN",
  address: null,
  photoUrl: null,
  unitLabel: null,
  target: null,
  targetIsVisit: false,
  finishedOn: null,
  newCount: 0,
  ...over,
});

test("day labels: today, tomorrow, yesterday, then the weekday and date", () => {
  assert.equal(dayLabel("2026-10-22", TODAY), "Today");
  assert.equal(dayLabel("2026-10-23", TODAY), "Tomorrow");
  assert.equal(dayLabel("2026-10-21", TODAY), "Yesterday");
  assert.equal(dayLabel("2026-10-29", TODAY), "Thu, Oct 29");
  assert.equal(dayLabel("2027-01-05", TODAY), "Tue, Jan 5, 2027");
});

test("a job's date reads as a label and a day: Due date, or Visit date for a booked visit", () => {
  assert.deepEqual(dueDateParts("2026-10-22", false, TODAY), { label: "Due date", short: "Due", day: "Today" });
  assert.deepEqual(dueDateParts("2026-10-29", true, TODAY), { label: "Visit date", short: "Visit", day: "Thu, Oct 29" });
});

test("By date: soonest first for open jobs, no date last, one group per day", () => {
  const groups = groupByDate(
    [job("b", { target: "2026-10-29" }), job("none"), job("a", { target: "2026-10-22" }), job("c", { target: "2026-10-29" })],
    TODAY,
  );
  assert.deepEqual(
    groups.map((g) => [g.label, g.jobs.map((j) => j.id)]),
    [
      ["Today", ["a"]],
      ["Thu, Oct 29", ["b", "c"]],
      ["No due date", ["none"]],
    ],
  );
});

test("Done, By date: grouped by the day each job was finished, most recent first, not by its old Target", () => {
  const groups = groupJobs(
    [
      job("early", { target: "2026-10-30", finishedOn: "2026-10-20" }),
      job("late", { target: "2026-10-05", finishedOn: "2026-10-22" }),
      job("undated", { finishedOn: "2026-10-21" }),
    ],
    { tab: "done", group: "date", today: TODAY },
  );
  assert.deepEqual(
    groups.map((g) => [g.label, g.jobs.map((j) => j.id)]),
    [
      ["Today", ["late"]],
      ["Yesterday", ["undated"]],
      ["Tue, Oct 20", ["early"]],
    ],
  );
});

test("Open uses the Target, soonest first, whichever switch is on", () => {
  const jobs = [job("later", { target: "2026-10-29", address: "23 Sherwood St" }), job("sooner", { target: "2026-10-23", address: "23 Sherwood St" })];
  assert.deepEqual(
    groupJobs(jobs, { tab: "open", group: "date", today: TODAY }).map((g) => g.label),
    ["Tomorrow", "Thu, Oct 29"],
  );
  assert.deepEqual(
    groupJobs(jobs, { tab: "open", group: "property", today: TODAY }).map((g) => [g.label, g.jobs.map((j) => j.id)]),
    [["23 Sherwood St", ["sooner", "later"]]],
  );
});

test("Done, By property: most recently finished first inside each address", () => {
  const groups = groupJobs(
    [
      job("a", { address: "23 Sherwood St", finishedOn: "2026-10-20" }),
      job("b", { address: "23 Sherwood St", finishedOn: "2026-10-22" }),
    ],
    { tab: "done", group: "property", today: TODAY },
  );
  assert.deepEqual(groups[0].jobs.map((j) => j.id), ["b", "a"]);
});

test("By property: addresses in street-number order, no property last, soonest Target inside", () => {
  const groups = groupByProperty([
    job("x", { address: "767 Prospect Ave", target: "2026-11-02" }),
    job("loose"),
    job("y", { address: "23 Sherwood St" }),
    job("z", { address: "767 Prospect Ave", target: "2026-10-25" }),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.label, g.jobs.map((j) => j.id)]),
    [
      ["23 Sherwood St", ["y"]],
      ["767 Prospect Ave", ["z", "x"]],
      ["No property", ["loose"]],
    ],
  );
});

test("address line joins the street and the unit", () => {
  assert.equal(addressLine("23 Sherwood St, Buffalo, NY 14213", "Upper", { short: true }), "23 Sherwood St · Upper");
  assert.equal(addressLine("23 Sherwood St, Buffalo, NY 14213", null), "23 Sherwood St, Buffalo, NY 14213");
  assert.equal(addressLine(null, "Unit 2"), "Unit 2");
  assert.equal(addressLine(null, null), "");
});

test("the portal's status updates are exactly the ones core shares with a contractor", () => {
  const shared = STATUS_ORDER.filter((s) => statusEventVisibility(s, true) === "SHARED");
  assert.deepEqual([...shared].sort(), [...PORTAL_STATUS_UPDATES].sort());
});

test("status updates read as a short phrase", () => {
  assert.equal(statusUpdateText("OPEN", "IN_PROGRESS"), "started the job");
  assert.equal(statusUpdateText("REVIEW", "IN_PROGRESS"), "sent it back");
  assert.equal(statusUpdateText("IN_PROGRESS", "REVIEW"), "marked it done");
  assert.equal(statusUpdateText("REVIEW", "DONE"), "approved it");
  assert.equal(statusUpdateText("OPEN", "DONE"), "closed the job");
  assert.equal(statusUpdateText("OPEN", "SCHEDULED"), "scheduled the job");
  assert.equal(statusUpdateText(null, null), "updated the job");
  // Only the contractor starts the job; a partner moving it there changed its status.
  assert.equal(statusUpdateText("SCHEDULED", "IN_PROGRESS", { contractor: false }), "moved it to In progress");
  assert.equal(statusUpdateText("SCHEDULED", "IN_PROGRESS", { contractor: true }), "started the job");
  assert.equal(statusUpdateText("REVIEW", "IN_PROGRESS", { contractor: false }), "sent it back");
});

test("file posts say what was added", () => {
  assert.equal(addedText(["IMAGE"]), "added a photo");
  assert.equal(addedText(["VIDEO", "VIDEO"]), "added 2 videos");
  assert.equal(addedText(["IMAGE", "VIDEO"]), "added 2 files");
  assert.equal(addedText(["FILE"]), "added a file");
});

test("names", () => {
  assert.equal(firstName("Connor Swofford"), "Connor");
  assert.equal(firstName("  Zack (Outlaw Carpentry) "), "Zack");
  // The greeting, the Mark done payoff and the first-password page use the name he goes by.
  assert.equal(firstName("Jacob (Jake) hoak"), "Jake");
  assert.equal(firstName("Zack(Outlaw Carpentry)"), "Zack");
  assert.equal(firstName("(Asana sync)"), "(Asana sync)");
  assert.equal(joinNames(["Connor"]), "Connor");
  assert.equal(joinNames(["Connor", "Pieter"]), "Connor and Pieter");
  assert.equal(joinNames(["A", "B", "C"]), "A, B and C");
  assert.equal(joinNames([]), "");
});

test("who an update or photo is from, as the contractor sees it", () => {
  const me = "contact-me";
  // Their own: "You", whatever the stored label says.
  assert.equal(portalActorLabel(me, { userId: null, contactId: me, label: "Zack (Outlaw Carpentry)" }), "You");
  // Staff: first name, from the stored label or the email's local part.
  assert.equal(portalActorLabel(me, { userId: "u1", contactId: null, label: "Connor Swofford" }), "Connor");
  assert.equal(portalActorLabel(me, { userId: "u1", contactId: null, label: "pieter" }), "pieter");
  // The system and unmatched imports keep their label as written.
  assert.equal(portalActorLabel(me, { userId: null, contactId: null, label: "Property reminder" }), "Property reminder");
  assert.equal(portalActorLabel(me, { userId: null, contactId: null, label: "Asana user" }), "Asana user");
  // Another contractor, which only imported history reaches (D17): first name only.
  assert.equal(portalActorLabel(me, { userId: null, contactId: "contact-other", label: "Jacob Miller" }), "Jacob");
  // No name at all, such as a deleted uploader.
  assert.equal(portalActorLabel(me, { userId: null, contactId: null, label: null }), null);
  assert.equal(portalActorLabel(me, { userId: null, contactId: null, label: "  " }), null);
});

test("update times are short and use Buffalo days", () => {
  const now = new Date("2026-10-22T18:00:00Z"); // 2pm Eastern
  assert.equal(updateTimeLabel(new Date("2026-10-22T17:59:40Z"), now), "just now");
  assert.equal(updateTimeLabel(new Date("2026-10-22T17:15:00Z"), now), "45m");
  assert.equal(updateTimeLabel(new Date("2026-10-22T14:00:00Z"), now), "4h");
  // 11pm Eastern the day before is 3am UTC today: still "yesterday" in Buffalo.
  assert.equal(updateTimeLabel(new Date("2026-10-22T03:00:00Z"), now), "yesterday");
  assert.equal(updateTimeLabel(new Date("2026-10-19T15:00:00Z"), now), "Mon");
  assert.equal(updateTimeLabel(new Date("2026-10-03T15:00:00Z"), now), "Oct 3");
  assert.equal(updateTimeLabel(new Date("2025-10-03T15:00:00Z"), now), "Oct 3, 2025");
});

test("the bottom bar's next step follows the contractor's two buttons", () => {
  const steps = Object.fromEntries(STATUS_ORDER.map((s: TaskStatus) => [s, nextStep(s)]));
  assert.deepEqual(steps, {
    OPEN: "start",
    SCHEDULED: "start",
    IN_PROGRESS: "done",
    WAITING: "start",
    REVIEW: "review",
    DONE: null,
    CANCELED: null,
  });
});

test("parsing the tab and the remembered grouping", () => {
  assert.equal(parseJobsTab("done"), "done");
  assert.equal(parseJobsTab(["done"]), "open");
  assert.equal(parseJobsTab(undefined), "open");
  assert.equal(parseJobsGroup("property"), "property");
  assert.equal(parseJobsGroup("nonsense"), "date");
});

test("finishing label counts uploads", () => {
  assert.equal(finishingLabel(1), "Finishing 1 upload…");
  assert.equal(finishingLabel(3), "Finishing 3 uploads…");
});

test("Mark done has no Skip: an optional job reads Mark done and is on, with or without photos", () => {
  const idle = { pending: 0, waiting: 0, failed: 0, sending: false, uploaded: 0, required: 0 };
  assert.deepEqual(markDoneButton(idle), { label: "Mark done", enabled: true, busy: false, reason: null, line: null });
  assert.equal(markDoneButton({ ...idle, uploaded: 3 }).label, "Mark done");
  assert.equal(markDoneButton({ ...idle, uploaded: 3 }).enabled, true);
});

test("Mark done waits for uploads and stays off while a photo failed (decision 13)", () => {
  const idle = { pending: 0, waiting: 0, failed: 0, sending: false, uploaded: 0, required: 0 };
  // It keeps its label (forms 2.7) and a line says why it waits.
  assert.deepEqual(markDoneButton({ ...idle, pending: 2 }), {
    label: "Mark done",
    enabled: false,
    busy: false,
    reason: "uploading",
    line: "Finishing 2 uploads…",
  });
  // Sending is the button's own pending state, not another label.
  assert.deepEqual(markDoneButton({ ...idle, sending: true }), { label: "Mark done", enabled: false, busy: true, reason: null, line: null });
  // A failed photo waits for a Retry or a Remove; the red line with Retry is the uploader's.
  assert.deepEqual(markDoneButton({ ...idle, failed: 2 }), { label: "Mark done", enabled: false, busy: false, reason: "failed", line: null });
  // A retry puts the tile back in flight: the button counts it again.
  assert.deepEqual(markDoneButton({ ...idle, failed: 1, pending: 1 }), {
    label: "Mark done",
    enabled: false,
    busy: false,
    reason: "uploading",
    line: "Finishing 1 upload…",
  });
});

test("Mark done stays off while a photo waits for a signal, and its line is the uploader's", () => {
  const idle = { pending: 0, waiting: 0, failed: 0, sending: false, uploaded: 0, required: 0 };
  // A photo held for a signal isn't on the job yet: marking done now would leave it out of the finish set.
  assert.deepEqual(markDoneButton({ ...idle, waiting: 2 }), { label: "Mark done", enabled: false, busy: false, reason: "waiting", line: null });
  // Going up leads, then failed, then waiting, then the count.
  assert.equal(markDoneButton({ ...idle, waiting: 1, pending: 1 }).reason, "uploading");
  assert.equal(markDoneButton({ ...idle, waiting: 1, failed: 1 }).reason, "failed");
  assert.equal(markDoneButton({ ...idle, waiting: 1, required: 2 }).reason, "waiting");
  // The signal comes back and they land: the count decides again.
  assert.equal(markDoneButton({ ...idle, required: 2 }).reason, "short");
});

test("Mark done with a required count waits for that many uploaded photos, and says how many more", () => {
  const ask2 = { pending: 0, waiting: 0, failed: 0, sending: false, uploaded: 0, required: 2 };
  assert.deepEqual(markDoneButton(ask2), { label: "Mark done", enabled: false, busy: false, reason: "short", line: "Add 2 more photos" });
  assert.equal(markDoneButton({ ...ask2, uploaded: 1 }).line, "Add 1 more photo");
  assert.deepEqual(markDoneButton({ ...ask2, uploaded: 2 }), { label: "Mark done", enabled: true, busy: false, reason: null, line: null });
  assert.equal(markDoneButton({ ...ask2, uploaded: 5 }).enabled, true, "more than asked is fine");
  // Only uploaded photos count: one still going up, or one that failed, keeps it off for its own reason.
  assert.equal(markDoneButton({ ...ask2, uploaded: 1, pending: 1 }).reason, "uploading");
  assert.equal(markDoneButton({ ...ask2, uploaded: 1, failed: 1 }).reason, "failed");
  // Once nothing is in flight and the failed one is gone, the count decides again.
  assert.equal(markDoneButton({ ...ask2, uploaded: 1 }).reason, "short");
});

test("the count a playbook asks for: null, 0 and nonsense are optional, and a typo can't draw 200 slots", () => {
  assert.equal(finishPhotosNeeded(null), 0);
  assert.equal(finishPhotosNeeded(undefined), 0);
  assert.equal(finishPhotosNeeded(0), 0);
  assert.equal(finishPhotosNeeded(-3), 0);
  assert.equal(finishPhotosNeeded(Number.NaN), 0);
  assert.equal(finishPhotosNeeded(2), 2);
  assert.equal(finishPhotosNeeded(2.9), 2);
  assert.equal(finishPhotosNeeded(200), 12);
});

test("Mark done counts photos and videos toward the playbook's count, never a document or a link", () => {
  // The chunk 6 review's database run: a PDF counted as a finish photo.
  assert.equal(finishPhotoCount(["IMAGE", "FILE"]), 1);
  assert.equal(finishPhotoCount(["IMAGE", "VIDEO"]), 2, "the sheet counts every upload, and the job page uploads photos and videos");
  assert.equal(finishPhotoCount(["FILE", "LINK"]), 0);
  assert.equal(finishPhotoCount([]), 0);
  // So a playbook asking for 2 is short with one photo and a PDF.
  assert.ok(finishPhotoCount(["IMAGE", "FILE"]) < finishPhotosNeeded(2));
});

test("proof slots: the count asked for, or one on an optional job, and the 1 of 2 beside the heading", () => {
  assert.equal(finishSlots(0), 1);
  assert.equal(finishSlots(1), 1);
  assert.equal(finishSlots(3), 3);
  assert.equal(finishCountLabel(2, 0), "0 of 2");
  assert.equal(finishCountLabel(2, 1), "1 of 2");
  assert.equal(finishCountLabel(2, 4), "2 of 2", "never past the count");
  assert.equal(addMorePhotosLine(1), "Add 1 more photo");
  assert.equal(addMorePhotosLine(3), "Add 3 more photos");
});

test("a batch toast says what posted", () => {
  assert.equal(postedText(["image", "image", "image"]), "3 photos posted");
  assert.equal(postedText(["image"]), "1 photo posted");
  assert.equal(postedText(["video", "video"]), "2 videos posted");
  assert.equal(postedText(["image", "video"]), "2 files posted");
  assert.equal(postedText([null, null]), "2 files posted", "a kind the page couldn't read is a file");
});

test("Add photo/video stays on for the server's hour after Mark done, then hides (question 4)", () => {
  const markedAt = new Date("2026-10-22T15:00:00Z");
  assert.equal(lateUploadsOpen(markedAt, new Date("2026-10-22T15:00:01Z")), true);
  assert.equal(lateUploadsOpen(markedAt, new Date("2026-10-22T16:00:00Z")), true, "the hour is inclusive, as acceptsContractorUpload has it");
  assert.equal(lateUploadsOpen(markedAt, new Date("2026-10-22T16:00:01Z")), false);
  assert.equal(lateUploadsOpen(markedAt.toISOString(), new Date("2026-10-22T17:30:00Z")), false, "an ISO string from the server page reads the same");
  // No time to go by: it stays, as before.
  assert.equal(lateUploadsOpen(null, new Date("2026-10-22T20:00:00Z")), true);
  assert.equal(lateUploadsOpen(undefined, new Date("2026-10-22T20:00:00Z")), true);
  assert.equal(lateUploadsOpen("not a date", new Date("2026-10-22T20:00:00Z")), true);
});

test("the hour has an end to set a timer for", () => {
  const markedAt = "2026-10-22T15:00:00Z";
  assert.equal(lateUploadsEndsIn(markedAt, new Date("2026-10-22T15:20:00Z")), 40 * 60_000);
  assert.equal(lateUploadsEndsIn(markedAt, new Date("2026-10-22T18:00:00Z")), 0);
  assert.equal(lateUploadsEndsIn(null, new Date("2026-10-22T15:20:00Z")), null);
});

test("a My jobs row says what its uploads are doing (uploads 2.1)", () => {
  const none = { pending: 0, waiting: 0, failed: 0, pendingKinds: [] as const };
  assert.equal(rowUploadLine(none), null);
  assert.deepEqual(rowUploadLine({ ...none, pending: 3, pendingKinds: ["image", "image", "image"] }), { text: "Uploading 3 photos", tone: "info" });
  assert.deepEqual(rowUploadLine({ ...none, pending: 1, pendingKinds: ["video"] }), { text: "Uploading 1 video", tone: "info" });
  assert.deepEqual(rowUploadLine({ ...none, pending: 2, pendingKinds: ["image", "video"] }), { text: "Uploading 2 photos", tone: "info" });
  assert.deepEqual(rowUploadLine({ ...none, failed: 2 }), { text: "2 photos didn't upload", tone: "danger" });
  assert.deepEqual(rowUploadLine({ ...none, failed: 1 }), { text: "1 photo didn't upload", tone: "danger" });
  // The one that needs the contractor leads.
  assert.equal(rowUploadLine({ pending: 2, waiting: 0, failed: 1, pendingKinds: ["image", "image"] })?.tone, "danger");
  // Files held for a signal say so, after the ones going up.
  assert.deepEqual(rowUploadLine({ ...none, waiting: 3, pendingKinds: ["image", "image", "image"] }), { text: "No signal · 3 photos waiting", tone: "info" });
  assert.deepEqual(rowUploadLine({ ...none, waiting: 1, pendingKinds: ["video"] }), { text: "No signal · 1 video waiting", tone: "info" });
  assert.equal(rowUploadLine({ ...none, pending: 1, waiting: 2, pendingKinds: ["image", "image", "image"] })?.text, "Uploading 1 photo");
});

test("the payoff strip shows four thumbs and a count for the rest", () => {
  assert.deepEqual(stripCounts(0), { shown: 0, more: 0 });
  assert.deepEqual(stripCounts(3), { shown: 3, more: 0 });
  assert.deepEqual(stripCounts(4), { shown: 4, more: 0 });
  assert.deepEqual(stripCounts(6), { shown: 4, more: 2 });
  assert.deepEqual(stripCounts(6, 3), { shown: 3, more: 3 }, "inside a comment card at 320 it shows three");
});

test("the leave sheet names what's still uploading (decision 24)", () => {
  assert.equal(stillUploading(["image", "image"]), "2 photos are still uploading");
  assert.equal(stillUploading(["image"]), "1 photo is still uploading");
  assert.equal(stillUploading(["video", "video", "video"]), "3 videos are still uploading");
  assert.equal(stillUploading(["image", "video"]), "2 files are still uploading");
  assert.equal(stillUploading(["file"]), "1 file is still uploading");
});
