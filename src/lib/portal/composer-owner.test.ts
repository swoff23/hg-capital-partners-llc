import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Where chunk 6's queue owner (attachments/queue-owner.ts) meets chunk 7's
 * shared Composer. The composer hands the queue's record step on, and the
 * portal's Send and Mark done carry the photos the queue held, so each names
 * the owner and the server refuses a tab still showing someone else's queue.
 * Read as source, like upload-guards.test.ts, since these files talk to Next
 * and the browser.
 */

const SRC = join(__dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8");

/** The body of a top-level function, up to the next top-level declaration. */
function fn(source: string, name: string): string {
  const start = source.search(new RegExp(`(?:export )?(?:async )?function ${name}\\b`));
  assert.ok(start >= 0, `declares ${name}`);
  const next = source.slice(start + 1).search(/\n(?:export |const |function |async function |\/\*\*)/);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

test("the shared Composer passes the queue's owner on to the record step it wraps", () => {
  const composer = read("components", "composer.tsx");
  assert.match(composer, /async \(file: Parameters<MediaUploaderOptions\["record"\]>\[0\], owner\?: string\) => \{\s*const res = await record\(file, owner\);/);
  assert.doesNotMatch(composer, /await record\(file\);/, "a wrapper that drops the owner lets the server's check pass by default");
  // The staff wrapper hands it to the record action, which checks it against the signed-in user.
  assert.match(
    read("app", "(app)", "tasks", "[id]", "composer.tsx"),
    /record: \(file, owner\) => recordTaskAttachment\(taskId, \{ \.\.\.file, visibility: "INTERNAL", standalone: false \}, owner\)/,
  );
});

test("the portal's Send and Mark done run their write inside the owner check, under the signed-in contact's own scope", () => {
  // The check's behavior is withQueueOwner's (queue-owner.test.ts: refused before the write, the owner's and an unnamed
  // call write). The server actions import Next and the database, which node:test can't load, so this pins that each
  // one goes through it, with the session's contact, and that nothing writes outside it.
  const actions = read("app", "(portal)", "p", "jobs", "[id]", "actions.ts");
  const writes: Record<string, string> = { postJobUpdateAction: "postJobUpdate", markJobDoneAction: "markJobDone" };
  for (const [name, write] of Object.entries(writes)) {
    const body = fn(actions, name);
    assert.match(
      body,
      new RegExp(`const p = await requirePortalPrincipal\\(\\);\\s*await withQueueOwner\\(owner\\.parse\\(queueOwner\\), portalScope\\(p\\.contactId\\), \\(\\) => jobs\\.${write}\\(`),
      name,
    );
    assert.equal(body.match(/\bjobs\./g)?.length, 1, `${name}: the one write is the one inside the check`);
    assert.doesNotMatch(body, /assertQueueOwner/, `${name}: no separate check to forget or reorder`);
  }
  const page = read("app", "(portal)", "p", "jobs", "[id]", "_components", "job-actions.tsx");
  // The client names the owner on every call it makes.
  assert.match(page, /postJobUpdateAction\(taskId, \{ body: text, attachmentIds, clientId \}, owner\)/, "the composer's Send");
  assert.match(page, /postJobUpdateAction\(taskId, \{ body: "", attachmentIds: held \}, owner\)/, "what's held, posted on leaving");
  assert.match(page, /markJobDoneAction\(taskId, \{ body: note\.trim\(\), attachmentIds: items\.map\(\(i\) => i\.id\) \}, owner\)/, "Mark done");
  assert.doesNotMatch(page, /postJobUpdateAction\([^)]*\}\)/, "no call without the owner");
});
