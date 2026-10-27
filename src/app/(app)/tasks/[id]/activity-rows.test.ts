import test from "node:test";
import assert from "node:assert/strict";
import type { TaskEventKind } from "@prisma/client";
import type { ActivityEvent } from "@/lib/tasks/activity";
import type { EmailState } from "@/lib/tasks/delivery";
import { shapeActivity, type ActivityRow, type ShapeInput } from "./activity-rows";

const TODAY = "2026-10-23";
let seq = 0;
function ev(kind: TaskEventKind, data: Record<string, unknown> = {}, over: Partial<ActivityEvent> = {}): ActivityEvent {
  seq++;
  return {
    id: `e${String(seq).padStart(3, "0")}`,
    kind,
    visibility: "INTERNAL",
    actorLabel: "Connor Swofford",
    actorUserId: "u-connor",
    actorContactId: null,
    audienceContactId: null,
    body: null,
    data,
    createdAt: new Date(Date.UTC(2026, 9, 20, 14, seq)),
    source: "APP",
    ...over,
  };
}
const ZACK = { actorLabel: "Zack (Outlaw)", actorUserId: null, actorContactId: "c-zack", source: "PORTAL", visibility: "SHARED" } as const;
const SHARED_TO_ZACK = { visibility: "SHARED", audienceContactId: "c-zack" } as const;

const zack = { id: "c-zack", first: "Zack", hasLogin: true, accessActive: true, seenAt: null as Date | null };
function shape(events: ActivityEvent[], over: Partial<ShapeInput> = {}): ActivityRow[] {
  return shapeActivity({
    events,
    attachments: [],
    names: { users: { "u-connor": "Connor Swofford" }, contacts: { "c-zack": "Zack Reading" } },
    today: TODAY,
    viewerId: "u-connor",
    contractor: zack,
    emailStates: new Map<string, EmailState>(),
    partnersSeen: [],
    ...over,
  });
}
const delivery = (rows: ActivityRow[]) => rows.map((r) => r.delivery);

test("the delivery line goes under the newest staff entry the contractor can see, and says the email state", () => {
  const first = ev("COMMENT", {}, { ...SHARED_TO_ZACK, body: "Doors Thursday?" });
  const second = ev("COMMENT", {}, { ...SHARED_TO_ZACK, body: "Use the side door." });
  const rows = shape([first, second], { emailStates: new Map<string, EmailState>([[second.id, "queued"]]) });
  assert.deepEqual(delivery(rows), [null, { state: "queued", to: "Zack" }]);
  const sent = shape([first, second], { emailStates: new Map<string, EmailState>([[second.id, "emailed"]]) });
  assert.deepEqual(delivery(sent)[1], { state: "emailed", to: "Zack" });
});

test("Seen wins once he opened the job after the entry", () => {
  const c = ev("COMMENT", {}, { ...SHARED_TO_ZACK, body: "Hi" });
  const seenAt = new Date(c.createdAt.getTime() + 60_000);
  const rows = shape([c], { contractor: { ...zack, seenAt }, emailStates: new Map<string, EmailState>([[c.id, "emailed"]]) });
  assert.deepEqual(rows[0].delivery, { state: "seen", to: "Zack", at: seenAt.toISOString() });
  // He opened it before the comment was written: not seen.
  const before = shape([c], { contractor: { ...zack, seenAt: new Date(c.createdAt.getTime() - 1) }, emailStates: new Map<string, EmailState>([[c.id, "emailed"]]) });
  assert.deepEqual(before[0].delivery, { state: "emailed", to: "Zack" });
});

test("without a login the line says so; without live access, or any email on record, it says nothing", () => {
  const c = ev("COMMENT", {}, { ...SHARED_TO_ZACK, body: "Hi" });
  assert.deepEqual(shape([c], { contractor: { ...zack, hasLogin: false } })[0].delivery, { state: "no-login", to: "Zack" });
  assert.equal(shape([c], { contractor: { ...zack, accessActive: false } })[0].delivery, null);
  assert.equal(shape([c])[0].delivery, null, "a comment posted before the outbox named its events");
  assert.equal(shape([c], { contractor: null })[0].delivery, null);
});

