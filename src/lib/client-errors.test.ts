import test from "node:test";
import assert from "node:assert/strict";
import { type ClientError, attachClientErrorSender, reportClientError, shouldReportClientError, turnOnClientErrors } from "./client-errors";

// docs/specs/error-alerts.md, Q6 and Q18. The state lives on globalThis; each test starts it fresh.
const KEY = Symbol.for("hg.clientErrors");
test.beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[KEY];
});

test("a server error that reached the screen with only its digest isn't reported again", () => {
  const fromServer = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "1234567" });
  assert.equal(shouldReportClientError(fromServer), false);
});

test("a dropped connection and an old deploy's missing chunk aren't bugs", () => {
  assert.equal(shouldReportClientError(new TypeError("Failed to fetch")), false);
  assert.equal(shouldReportClientError(Object.assign(new Error("Loading chunk 123 failed."), { name: "ChunkLoadError" })), false);
  assert.equal(shouldReportClientError(null), false);
});

test("a real browser error is reported", () => {
  assert.equal(shouldReportClientError(new TypeError("Cannot read properties of undefined (reading 'title')")), true);
  assert.equal(shouldReportClientError("a thrown string"), true);
});

test("off until instrumentation-client.ts turns it on, so nothing piles up outside production", () => {
  const sent: ClientError[] = [];
  reportClientError(new Error("early"), "window");
  attachClientErrorSender((item) => sent.push(item));
  assert.equal(sent.length, 0);
});

test("errors before Sentry loads wait, then go when it attaches; later ones go straight through", () => {
  turnOnClientErrors();
  const first = new Error("before load");
  reportClientError(first, "window");
  reportClientError(new Error("public page"), "boundary", "public");
  const sent: ClientError[] = [];
  attachClientErrorSender((item) => sent.push(item));
  assert.deepEqual(sent, [
    { error: first, source: "window" },
    { error: sent[1].error, source: "boundary", area: "public" },
  ]);
  reportClientError(new Error("after load"), "rejection");
  assert.equal(sent.length, 3);
});

test("the same error twice on one page load is one report", () => {
  turnOnClientErrors();
  const sent: ClientError[] = [];
  attachClientErrorSender((item) => sent.push(item));
  const err = new Error("same");
  reportClientError(err, "window");
  reportClientError(err, "boundary");
  assert.equal(sent.length, 1);
});

test("at most 20 wait before Sentry loads", () => {
  turnOnClientErrors();
  for (let i = 0; i < 30; i++) reportClientError(new Error(`e${i}`), "window");
  const sent: ClientError[] = [];
  attachClientErrorSender((item) => sent.push(item));
  assert.equal(sent.length, 20);
});
