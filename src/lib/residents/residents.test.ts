import test from "node:test";
import assert from "node:assert/strict";
import { requestedResidentUploadRole, residentUploadPath, storedResidentUploadRole, requestedUploadRole } from "../attachments/paths";
import { residentUploadLimits } from "../attachments/limits";
import { residentScope, residentTokenOf } from "../attachments/queue-owner";
import { emailSteps, linkEmail, requestCopyEmail, updateEmail } from "./emails";
import { linkLeaseEnded, residentMayCancel, stepOf } from "./steps";

// docs/specs/maintenance-requests.md

test("the step a resident sees follows the task, Review staying Scheduled until Done (3.4)", () => {
  const day = new Date("2026-11-25T00:00:00Z");
  assert.equal(stepOf("OPEN", null), "received");
  assert.equal(stepOf("WAITING", null), "received");
  // Started or finished on its day: still Scheduled, so the resident never sees it go back to Received.
  assert.equal(stepOf("IN_PROGRESS", day), "scheduled");
  assert.equal(stepOf("IN_PROGRESS", null), "received");
  assert.equal(stepOf("SCHEDULED", day), "scheduled");
  assert.equal(stepOf("REVIEW", day), "scheduled");
  // Finished without ever getting a day: still Received until a partner marks it Done.
  assert.equal(stepOf("REVIEW", null), "received");
  assert.equal(stepOf("DONE", day), "done");
  assert.equal(stepOf("CANCELED", null), "closed");
});

test("a resident cancels only before anyone started, and the link lasts through the move-out day", () => {
  assert.equal(residentMayCancel("OPEN"), true);
  assert.equal(residentMayCancel("WAITING"), true);
  assert.equal(residentMayCancel("IN_PROGRESS"), false);
  assert.equal(residentMayCancel("REVIEW"), false);
  assert.equal(residentMayCancel("SCHEDULED"), false);
  assert.equal(linkLeaseEnded({ movesOut: null }, "2026-11-21"), false);
  assert.equal(linkLeaseEnded({ movesOut: "2026-11-21" }, "2026-11-21"), false);
  assert.equal(linkLeaseEnded({ movesOut: "2026-11-20" }, "2026-11-21"), true);
});

test("a resident's uploads live in their link's own folder, never a task's (6)", () => {
  const path = residentUploadPath("link1", "IMG 0042.HEIC", "orig", "image/jpeg");
  assert.equal(path, "residents/link1/orig/IMG-0042.jpg");
  assert.equal(requestedResidentUploadRole(path, "link1"), "orig");
  assert.equal(requestedResidentUploadRole(path, "link2"), null);
  assert.equal(requestedResidentUploadRole("tasks/link1/orig/a.jpg", "link1"), null);
  assert.equal(requestedUploadRole(path, "link1"), null);
  assert.equal(storedResidentUploadRole("residents/link1/thumb/a-Xy12.jpg", "link1"), "thumb");
  assert.equal(storedResidentUploadRole("residents/link1/../x/orig/a.jpg", "link1"), null);
});

test("a resident's token takes photos and videos only", () => {
  assert.equal(typeof residentUploadLimits("link1", "residents/link1/orig/a.jpg", "image"), "object");
  assert.equal(typeof residentUploadLimits("link1", "residents/link1/orig/a.mov", "video"), "object");
  assert.equal(residentUploadLimits("link1", "residents/link1/orig/a.pdf", "file"), "Only photos and videos can be added here.");
  assert.equal(residentUploadLimits("link1", "residents/link2/orig/a.jpg", "image"), "That upload path isn't allowed.");
});

test("the resident's queue names their link, which the token route reads back", () => {
  assert.equal(residentTokenOf(residentScope("abc")), "abc");
  assert.equal(residentTokenOf("portal:abc"), null);
  assert.equal(residentTokenOf(undefined), null);
});

test("the link email sets the rule and says where emergencies go (5)", () => {
  const e = linkEmail({ firstName: "Dana", home: "56 Tamarack St · Upper", url: "https://example.test/r/t" });
  assert.equal(e.subject, "Your maintenance request link");
  assert.match(e.text, /Hi Dana, here.s your maintenance request link/);
  assert.match(e.text, /From now on, send repairs for 56 Tamarack St · Upper here/);
  assert.match(e.text, /Emergency\? Text us in our group chat\./);
  assert.match(e.text, /Report a problem/);
});

test("every email shows their three steps, Closed ending the row (drawing 15 B)", () => {
  const where = (step: Parameters<typeof emailSteps>[0]) => emailSteps(step).map((s) => `${s.label}${s.current ? "*" : s.reached ? "+" : "-"}`).join(" ");
  assert.equal(where("received"), "Received* Scheduled- Done-");
  assert.equal(where("scheduled"), "Received+ Scheduled* Done-");
  assert.equal(where("done"), "Received+ Scheduled+ Done*");
  assert.equal(where("closed"), "Received+ Closed*");
});

test("the request copy: What's new, the steps, the button, then Your request as rows", () => {
  const e = requestCopyEmail({ firstName: "Dana", whatsWrong: "Kitchen sink leaks", home: "56 Tamarack St · Upper", details: "Drips", letUsIn: true, pets: true, petsNote: "a cat", url: "https://example.test/r/t/1" });
  assert.equal(e.subject, "Your request: Kitchen sink leaks");
  for (const part of ["What's new", "Thanks, Dana. We got your request", "Received (now) > Scheduled (to come) > Done (to come)", "Your request", "Entry:\nYou can come in", "Pets:\na cat", "Comments:\nDrips"]) {
    assert.ok(e.text.includes(part), part);
  }
  const noEntry = requestCopyEmail({ firstName: "Dana", whatsWrong: "Leak", home: "h", details: null, letUsIn: false, pets: null, petsNote: null, url: "https://example.test/r/t/1" });
  assert.ok(noEntry.text.includes("Entry:\nCoordinate when you're home"));
  assert.ok(!noEntry.text.includes("Pets:"));
});

test("update emails: scheduled, moved, done and closed with the note or the group chat line", () => {
  const base = { whatsWrong: "Kitchen sink leaks", home: "56 Tamarack St · Upper", details: null, letUsIn: true, pets: null, petsNote: null, closedNote: null, url: "https://example.test/r/t/1", today: "2026-11-21" };
  assert.equal(updateEmail({ ...base, step: "scheduled", moved: false, day: "2026-11-25" }).subject, "Scheduled for Wed, Nov 25: Kitchen sink leaks");
  assert.equal(updateEmail({ ...base, step: "scheduled", moved: true, day: "2026-11-27" }).subject, "Moved to Fri, Nov 27: Kitchen sink leaks");
  assert.equal(updateEmail({ ...base, step: "scheduled", moved: false, day: null }).subject, "Scheduled: Kitchen sink leaks");
  assert.equal(updateEmail({ ...base, step: "done", moved: false, day: null }).subject, "Done: Kitchen sink leaks");
  const closed = updateEmail({ ...base, step: "closed", moved: false, day: null, closedNote: "Same as your other request." });
  assert.equal(closed.subject, "Closed: Kitchen sink leaks");
  assert.match(closed.text, /Same as your other request\./);
  assert.match(closed.text, /Questions\? Text us in our group chat\./);
});
