import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Static guards for the chunk 6 review's fixes in files that talk to the
 * database, Next or the browser, so they're read here instead of imported:
 * whose upload queue the portal mounts and when it stops, where a job page
 * keeps what it recorded, which files count at Mark done, and that every
 * write to the email outbox stays in src/lib/tasks/core.ts. The behavior
 * itself is tested in tasks/contractor-post.test.ts, attachments/engine.test.ts,
 * job-view.test.ts and recorded-uploads.test.ts.
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

test("the portal's upload queue is each contractor's own, and a new person gets a fresh one (fix 4)", () => {
  const layout = read("app", "(portal)", "p", "layout.tsx");
  assert.match(layout, /getPortalPrincipal\(\{ allowStartingPassword: true \}\)/);
  assert.match(layout, /`portal:\$\{principal\?\.contactId/);
  assert.match(layout, /<UploadQueueProvider key=\{scope\} scope=\{scope\}>/);
  assert.doesNotMatch(layout, /scope="portal"/, "one shared portal queue hands one contractor's files to the next");
});

test("the upload queue stops with its layout, so nothing records under the next person's session (fix 5)", () => {
  const queue = read("components", "upload-queue.tsx");
  const provider = fn(queue, "UploadQueueProvider");
  assert.match(provider, /return \(\) => \{\s*stopping\.current = setTimeout\(\(\) => engine\.dispose\(\), 0\);\s*\};/);
  assert.match(provider, /if \(stopping\.current !== null\) clearTimeout\(stopping\.current\);/, "Strict Mode's rehearsal unmount doesn't stop it");
});

test("a job page keeps what it recorded for the tab, not for itself (fix 6)", () => {
  const actions = read("app", "(portal)", "p", "jobs", "[id]", "_components", "job-actions.tsx");
  assert.match(actions, /recordedUploads\.note\(taskId,/);
  assert.match(fn(actions, "JobActions"), /function onRecorded\(ids: string\[\]\) \{[\s\S]*?recordedUploads\.take\(taskId, ids\)/);
  assert.match(actions, /function onAway\(ids: string\[\]\) \{\s*void sendBatch\(recordedUploads\.take\(taskId, ids\)\);/);
  assert.doesNotMatch(actions, /useRef\(new Map/, "a per-page map drops the files an earlier visit recorded");
});

test("Mark done counts only this visit's photos and videos: no imported file, no document (fix 8)", () => {
  const jobs = read("lib", "portal", "jobs.ts");
  const own = fn(jobs, "ownUnposted");
  assert.match(own, /uploadedByContactId: contactId, eventId: null, deletedAt: null, asanaGid: null/);
  assert.match(fn(jobs, "markJobDone"), /finishPhotoCount\(own\.map\(\(f\) => f\.kind\)\)/);
  // One copy of the rule: the batch post uses the same one.
  const uploads = read("lib", "portal", "job-uploads.ts");
  assert.match(uploads, /import \{ ownUnposted \} from "\.\/jobs";/);
  assert.doesNotMatch(uploads, /function ownUnposted/);
});

test("a batch post is marked as one, and its Undo is core's (fixes 1, 2, 3 and 10)", () => {
  const uploads = read("lib", "portal", "job-uploads.ts");
  assert.match(fn(uploads, "postJobBatch"), /batch: true/);
  assert.match(fn(uploads, "undoJobPost"), /core\.takeBackContractorPost\(/);
  for (const word of ["$executeRaw", "$queryRaw", "NotificationOutbox", "notificationOutbox", "taskEvent.", "taskAttachment."]) {
    assert.ok(!uploads.includes(word), `job-uploads.ts names ${word}; task writes go through core`);
  }
});

test("raw SQL on the email outbox lives only in core.ts and the send run", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk(SRC);
  const naming = files.filter((f) => readFileSync(f, "utf8").includes('"NotificationOutbox"')).map((f) => relative(SRC, f));
  assert.deepEqual(naming.sort(), ["lib/notifications/outbox.ts", "lib/tasks/core.ts"]);
});

test("the record step answers a Retry with its own earlier row, and staff Remove goes through core (fixes 7 and 9)", () => {
  const attachments = read("lib", "tasks", "attachments.ts");
  // Every way a record step can find its file attached (the check before head(), the unique pathname in a race)
  // goes through recordOnce, which hands back the person's own row.
  assert.match(fn(attachments, "verifiedAttachment"), /if \(taken\) throw new AlreadyAttachedError\(\);/);
  const once = fn(attachments, "recordOnce");
  assert.match(once, /err instanceof AlreadyAttachedError \|\| \(err instanceof Prisma\.PrismaClientKnownRequestError && err\.code === "P2002"\)/);
  assert.match(once, /const mine = await core\.findOwnUpload\(prisma, taskId, input\.pathname, p\);\s*if \(mine\) return mine;/);
  for (const name of ["recordTaskAttachment", "recordPortalAttachment"]) {
    const body = fn(attachments, name);
    const once = body.indexOf("recordOnce(taskId, input, p, async () => {");
    const verify = body.indexOf("verifiedAttachment(");
    assert.ok(once >= 0 && verify > once, `${name} runs its check and its write inside recordOnce`);
  }
  assert.ok(!/throw new core\.TaskRuleError\("That file is already attached\."\)/.test(attachments), "one way to say it, the one recordOnce knows");
  const remove = fn(attachments, "deleteTaskAttachment");
  assert.match(remove, /core\.removeAttachment\(tx, att, p\)/);
  assert.doesNotMatch(remove, /taskAttachment\.delete\(/, "an imported file deleted for good comes back with the next delta");
});
