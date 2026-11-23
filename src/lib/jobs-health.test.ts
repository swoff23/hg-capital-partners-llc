import test from "node:test";
import assert from "node:assert/strict";
import { DAILY_EMAIL_CAP } from "./notifications/content";
import { type JobsSnapshot, jobReasons, jobsSwitches, readJobsSnapshot } from "./jobs-health";

// docs/specs/error-alerts.md, Q9 and Q14 to Q16.

const NOW = new Date("2026-11-14T15:00:00Z");
const minutes = (n: number) => new Date(NOW.getTime() - n * 60_000);
const hours = (n: number) => minutes(n * 60);
const calmEmail = { sentToday: 4, oldestDueAt: null, retrying: 0, gaveUpRecently: 0, complainedRecently: 0 };

function reasons(snapshot: Partial<JobsSnapshot>) {
  return jobReasons({ email: null, qbo: null, ...snapshot }, NOW);
}

test("a quiet queue and a fresh sync check in ok", () => {
  assert.deepEqual(reasons({ email: calmEmail, qbo: { lastSuccessfulSyncAt: hours(10), connectedAt: hours(500) } }), []);
});

test("nothing is judged while email and QuickBooks are off", () => {
  assert.deepEqual(reasons({}), []);
});

test("an email more than 15 minutes past its send time is stuck", () => {
  assert.deepEqual(reasons({ email: { ...calmEmail, oldestDueAt: minutes(16) } }), ["email_stuck"]);
  assert.deepEqual(reasons({ email: { ...calmEmail, oldestDueAt: minutes(14) } }), [], "a run or two behind isn't stuck");
});

test("emails held by the daily cap aren't stuck: the cap is its own reason (Q15)", () => {
  const capped = { ...calmEmail, sentToday: DAILY_EMAIL_CAP, oldestDueAt: hours(5) };
  assert.deepEqual(reasons({ email: capped }), ["email_capped"]);
});

test("an email on its third try is failing, and so is one that gave up today, so a drop isn't a recovery (Q15)", () => {
  assert.deepEqual(reasons({ email: { ...calmEmail, retrying: 1 } }), ["email_failing"]);
  assert.deepEqual(reasons({ email: { ...calmEmail, gaveUpRecently: 1 } }), ["email_failing"]);
});

test("a spam report in the last day alerts like the daily cap, and clears on its own (emails redesign, section 5)", () => {
  assert.deepEqual(reasons({ email: { ...calmEmail, complainedRecently: 1 } }), ["email_complained"]);
  assert.deepEqual(reasons({ email: { ...calmEmail, sentToday: DAILY_EMAIL_CAP, complainedRecently: 2 } }), ["email_capped", "email_complained"]);
});

test("QuickBooks is stale after 26 hours without a successful sync, counted from the connection if it never synced", () => {
  assert.deepEqual(reasons({ qbo: { lastSuccessfulSyncAt: hours(27), connectedAt: hours(500) } }), ["qbo_stale"]);
  assert.deepEqual(reasons({ qbo: { lastSuccessfulSyncAt: hours(25), connectedAt: hours(500) } }), []);
  assert.deepEqual(reasons({ qbo: { lastSuccessfulSyncAt: null, connectedAt: hours(2) } }), []);
  assert.deepEqual(reasons({ qbo: { lastSuccessfulSyncAt: null, connectedAt: hours(30) } }), ["qbo_stale"]);
});

test("several reasons come back together", () => {
  assert.deepEqual(
    reasons({ email: { ...calmEmail, oldestDueAt: minutes(30), retrying: 2 }, qbo: { lastSuccessfulSyncAt: hours(40), connectedAt: hours(500) } }),
    ["email_stuck", "email_failing", "qbo_stale"],
  );
});

test("a feature counts as on only with the cron secret too, since without it neither cron runs (Q16)", () => {
  const email = { apiKey: "k", from: "f", replyTo: null, webhookSecret: null };
  const qbo = { clientId: "c", clientSecret: "s", redirectUri: "https://x/cb", tokenSecret: "t", environment: "production" as const, historyStart: "2026-01" };
  assert.deepEqual(jobsSwitches({ email, qbo, CRON_SECRET: "s" }), { email: true, qbo: true });
  assert.deepEqual(jobsSwitches({ email, qbo: null, CRON_SECRET: "s" }), { email: true, qbo: false }, "production today: no QuickBooks keys");
  assert.deepEqual(jobsSwitches({ email, qbo, CRON_SECRET: "  " }), { email: false, qbo: false });
  assert.deepEqual(jobsSwitches({ email: null, qbo, CRON_SECRET: undefined }), { email: false, qbo: false });
});

test("the snapshot asks the queue the questions the rules need, and skips what's off", async () => {
  const calls: { model: string; op: string; args: unknown }[] = [];
  const model = (name: string, answers: Record<string, unknown>) =>
    new Proxy(
      {},
      {
        get: (_t, op: string) => async (args: unknown) => {
          calls.push({ model: name, op, args });
          return typeof answers[op] === "function" ? (answers[op] as (a: unknown) => unknown)(args) : answers[op];
        },
      },
    );
  const db = {
    notificationOutbox: model("outbox", {
      // Retrying rows: 2. Gave up recently: 1. Sent today with no error (sent-count.ts): 7.
      count: (args: { where: { attempts?: unknown; lastError?: { startsWith?: string } | null } }) =>
        args.where.attempts ? 2 : args.where.lastError?.startsWith ? 1 : 7,
      findFirst: { sendAfter: minutes(20) },
    }),
    securityEvent: model("securityEvent", { count: 1 }),
    quickbooksConnection: model("qbo", { findFirst: null }),
    // Spam reports in the last day: one on a contractor's login, none on a partner.
    portalAccount: model("portalAccount", { count: 1 }),
    user: model("user", { count: 0 }),
  } as unknown as Parameters<typeof readJobsSnapshot>[0];

  const snapshot = await readJobsSnapshot(db, { email: true, qbo: true }, NOW);
  assert.deepEqual(snapshot.email, { sentToday: 8, oldestDueAt: minutes(20), retrying: 2, gaveUpRecently: 1, complainedRecently: 1 });
  const complaints = calls.find((c) => c.model === "portalAccount")?.args as { where: unknown };
  assert.deepEqual(complaints.where, { emailProblem: "COMPLAINED", emailEventAt: { gte: hours(24) } });
  assert.equal(snapshot.qbo, null, "no connection that isn't revoked");

  const qboQuery = calls.find((c) => c.model === "qbo")?.args as { where: unknown };
  assert.deepEqual(qboQuery.where, { status: { not: "REVOKED" } });
  const due = calls.find((c) => c.op === "findFirst" && c.model === "outbox")?.args as { where: unknown };
  assert.deepEqual(due.where, { sentAt: null, sendAfter: { lte: NOW } });

  calls.length = 0;
  assert.deepEqual(await readJobsSnapshot(db, { email: false, qbo: false }, NOW), { email: null, qbo: null });
  assert.equal(calls.length, 0, "nothing is read for a feature that's off");
});
