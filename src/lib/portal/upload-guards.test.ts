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
  assert.match(layout, /<PortalUploadQueue key=\{scope\} scope=\{scope\}>/);
  assert.doesNotMatch(layout, /scope="portal"/, "one shared portal queue hands one contractor's files to the next");
  // The portal's wrapper is the one queue, under that scope, and posts only that scope's kept files when it wakes.
  const queue = read("app", "(portal)", "p", "_components", "portal-upload-queue.tsx");
  assert.match(queue, /<UploadQueueProvider scope=\{scope\} onWake=\{\(\) => void postEveryKept\(toast, scope\)\}>/);
});

test("kept files post again when the signal or the tab comes back, on whatever portal page is open (S1)", () => {
  const provider = fn(read("components", "upload-queue.tsx"), "UploadQueueProvider");
  // The same two events that nudge the queue wake the layout's own work, the latest onWake, only with a signal.
  assert.match(provider, /const wake = \(\) => \{\s*engine\.nudge\(\);\s*if \(navigator\.onLine !== false\) wakeNow\.current\?\.\(\);\s*\};/);
  assert.match(provider, /if \(document\.visibilityState === "visible"\) wake\(\);/);
  assert.match(provider, /window\.addEventListener\("online", wake\);/);
  // Every job the tab kept files for drains, each the one-at-a-time way, with Retry on a post that failed.
  const shared = read("app", "(portal)", "p", "jobs", "[id]", "_components", "record-and-post.ts");
  assert.match(fn(shared, "postEveryKept"), /return drainEveryKept\(owner, \(taskId, kept\) => postRecordedBatch\(taskId, kept, toast, owner, retryKept\(taskId, toast, owner\)\)\);/);
  assert.match(fn(shared, "retryKept"), /return \(\) => void postKept\(taskId, toast, owner\);/);
  assert.match(fn(shared, "postPiece"), /toast\(failedPostToast\(res\.error, retry\)\);/);
  // A finished job's page drains as it goes too, as the job page does.
  const late = read("app", "(portal)", "p", "jobs", "[id]", "_components", "late-uploads.tsx");
  assert.match(late, /void postKept\(taskId, toast, owner\);\s*return \(\) => void postKept\(taskId, toast, owner\);/);
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

test("a job page keeps what it recorded for the tab and the queue's owner, not for itself (fix 6)", () => {
  const actions = read("app", "(portal)", "p", "jobs", "[id]", "_components", "job-actions.tsx");
  // The record step is shared with the finished job's page, so the tab's registry is written in one place, under the
  // owner the queue named for the file.
  assert.match(read("app", "(portal)", "p", "jobs", "[id]", "_components", "record-and-post.ts"), /recordedUploadsOf\(owner\)\.note\(taskId,/);
  assert.match(actions, /recordJobFile\(taskId, file, from\)/);
  // Every page reads the registry of its own queue's owner, so one person's kept files never post for the next.
  assert.match(actions, /const owner = useUploadScope\(\);[\s\S]*?const tab = recordedUploadsOf\(owner\);/);
  assert.match(read("app", "(portal)", "p", "jobs", "[id]", "_components", "late-uploads.tsx"), /const tab = recordedUploadsOf\(owner\);/);
  assert.doesNotMatch(actions, /recordedUploads\./, "no registry shared by every owner");
  const onRecorded = fn(actions, "JobActions").match(/function onRecorded\(ids: string\[\]\) \{[\s\S]*?\n  \}\n/)?.[0] ?? "";
  // Held for a Send or Mark done it takes what one of them takes; posted on its own it takes the lot, and the post goes in pieces.
  assert.match(onRecorded, /tab\.take\(taskId, ids, MAX_FILES_PER_POST - held\.length\)/);
  assert.match(onRecorded, /const added = tab\.take\(taskId, ids\);/);
  // A batch that lands away posts the tab's record of it, and keeps the files that didn't post for the next batch,
  // even when the call throws (postOrKeepBatch's try and finally).
  assert.match(actions, /function onAway\(ids: string\[\]\) \{\s*void postOrKeepBatch\(taskId, tab\.take\(taskId, ids\), toast, owner\);/);
  assert.match(fn(read("app", "(portal)", "p", "jobs", "[id]", "_components", "record-and-post.ts"), "postOrKeepBatch"), /return postOrKeep\(owner, taskId, items,/);
  assert.doesNotMatch(actions, /useRef\(new Map/, "a per-page map drops the files an earlier visit recorded");
});

test("Mark done counts only this visit's photos and videos: no imported file, no document (fix 8)", () => {
  // The rule lives with the batch step, which job-batch.test.ts runs on a fake transaction.
  const batch = read("lib", "portal", "job-batch.ts");
  const own = fn(batch, "ownUnposted");
  assert.match(own, /uploadedByContactId: contactId, eventId: null, deletedAt: null, asanaGid: null/);
  const send = read("lib", "portal", "job-send.ts");
  assert.match(fn(send, "markDoneIn"), /finishPhotoCount\(own\.map\(\(f\) => f\.kind\)\)/);
  // One copy of the rule: Mark done, a written update and the batch post all use the same one.
  assert.match(send, /import \{ allOwnPosted, ownPosted, ownUnposted, postBatchIn \} from "\.\/job-batch";/);
  assert.match(fn(batch, "postBatchIn"), /await ownUnposted\(tx, taskId, p\.contactId, attachmentIds\)/);
  const jobs = read("lib", "portal", "jobs.ts");
  for (const [name, source] of [["jobs.ts", jobs], ["job-send.ts", send], ["job-uploads.ts", read("lib", "portal", "job-uploads.ts")]] as const) {
    assert.doesNotMatch(source, /function ownUnposted/, name);
  }
  // The session's half runs the rules on its transaction, as the signed-in contractor.
  assert.match(fn(jobs, "postJobUpdate"), /prisma\.\$transaction\(\(tx\) => postUpdateIn\(tx, taskId, taskPrincipal\(p\), input\)\)/);
  assert.match(fn(jobs, "markJobDone"), /prisma\.\$transaction\(\(tx\) => markDoneIn\(tx, taskId, taskPrincipal\(p\), input\)\)/);
  assert.doesNotMatch(send, /^import "server-only";/m, "kept apart from the session so job-batch.test.ts can run it");
  // Mark done takes the task row before it counts anything (S2), as every writer on a task takes it first.
  assert.match(
    fn(send, "markDoneIn"),
    /\{\s*await core\.lockTask\(tx, taskId\);\s*\/\/[^\n]*\n\s*await core\.assertContractorAccess\(tx, taskId, p\.contactId\);\s*const own = await ownUnposted\(/,
  );
});

test("files a batch post already told HG of, sent again after its answer was lost, never stall a Send or a Mark done", () => {
  const send = read("lib", "portal", "job-send.ts");
  // A Send with no text and nothing new answers quietly, so the page clears its tray instead of being refused each tap.
  assert.match(
    fn(send, "postUpdateIn"),
    /if \(!input\.body\.trim\(\) && own\.length === 0 && \(await allOwnPosted\(tx, taskId, p\.contactId, input\.attachmentIds\)\)\) \{\s*await core\.assertContractorAccess\(tx, taskId, p\.contactId\);\s*return;\s*\}\s*await core\.addComment/,
  );
  // A Send again whose first send did post (M1): the photos still unposted under addComment's lock go as their own
  // batch, through the batch step, so the words are never written twice.
  assert.match(
    fn(send, "postUpdateIn"),
    /const left = input\.clientId && own\.length > 0 \? await ownUnposted\(tx, taskId, p\.contactId, own\.map\(\(f\) => f\.id\)\) : \[\];\s*if \(left\.length > 0\) await postBatchIn\(tx, taskId, p, left\.map\(\(f\) => f\.id\)\);/,
  );
  // Mark done counts them toward the photos it asks for, only this visit's (the Review card's rule, visitStart), links
  // only the unposted ones (with its note, chunk 7's setStatus), and names the ones it counted on the move to Review
  // for "At finish".
  const done = fn(send, "markDoneIn");
  assert.match(
    done,
    /const posted = photos < required \? await ownPosted\(tx, taskId, p\.contactId, input\.attachmentIds, await visitStartOf\(tx, taskId\)\) : \[\];\s*photos \+= finishPhotoCount\(posted\.map\(\(f\) => f\.kind\)\);/,
  );
  assert.match(
    done,
    /core\.setStatus\(tx, taskId, "REVIEW", p, \{\s*note: input\.body,\s*attachmentIds: own\.map\(\(f\) => f\.id\),\s*finishIds: posted\.map\(\(f\) => f\.id\),\s*\}\)/,
  );
  assert.match(fn(send, "visitStartOf"), /return visitStart\(starts\);/);
  const media = read("lib", "tasks", "media.ts");
  assert.match(fn(media, "reviewPhotos"), /const started = visitStart\(events, done \? done\.review\.createdAt\.getTime\(\) : Infinity\);/, "one rule for the visit");
  assert.match(fn(media, "finishPhotoIds"), /\.finishIds;/);
  // The service owns the check, with one copy of each rule: the rows by id on the job, a missing one removed.
  const batch = read("lib", "portal", "job-batch.ts");
  const all = fn(batch, "allOwnPosted");
  assert.match(all, /where: \{ id: \{ in: unique \}, taskId \},/);
  assert.match(all, /return rows\.every\(\(f\) => f\.uploadedByContactId === contactId && f\.eventId !== null && f\.asanaGid === null\);/);
  assert.doesNotMatch(all, /deletedAt/, "staff Remove deletes the row, and Undo keeps eventId");
});

test("a batch post is marked as one, and its Undo is core's (fixes 1, 2, 3 and 10)", () => {
  const uploads = read("lib", "portal", "job-uploads.ts");
  assert.match(fn(uploads, "postJobBatch"), /prisma\.\$transaction\(\(tx\) => postBatchIn\(tx, taskId, taskPrincipal\(p\), attachmentIds\)\)/);
  assert.match(fn(read("lib", "portal", "job-batch.ts"), "postActive"), /core\.addComment\(tx, taskId, \{ body: "", attachmentIds: own, batch: true \}, p\)/);
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

test("a job that is no longer active still gets its late photos recorded, and HG hears once per batch", () => {
  // The page mounts the queue's record-only target when there is no composer.
  const page = read("app", "(portal)", "p", "jobs", "[id]", "page.tsx");
  assert.match(page, /\{active \? \(\s*<JobActions[\s\S]*?\) : \(\s*(?:\/\/[^\n]*\n\s*)?<LateUploads taskId=\{job\.id\}/);
  const late = read("app", "(portal)", "p", "jobs", "[id]", "_components", "late-uploads.tsx");
  assert.match(late, /key: `portal-task:\$\{taskId\}`/, "the same target key the composer uses, so files waiting for a page find it");
  // Files whose post didn't go through stay kept for the tab, even when the call throws, so the next batch for this
  // job carries them.
  assert.match(late, /void postOrKeepBatch\(taskId, tab\.take\(taskId, ids\), toast, owner\);/);
  assert.match(late, /onRecorded: land,[\s\S]*?onAway: land,/);
  // And what the tab kept before the job closed (every failure path keeps) posts as this page opens and as it goes,
  // not only when a new batch lands.
  assert.match(late, /useEffect\(\(\) => \{\s*void postKept\(taskId, toast, owner\);\s*return \(\) => void postKept\(taskId, toast, owner\);\s*\}, \[taskId, toast, owner\]\);/);
  // On a job closed to updates the batch step, access checked first, hands the own files to core's late line
  // (one update, one email line, never a batch Undo takes back) and answers with no id. The behavior by status,
  // and with an approve landing in between, is job-batch.test.ts.
  const batch = read("lib", "portal", "job-batch.ts");
  const step = fn(batch, "postBatchIn");
  const own = fn(batch, "postOwn");
  assert.ok(step.indexOf("core.assertContractorAccess(tx, taskId, p.contactId)") < step.indexOf("tx.task.findUnique"), "the access check comes first");
  // A send whose files are all posted already answers quietly whatever the job's status, so it can't stall the next piece.
  assert.match(step, /if \(own\.length === 0 && \(await allOwnPosted\(tx, taskId, p\.contactId, attachmentIds\)\)\) return \{ event: null, linked: \[\] \};/);
  assert.ok(step.indexOf("allOwnPosted(") < step.indexOf("isActiveStatus("), "the quiet answer comes before the status branch");
  assert.match(step, /return await postOwn\(tx, taskId, p, own, !task \|\| isActiveStatus\(task\.status\)\);/);
  assert.match(own, /if \(!active\) \{\s*try \{\s*return await postLate\(tx, taskId, p, own\);/);
  // A job HG reopened while the late line waited for the task row is refused under its lock, and the same files go
  // the active way (the low on core.ts:1227).
  assert.match(fn(read("lib", "tasks", "core.ts"), "addLateContractorBatch"), /await assertContractorAccess\(tx, taskId, p\.contactId\);\s*if \(isActiveStatus\(task\.status\)\) throw new TaskRuleError\(JOB_OPEN_AGAIN\);/);
  assert.match(own, /err instanceof core\.TaskRuleError && err\.message === core\.JOB_OPEN_AGAIN\) return postActive\(tx, taskId, p, own\);/);
  // A batch that waited behind Approve finds the job Done under addComment's lock: core refuses before it writes, in
  // access.ts JOB_CLOSED's words (core.test.ts pins them), and the same files take the late way.
  assert.match(batch, /import \{ JOB_CLOSED \} from "@\/lib\/attachments\/access";/);
  assert.doesNotMatch(batch, /export const JOB_CLOSED/, "one copy of the words");
  assert.match(own, /err instanceof core\.TaskRuleError && err\.message === JOB_CLOSED\) return postLate\(/);
  // `linked` is what the post linked, read back from its event, never the earlier read of what was unposted.
  assert.match(fn(batch, "postLate"), /const event = await core\.addLateContractorBatch\(tx, taskId, own, p\);\s*return \{ event: null, linked: await linkedTo\(tx, event\.id\) \};/);
  assert.match(fn(batch, "postActive"), /return \{ event, linked: await linkedTo\(tx, event\.id\) \};/);
  assert.match(fn(read("lib", "portal", "job-uploads.ts"), "postJobBatch"), /eventId: posted\.event\?\.id \?\? null, linked: posted\.linked/);
  // Held photos the composer still had when the job closed go the late way as the page goes.
  const actions = read("app", "(portal)", "p", "jobs", "[id]", "_components", "job-actions.tsx");
  assert.match(actions, /!res\.ok && res\.error === JOB_CLOSED \? await postJobBatchAction\(taskId, held, queueOwner\.current\)/);
  // And the page says so, with nothing to undo, in one toast that counts every late piece of the batch; the next
  // batch gets its own toast, and a quiet answer (nothing new to tell) gets none.
  const shared = read("app", "(portal)", "p", "jobs", "[id]", "_components", "record-and-post.ts");
  assert.match(fn(shared, "postRecordedBatch"), /const late: LateToast = \{ key: `job-added:\$\{taskId\}:\$\{\+\+lateToasts\}`, kinds: \[\] \};/);
  assert.match(
    shared,
    /if \(kinds\.length === 0\) return true;\s*if \(eventId === null\) \{\s*late\.kinds\.push\(\.\.\.kinds\);\s*toast\(\{ message: addedToJobText\(late\.kinds\), key: late\.key \}\);\s*return true;/,
  );
});

test("past the window the record step's closed-job refusal is final, and only that one", () => {
  const portal = read("app", "(portal)", "p", "jobs", "[id]", "upload-actions.ts");
  assert.match(fn(portal, "recordJobUploadAction"), /return withFinalRefusal\(res\);/);
  for (const name of ["postJobBatchAction", "undoJobPostAction"]) assert.doesNotMatch(fn(portal, name), /withFinalRefusal/, name);
  // The refusal's words are the constants the final check reads, Review's apart from Done's and Canceled's.
  assert.match(fn(read("lib", "tasks", "attachments.ts"), "contractorUploadRefusal"), /\? null : lateRefusal\(task\.status\);/);
  // A Retry of a record that committed gets its row back before the job's window is asked (B), so a file whose
  // answer was lost is never refused, and never sent again as a second copy.
  const record = fn(read("lib", "tasks", "attachments.ts"), "recordPortalAttachment");
  const mine = record.indexOf("const mine = await core.findOwnUpload(prisma, taskId, input.pathname, p);");
  assert.ok(mine >= 0 && mine < record.indexOf("contractorUploadRefusal("), "the own row is looked for before the early refusal");
  assert.match(record, /if \(mine\) return mine;/);
  // But never before access (the portal data boundary): a contractor taken off the job gets no row back.
  const access = record.indexOf("await core.assertContractorAccess(prisma, taskId, portal.contactId);");
  assert.ok(access >= 0 && access < mine, "access first, then the own row, then the job's window");
  // The queue's half (A, a final tile forgets its paths) is engine.test.ts: a restored final row sends its bytes again.
  // The record step hands `final` to the queue as it came.
  assert.match(read("app", "(portal)", "p", "jobs", "[id]", "_components", "record-and-post.ts"), /const res = await recordJobUploadAction\(taskId, file, owner\);[\s\S]*?return res;/);
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
  assert.match(shared, /postJobBatchAction\(taskId, piece\.map\(\(i\) => i\.id\), owner\)/);
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
  // The loser answers with nothing linked (job-uploads.ts), and a piece that linked nothing says nothing.
  assert.match(fn(read("lib", "portal", "job-uploads.ts"), "postJobBatch"), /if \(!\(err instanceof BatchAlreadyPosted\)\) throw err;\s*posted = \{ event: null, linked: \[\] \};/);
  assert.ok(shared.indexOf("if (kinds.length === 0) return true;") < shared.indexOf("toast({\n    message: postedText(kinds)"), "before any toast");
  // A loser on a closed job (core.addLateContractorBatch links none) is the same quiet answer.
  const step = fn(read("lib", "portal", "job-batch.ts"), "postBatchIn");
  assert.match(step, /if \(own\.length > 0 && \(await allOwnPosted\(tx, taskId, p\.contactId, own\)\)\) throw new BatchAlreadyPosted\(\);/);
  assert.ok(step.indexOf("postOwn(") < step.indexOf("throw new BatchAlreadyPosted()"), "around both ways, active and late");
  assert.match(read("app", "(portal)", "p", "jobs", "[id]", "upload-actions.ts"), /filename: z\.string\(\)\.min\(1\)\.max\(MAX_FILENAME \* 4\),/);
});

test("no post names more files than the actions take, and a kept batch can't stall the ones after it", () => {
  // One limit, read by the batch action, the written update and Mark done, and by the page that splits and holds.
  const jobDir = ["app", "(portal)", "p", "jobs", "[id]"] as const;
  assert.doesNotMatch(read(...jobDir, "upload-actions.ts"), /\.max\(50\)/);
  assert.doesNotMatch(read(...jobDir, "actions.ts"), /\.max\(50\)/);
  // Every post of recorded files goes through postInBatches, so a tab that kept 30 and then recorded 25 posts 50 and 5.
  const shared = read(...jobDir, "_components", "record-and-post.ts");
  assert.match(fn(shared, "postRecordedBatch"), /return postInBatches\(items, \(piece\) => postPiece\(taskId, piece, toast, late, owner, retry\)\);/);
  // The tray holds what one Send or Mark done takes; files that don't fit, or didn't post, wait in the tab's registry.
  const actions = read(...jobDir, "_components", "job-actions.tsx");
  assert.match(actions, /const room = Math\.max\(0, MAX_FILES_PER_POST - live\.current\.ready\.length\);\s*tab\.keep\(taskId, items\.slice\(room\)\);/);
  assert.match(actions, /if \(left\.length > 0\) putBack\(left\);/);
  // A file past what the tray holds leaves it for the tab's registry (kept in order), and posts once the Send or Mark done went.
  assert.match(actions, /tab\.take\(taskId, ids, MAX_FILES_PER_POST - held\.length\)/);
  // What the tab kept posts as the page opens, once the Send or Mark done went, and as the page goes, so none is left
  // unposted; one drain at a time for each job, and whatever doesn't post stays kept (recorded-uploads.ts drainKept).
  assert.match(fn(shared, "postKept"), /return drainKept\(owner, taskId, \(kept\) => postRecordedBatch\(taskId, kept, toast, owner, retryKept\(taskId, toast, owner\)\)\);/);
  assert.match(actions, /const sendKept = \(\) => postKept\(taskId, toast, owner\);/);
  assert.match(actions, /if \(res\?\.ok\) startSending\(sendKept\);/, "after a Send went");
  assert.match(actions, /setSheetState\("sent"\);[\s\S]*?startSending\(sendKept\);/, "after a Mark done went");
  assert.match(
    actions,
    /here\.current = true;\s*void postKept\(taskId, toastLater\.current, queueOwner\.current\);\s*return \(\) => \{\s*here\.current = false;\s*void postKept\(taskId, toastLater\.current, queueOwner\.current\);/,
    "as the page opens, and as it goes",
  );
  // With the page gone, files that didn't post are all kept for the tab, never put into a tray that's gone.
  assert.match(actions, /if \(!mounted\.current\) \{\s*tab\.keep\(taskId, items\);\s*return;\s*\}/);
  assert.match(actions, /const registry = recordedUploadsOf\(queueOwner\.current\);/);
  assert.match(actions, /postJobUpdateAction\(taskId, \{ body: "", attachmentIds: held \}, queueOwner\.current\)/, "as the queue's owner");
  assert.match(actions, /if \(!posted\.ok\) registry\.keep\(taskId, heldItems\);/);
  // A Mark done that fails after the page went keeps its files too (the unmount left them out of its own post).
  assert.match(actions, /toast\(\{ message: res\.error \}\);\s*\/\/[^\n]*\n\s*if \(!mounted\.current\) tab\.keep\(taskId, items\);\s*return;/);
});

test("a Send refused because HG closed the job posts the held photos the late way and refreshes the page", () => {
  const actions = read("app", "(portal)", "p", "jobs", "[id]", "_components", "job-actions.tsx");
  const send = fn(actions, "sendUpdate");
  // Posted: the kept files go. Closed: the held photos go the late way. Anything else: they go back on the tray.
  assert.match(send, /if \(res\?\.ok\) startSending\(sendKept\);\s*else if \(res && res\.error === JOB_CLOSED\) sendLate\(items\);\s*else putBack\(items\);/);
  // Files that don't post go back on the tray even when the call throws (a redirect), as drainKept keeps its own.
  assert.match(
    actions,
    /const sendLate = \(items: Recorded\[\]\) =>\s*startSending\(async \(\) => \{\s*let left = items;\s*try \{\s*left = items\.length > 0 \? await sendBatch\(items\) : \[\];\s*\} finally \{\s*if \(left\.length > 0\) putBack\(left\);\s*\}\s*router\.refresh\(\);\s*\}\);/,
  );
  assert.match(
    actions,
    /const postBatch = \(items: Recorded\[\]\) =>\s*startSending\(async \(\) => \{\s*let left = items;\s*try \{\s*left = await sendBatch\(items\);\s*\} finally \{\s*if \(left\.length > 0\) putBack\(left\);\s*\}\s*\}\);/,
  );
});

test("the Mark done sheet shows, counts and sends the tray less what a written update whose answer was lost may have posted", () => {
  const actions = read("app", "(portal)", "p", "jobs", "[id]", "_components", "job-actions.tsx");
  const send = fn(actions, "sendUpdate");
  assert.match(send, /const outcome = res\?\.ok \? "posted" : res \? "refused" : "lost";\s*setUnconfirmed\(\(u\) => unconfirmedAfter\(u, attachmentIds, outcome\)\);/);
  assert.match(actions, /const sheetReady = finishable\(ready, unconfirmed\);/);
  assert.match(actions, /const items = sheetReady;/);
  assert.match(actions, /uploaded: sheetReady\.length, required/);
  assert.match(actions, /finishCountLabel\(required, sheetReady\.length\)/);
  assert.match(actions, /filled=\{sheetReady\.length\}/);
  assert.match(actions, /leading=\{sheetReady\.map\(/);
});

test("a job page that stays open mounts its upload target again when the job's status changes", () => {
  // A tile the job refused for good gets its one more go when HG moves the job back, not only when the page opens.
  assert.match(read("components", "media-uploader.tsx"), /useEffect\(\(\) => engine\.mount\(target\.key\), \[engine, target\.key, reopenOn\]\);/);
  const actions = read("app", "(portal)", "p", "jobs", "[id]", "_components", "job-actions.tsx");
  assert.match(actions, /useMediaUploader\(\{ target, reopenOn: status \}\)/);
  // The page learns of that change with one refresh when a tile is first refused for good.
  assert.match(actions, /if \(finals > 0 && !hadFinal\.current\) router\.refresh\(\);\s*hadFinal\.current = finals > 0;/);
});
