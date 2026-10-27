import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMPTY_DRAFT,
  adoptSharedDraft,
  clientIdToReuse,
  parseDraft,
  personalDraftKey,
  resolvePending,
  serializeDraft,
  sharedDraftKey,
  type Draft,
  type DraftStorage,
} from "./composer-draft";

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

const held = { ...pending, held: true as const, files: [{ id: "a1", filename: "IMG_1.jpg" }] };

test("a message held in the field (no timeline) keeps its id across a reload, and says it stayed in the field", () => {
  const d: Draft = { text: "On my way", visibility: "INTERNAL", pending: held };
  assert.deepEqual(parseDraft(serializeDraft(d)!).draft, d);
  // One that never posted: the words and the id stay, so the next Send is the same send.
  assert.deepEqual(resolvePending(d, ["x"]), { action: "none" });
  // One the page already holds: the words in the field were that message, so they go with it.
  assert.deepEqual(resolvePending(d, ["c1"]), { action: "restore", draft: { text: "", visibility: "INTERNAL", pending: null } });
  // Words changed since are the person's own and stay.
  assert.deepEqual(resolvePending({ ...d, text: "Different now" }, ["c1"]), { action: "restore", draft: { text: "Different now", visibility: "INTERNAL", pending: null } });
});

test("failed, then Send again: the same message reuses its clientId; any change is a new send", () => {
  const d: Draft = { text: "On my way", visibility: "INTERNAL", pending: held };
  const same = { body: "On my way", visibility: "INTERNAL" as const, attachmentIds: ["a1"] };
  assert.equal(clientIdToReuse(d, same), "c1");
  assert.equal(clientIdToReuse(d, { ...same, body: "On my way!" }), null, "edited words");
  assert.equal(clientIdToReuse(d, { ...same, visibility: "SHARED" }), null, "the other side of the switch");
  assert.equal(clientIdToReuse(d, { ...same, attachmentIds: [] }), null, "a file taken off");
  assert.equal(clientIdToReuse(d, { ...same, attachmentIds: ["a1", "a2"] }), null, "a file added");
  assert.equal(clientIdToReuse(EMPTY_DRAFT, same), null, "nothing held");
  // A timeline send waiting on its answer is not a held one: Retry has its own record of the message.
  assert.equal(clientIdToReuse({ ...d, pending }, same), null);
});

test("the portal's job composer and the deal note box keep one draft per person, so a second sign-in on the device starts empty", () => {
  assert.equal(personalDraftKey("job", "t1", "c-zack"), "hgos-job-draft:t1:c-zack");
  assert.notEqual(personalDraftKey("job", "t1", "c-zack"), personalDraftKey("job", "t1", "c-jose"));
  assert.equal(personalDraftKey("deal-note", "d1", "u-connor"), "hgos-deal-note-draft:d1:u-connor");
  assert.notEqual(personalDraftKey("deal-note", "d1", "u-connor"), personalDraftKey("deal-note", "d1", "u-pieter"));
  // Never the per-record keys the two boxes used before the person was in them.
  assert.notEqual(personalDraftKey("job", "t1", "c-zack"), "hgos-job-draft:t1");
});

