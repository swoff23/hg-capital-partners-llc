import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { EmailMessage } from "@/lib/email/resend";
import type { SendResult } from "@/lib/email/send";
import { deliverResetEmail, type ResetRequestData } from "./reset-core";

/*
 * A reset request used to log `sent: true` in its transaction, before the
 * send after the response was even tried, and the daily email count
 * (notifications/sent-count.ts) counts those events: a failed send still
 * spent the cap. Now the request writes `sent: false` and the send marks it.
 */

const msg: EmailMessage = { to: "zack@example.test", subject: "Reset your HG password", text: "link" };
const data: ResetRequestData = { emailHash: "h-zack", sent: false };

function fakeEvents() {
  const writes: { where: unknown; data: unknown }[] = [];
  const db = {
    securityEvent: {
      updateMany: async (args: { where: unknown; data: unknown }) => {
        writes.push(args);
        return { count: 1 };
      },
    },
  };
  return { db: db as unknown as Parameters<typeof deliverResetEmail>[0], writes };
}

test("a reset email that went marks its event sent, keeping the emailHash the hourly limit counts by", async () => {
  const { db, writes } = fakeEvents();
  const sent: EmailMessage[] = [];
  const went = await deliverResetEmail(db, async (m) => (sent.push(m), { ok: true, id: "re_1" }), { eventId: "ev-1", data, msg });
  assert.equal(went, true);
  assert.deepEqual(sent, [msg]);
  assert.deepEqual(writes, [{ where: { id: "ev-1" }, data: { data: { emailHash: "h-zack", sent: true } } }]);
});

test("a send Resend refuses, or that fails before it, leaves the event unsent", async () => {
  const failures: SendResult[] = [
    { ok: false, error: "Resend 500: request failed", status: 500 },
    { ok: false, error: "Resend 429: daily quota", status: 429, code: "daily_quota_exceeded" },
    { ok: false, error: "Email is not configured" },
  ];
  for (const res of failures) {
    const { db, writes } = fakeEvents();
    assert.equal(await deliverResetEmail(db, async () => res, { eventId: "ev-1", data, msg }), false, res.error);
    assert.deepEqual(writes, [], res.error);
  }
});

test("the request writes `sent: false` for every address and lets only the send mark it", () => {
  const source = fs
    .readFileSync(path.join(import.meta.dirname, "reset.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const start = source.slice(source.indexOf("export async function startPasswordReset"), source.indexOf("async function sendResetEmail"));
  // Same row whether or not the address has a login, so the stored event says nothing the response doesn't.
  assert.match(start, /const data: ResetRequestData = \{ emailHash: keyed, sent: false \};/);
  assert.doesNotMatch(start, /sent: (true|!!token|token)/, "never recorded as sent before the send is tried");
  // The send runs after the response, for a known address only, and records its own outcome.
  assert.match(start, /if \(request\) after\(\(\) => sendResetEmail\(email, request\)\);/);
  const send = source.slice(source.indexOf("async function sendResetEmail"));
  assert.match(send, /await deliverResetEmail\(prisma, sendEmail, \{/);
  assert.doesNotMatch(send, /await sendEmail\(/, "no send whose result goes unread");
});
