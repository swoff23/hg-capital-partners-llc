import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOAST_PHONE_CHARS } from "@/lib/toast-line";
import { RETRY_PAST_CAP, RETRY_PAST_CAP_IN_SHEET, TOO_MANY_FILES, finishable, lostAfter, sendOutcome, settleLost, unconfirmedIds } from "./job-view";

/**
 * Static guards for the Nov 3 review's lows on the contractor job page (job-actions.tsx), a client component, so its
 * source is read here instead of rendered, in the style of upload-guards.test.ts: a lost Send settles on the next
 * answer from the server too (lows 5), and a post or a Mark done out when the page goes leaves every file posted or
 * kept for the tab (lows 10d, the L2 and L4 residuals), and a Retry past the cap says the way on (lows 1). The rules
 * they lean on are job-view.test.ts's, recorded-uploads.test.ts's and engine.test.ts's.
 */

const SRC = join(__dirname, "..", "..");
const actions = readFileSync(join(SRC, "app", "(portal)", "p", "jobs", "[id]", "_components", "job-actions.tsx"), "utf8");

/** The text from `from` up to `to`, both found in order. */
function between(from: string, to: string): string {
  const start = actions.indexOf(from);
  const end = actions.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `${from} comes before ${to}`);
  return actions.slice(start, end);
}

test("a lost Send settles on the next answer from the server, not only on the browser's online event (lows 5)", () => {
  // The case: a phone with no data still reads online, so `online` never fires and the photos stayed out of Mark done.
  const tray = [{ id: "A" }, { id: "B" }];
  const lost = lostAfter([], { clientId: "s1", ids: ["A", "B"] }, sendOutcome(null, false));
  assert.deepEqual(finishable(tray, unconfirmedIds(lost)), [], "held back while it may have posted");
  // The refresh the next answer starts brings the page's own updates, and s1 isn't among them: it never committed.
  assert.deepEqual(finishable(tray, unconfirmedIds(settleLost(lost, ["other"]))), tray, "both count again");

  // A lost Send marks that the page hasn't asked yet; any later answer (another Send's, or a record step's) asks once.
  const send = between("async function sendUpdate", "const postBatch");
  assert.match(
    send,
    /setLost\(\(l\) => lostAfter\(l, \{ clientId, ids: attachmentIds \}, outcome\)\);\s*if \(outcome === "lost"\) unasked\.current = true;\s*else if \(res\) heard\(\);/,
  );
  assert.match(actions, /recordJobFile\(taskId, file, from\)\.then\(\(res\) => \{\s*heard\(\);\s*return res;\s*\}\)/, "every record step's answer");
  // Asking is the same refresh the online event starts, once for each loss, and never once the page is gone.
  assert.match(
    actions,
    /const heard = \(\) => \{\s*if \(!unasked\.current \|\| !mounted\.current \|\| navigator\.onLine === false\) return;\s*unasked\.current = false;\s*learning\.current = true;\s*router\.refresh\(\);\s*\};/,
    "and never while the browser says it's offline, where a failed refresh becomes a navigation to the offline page",
  );
  // And the refresh's answer is read the one way, whichever started it.
  assert.match(actions, /if \(!learning\.current\) return;\s*learning\.current = false;\s*setLost\(\(l\) => settleLost\(l, sentClientIds \?\? \[\]\)\);/);
});