test("every box builds its key from the person signed in", () => {
  const read = (...parts: string[]) => readFileSync(join(import.meta.dirname, "..", ...parts), "utf8");
  assert.match(read("app", "(portal)", "p", "jobs", "[id]", "_components", "job-actions.tsx"), /draftKey=\{personalDraftKey\("job", taskId, contactId\)\}/);
  assert.match(read("app", "(portal)", "p", "jobs", "[id]", "page.tsx"), /contactId=\{principal\.contactId\}/);
  assert.match(read("app", "(app)", "deals", "[id]", "deal-log.tsx"), /draftKey=\{personalDraftKey\("deal-note", dealId, viewerId\)\}/);
  // The task page: the partner signed in, handed down from the page's user.
  assert.match(read("app", "(app)", "tasks", "[id]", "composer.tsx"), /draftKey=\{personalDraftKey\("task", taskId, viewerId\)\}/);
  assert.match(read("app", "(app)", "tasks", "[id]", "view.tsx"), /viewerId=\{p\.meId\}/);
  assert.match(read("app", "(app)", "tasks", "[id]", "page.tsx"), /meId=\{user\.id\}/);
  assert.doesNotMatch(read("app", "(app)", "tasks", "[id]", "composer.tsx"), /draftKey=\{`hgos-task-draft:/, "never the shared key");
});

test("the task page keeps one draft per partner, and its shared key from before is the only one read once", () => {
  assert.equal(personalDraftKey("task", "t1", "u-connor"), "hgos-task-draft:t1:u-connor");
  assert.notEqual(personalDraftKey("task", "t1", "u-connor"), personalDraftKey("task", "t1", "u-pieter"));
  assert.equal(sharedDraftKey(personalDraftKey("task", "t1", "u-connor")), "hgos-task-draft:t1");
  // The portal's and the deal box's earlier keys never shipped; nothing is read for them.
  assert.equal(sharedDraftKey(personalDraftKey("job", "t1", "c-zack")), null);
  assert.equal(sharedDraftKey(personalDraftKey("deal-note", "d1", "u-connor")), null);
  assert.equal(sharedDraftKey("hgos-task-draft:t1"), null, "the shared key itself has nothing before it");
});

/** localStorage as a Map, counting what the move does. */
function storage(entries: Record<string, string>): DraftStorage & { map: Map<string, string>; writes: string[] } {
  const map = new Map(Object.entries(entries));
  const writes: string[] = [];
  return {
    map,
    writes,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      writes.push(`set ${k}`);
      map.set(k, v);
    },
    removeItem: (k) => {
      writes.push(`remove ${k}`);
      map.delete(k);
    },
  };
}

test("adoptSharedDraft: the task page's old draft moves to the first partner's key once, then the old key is gone", () => {
  const old = JSON.stringify({ v: 2, text: "Ask Zack about the vanity", visibility: "INTERNAL" });
  const mine = personalDraftKey("task", "t1", "u-connor");
  const s = storage({ "hgos-task-draft:t1": old, "hgos-task-draft:t2": "other task" });
  adoptSharedDraft(s, mine);
  assert.equal(s.map.get(mine), old, "moved whole: the words and the side");
  assert.equal(s.map.has("hgos-task-draft:t1"), false);
  assert.equal(s.map.get("hgos-task-draft:t2"), "other task", "another task's draft waits for its own page");
  assert.deepEqual(parseDraft(s.map.get(mine)).draft.visibility, "INTERNAL");
  // Read once: a second read, or another partner's, finds nothing to take.
  const theirs = personalDraftKey("task", "t1", "u-pieter");
  s.writes.length = 0;
  adoptSharedDraft(s, mine);
  adoptSharedDraft(s, theirs);
  assert.deepEqual(s.writes, []);
  assert.equal(s.map.has(theirs), false);
});

test("adoptSharedDraft: a plain-text draft from before drafts had sides moves as it was, and restores Internal", () => {
  const mine = personalDraftKey("task", "t1", "u-connor");
  const s = storage({ "hgos-task-draft:t1": "Ask Zack about the vanity" });
  adoptSharedDraft(s, mine);
  assert.equal(s.map.get(mine), "Ask Zack about the vanity");
  assert.equal(s.map.has("hgos-task-draft:t1"), false);
  const { draft, legacy } = parseDraft(s.map.get(mine));
  assert.deepEqual([draft.text, draft.visibility, draft.pending, legacy], ["Ask Zack about the vanity", "INTERNAL", null, true]);
});

test("adoptSharedDraft: a message sent and not confirmed stays behind, so a Retry never carries someone else's id or files", () => {
  const mine = personalDraftKey("task", "t1", "u-connor");
  const pending = { clientId: "c-1", text: "Sent words", visibility: "SHARED", files: [{ id: "a1", filename: "quote.pdf" }], at: "2026-10-27T10:00:00.000Z" };
  const withTyping = storage({ "hgos-task-draft:t1": JSON.stringify({ v: 2, text: "Typed since", visibility: "INTERNAL", pending }) });
  adoptSharedDraft(withTyping, mine);
  const adopted = parseDraft(withTyping.map.get(mine)).draft;
  assert.deepEqual([adopted.text, adopted.visibility, adopted.pending], ["Typed since", "INTERNAL", null]);
  assert.doesNotMatch(withTyping.map.get(mine) ?? "", /c-1|quote\.pdf/);
  assert.equal(withTyping.map.has("hgos-task-draft:t1"), false);
  // Nothing typed since: there is nothing to take, and the old entry still goes.
  const onlyPending = storage({ "hgos-task-draft:t1": JSON.stringify({ v: 2, text: "", visibility: "SHARED", pending }) });
  adoptSharedDraft(onlyPending, mine);
  assert.equal(onlyPending.map.has(mine), false);
  assert.equal(onlyPending.map.has("hgos-task-draft:t1"), false);
});

test("adoptSharedDraft: a draft already under the partner's key is theirs and stays; the old one goes", () => {
  const mine = personalDraftKey("task", "t1", "u-connor");
  const s = storage({ "hgos-task-draft:t1": "older words", [mine]: JSON.stringify({ v: 2, text: "Mine", visibility: "SHARED" }) });
  adoptSharedDraft(s, mine);
  assert.equal(parseDraft(s.map.get(mine)).draft.text, "Mine");
  assert.equal(s.map.has("hgos-task-draft:t1"), false);
  assert.deepEqual(s.writes, ["remove hgos-task-draft:t1"]);
});

test("adoptSharedDraft: nothing under the old key, or a key with none before it, writes nothing", () => {
  const empty = storage({});
  adoptSharedDraft(empty, personalDraftKey("task", "t1", "u-connor"));
  const job = storage({ "hgos-job-draft:t1": "never shipped" });
  adoptSharedDraft(job, personalDraftKey("job", "t1", "c-zack"));
  assert.deepEqual([...empty.writes, ...job.writes], []);
  assert.equal(job.map.get("hgos-job-draft:t1"), "never shipped");
});

test("the composer moves the old draft on the first read of a key, before it reads the key", () => {
  const src = readFileSync(join(import.meta.dirname, "..", "components", "composer.tsx"), "utf8");
  assert.match(src, /function readDraft\(key: string\): Draft \{\s*let d = drafts\.get\(key\);\s*if \(!d\) \{\s*let raw: string \| null = null;\s*try \{\s*adoptSharedDraft\(localStorage, key\);\s*raw = localStorage\.getItem\(key\);/);
});
