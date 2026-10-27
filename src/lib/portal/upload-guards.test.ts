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
  assert.match(layout, /principal \? portalScope\(principal\.contactId\) : "portal:signed-out"/);
  assert.match(layout, /<UploadQueueProvider key=\{scope\} scope=\{scope\}>/);
  assert.doesNotMatch(layout, /scope="portal"/, "one shared portal queue hands one contractor's files to the next");
});

test("the app's upload queue is each person's own too, keyed so a different sign-in gets a fresh one", () => {
  const layout = read("app", "(app)", "layout.tsx");
  assert.match(layout, /const scope = appScope\(user\.id\);/);
  assert.match(layout, /<UploadQueueProvider key=\{scope\} scope=\{scope\}>/);
});

test("the upload queue stops with its layout, so nothing records under the next person's session (fix 5)", () => {
  const queue = read("components", "upload-queue.tsx");
  const provider = fn(queue, "UploadQueueProvider");
  assert.match(provider, /return \(\) => \{\s*stopping\.current = setTimeout\(\(\) => engine\.dispose\(\), 0\);\s*\};/);
  assert.match(provider, /if \(stopping\.current !== null\) clearTimeout\(stopping\.current\);/, "Strict Mode's rehearsal unmount doesn't stop it");
});

test("a job page keeps what it recorded for the tab, not for itself (fix 6)", () => {
  const actions = read("app", "(portal)", "p", "jobs", "[id]", "_components", "job-actions.tsx");
  // The record step is shared with the finished job's page, so the tab's registry is written in one place.
  assert.match(read("app", "(portal)", "p", "jobs", "[id]", "_components", "record-and-post.ts"), /recordedUploads\.note\(taskId,/);
  assert.match(actions, /recordJobFile\(taskId, file, from\)/);
  assert.match(fn(actions, "JobActions"), /function onRecorded\(ids: string\[\]\) \{[\s\S]*?recordedUploads\.take\(taskId, ids\)/);
  assert.match(actions, /function onAway\(ids: string\[\]\) \{\s*void sendBatch\(recordedUploads\.take\(taskId, ids\)\);/);
  assert.doesNotMatch(actions, /useRef\(new Map/, "a per-page map drops the files an earlier visit recorded");
});

test("Mark done counts only this visit's photos and videos: no imported file, no document (fix 8)", () => {
  // The rule lives with the batch step, which job-batch.test.ts runs on a fake transaction.
  const batch = read("lib", "portal", "job-batch.ts");
  const own = fn(batch, "ownUnposted");
  assert.match(own, /uploadedByContactId: contactId, eventId: null, deletedAt: null, asanaGid: null/);
  const jobs = read("lib", "portal", "jobs.ts");
  assert.match(fn(jobs, "markJobDone"), /finishPhotoCount\(own\.map\(\(f\) => f\.kind\)\)/);
  // One copy of the rule: Mark done, a written update and the batch post all use the same one.
  assert.match(jobs, /import \{ ownUnposted \} from "\.\/job-batch";/);
  assert.match(fn(batch, "postBatchIn"), /await ownUnposted\(tx, taskId, p\.contactId, attachmentIds\)/);
  for (const [name, source] of [["jobs.ts", jobs], ["job-uploads.ts", read("lib", "portal", "job-uploads.ts")]] as const) {
    assert.doesNotMatch(source, /function ownUnposted/, name);
  }
});

test("a batch post is marked as one, and its Undo is core's (fixes 1, 2, 3 and 10)", () => {
  const uploads = read("lib", "portal", "job-uploads.ts");
  assert.match(fn(uploads, "postJobBatch"), /prisma\.\$transaction\(\(tx\) => postBatchIn\(tx, taskId, taskPrincipal\(p\), attachmentIds\)\)/);
  assert.match(fn(read("lib", "portal", "job-batch.ts"), "postBatchIn"), /core\.addComment\(tx, taskId, \{ body: "", attachmentIds: own, batch: true \}, p\)/);
  assert.match(fn(uploads, "undoJobPost"), /core\.takeBackContractorPost\(/);
  for (const word of ["$executeRaw", "$queryRaw", "NotificationOutbox", "notificationOutbox", "taskEvent.", "taskAttachment."]) {
    assert.ok(!uploads.includes(word), `job-uploads.ts names ${word}; task writes go through core`);
  }
  // The batch step on its transaction only reads: every write is core's.
  const batch = read("lib", "portal", "job-batch.ts");
  for (const word of ["$executeRaw", "$queryRaw", "NotificationOutbox", "notificationOutbox", "taskEvent.", ".create(", ".update(", ".updateMany(", ".delete(", ".deleteMany(", ".upsert("]) {
    assert.ok(!batch.includes(word), `job-batch.ts names ${word}; task writes go through core`);
  }
  assert.doesNotMatch(batch, /^import "server-only";/m, "kept apart from the session so job-batch.test.ts can run it");
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

test("the portal's record step locks the job before it reads the job's status, so a close that lands first is seen", () => {
  const attachments = read("lib", "tasks", "attachments.ts");
  const body = fn(attachments, "recordPortalAttachment");
  const txn = body.slice(body.indexOf("prisma.$transaction("));
  assert.ok(txn.includes("core.lockTask(tx, taskId)"), "the in-transaction check runs under the Task lock");
  const lock = txn.indexOf("core.lockTask(tx, taskId)");
  const refusal = txn.indexOf("contractorUploadRefusal(taskId, portal.contactId, { queuedAt }, tx)");
  const record = txn.indexOf("core.recordAttachment(tx, taskId");
  assert.ok(lock >= 0 && refusal > lock && record > refusal, "lock, then the job's status and window, then the record");
  // The lock is the one Task row lock core takes first everywhere, and names no email row.
  const core = read("lib", "tasks", "core.ts");
  assert.match(fn(core, "lockTask"), /SELECT 1 FROM "Task" WHERE "id" = \$\{taskId\} FOR NO KEY UPDATE/);
  assert.doesNotMatch(fn(core, "lockTask"), /NotificationOutbox/);
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

/* ---------------- The follow-ups after the must-fixes ---------------- */

test("a small file's token comes from the route's own call, so a 5xx waits and the stall abort reaches it", () => {
  const transfer = read("lib", "attachments", "transfer.ts");
  assert.doesNotMatch(transfer, /import \{[^}]*\bupload\b[^}]*\} from "@vercel\/blob\/client"/, "upload() mints its own token and reads any failure as a refusal");
  // put() itself (the client's, passed in by blobTransfer), with and without a streamed body.
  assert.match(fn(transfer, "sendWhole"), /client\.put\(pathname, input\.blob, \{ \.\.\.options, onUploadProgress/);
  assert.match(fn(transfer, "sendWhole"), /client\.put\(pathname, input\.blob, options\)/);
  assert.match(fn(transfer, "sendWhole"), /token: token \?\? \(await clientToken\(/);
  assert.match(fn(transfer, "blobTransfer"), /client: BlobClient = \{ put, createMultipartUpload, uploadPart, completeMultipartUpload \}/);
  assert.match(fn(transfer, "clientToken"), /res\.status >= 500/);
});

test("the token route says no with a 400 only for a refusal; everything else is a 503 (token-failure.ts)", () => {
  const route = read("app", "api", "blob", "[kind]", "route.ts");
  assert.match(route, /tokenFailure\(err, body\.type\)/);
  assert.doesNotMatch(route, /userMessage/, "a database error's words never reach a contractor");
});

test("a job that is no longer active still gets its late photos recorded, without a post or an email", () => {
  // The page mounts the queue's record-only target when there is no composer.
  const page = read("app", "(portal)", "p", "jobs", "[id]", "page.tsx");
  assert.match(page, /\{active \? \(\s*<JobActions[\s\S]*?\) : \(\s*(?:\/\/[^\n]*\n\s*)?<LateUploads taskId=\{job\.id\}/);
  const late = read("app", "(portal)", "p", "jobs", "[id]", "_components", "late-uploads.tsx");
  assert.match(late, /key: `portal-task:\$\{taskId\}`/, "the same target key the composer uses, so files waiting for a page find it");
  assert.match(late, /recordedUploads\.take\(taskId, ids\)/);
  assert.match(late, /onRecorded: land,[\s\S]*?onAway: land,/);
  // The server leaves the files as they are on a job that is closed to updates.
  const batch = read("lib", "portal", "job-batch.ts");
  assert.match(fn(batch, "postBatchIn"), /if \(task && !isActiveStatus\(task\.status\)\) return \{ event: null, alreadyPosted: false \};/);
  assert.match(fn(read("lib", "portal", "job-uploads.ts"), "postJobBatch"), /eventId: posted\.event\?\.id \?\? null/);
  // And so does a batch that waited behind Approve and found the job Done under addComment's lock: core refuses
  // before it writes, the same answer comes back. The message is core.addComment's (core.test.ts pins its words).
  assert.match(batch, /export const JOB_CLOSED = "This job is closed\.";/);
  assert.match(fn(batch, "postBatchIn"), /if \(err\.message === JOB_CLOSED\) return \{ event: null, alreadyPosted: false \};/);
  // And the page says so, with nothing to undo.
  const shared = read("app", "(portal)", "p", "jobs", "[id]", "_components", "record-and-post.ts");
  assert.match(shared, /if \(eventId === null\) \{\s*toast\(\{ message: addedToJobText\(kinds\)[\s\S]*?return true;/);
});

test("the day's grace needs the job's last start, asked only of a job in Review that has a queuedAt", () => {
  const refusal = fn(read("lib", "tasks", "attachments.ts"), "contractorUploadRefusal");
  assert.match(refusal, /task\.status === "REVIEW" && opts\.queuedAt/);
  assert.match(refusal, /data: \{ path: \["to"\], equals: "IN_PROGRESS" \}/);
  assert.match(refusal, /acceptsContractorUpload\(task, lastReview, contactId, now, opts\.queuedAt, startedAt\)/);
});

test("renaming a file is core's write (it stamps the task), not a bare update", () => {
  const rename = fn(read("lib", "tasks", "attachments.ts"), "renameTaskAttachment");
  assert.match(rename, /core\.renameAttachment\(tx, attachmentId, next, p\)/);
  assert.doesNotMatch(rename, /taskAttachment\.update\(/);
  assert.match(read("app", "(app)", "tasks", "upload-actions.ts"), /renameTaskAttachment\(id\.parse\(attachmentId\), z\.string\(\)\.max\(255\)\.parse\(name\), tasks\.staffPrincipal\(user\)\)/);
});

test("the ZIP and the saving link outlast a big download", () => {
  for (const parts of [["app", "api", "files", "zip", "[kind]", "[id]", "route.ts"], ["app", "api", "files", "[kind]", "[id]", "route.ts"]]) {
    assert.match(read(...parts), /export const maxDuration = 300;/, parts.join("/"));
  }
});

test("the portal job page labels the Mark done set under At finish, from the job's events", () => {
  const queries = read("lib", "portal", "queries.ts");
  assert.match(queries, /media: orderMedia\(media, \{ atFinish \}\)/);
  assert.match(queries, /const atFinish = await finishSet\(taskId, media\);/);
  assert.match(fn(queries, "finishSet"), /finishPhotoIds\(media, \[review, \.\.\.comments\]\)/);
  assert.match(read("app", "(portal)", "p", "jobs", "[id]", "page.tsx"), /<JobMediaSection media=\{job\.media\} atFinish=\{job\.atFinish\} \/>/);
});

test("a tab left open under another sign-in can't mint, record, post or undo as whoever signed in since", () => {
  // The portal's three steps name the contractor's queue and are refused when the session is someone else's.
  const portal = read("app", "(portal)", "p", "jobs", "[id]", "upload-actions.ts");
  for (const name of ["recordJobUploadAction", "postJobBatchAction", "undoJobPostAction"]) {
    const body = fn(portal, name);
    assert.match(body, /const p = await requirePortalPrincipal\(\);\s*assertQueueOwner\(owner\.parse\(queueOwner\), portalScope\(p\.contactId\)\);/, name);
  }
  // Staff: the record steps that attribute a file to a person.
  const owned = /assertQueueOwner\(z\.string\(\)\.max\(80\)\.nullish\(\)\.parse\(queueOwner\), appScope\(user\.id\)\);/;
  assert.match(fn(read("app", "(app)", "tasks", "upload-actions.ts"), "recordTaskAttachment"), owned);
  assert.match(fn(read("app", "(app)", "properties", "[id]", "document-actions.ts"), "recordPropertyDocument"), owned);
  // The token route reads the owner from every kind's payload, before it looks at the row.
  const route = read("app", "api", "blob", "[kind]", "route.ts");
  assert.match(route, /ownerRefusal\(payload\.owner, who\.kind === "staff" \? appScope\(who\.userId\) : portalScope\(who\.contactId\)\)/);
  assert.ok(route.indexOf("ownerRefusal(payload.owner") < route.indexOf("cfg.authorize("), "the owner is checked before the row is");
  // The queue sends it: with every record step (engine), every token request (transfer) and the page's post and Undo.
  assert.match(read("lib", "attachments", "engine.ts"), /target\.record\(input, this\.deps\.scope\)/);
  assert.match(read("lib", "attachments", "engine.ts"), /owner: this\.deps\.scope,/);
  assert.match(read("lib", "attachments", "transfer.ts"), /owner: input\.owner/);
  const shared = read("app", "(portal)", "p", "jobs", "[id]", "_components", "record-and-post.ts");
  assert.match(shared, /recordJobUploadAction\(taskId, file, owner\)/);
  assert.match(shared, /postJobBatchAction\(taskId, items\.map\(\(i\) => i\.id\), owner\)/);
  assert.match(shared, /undoJobPostAction\(taskId, eventId, owner\)/);
  // No second copy of the record step without the check.
  assert.doesNotMatch(read("app", "(portal)", "p", "jobs", "[id]", "actions.ts"), /recordJobUploadAction/);
});

/* ---------------- The break-the-app pass ---------------- */

test("the portal decides PORTAL_ENABLED per request, so a build made without it never prerenders /p as a 404", () => {
  const session = read("lib", "portal", "session.ts");
  assert.match(session, /import \{ connection \} from "next\/server";/);
  // The request first, then the flag: a page that reads nothing else (My jobs, the first-password page) stays dynamic.
  assert.match(fn(session, "portalOnForRequest"), /await connection\(\);\s*return getEnv\(\)\.portalEnabled;/);
  assert.match(fn(session, "requirePortalPrincipal"), /if \(!\(await portalOnForRequest\(\)\)\) notFound\(\);/);
  assert.match(session, /const readSession = cache\(async \(\): Promise<PortalSessionState \| null> => \{\s*if \(!\(await portalOnForRequest\(\)\)\) return null;/);
  assert.doesNotMatch(session, /if \(!getEnv\(\)\.portalEnabled\)/, "no flag read before the request");
});

test("the token route asks Blob for no upload-completed callback: the record action writes the row", () => {
  const route = read("app", "api", "blob", "[kind]", "route.ts");
  assert.doesNotMatch(route.replace(/\/\/.*$/gm, ""), /onUploadCompleted/);
});

test("a job page holds no more photos than one post takes, and says why past that", () => {
  const actions = read("app", "(portal)", "p", "jobs", "[id]", "_components", "job-actions.tsx");
  assert.match(actions, /maxFiles: postRoom\(ready\.length\),\s*maxFilesReason: MAX_FILES_REASON,/);
  // Every action that posts files refuses more than that in words, not zod's.
  const jobActions = read("app", "(portal)", "p", "jobs", "[id]", "actions.ts");
  assert.match(jobActions, /attachmentIds: z\.array\(id\)\.max\(MAX_FILES_PER_POST, TOO_MANY_FILES\)/);
  assert.match(read("app", "(portal)", "p", "jobs", "[id]", "upload-actions.ts"), /z\.array\(id\)\.min\(1\)\.max\(MAX_FILES_PER_POST, TOO_MANY_FILES\)/);
  // The engine uses the target's reason past its cap.
  assert.match(read("lib", "attachments", "engine.ts"), /error = target\.maxFilesReason \?\? capReason\(0\);/);
});

test("the losing side of a double batch post says nothing, and the record step cuts a long name instead of refusing it", () => {
  const shared = read("app", "(portal)", "p", "jobs", "[id]", "_components", "record-and-post.ts");
  assert.match(shared, /if \(res\.data\.alreadyPosted\) return true;/);
  assert.ok(shared.indexOf("if (res.data.alreadyPosted) return true;") < shared.indexOf("toast({\n    message: postedText(kinds)"), "before any toast");
  assert.match(fn(read("lib", "portal", "job-uploads.ts"), "postJobBatch"), /if \(!\(err instanceof BatchAlreadyPosted\)\) throw err;/);
  assert.match(read("app", "(portal)", "p", "jobs", "[id]", "upload-actions.ts"), /filename: z\.string\(\)\.min\(1\)\.max\(MAX_FILENAME \* 4\),/);
});
