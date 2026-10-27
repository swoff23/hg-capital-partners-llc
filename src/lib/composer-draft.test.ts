import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_DRAFT, parseDraft, resolvePending, serializeDraft, type Draft } from "./composer-draft";

test("a version 2 draft keeps the words and who sees them together", () => {
  const raw = JSON.stringify({ v: 2, text: "Check with Pieter first", visibility: "INTERNAL" });
  const { draft, legacy } = parseDraft(raw);
  assert.deepEqual(draft, { text: "Check with Pieter first", visibility: "INTERNAL", pending: null });
  assert.equal(legacy, false);
  assert.deepEqual(parseDraft(serializeDraft(draft)).draft, draft);
});

test("a draft in today's text-only format restores as Internal, and says it was the old format", () => {
  const { draft, legacy } = parseDraft("Doors look good, send Friday?");
  assert.deepEqual(draft, { text: "Doors look good, send Friday?", visibility: "INTERNAL", pending: null });
  assert.equal(legacy, true);
  // Text that happens to be JSON, or a number, is still text.
  assert.deepEqual(parseDraft("123").draft.text, "123");
  assert.equal(parseDraft('{"v":1,"text":"x"}').draft.text, '{"v":1,"text":"x"}');
  assert.equal(parseDraft("{ not json").draft.visibility, "INTERNAL");
});

test("nothing stored is an empty Shared draft", () => {
  assert.equal(parseDraft(null).draft, EMPTY_DRAFT);
  assert.equal(parseDraft("").draft, EMPTY_DRAFT);
  assert.deepEqual(EMPTY_DRAFT, { text: "", visibility: "SHARED", pending: null });
});

test("a damaged version 2 entry falls back to what it can: Shared, no pending", () => {
  assert.deepEqual(parseDraft(JSON.stringify({ v: 2, text: 5, visibility: "PUBLIC", pending: { clientId: "" } })).draft, { text: "", visibility: "SHARED", pending: null });
});

test("only a draft worth keeping is stored", () => {
  assert.equal(serializeDraft(EMPTY_DRAFT), null);
  assert.equal(serializeDraft({ text: "", visibility: "INTERNAL", pending: null }), null, "visibility alone isn't kept across a reload");
  assert.deepEqual(JSON.parse(serializeDraft({ text: "Hi", visibility: "SHARED", pending: null })!), { v: 2, text: "Hi", visibility: "SHARED" });
});

const pending = { clientId: "c1", text: "On my way", visibility: "INTERNAL" as const, files: [{ id: "a1", filename: "IMG_1.jpg" }], at: "2026-10-26T15:00:00.000Z" };

test("a message sent and not yet confirmed is stored apart from the field and survives a round trip", () => {
  const d: Draft = { text: "", visibility: "SHARED", pending };
  const raw = serializeDraft(d)!;
  assert.deepEqual(parseDraft(raw).draft, d);
  assert.deepEqual(JSON.parse(raw).pending.files, [{ id: "a1", filename: "IMG_1.jpg" }]);
  // Bad file entries are dropped, not trusted.
  const damaged = JSON.stringify({ v: 2, text: "", visibility: "SHARED", pending: { ...pending, files: [{ id: 1 }, null, { id: "a2", filename: "b.pdf" }] } });
  assert.deepEqual(parseDraft(damaged).draft.pending?.files, [{ id: "a2", filename: "b.pdf" }]);
});

test("after a reload a pending message that already posted is dropped; one that didn't comes back in the field", () => {
  const d: Draft = { text: "", visibility: "SHARED", pending };
  assert.deepEqual(resolvePending(EMPTY_DRAFT, ["c1"]), { action: "none" });
  assert.deepEqual(resolvePending(d, ["x", "c1"]), { action: "drop" });
  assert.deepEqual(resolvePending(d, ["x"]), { action: "restore", draft: { text: "On my way", visibility: "INTERNAL", pending: null } });
  // It goes ahead of anything typed since, and brings its visibility back.
  assert.deepEqual(resolvePending({ ...d, text: "Also" }, []), { action: "restore", draft: { text: "On my way\n\nAlso", visibility: "INTERNAL", pending: null } });
});
