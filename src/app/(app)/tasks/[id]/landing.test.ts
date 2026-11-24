import test from "node:test";
import assert from "node:assert/strict";
import { asked, assignedBy } from "./landing";

test("only the three buttons' asks count", () => {
  assert.equal(asked("assign"), "assign");
  assert.equal(asked("approve"), "approve");
  assert.equal(asked(["send-back", "assign"]), "send-back");
  assert.equal(asked("done"), null);
  assert.equal(asked(undefined), null);
});

const ev = (to: object, at: string, actorLabel = "Pieter Louw") => ({ kind: "ASSIGNED", data: { from: {}, to }, actorLabel, createdAt: new Date(at) });

test("who assigned the current contractor, by the latest line that gave it to them", () => {
  const live = [ev({ contactId: "c1" }, "2026-11-22T14:00:00Z", "Connor Swofford"), ev({ contactId: "c2" }, "2026-11-22T14:20:00Z")];
  const line = assignedBy(live, { assigneeUserId: null, assigneeContactId: "c2" }, "Zack Miller");
  assert.deepEqual(line, { text: "Pieter assigned Zack Miller", at: "2026-11-22T14:20:00.000Z" });
});

test("a partner assignee matches by user, and a job made with its assignee has no actor", () => {
  assert.deepEqual(assignedBy([ev({ userId: "u1" }, "2026-11-22T14:00:00Z")], { assigneeUserId: "u1", assigneeContactId: null }, "Connor Swofford"), {
    text: "Pieter assigned Connor Swofford",
    at: "2026-11-22T14:00:00.000Z",
  });
  assert.deepEqual(assignedBy([], { assigneeUserId: null, assigneeContactId: "c2" }, "Zack Miller"), { text: "Zack Miller is assigned", at: null });
  assert.equal(assignedBy([], { assigneeUserId: null, assigneeContactId: "c2" }, null), null);
});
