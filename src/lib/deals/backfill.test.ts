import test from "node:test";
import assert from "node:assert/strict";
import { matchUsers, planBackfill, planNote, summarize, type BackfillUser } from "./backfill";

const connor: BackfillUser = { id: "u1", name: "Connor Swofford", email: "connor@hg.test" };
const pieter: BackfillUser = { id: "u2", name: "Pieter Louw", email: "pieter@hg.test" };
const users = [connor, pieter];

const note = (body: string, over: Partial<{ source: string; authorUserId: string | null }> = {}) => ({
  id: body.slice(0, 8),
  body,
  source: "manual",
  authorUserId: null as string | null,
  ...over,
});

test("a note signed with initials is set to that user, and loses the signature", () => {
  const step = planNote(note("seeing tomorrow (CS)"), users);
  assert.deepEqual(step, {
    id: "seeing t",
    action: "set",
    authorUserId: "u1",
    userName: "Connor Swofford",
    via: "initials",
    label: "CS",
    text: "seeing tomorrow",
    was: "seeing tomorrow (CS)",
  });
});

test("a change line with a name after the dot is set to that user by their full name", () => {
  const step = planNote(note("Status: 1 - High → Pass  ·  Pieter Louw", { source: "change" }), users);
  assert.ok(step.action === "set");
  if (step.action !== "set") return;
  assert.equal(step.authorUserId, "u2");
  assert.equal(step.text, "Status: 1 - High → Pass");
  assert.equal(step.via, "name");
});

test("the name matches without regard to case, and by the part of the email before the @", () => {
  assert.equal(matchUsers({ initials: null, name: "connor swofford" }, users)[0]?.id, "u1");
  assert.equal(matchUsers({ initials: null, name: "pieter" }, users)[0]?.id, "u2");
});

test("a label that is no user is left in the text, and counted by label", () => {
  const steps = planBackfill([note("Price: $1 → $2  ·  Spreadsheet import", { source: "change" }), note("x  ·  Spreadsheet import", { source: "change" })], users);
  assert.deepEqual(
    steps.map((s) => s.action === "skip" && s.reason),
    ["unmatched", "unmatched"],
  );
  assert.deepEqual(summarize(steps).labels, { "Spreadsheet import": 2 });
});

test("the same initials on two users are ambiguous, never guessed", () => {
  const twin: BackfillUser = { id: "u3", name: "Chris Sutton", email: "chris@hg.test" };
  const step = planNote(note("hi (CS)"), [connor, twin]);
  assert.deepEqual(step, { id: "hi (CS)", action: "skip", reason: "ambiguous", label: "CS" });
});

test("rows that already have an author, imported lines and unsigned notes are left alone", () => {
  const reason = (s: ReturnType<typeof planNote>) => (s.action === "skip" ? s.reason : "set");
  assert.equal(reason(planNote(note("hi (CS)", { authorUserId: "u1" }), users)), "has-author");
  assert.equal(reason(planNote(note("hi (CS)", { source: "migration" }), users)), "not-ours");
  assert.deepEqual(planNote(note("just a note"), users), { id: "just a n", action: "skip", reason: "no-signature", label: null });
});

test("a word in brackets is not a signature", () => {
  assert.equal(planNote(note("Need it back (ASAP)"), users).action, "skip");
});

test("the summary counts what would be set and why the rest stay", () => {
  const steps = planBackfill(
    [note("a (CS)"), note("b (PL)"), note("c (ZZ)"), note("plain"), note("d (CS)", { source: "migration" }), note("e", { authorUserId: "u1" })],
    users,
  );
  const s = summarize(steps);
  assert.equal(s.set, 2);
  assert.deepEqual(s.skipped, { "has-author": 1, "not-ours": 1, "no-signature": 1, unmatched: 1, ambiguous: 0 });
  assert.deepEqual(s.labels, { ZZ: 1 });
});

test("the plan is a function of its inputs: planning twice gives the same answer", () => {
  const notes = [note("a (CS)"), note("b  ·  Pieter Louw", { source: "change" })];
  assert.deepEqual(planBackfill(notes, users), planBackfill(notes, users));
});
