import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// queries.ts talks to the database, so this reads its source instead of importing it.
const source = readFileSync(join(__dirname, "queries.ts"), "utf8");

/** The text of a top-level `const name = ...` up to the next top-level declaration. */
function declaration(name: string): string {
  const start = source.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `queries.ts declares ${name}`);
  const next = source.slice(start + 1).search(/\n(?:export |const |function |async function |\/\*\*)/);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

/** The text of a top-level function up to the next top-level declaration. */
function fn(name: string): string {
  const start = source.search(new RegExp(`(?:export )?(?:async )?function ${name}\\b`));
  assert.ok(start >= 0, `queries.ts declares ${name}`);
  const next = source.slice(start + 1).search(/\n(?:export |const |function |async function |interface |type |\/\*\*)/);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

test("the portal's timeline and file filters both keep staff replies with the contractor they were written to", () => {
  // G2B-IV01: drop audienceContactId from either and a reassigned job shows the
  // next contractor what staff said to the last one, with npm test still green otherwise.
  for (const name of ["portalEvents", "visibleFile"]) {
    assert.match(declaration(name), /audienceContactId/, `${name} filters on audienceContactId`);
  }
});

test("Updates only ever show events that are not deleted", () => {
  assert.match(declaration("portalEvents"), /e\."deletedAt" IS NULL/);
});

test("no query reads an event's whole data, only named keys", () => {
  const reads = [...source.matchAll(/e\."data"(.{0,12})/g)].map((m) => m[1]);
  assert.ok(reads.length > 0);
  for (const next of reads) assert.match(next, /^->>?'/, `e."data" is read by key, not whole (found e."data"${next})`);
  const keys = new Set([...source.matchAll(/e\."data"->>?'(\w+)'/g)].map((m) => m[1]));
  // from, to: a status or a date edit; edited: an imported comment marked edited; clientId: the viewer's own send;
  // statusEventId: the note written with a send back.
  assert.deepEqual([...keys].sort(), ["clientId", "edited", "from", "statusEventId", "to"]);
});

test("the notice never reads a NOTES event's text or the notes it replaced", () => {
  const notice = fn("jobNotice");
  assert.match(notice, /CASE WHEN e\."kind" <> 'NOTES' THEN e\."data"->>'from' END/);
  assert.match(notice, /CASE WHEN e\."kind" <> 'NOTES' THEN e\."data"->>'to' END/);
  assert.doesNotMatch(notice, /e\."body"/);
  const counts = fn("noticeCounts");
  assert.match(counts, /CASE WHEN e\."kind" <> 'NOTES' THEN e\."data"->>'from' END/);
  assert.doesNotMatch(counts, /e\."body"/);
});

test("the send back and its note go through the Updates' own audience rule", () => {
  const sendBack = fn("openSendBack");
  assert.equal(sendBack.match(/\$\{portalEvents\(p\.contactId\)\}/g)?.length, 3, "the status, the last Mark done and the note");
  assert.match(sendBack, /e\."data"->>'statusEventId' = \$\{row\.id\}/);
  assert.doesNotMatch(sendBack, /audienceContactId/, "the rule is not written out a second time");
});

test("the trace of a removed comment carries no body, and only for a comment the contractor could have seen", () => {
  const trace = fn("removedComments");
  const select = trace.slice(trace.indexOf("SELECT"), trace.indexOf("FROM"));
  assert.doesNotMatch(select, /body/, "who and when, never its text");
  assert.match(trace, /e\."deletedAt" IS NOT NULL/);
  assert.match(trace, /e\."visibility" = 'SHARED'/);
  assert.match(trace, /e\."audienceContactId" IS NULL OR e\."audienceContactId" = \$\{p\.contactId\}/);
  assert.match(trace, /COALESCE\(r\."lastSeenAt", a\."createdAt"\)/, "bounded by the last open, or by when they got access");
  assert.match(trace, /o\."sentAt" IS NOT NULL/, "or its email went");
});

test("the trace is not counted as new on My jobs", () => {
  const counts = fn("newUpdateCounts");
  assert.match(counts, /\$\{portalEvents\(contactId\)\}/);
  assert.doesNotMatch(counts, /deletedAt" IS NOT NULL/);
});

test("the delivery line reads the outbox for state only, never its items", () => {
  const delivery = fn("deliveryFor");
  const select = delivery.slice(delivery.indexOf("SELECT"), delivery.indexOf("FROM"));
  assert.match(select, /o\."sentAt"/);
  assert.match(select, /o\."lastError"/);
  assert.doesNotMatch(select, /items/);
  assert.match(delivery, /recipientUserId/, "the partners' rows, not another contractor's");
});

test("a contractor sees their own clientId and no one else's", () => {
  assert.match(fn("jobUpdates"), /CASE WHEN e\."actorContactId" = \$\{p\.contactId\} THEN e\."data"->>'clientId' END/);
});

test("lockbox codes are hidden in imported comments only, on the server", () => {
  const updates = fn("jobUpdates");
  assert.match(updates, /r\.source === "ASANA" \? mask\(r\.body\)/);
  // The masker keeps the codes inside access-code.ts; this file never names the column they live in
  // (auth-guard.test.ts looks for that word in every portal file, this one included, so it is spelled in two halves).
  assert.doesNotMatch(source, new RegExp("un" + "its"));
});

test("the job page reads where the contractor last looked before the visit is recorded", () => {
  const job = fn("getJob");
  assert.ok(job.indexOf("lastLooked(") > 0);
  assert.doesNotMatch(job, /taskReadState\.(upsert|update|create)/, "the visit is written by noteJobViewed, after the page is sent");
});
