import test from "node:test";
import assert from "node:assert/strict";
import type { TaskStatus } from "@prisma/client";
import { STATUS_ORDER } from "@/lib/task-scope";
import { statusEventVisibility } from "@/lib/tasks/rules";
import {
  PORTAL_STATUS_UPDATES,
  addedText,
  addressLine,
  dayLabel,
  finishingLabel,
  firstName,
  groupByDate,
  groupByProperty,
  groupJobs,
  joinNames,
  nextStep,
  parseJobsGroup,
  parseJobsTab,
  portalActorLabel,
  statusUpdateText,
  targetLabel,
  updateTimeLabel,
  type JobCard,
} from "./job-view";

const TODAY = "2026-10-22"; // a Thursday

const job = (id: string, over: Partial<JobCard> = {}): JobCard => ({
  id,
  title: id,
  status: "OPEN",
  address: null,
  unitLabel: null,
  target: null,
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
  assert.equal(targetLabel("2026-10-22", TODAY), "Target today");
  assert.equal(targetLabel("2026-10-29", TODAY), "Target Thu, Oct 29");
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
      ["No target date", ["none"]],
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