test("never a line under a reply written to someone else, or an Internal note, or the contractor's own word", () => {
  const toZack = ev("COMMENT", {}, { ...SHARED_TO_ZACK, body: "For Zack" });
  const internal = ev("COMMENT", {}, { visibility: "INTERNAL", body: "Between us" });
  const theirs = ev("COMMENT", {}, { ...ZACK, body: "On my way" });
  // Jose has the job now: a reply written to Zack is not his, so nothing says "Jose gets an email" under it.
  const jose = { id: "c-jose", first: "Jose", hasLogin: true, accessActive: true, seenAt: null };
  assert.deepEqual(delivery(shape([toZack], { contractor: jose, emailStates: new Map<string, EmailState>([[toZack.id, "emailed"]]) })), [null]);
  // Zack's job: the newest entry he can see is the earlier staff one; the internal note and his own comment are skipped.
  const rows = shape([toZack, internal, theirs], { emailStates: new Map<string, EmailState>([[toZack.id, "queued"]]) });
  assert.deepEqual(delivery(rows), [{ state: "queued", to: "Zack" }, null, null]);
});

test("a send-back is one entry, and the line goes under it by its status event", () => {
  const status = ev("STATUS", { from: "REVIEW", to: "IN_PROGRESS" }, { ...SHARED_TO_ZACK });
  const note = ev("COMMENT", { statusEventId: status.id }, { ...SHARED_TO_ZACK, body: "Paint the left side" });
  const rows = shape([status, note], { emailStates: new Map<string, EmailState>([[status.id, "queued"]]) });
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.ok(row.type === "decision");
  assert.equal(row.text, "Connor sent this back");
  assert.equal(row.status, "IN_PROGRESS");
  assert.equal(row.note?.text, "Paint the left side");
  assert.equal(row.note?.internal, false, "styled by the note's own visibility");
  assert.deepEqual(row.delivery, { state: "queued", to: "Zack" });
  assert.deepEqual(row.ids, [status.id, note.id], "a link to either finds the entry");
});

test("under your own newest Internal note: which partners have opened the task since", () => {
  const mine = ev("COMMENT", {}, { body: "Check the permit" });
  const later = new Date(mine.createdAt.getTime() + 60_000);
  const rows = shape([mine], {
    contractor: null,
    partnersSeen: [
      { first: "Pieter", at: later },
      { first: "Dana", at: new Date(mine.createdAt.getTime() - 1) },
    ],
  });
  assert.deepEqual(rows[0].delivery, { state: "seen", to: ["Pieter"] });
  assert.equal(shape([mine], { contractor: null, partnersSeen: [{ first: "Pieter", at: new Date(mine.createdAt.getTime() - 1) }] })[0].delivery, null);
  // Only the viewer's own note: Pieter's note gets no line.
  const theirs = ev("COMMENT", {}, { ...{ actorUserId: "u-pieter", actorLabel: "Pieter Hoff" }, body: "Mine" });
  assert.equal(shape([theirs], { contractor: null, partnersSeen: [{ first: "Dana", at: later }] })[0].delivery, null);
});

test("a comment is the viewer's to edit only when they wrote it in the app", () => {
  const mine = ev("COMMENT", {}, { body: "Mine" });
  const pieter = ev("COMMENT", {}, { actorUserId: "u-pieter", actorLabel: "Pieter Hoff", body: "His" });
  const imported = ev("COMMENT", {}, { source: "ASANA", asanaStoryGid: "s1", body: "Mapped to me" });
  const rows = shape([mine, pieter, imported], { contractor: null });
  assert.deepEqual(
    rows.map((r) => r.type === "comment" && r.comment.mine),
    [true, false, false],
  );
});

test("a comment carries its links, edited time, clientId and the email its edit field mentions", () => {
  const c = ev("COMMENT", { clientId: "send-9" }, { ...SHARED_TO_ZACK, body: "Open https://example.com/doors please", editedAt: new Date("2026-10-21T15:00:00Z") });
  const [row] = shape([c], { emailStates: new Map<string, EmailState>([[c.id, "emailed"]]) });
  assert.ok(row.type === "comment");
  assert.equal(row.comment.clientId, "send-9");
  assert.equal(row.comment.edited, "2026-10-21T15:00:00.000Z");
  assert.deepEqual(row.comment.segments?.map((s) => s.type), ["text", "link", "text"]);
  assert.equal(row.comment.email, "emailed");
  assert.equal(row.comment.to, "Zack");
  // Imported comments Asana marked edited say so, with no time.
  const old = ev("COMMENT", { edited: true }, { source: "ASANA", asanaStoryGid: "s2", body: "Old", actorUserId: null });
  const [flagged] = shape([old], { contractor: null });
  assert.ok(flagged.type === "comment" && flagged.comment.edited === true);
});