test("the tray is set in the page's state and in live at once, so the unmount reads it as it is (lows 10d, L2)", () => {
  // The unmount's post, putBack and onRecorded read `live`. When it was copied from the state after each render, a
  // page that went before that render lost a file a failed post had just put back, and sent again one a post had just
  // taken off the tray.
  assert.match(actions, /const \[ready, setReadyState\] = useState<Recorded\[\]>\(\[\]\);/);
  assert.match(
    actions,
    /const setReady = \(next: Recorded\[\] \| \(\(r: Recorded\[\]\) => Recorded\[\]\)\) => \{\s*const value = typeof next === "function" \? next\(live\.current\.ready\) : next;\s*live\.current = \{ \.\.\.live\.current, ready: value \};\s*setReadyState\(value\);\s*\};/,
  );
  assert.equal(actions.match(/setReadyState\(/g)?.length, 1, "nothing sets the state around it");
  // The render copies the words and the sheet, never an older tray over a newer one.
  assert.match(actions, /useEffect\(\(\) => \{\s*live\.current = \{ \.\.\.live\.current, body, sheetOpen \};\s*\}\);/);
  assert.doesNotMatch(actions, /live\.current = \{ body, sheetOpen, ready \}/);
  // What reads the tray outside a render reads `live`.
  assert.match(actions, /backOnTray\(items, live\.current\.ready\)/, "putBack");
  assert.match(actions, /const \{ sheetOpen: holding, body: text, ready: held \} = live\.current;/, "onRecorded");
  assert.match(actions, /const heldItems = latest\.current\.ready\.filter\(\(r\) => !inFlight\.current\.includes\(r\.id\)\);/, "the unmount's post");
  // Once the page is gone, a post that didn't go keeps its files for the tab (putBack), and the counter nets out.
  assert.match(actions, /if \(!mounted\.current\) \{\s*tab\.keep\(taskId, items\);\s*return;\s*\}/);
  for (const name of ["const sendLate", "async function sendUpdate", "const postBatch"]) {
    const body = between(name, name === "const postBatch" ? "const record =" : name === "const sendLate" ? "async function sendUpdate" : "const postBatch");
    assert.match(body, /setPosting\(\(n\) => n \+ items\.length\)[\s\S]*finally \{\s*setPosting\(\(n\) => n - items\.length\)/, name);
  }
});

test("a Mark done out when the page goes leaves its photos posted or kept, a throw included (lows 10d, L4)", () => {
  const finish = between("function finish()", "const done = markDoneButton");
  // While it's out the unmount leaves its photos to it (finishingIds), so whatever it ends in has to keep them.
  assert.match(actions, /const heldItems = latest\.current\.ready\.filter\(\(r\) => !inFlight\.current\.includes\(r\.id\)\);/);
  assert.match(finish, /finishingIds\.current = items\.map\(\(i\) => i\.id\);/);
  // Refused: kept (as before).
  assert.match(finish, /toast\(\{ message: res\.error \}\);\s*\/\/[^\n]*\n\s*if \(!mounted\.current\) tab\.keep\(taskId, items\);\s*return;/);
  // Thrown (a redirect once the session ended), with no answer: kept too, where before they were let go.
  assert.match(finish, /let answered = false;\s*try \{\s*const res = await callAction\([\s\S]*?\);\s*answered = true;/);
  assert.match(finish, /\} finally \{\s*finishingIds\.current = \[\];\s*\/\/[^\n]*\n\s*if \(!answered && !mounted\.current\) tab\.keep\(taskId, items\);\s*\}/);
  // Posted: the tray lets them go at once (setReady writes live), so an unmount before the next render can't send
  // them again as an empty update.
  assert.match(finish, /setReady\(\(r\) => r\.filter\(\(x\) => !items\.some\(\(i\) => i\.id === x\.id\)\)\);/);
});

test("a Retry past the job page's cap toasts the way on, whole on a phone (lows 1)", () => {
  // The engine keeps the tile failed with its Retry (engine.test.ts); the page gives the words.
  assert.match(actions, /maxFilesReason: MAX_FILES_REASON,\s*maxFilesNotice: sheetOpen \? RETRY_PAST_CAP_IN_SHEET : RETRY_PAST_CAP,/);
  assert.equal(RETRY_PAST_CAP, "Send these 50, then Retry.");
  assert.equal(RETRY_PAST_CAP_IN_SHEET, "Close this and Send first.");
  for (const line of [RETRY_PAST_CAP, RETRY_PAST_CAP_IN_SHEET]) assert.ok(line.length <= TOAST_PHONE_CHARS, line);
  // The server's refusal of an oversize send keeps its rule.
  assert.equal(TOO_MANY_FILES, "Send up to 50 at a time.");
});

test("the My jobs row hands the queue's whole count to rowUploadLine, which is how refused reaches it", () => {
  const row = readFileSync(join(__dirname, "..", "..", "app", "(portal)", "p", "_components", "my-jobs.tsx"), "utf8");
  assert.match(row, /rowUploadLine\(useUploadQueue\(`portal-task:\$\{job\.id\}`\)\)/);
});

test("at 320 the My jobs row's upload line leaves the date whole: the separator and the place go under 360", () => {
  const row = readFileSync(join(__dirname, "..", "..", "app", "(portal)", "p", "_components", "my-jobs.tsx"), "utf8");
  assert.match(row, /className=\{cn\("shrink-0", uploading && "max-\[360px\]:hidden"\)\}/);
  // Only beside a day (Due or Scheduled): with none (none set, or a finished job still taking photos) the place is all that follows.
  assert.match(row, /className=\{cn\("min-w-0 flex-1 truncate", uploading && day && "max-\[360px\]:hidden"\)\}/);
  // The separator before the place sits inside the day's span, so it goes with the day.
  assert.match(row, /\{day && \(\s*<span className="flex min-w-0 items-center gap-1">[\s\S]*?\{where && \(\s*<span aria-hidden="true" className=\{cn\("shrink-0", uploading && "max-\[360px\]:hidden"\)\}>/);
});
