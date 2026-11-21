import test from "node:test";
import assert from "node:assert/strict";
import { TOAST_PHONE_CHARS } from "@/lib/toast-line";
import {
  assignLine,
  deleteBody,
  deletedLine,
  deleteTitle,
  dueLine,
  emailsDetail,
  propertyLine,
  skipDetail,
  statusLine,
  tasksCount,
  undoLine,
  type BulkLine,
} from "./bulk-copy";

const phone = (l: BulkLine) => l.phoneMessage ?? l.message;
/** What fits beside Undo in a 384px desktop toast, and on a 375 phone (lib/toast-line.ts). */
const DESKTOP_CHARS = 40;
const PHONE_375_CHARS = 33;

test("counts read as words: 1 task, 3 tasks", () => {
  assert.equal(tasksCount(1), "1 task");
  assert.equal(tasksCount(3), "3 tasks");
});

test("each change names what happened to how many", () => {
  assert.equal(statusLine(3, "WAITING").message, "3 tasks set to Waiting");
  assert.equal(statusLine(1, "DONE").message, "1 task set to Done");
  assert.equal(assignLine(3, "Zack").message, "Assigned 3 tasks to Zack");
  assert.equal(assignLine(2, "you").message, "Assigned 2 tasks to you");
  assert.equal(assignLine(3, null).message, "Unassigned 3 tasks");
  assert.equal(emailsDetail("Zack", 3), "Zack gets 3 emails");
  assert.equal(emailsDetail("Zack", 1), "Zack gets an email");
  assert.equal(dueLine(3, "2026-11-20").message, "Moved 3 tasks to Fri Nov 20");
  assert.equal(dueLine(3, null).message, "Date removed from 3 tasks");
  assert.equal(propertyLine(3, "118 Congress St.").message, "Moved 3 tasks to 118 Congress St.");
  assert.equal(propertyLine(3, null).message, "Property removed from 3 tasks");
});

test("with skips, the news counts what changed and the reason is the detail, cut first", () => {
  assert.deepEqual(dueLine(2, "2026-11-20", { closed: 1 }), {
    message: "Moved 2 of 3 tasks to Fri Nov 20",
    phoneMessage: "Moved 2 of 3 to Fri Nov 20",
    detail: "1 is closed",
  });
  assert.equal(skipDetail({ closed: 2, changed: 1 }), "2 are closed, 1 changed since");
  assert.equal(skipDetail({ needsDate: 1 }), "1 needs a day");
  assert.equal(skipDetail({ gone: 2 }), "2 were deleted");
  assert.deepEqual(statusLine(0, "DONE", { changed: 3 }), { message: "Nothing changed", detail: "3 changed since" });
  // An address's own period stays single: the reason isn't joined to it.
  assert.equal(propertyLine(2, "118 Congress St.", { gone: 1 }).message, "Moved 2 of 3 tasks to 118 Congress St.");
});

test("Undo says nothing when everything went back, and what didn't when something didn't", () => {
  assert.equal(undoLine(3, {}), null);
  assert.deepEqual(undoLine(2, { changed: 1 }), { message: "Put back 2 of 3 tasks", detail: "1 changed since" });
  assert.deepEqual(undoLine(0, { changed: 1 }), { message: "Couldn't put it back", detail: "1 changed since" });
  assert.deepEqual(undoLine(0, { changed: 2 }), { message: "Couldn't put them back", detail: "2 changed since" });
});

test("Delete asks with the count, in the singular for one, and says what went", () => {
  assert.equal(deleteTitle(1), "Delete 1 task?");
  assert.equal(deleteTitle(3), "Delete 3 tasks?");
  assert.equal(deleteBody(1), "It goes for good, with its notes, checklist, activity and files.");
  assert.equal(deleteBody(3), "They go for good, with their notes, checklists, activity and files.");
  assert.equal(deletedLine(3, 0).message, "Deleted 3 tasks");
  assert.deepEqual(deletedLine(2, 1), { message: "Deleted 2 of 3 tasks", detail: "Try the other one again" });
  assert.equal(deletedLine(0, 1).message, "Couldn't delete that task. Try again.");
  assert.equal(deletedLine(0, 2).message, "Couldn't delete those tasks. Try again.");
  // Every pick was left alone (a draft from Claude, which bulk delete never takes): not "Deleted 0 tasks".
  assert.deepEqual(deletedLine(0, 0), { message: "Nothing changed" });
});

test("the news fits a laptop toast beside Undo and a phone's line, at 3 and at 400 tasks, with any skips", () => {
  const changing = { changed: 3, gone: 1, refused: 2 };
  const dating = { closed: 12, needsDate: 2, gone: 1 };
  const lines: BulkLine[] = [
    statusLine(382, "IN_PROGRESS", changing),
    assignLine(382, "Zack", changing),
    assignLine(382, null, changing),
    dueLine(382, "2026-09-30", dating),
    dueLine(382, null, dating),
    propertyLine(382, null, { changed: 3, gone: 1 }),
    undoLine(382, { changed: 17 })!,
    undoLine(0, { changed: 17 })!,
    deletedLine(399, 1),
    deletedLine(0, 2),
    deletedLine(0, 0),
    statusLine(3, "IN_PROGRESS"),
    statusLine(2, "WAITING", { changed: 1 }),
    dueLine(3, null),
    dueLine(2, "2026-11-20", { closed: 1 }),
    propertyLine(3, null),
  ];
  for (const l of lines) {
    const all = l.detail ? `${l.message} · ${l.detail}` : l.message;
    assert.ok(all.length <= 90, `whole toast ${all.length}: ${all}`);
    assert.ok(l.message.length <= DESKTOP_CHARS, `laptop ${l.message.length}: ${l.message}`);
    assert.ok(phone(l).length <= TOAST_PHONE_CHARS, `under 375 ${phone(l).length}: ${phone(l)}`);
    assert.doesNotMatch(all, /—/);
  }
});

test("at 375 a toast's news fits too, or its phone line is used", () => {
  for (const l of [statusLine(382, "IN_PROGRESS", { changed: 3 }), dueLine(2, "2026-11-20", { closed: 1 }), assignLine(3, "Zack")]) {
    assert.ok(l.message.length <= PHONE_375_CHARS || l.phoneMessage, `375 needs a shorter line: ${l.message}`);
  }
});

test("a move to a long address keeps the news first; only the address's end is cut", () => {
  const l = propertyLine(382, "1234 Abbott Rd Ext.", { changed: 3, gone: 1 });
  assert.ok(phone(l).startsWith("Moved 382 of 386 to "));
  assert.equal(l.detail, "3 changed since, 1 was deleted");
});
