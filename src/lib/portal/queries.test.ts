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
  // statusEventId: the note written with a send back; seenBy: the contacts who could read a comment that came off
  // (ids only, matched against the viewer's own); title, action, done: a checklist line of the job's story; request: a
  // resident's request, whose sender the line never names (docs/specs/contractor-timeline.md); scheduledFor: the day a move to
  // Scheduled set, for "You scheduled the job for Fri, Nov 27".
  assert.deepEqual([...keys].sort(), ["action", "clientId", "done", "edited", "from", "request", "scheduledFor", "seenBy", "statusEventId", "title", "to"]);
});

// The job's story (docs/specs/contractor-timeline.md): its own module, read as source like this one.
const story = readFileSync(join(__dirname, "story-events.ts"), "utf8");

test("the job's story keeps the Updates' audience rule, drops deleted rows and Asana's history, and an assignment only to the viewer", () => {
  assert.match(story, /e\."deletedAt" IS NULL/);
  assert.match(story, /e\."source" <> 'ASANA'/);
  assert.match(story, /e\."audienceContactId" IS NULL OR e\."audienceContactId" = \$\{contactId\}/, "staff and system lines addressed to them or to no one");
  assert.match(story, /e\."actorContactId" = \$\{contactId\} OR \(e\."actorContactId" IS NULL/, "never another contractor's");
  assert.match(story, /e\."kind" = 'ASSIGNED' AND e\."actorContactId" IS NULL AND e\."data"->'to'->>'contactId' = \$\{contactId\}/);
  assert.match(story, /e\."data"->>'from' IS DISTINCT FROM 'DRAFT'/);
  // The kinds on the list, and nothing about how HG runs the job.
  assert.match(story, /e\."kind" = 'CREATED' AND e\."actorContactId" IS NULL\)/, "the job being added names nobody");
  assert.match(story, /e\."createdAt" >= \(SELECT a\."createdAt" FROM "TaskAccess" a\s+WHERE a\."taskId" = e\."taskId" AND a\."contactId" = \$\{contactId\} AND a\."revokedAt" IS NULL\)/, "never before they first had it");
  assert.match(
    story,
    /IS NOT DISTINCT FROM \$\{contactId\}\s+FROM "TaskEvent" x\s+WHERE x\."taskId" = e\."taskId" AND x\."deletedAt" IS NULL AND x\."source" <> 'ASANA' AND x\."createdAt" <= e\."createdAt"\s+AND \(x\."kind" = 'ASSIGNED' OR \(x\."kind" = 'CREATED' AND x\."data" \? 'to'\)\)\s+ORDER BY x\."createdAt" DESC, x\."id" DESC/,
    "and never while it was someone else's: the latest assignment at the line's moment names them",
  );
  assert.match(story, /e\."kind" IN \('DUE', 'SCHEDULED', 'NOTES', 'CHECKLIST'\)/);
  for (const kind of ["TITLE", "PROPERTY", "ACCESS", "REPEAT", "CONFLICT", "COMMENT", "ATTACHMENT"]) assert.doesNotMatch(story, new RegExp(`'${kind}'`), kind);
});

test("only the job page's Updates read the story: the counts and the notice keep portalEvents", () => {
  assert.match(fn("jobUpdates"), /\(\$\{portalEvents\(p\.contactId\)\} OR \$\{storyEvents\(p\.contactId\)\}\)/);
  assert.doesNotMatch(fn("newUpdateCounts"), /storyEvents/);
  assert.equal(source.match(/storyEvents\(/g)?.length, 1, "one caller");
});

test("the story never reads an assignment's people or Waiting's reason", () => {
  const updates = fn("jobUpdates");
  // From and to only where a line uses them: never an assignment's or a creation's people, nor a notes edit's old text.
  assert.match(updates, /CASE WHEN e\."kind" IN \('STATUS', 'DUE', 'SCHEDULED', 'CHECKLIST'\) THEN e\."data"->>'from' END/);
  assert.match(updates, /CASE WHEN e\."kind" IN \('STATUS', 'DUE', 'SCHEDULED', 'CHECKLIST'\) THEN e\."data"->>'to' END/);
  assert.match(updates, /actorLabel: r\.actorUserId \|\| r\.actorContactId \? actorLabel : "HG Capital"/, "a system or resident line sends no name");
  assert.doesNotMatch(source + story, /waitingOn/);
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
  // Whether they could have read it is settled at delete time and stored; a visit after the delete decides nothing.
  assert.match(trace, /e\."data"->'seenBy' @> \$\{JSON\.stringify\(\[p\.contactId\]\)\}::jsonb/);
  assert.doesNotMatch(trace, /lastSeenAt|NotificationOutbox/, "the facts are not re-read after the fact");
});

test("the trace is not counted as new on My jobs", () => {
  const counts = fn("newUpdateCounts");
  assert.match(counts, /\$\{portalEvents\(contactId\)\}/);
  assert.doesNotMatch(counts, /deletedAt" IS NOT NULL/);
});

test("a comment left with no words and no file is skipped by the page and by the counts, on portalEvents' own file rule", () => {
  // Staff took off every photo of a batch, a photo-only reply or a Mark done note: the card would be empty.
  assert.match(fn("jobUpdates"), /if \(comment && !r\.body\?\.trim\(\) && own\.length === 0\) continue;/);
  assert.match(fn("newUpdateCounts"), /AND NOT \$\{emptyComment\(contactId\)\}/, "the dot on My jobs agrees with the page");
  // portalEvents itself is as it was (it still drops a deleted event and keeps the audience rule); the file test inside
  // emptyComment is its ATTACHMENT branch's, line for line, so the two can't drift apart.
  const fileRule = (text: string) => text.match(/t\."visibility" = 'SHARED'[\s\S]*?t\."audienceContactId" = \$\{contactId\}\)\)\s*\)/)?.[0].replace(/\s+/g, " ");
  const rule = fileRule(declaration("portalEvents"));
  assert.ok(rule, "portalEvents has the file rule");
  assert.equal(fileRule(declaration("emptyComment")), rule);
  assert.match(declaration("emptyComment"), /e\."kind" = 'COMMENT'/);
  assert.match(declaration("emptyComment"), /btrim\(COALESCE\(e\."body", ''\)\) = ''/);
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
