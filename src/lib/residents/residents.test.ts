import test from "node:test";
import assert from "node:assert/strict";
import { requestedResidentUploadRole, residentUploadPath, storedResidentUploadRole, requestedUploadRole } from "../attachments/paths";
import { residentUploadLimits } from "../attachments/limits";
import { residentScope, residentTokenOf } from "../attachments/queue-owner";
import { emailSteps, linkEmail, moveInCopyEmail, requestCopyEmail, updateEmail } from "./emails";
import { endedMessage, endedWords, linkLeaseEnded, newTenant, requestClosed, residentMayCancel, stepOf } from "./steps";

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

// docs/specs/tenant-welcome-email.md

const FORM = "https://example.test/r/t/new";
const HOME = "933 Lafayette Avenue · Floor 2";

/** The HTML's visible text, in order, one cell a line. */
const htmlLines = (html: string) =>
  html
    .replace(/<div style="display:none[\s\S]*?<\/div>/, "")
    .split(/<\/td>/)
    .map((c) => c.replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim())
    .filter(Boolean);

test("the form email: Connor's words, the button to the form, two lines under it, the emergency footer (Q1)", () => {
  const e = linkEmail({ firstName: "Dana", home: HOME, url: FORM });
  assert.equal(e.subject, "Your maintenance request form for 933 Lafayette Avenue · Floor 2");
  assert.equal(e.fromName, "HG Capital");
  assert.equal(
    e.text,
    [
      "HG Capital Partners",
      "",
      "Hi Dana, here's your maintenance request form.",
      "Use it for all maintenance requests.",
      "",
      `Report a problem: ${FORM}`,
      "",
      "Emergency? Text us in our group chat.",
    ].join("\n"),
  );
  // Short and sweet (Nov 24): the preview is the one line; the HTML keeps the same order, nothing under the button.
  assert.ok(e.html.includes("Use it for all maintenance requests."));
  assert.deepEqual(htmlLines(e.html).slice(-4), [
    "Hi Dana, here's your maintenance request form.",
    "Use it for all maintenance requests.",
    "Report a problem",
    "Emergency? Text us in our group chat.",
  ]);
  assert.ok(!e.text.includes("Keep this email") && !e.text.includes("scheduled and done"));
  assert.ok(e.html.includes(`href="${FORM}"`), "the button opens the form itself");
  assert.ok(e.html.includes("HG Capital Partners"), "the full letterhead");
});

test("a new link says the old one stopped, in the subject, preview, headline and first line (Q1)", () => {
  const e = linkEmail({ firstName: "Dana", home: HOME, url: FORM, replaced: true });
  assert.equal(e.subject, "Your new maintenance request form for 933 Lafayette Avenue · Floor 2");
  assert.match(e.text, /^Hi Dana, here's your new maintenance request form\.\nYour old link no longer works\. Use this one from now on\.$/m);
  assert.match(e.html, /Your old link no longer works\. Use this one from now on\./);
  assert.ok(!e.text.includes("Use it for all maintenance requests."));
  // The rest is the same email.
  assert.match(e.text, /Report a problem: .+\n\nEmergency\? Text us in our group chat\.$/);
  // A new tenant's new link still says it's new: the old link stopping is what they need to know.
  assert.equal(linkEmail({ firstName: "Dana", home: HOME, url: FORM, replaced: true, welcome: true }).text, e.text);
});

test("a new tenant is welcomed: move-in in the last 30 days or still ahead (Q3)", () => {
  const today = "2026-11-23";
  assert.equal(newTenant("2026-11-23", today), true, "moves in today");
  assert.equal(newTenant("2026-12-01", today), true, "still ahead");
  assert.equal(newTenant("2026-10-24", today), true, "30 days ago");
  assert.equal(newTenant("2026-10-23", today), false, "31 days ago");
  assert.equal(newTenant(new Date("2025-06-01T00:00:00Z"), today), false, "years ago");
  assert.equal(newTenant(null, today), false, "no move-in date: they live there now");
  const welcome = linkEmail({ firstName: "Dana", home: HOME, url: FORM, welcome: true });
  assert.match(welcome.text, /^Welcome, Dana\. Here's your maintenance request form\.$/m);
  assert.equal(welcome.subject, "Your maintenance request form for 933 Lafayette Avenue · Floor 2");
  assert.match(linkEmail({ firstName: "Dana", home: HOME, url: FORM, welcome: false }).text, /^Hi Dana, here's your maintenance request form\.$/m);
});

test("every resident email is From HG Capital, never via, and none has an em dash (Q4)", () => {
  const facts = { whatsWrong: "Kitchen sink leaks", home: "56 Tamarack St · Upper", details: null, letUsIn: true, pets: null, petsNote: null, url: "https://example.test/r/t/1" };
  const update = { ...facts, closedNote: null, today: "2026-11-21", moved: false };
  const emails = [
    linkEmail({ firstName: "Dana", home: HOME, url: FORM }),
    linkEmail({ firstName: "Dana", home: HOME, url: FORM, replaced: true }),
    linkEmail({ firstName: "Dana", home: HOME, url: FORM, welcome: true }),
    requestCopyEmail({ ...facts, firstName: "Dana" }),
    updateEmail({ ...update, step: "scheduled", day: "2026-11-25" }),
    updateEmail({ ...update, step: "scheduled", moved: true, day: "2026-11-27" }),
    updateEmail({ ...update, step: "done", day: null }),
    updateEmail({ ...update, step: "closed", day: null }),
    moveInCopyEmail({ name: "Dana Lee", firstName: "Dana", where: "56 Tamarack St, Upper", lines: ["Kitchen: Good"], today: "2026-11-23", appUrl: "https://example.test" }),
  ];
  for (const e of emails) {
    assert.equal(e.fromName, "HG Capital", e.subject);
    assert.ok(!/—/.test(e.subject + e.text), e.subject);
  }
});

test("the move-in report copy names HG Capital in its footnote", () => {
  const e = moveInCopyEmail({ name: "Dana Lee", firstName: "Dana", where: "56 Tamarack St, Upper", lines: ["Kitchen: Good", " "], today: "2026-11-23", appUrl: "https://example.test" });
  assert.equal(e.subject, "Your move-in report for 56 Tamarack St, Upper");
  assert.match(e.text, /^Thanks, Dana\. Here's a copy of the move-in report you sent for 56 Tamarack St, Upper\.$/m);
  // One line at 320 and 375 for every date, "HG Capital" spelled out (never bare "HG").
  assert.match(e.text, /^Sent to HG Capital on Nov 23\.$/m);
  assert.ok(!/\bHG\b(?! Capital)/.test(e.text.replace(/HG Capital Partners/g, "")));
});

test("an old link's page says it was replaced only when a newer one was emailed (Q1)", () => {
  assert.deepEqual(endedWords("replaced"), { heading: "This link was replaced.", lines: ["Use the newest email from HG Capital.", "Questions? Text us in our group chat."] });
  assert.deepEqual(endedWords("gone"), { heading: "This link no longer works.", lines: ["Questions? Text us in our group chat."] });
  // An action's refusal is the heading and the first line: Cancel shows it as a toast, which stays under about 90.
  assert.equal(endedMessage("replaced"), "This link was replaced. Use the newest email from HG Capital.");
  assert.equal(endedMessage("gone"), "This link no longer works. Questions? Text us in our group chat.");
  for (const why of ["replaced", "gone"] as const) {
    assert.ok(!endedMessage(why).includes("ticket"));
    assert.ok(endedMessage(why).length <= 90, why);
  }
});

test("a request takes additions until it's Done or canceled, by the form or by email", () => {
  assert.equal(requestClosed("DONE"), true);
  assert.equal(requestClosed("CANCELED"), true);
  for (const s of ["OPEN", "WAITING", "SCHEDULED", "IN_PROGRESS", "REVIEW"] as const) assert.equal(requestClosed(s), false, s);
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
