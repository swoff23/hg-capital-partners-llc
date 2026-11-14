import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ReportLevel, logError, setErrorReporter } from "./log";

type Sent = { scope: string; message: string; ctx: Record<string, unknown>; level: ReportLevel };

function capture(): Sent[] {
  const sent: Sent[] = [];
  setErrorReporter((scope, err, ctx, level) => sent.push({ scope, message: err.message, ctx, level }));
  return sent;
}

/** logError writes its line to console.error; keep the test output quiet. */
function quietly(run: () => void): void {
  const original = console.error;
  console.error = () => {};
  try {
    run();
  } finally {
    console.error = original;
  }
}

test.afterEach(() => setErrorReporter(null));

test("with no reporter set, logError only logs (scripts and tests)", () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (line: string) => lines.push(line);
  try {
    logError("scripts:import", new Error("boom"), { id: "x" });
  } finally {
    console.error = original;
  }
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).scope, "scripts:import");
});

test("a reporter receives the scope, the error, its context and level error by default (Q13)", () => {
  const sent = capture();
  quietly(() => logError("email:inbound", new Error("download failed"), { emailId: "e1" }));
  assert.deepEqual(sent, [{ scope: "email:inbound", message: "download failed", ctx: { emailId: "e1" }, level: "error" }]);
});

test("cleanup that's allowed to fail reports as a warning", () => {
  const sent = capture();
  quietly(() => logError("recent-views.record", new Error("x"), {}, { level: "warning" }));
  assert.equal(sent[0].level, "warning");
});

test("report: false logs without reporting", () => {
  const sent = capture();
  quietly(() => logError("action:saveTask", new Error("x"), {}, { report: false }));
  assert.equal(sent.length, 0);
});

test("the same scope and message report once a minute, so a loop can't spend the quota (risk 2)", () => {
  const sent = capture();
  quietly(() => {
    for (let i = 0; i < 50; i++) logError("notifications:reminder", new Error("same"));
    logError("notifications:reminder", new Error("different"));
    logError("qbo:sync", new Error("same"));
  });
  assert.deepEqual(
    sent.map((s) => `${s.scope}/${s.message}`),
    ["notifications:reminder/same", "notifications:reminder/different", "qbo:sync/same"],
  );
});

test("a reporter that throws never breaks the caller", () => {
  setErrorReporter(() => {
    throw new Error("Sentry is down");
  });
  quietly(() => assert.doesNotThrow(() => logError("email:send", new Error("x"))));
});

test("the reporter is shared through globalThis, so instrumentation and app code see one copy", () => {
  const sent = capture();
  const holder = (globalThis as Record<symbol, { reporter: unknown } | undefined>)[Symbol.for("hg.errorReporter")];
  assert.ok(holder && typeof holder.reporter === "function");
  quietly(() => logError("x", "a string, not an Error"));
  assert.equal(sent[0].message, "a string, not an Error");
});

test("withResult reports only what shows GENERIC_ERROR; withLog leaves it to onRequestError (Q7)", () => {
  // server-action.ts is server-only, so this reads its source instead of importing it.
  const source = readFileSync(join(__dirname, "server-action.ts"), "utf8");
  const withResult = source.slice(source.indexOf("export async function withResult"), source.indexOf("export async function withLog"));
  const withLog = source.slice(source.indexOf("export async function withLog"));
  assert.match(withResult, /logError\(`action:\$\{name\}`, err, \{\}, \{ report: failure\.error === GENERIC_ERROR \}\)/);
  assert.match(withLog, /logError\(`action:\$\{name\}`, err, \{\}, \{ report: false \}\)/);
});
