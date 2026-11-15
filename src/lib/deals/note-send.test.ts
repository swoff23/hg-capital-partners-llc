import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GENERIC_ERROR, OFFLINE_ERROR } from "@/lib/action-result";
import { sendRefusal } from "@/lib/composer-draft";
import { DEAL_MESSAGES } from "./field-rules";

test("a note refused as written says why on its card, and no Retry is offered for it", () => {
  // A 5,019-character note showed only "Didn't save · Retry", and Retry could never work.
  assert.equal(sendRefusal(DEAL_MESSAGES.note), "Shorten it to 5,000 characters.");
  // A dropped connection or a failure on our side keeps Retry.
  assert.equal(sendRefusal(OFFLINE_ERROR), null);
  assert.equal(sendRefusal(GENERIC_ERROR), null);

  const src = readFileSync(new URL("../../app/(app)/deals/[id]/deal-log.tsx", import.meta.url), "utf8");
  assert.match(src, /const refusal = failed \? sendRefusal\(send\.error\) : null;/);
  assert.match(src, /<SendFailedLine verb="save" offline=\{isOfflineMessage\(send\.error\)\} reason=\{refusal\}/);
  assert.match(src, /\{!refusal && \(\s*<MenuItem id="retry"/);
});

test("the refusal matches the task comment's sentence, and exactly the limit is accepted (design call 12)", async () => {
  const { NOTE_MAX } = await import("./field-rules");
  const { TOO_LONG } = await import("@/lib/tasks/limits");
  // "Keep the note under 5,000 characters." was one off: 5,000 saves. The same words as a comment, with the note's number.
  assert.equal(DEAL_MESSAGES.note, TOO_LONG.comment.replace("20,000", "5,000"));
  assert.equal(NOTE_MAX, 5000);
  const notes = readFileSync(new URL("./notes.ts", import.meta.url), "utf8");
  assert.match(notes, /if \(text\.length > NOTE_MAX\) throw new NoteError\(DEAL_MESSAGES\.note\);/);
});

test("editing a deal note stops at the length the service takes: the editor's cap comes from its caller (design call 12)", () => {
  const card = readFileSync(new URL("../../components/comment-card.tsx", import.meta.url), "utf8");
  // The shared editor takes the cap as a prop; a task comment keeps its 20,000 as the default.
  assert.match(card, /noun = "comment",\s*maxLength = 20_000,/);
  assert.match(card, /maxLength=\{maxLength\}/);
  assert.doesNotMatch(card, /maxLength=\{20_000\}/);
  const log = readFileSync(new URL("../../app/(app)/deals/[id]/deal-log.tsx", import.meta.url), "utf8");
  assert.match(log, /import \{ NOTE_MAX \} from "@\/lib\/deals\/field-rules";/);
  assert.match(log, /<CommentEditor initial=\{note\.text\} noun="note" maxLength=\{NOTE_MAX\}/);
});
