import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/*
 * Home's "Email limit reached today." banner used to count every outbox row
 * closed today, rows closed unsent included, and left out password resets,
 * so it could show after a handful of emails while the send run still had
 * room. Both now count with sent-count.ts sentSince, whose rule the pg test
 * (sent-count.pg.test.ts) checks on a real Postgres. The modules that call it
 * are server-only, so here it's their source that is read.
 */

const read = (rel: string) =>
  fs
    .readFileSync(path.join(import.meta.dirname, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

const queries = read("../tasks/queries.ts");
const outbox = read("outbox.ts");

test("Home's banner counts today's emails with the send run's rule", () => {
  const banner = queries.slice(queries.indexOf("export async function emailCapReached"));
  assert.match(banner, /^export async function emailCapReached\(today: Ymd\): Promise<boolean> \{\s*return \(await sentSince\(prisma, easternDayStart\(today\)\)\) >= DAILY_EMAIL_CAP;\s*\}/);
  assert.doesNotMatch(queries, /notificationOutbox\.count/, "no count of its own that takes rows closed unsent as sent");
});

test("the send run's count is the same rule, from midnight in Buffalo", () => {
  assert.match(outbox, /export async function sentTodayCount\(now = new Date\(\)\): Promise<number> \{\s*return sentSince\(prisma, easternDayStart\(now\)\);\s*\}/);
  assert.match(outbox, /const sentBefore = await sentTodayCount\(now\);/, "the drain's budget starts from it");
  assert.doesNotMatch(outbox, /notificationOutbox\.count|securityEvent\.count/);
});
