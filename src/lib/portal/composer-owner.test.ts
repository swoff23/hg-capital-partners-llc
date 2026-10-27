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

test("the portal's Send and Mark done name the queue's owner, and the server refuses another sign-in", () => {
  const actions = read("app", "(portal)", "p", "jobs", "[id]", "actions.ts");
  for (const name of ["postJobUpdateAction", "markJobDoneAction"]) {
    assert.match(
      fn(actions, name),
      /const p = await requirePortalPrincipal\(\);\s*assertQueueOwner\(owner\.parse\(queueOwner\), portalScope\(p\.contactId\)\);/,
      name,
    );
  }
  const page = read("app", "(portal)", "p", "jobs", "[id]", "_components", "job-actions.tsx");
  assert.match(page, /postJobUpdateAction\(taskId, \{ body: text, attachmentIds, clientId \}, owner\)/, "the composer's Send");
  assert.match(page, /postJobUpdateAction\(taskId, \{ body: "", attachmentIds: held \}, owner\)/, "what's held, posted on leaving");
  assert.match(page, /markJobDoneAction\(taskId, \{ body: note\.trim\(\), attachmentIds: items\.map\(\(i\) => i\.id\) \}, owner\)/, "Mark done");
  assert.doesNotMatch(page, /postJobUpdateAction\([^)]*\}\)/, "no call without the owner");
});
