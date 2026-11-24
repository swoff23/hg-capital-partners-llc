import test from "node:test";
import assert from "node:assert/strict";
import type { DraftContractor } from "@/lib/tasks/drafts";
import { addedLine, applyDraftChange, discardedLine, groupDrafts, undoAddLine, undoDiscardLine, type DraftLine, type DraftTask } from "./draft-copy";

const draft = (id: string, createdAt: string): DraftTask => ({
  id,
  title: `Draft ${id}`,
  status: "DRAFT",
  checked: false,
  due: null,
  scheduledFor: null,
  waitingOn: null,
  unitLabel: null,
  propertyId: null,
  place: null,
  assignee: null,
  repeat: null,
  createdAt,
});

const who = (id: string, first: string, getsEmail: boolean): DraftContractor => ({ contactId: id, firstName: first, fullName: `${first} Smith`, getsEmail });
const zack = who("c1", "Zack", true);
const rob = who("c2", "Rob", false);
const ana = who("c3", "Ana", true);

// What shows beside Undo (lib/toast-line.ts, measured on the toast's own classes): about 38 characters on a laptop,
// 32 at 375, and 25 under 375, where `phoneMessage` replaces the message. The detail is the clause that is cut first.
const LAPTOP = 38;
const AT_375 = 32;
const AT_320 = 25;

/**
 * Every width's line must show its news whole; the detail may be cut. A count of ten or more adds a digit, which
 * the 320 line (25 characters) has no room for: pass `wide` and it is held to 375 and the laptop only.
 */
function fits(l: DraftLine, { wide = false }: { wide?: boolean } = {}) {
  assert.ok(l.message.length <= LAPTOP, `laptop: "${l.message}" is ${l.message.length}`);
  assert.ok(l.message.length <= AT_375, `375: "${l.message}" is ${l.message.length}`);
  const phone = l.phoneMessage ?? l.message;
  if (!wide) assert.ok(phone.length <= AT_320, `320: "${phone}" is ${phone.length}`);
}

test("one added: who hears, or who doesn't, or nothing about it", () => {
  assert.deepEqual(addedLine([zack]), { message: "Task added. Emails Zack." });
  assert.deepEqual(addedLine([rob]), { message: "Task added. No email to Rob.", phoneMessage: "Added. No email to Rob." });
  assert.deepEqual(addedLine([null]), { message: "Task added." });
});

test("several added: the count leads, who hears is the detail a short toast cuts", () => {
  assert.deepEqual(addedLine([zack, rob, null]), { message: "3 added. No email to Rob.", detail: "Emails Zack" });
  assert.deepEqual(addedLine([zack, ana]), { message: "2 tasks added", detail: "Emails Zack and Ana" });
  assert.deepEqual(addedLine([null, null, null]), { message: "3 tasks added" });
  assert.deepEqual(addedLine([rob, null]), { message: "2 added. No email to Rob." });
  // A person with two jobs is named once.
  assert.deepEqual(addedLine([zack, zack]), { message: "2 tasks added", detail: "Emails Zack" });
});

test("two people who share a first name read by their full names, among everyone the pickers list", () => {
  const other = who("c9", "Zack", true);
  assert.equal(addedLine([zack, other]).detail, "Emails Zack Smith and Zack Smith");
  assert.equal(addedLine([zack], [{ key: "c:c1", name: "Zack Smith" }, { key: "u:u1", name: "Zack Jones" }]).message, "Task added. Emails Zack Smith.");
});

test("every added line shows its news whole at 320, 375 and on a laptop", () => {
  for (const l of [
    addedLine([zack]),
    addedLine([rob]),
    addedLine([null]),
    addedLine([zack, rob, null]),
    addedLine([zack, ana]),
    addedLine([null, null, null]),
    addedLine([rob, null]),
  ]) {
    fits(l);
  }
  fits(addedLine(Array.from({ length: 200 }, () => null)), { wide: true });
  fits(addedLine([rob, ...Array.from({ length: 199 }, () => zack)]), { wide: true });
});

test("a long name loses only its tail: the news is already whole before it", () => {
  const long = who("c4", "Christopher", true);
  assert.ok(addedLine([long]).message.startsWith("Task added. Emails "));
  const quiet = who("c5", "Bartholomew", false);
  assert.ok(addedLine([quiet]).phoneMessage!.startsWith("Added. No email to "));
});

