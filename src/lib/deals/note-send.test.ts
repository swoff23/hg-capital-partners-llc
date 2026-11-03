import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GENERIC_ERROR, OFFLINE_ERROR } from "@/lib/action-result";
import { sendRefusal } from "@/lib/composer-draft";
import { DEAL_MESSAGES } from "./field-rules";

test("a note refused as written says why on its card, and no Retry is offered for it", () => {
  // A 5,019-character note showed only "Didn't save · Retry", and Retry could never work.
  assert.equal(sendRefusal(DEAL_MESSAGES.note), "Keep the note under 5,000 characters.");
  // A dropped connection or a failure on our side keeps Retry.
  assert.equal(sendRefusal(OFFLINE_ERROR), null);
  assert.equal(sendRefusal(GENERIC_ERROR), null);

  const src = readFileSync(new URL("../../app/(app)/deals/[id]/deal-log.tsx", import.meta.url), "utf8");
  assert.match(src, /const refusal = failed \? sendRefusal\(send\.error\) : null;/);
  assert.match(src, /<SendFailedLine verb="save" offline=\{isOfflineMessage\(send\.error\)\} reason=\{refusal\}/);
  assert.match(src, /\{!refusal && \(\s*<MenuItem id="retry"/);
});