test("a file taken off a comment leaves '1 file removed' on it, and a comment of files alone that lost them all becomes a line", () => {
  const c = ev("COMMENT", {}, { body: "Quote attached" });
  const removal = ev("ATTACHMENT", { attachmentId: "a1", filename: "quote.pdf", removed: true, eventId: c.id });
  const rows = shape([c, removal], { contractor: null });
  assert.ok(rows[0].type === "comment" && rows[0].comment.removedFiles === 1);
  // The removal keeps its own line, which says why the file is gone.
  assert.equal(rows[1].type === "line" && rows[1].text, "Connor removed quote.pdf");
  // Older removal lines name no comment: nothing is claimed.
  const old = shape([c, ev("ATTACHMENT", { attachmentId: "a1", filename: "quote.pdf", removed: true })], { contractor: null });
  assert.ok(old[0].type === "comment" && old[0].comment.removedFiles === 0);
});

test("a deleted comment ships no words", () => {
  const gone = ev("COMMENT", {}, { body: "Secret", deletedAt: new Date("2026-10-21T15:00:00Z") });
  const rows = shape([gone], { contractor: null });
  assert.equal(rows[0].type, "deleted");
  assert.ok(!JSON.stringify(rows).includes("Secret"));
});

test("a deleted comment's line keeps its place and prints when it came off", () => {
  const written = new Date("2026-10-21T15:00:00Z");
  const gone = ev("COMMENT", {}, { body: "Oops", createdAt: written, deletedAt: new Date("2026-10-21T15:08:00Z") });
  const row = shape([gone], { contractor: null })[0];
  assert.ok(row.type === "deleted");
  assert.equal(row.at, written.toISOString(), "it sits where the comment was");
  assert.equal(row.deletedAt, "2026-10-21T15:08:00.000Z", "and says when it was deleted, not when it was written");
});

test("rows mark what is new to the viewer, whenever it was written", () => {
  const theirs = ev("COMMENT", {}, { ...ZACK, body: "Hi" });
  const mine = ev("COMMENT", {}, { body: "Mine" });
  const due = ev("DUE", { from: null, to: "2026-10-30" });
  assert.deepEqual(shape([theirs, mine, due]).map((r) => r.fresh), [true, false, false]);
});

test("'Moved from Asana' sits once, between the imported history and the first entry written in HG", () => {
  const sync = { source: "ASANA", actorUserId: null, actorLabel: "Rae Realtor" } as const;
  const e = [
    ev("CREATED", {}, { ...sync, actorLabel: "Asana import" }),
    ev("COMMENT", {}, { ...sync, body: "From Asana", asanaStoryGid: "s1" }),
    ev("COMMENT", {}, { body: "First in HG" }),
    ev("COMMENT", {}, { body: "Second in HG" }),
  ];
  const rows = shape(e, { contractor: null, movedOn: "2026-10-29" });
  assert.deepEqual(rows.map((r) => r.type), ["line", "comment", "moved", "comment", "comment"]);
  const moved = rows[2];
  assert.ok(moved.type === "moved" && moved.label === "Moved from Asana · Oct 29");
  assert.equal(shape(e, { contractor: null })[2].type === "moved" && (shape(e, { contractor: null })[2] as { label: string }).label, "Moved from Asana");
  // Nothing written in HG yet: no divider. A task made in HG: none either.
  assert.ok(!shape(e.slice(0, 2), { contractor: null }).some((r) => r.type === "moved"));
  assert.ok(!shape(e.slice(2), { contractor: null }).some((r) => r.type === "moved"));
  // A later sync row (a conflict) isn't imported history, so it doesn't move the divider below HG entries.
  const conflict = ev("CONFLICT", { field: "title", app: "A" }, { ...sync, actorLabel: "Asana sync", createdAt: new Date(e[1].createdAt.getTime() + 30_000) });
  const withConflict = [...e.slice(0, 2), conflict, e[2]];
  assert.deepEqual(shape(withConflict, { contractor: null }).map((r) => r.type), ["line", "comment", "moved", "line", "comment"]);
});

test("a folded run keeps its member lines, the text before a notes run, and every id for links", () => {
  const notes = [ev("NOTES", { from: "v0" }), ev("NOTES", { from: "v1" })];
  const [row] = shape(notes, { contractor: null });
  assert.ok(row.type === "run");
  assert.equal(row.text, "Connor edited the notes");
  assert.equal(row.previous, "v0");
  assert.equal(row.by, "Connor");
  assert.deepEqual(row.ids, notes.map((n) => n.id));
  assert.deepEqual(row.members.map((m) => m.previous), ["v0", "v1"]);
});