test("discard: one or many", () => {
  assert.deepEqual(discardedLine(1), { message: "Draft discarded." });
  assert.deepEqual(discardedLine(3), { message: "3 drafts discarded." });
  assert.deepEqual(discardedLine(200), { message: "200 drafts discarded." });
  fits(discardedLine(1));
  fits(discardedLine(200), { wide: true });
});

test("Add's Undo: silent when everything went back, the server's own line when nothing did, the count when some did", () => {
  assert.equal(undoAddLine(3, 3, []), null);
  assert.deepEqual(undoAddLine(1, 0, [{ message: "Too late to undo." }]), { message: "Too late to undo." });
  assert.deepEqual(undoAddLine(3, 2, [{ message: "Zack already opened it." }]), { message: "2 of 3 are drafts again", detail: "Zack already opened it" });
  fits(undoAddLine(3, 2, [{ message: "Zack already opened it." }])!);
  fits(undoAddLine(200, 199, [{ message: "Zack already opened it." }])!, { wide: true });
});

test("Discard's Undo: silent when every draft came back; says so when one was already cleared", () => {
  assert.equal(undoDiscardLine(3, 3, 0), null);
  assert.deepEqual(undoDiscardLine(1, 0, 1), { message: "That draft is gone." });
  assert.deepEqual(undoDiscardLine(3, 0, 3), { message: "Those drafts are gone." });
  assert.deepEqual(undoDiscardLine(3, 2, 1), { message: "2 of 3 are drafts again", detail: "1 is gone" });
  assert.deepEqual(undoDiscardLine(5, 2, 3), { message: "2 of 5 are drafts again", detail: "3 are gone" });
  for (const l of [undoDiscardLine(1, 0, 1)!, undoDiscardLine(3, 0, 3)!, undoDiscardLine(3, 2, 1)!]) fits(l);
  fits(undoDiscardLine(200, 100, 100)!, { wide: true });
});

test("applyDraftChange: hide drops the rows; show brings them back newest first without doubling one that is there", () => {
  const a = draft("a", "2026-11-20T10:00:00.000Z");
  const b = draft("b", "2026-11-20T11:00:00.000Z");
  const c = draft("c", "2026-11-20T09:00:00.000Z");
  assert.deepEqual(applyDraftChange([b, a, c], { kind: "hide", ids: ["a", "c"] }).map((t) => t.id), ["b"]);
  assert.deepEqual(applyDraftChange([b], { kind: "show", tasks: [a, c, b] }).map((t) => t.id), ["b", "a", "c"]);
});

test("applyDraftChange: a restored row keeps the group it sat in, so its section can be drawn again before the page refreshes", () => {
  const other: DraftTask = { ...draft("o", "2026-11-20T08:00:00.000Z"), group: { userId: "u2", name: "Pieter" } };
  const out = applyDraftChange([], { kind: "show", tasks: [other] });
  assert.deepEqual(out[0].group, { userId: "u2", name: "Pieter" });
});

test("groupDrafts: the page's groups hold their rows; an Undo's row says where it sat, even when the page dropped its group", () => {
  const a = draft("a", "2026-11-20T10:00:00.000Z");
  const b = draft("b", "2026-11-20T09:00:00.000Z");
  const o1 = draft("o1", "2026-11-20T08:00:00.000Z");
  const pieter = { userId: "u2", name: "Pieter", tasks: [o1] };
  // Rows as the page lists them.
  const plain = groupDrafts([a, b, o1], [a, b], [pieter]);
  assert.deepEqual(plain.mine.map((t) => t.id), ["a", "b"]);
  assert.deepEqual(plain.others.map((g) => [g.name, g.tasks.map((t) => t.id)]), [["Pieter", ["o1"]]]);
  // Pieter's only draft was discarded and the page refreshed: his group is gone from the page, then Undo draws it again.
  const back: DraftTask = { ...o1, group: { userId: "u2", name: "Pieter" } };
  const undone = groupDrafts([a, back], [a], []);
  assert.deepEqual(undone.mine.map((t) => t.id), ["a"]);
  assert.deepEqual(undone.others.map((g) => [g.userId, g.name, g.tasks.map((t) => t.id)]), [["u2", "Pieter", ["o1"]]]);
  // My own row that came back after a refresh dropped it.
  const mineBack: DraftTask = { ...b, group: "mine" };
  assert.deepEqual(groupDrafts([mineBack], [], []).mine.map((t) => t.id), ["b"]);
  // A row nobody says where it sat is not drawn.
  assert.deepEqual(groupDrafts([b], [], []), { mine: [], others: [] });
});
