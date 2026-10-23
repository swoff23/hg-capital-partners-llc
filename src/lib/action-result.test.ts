import test from "node:test";
import assert from "node:assert/strict";
import { notFound } from "next/navigation";
import { z } from "zod";
import { GENERIC_ERROR, OFFLINE_ERROR, callAction, isOfflineError, userMessage } from "./action-result";

test("zod errors name the field and the first issue", () => {
  const r = z.object({ address: z.string().min(4) }).safeParse({ address: "ab" });
  assert.equal(r.success, false);
  const msg = userMessage(r.error);
  assert.match(msg, /^Invalid address: /);
});

test("our own thrown messages pass through", () => {
  assert.equal(userMessage(new Error("Keep at least one equipment rule.")), "Keep at least one equipment rule.");
});

test("infrastructure errors become the generic line", () => {
  const prisma = new Error("Invalid `prisma.task.update()` invocation");
  prisma.name = "PrismaClientKnownRequestError";
  assert.equal(userMessage(prisma), GENERIC_ERROR);
  assert.equal(userMessage(new Error("connect ECONNREFUSED 127.0.0.1:5432")), GENERIC_ERROR);
  assert.equal(userMessage(new Error("x".repeat(500))), GENERIC_ERROR);
  assert.equal(userMessage(new Error("")), GENERIC_ERROR);
  assert.equal(userMessage("string"), GENERIC_ERROR);
  assert.equal(userMessage(undefined), GENERIC_ERROR);
});

test("callAction passes a result through, ok or refused", async () => {
  assert.deepEqual(await callAction(async () => ({ ok: true, data: { id: "t1" } })), { ok: true, data: { id: "t1" } });
  assert.deepEqual(await callAction(async () => ({ ok: false, error: "This job is closed." })), {
    ok: false,
    error: "This job is closed.",
  });
});

test("callAction turns a dropped connection into the offline line", async () => {
  // What each browser's fetch rejects with when there's no signal.
  for (const message of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "fetch failed"]) {
    const res = await callAction(() => Promise.reject(new TypeError(message)));
    assert.deepEqual(res, { ok: false, error: OFFLINE_ERROR }, message);
  }
});

test("callAction turns anything else thrown into the generic line", async () => {
  const unexpected = new Error("An unexpected response was received from the server.");
  assert.deepEqual(await callAction(() => Promise.reject(unexpected)), { ok: false, error: GENERIC_ERROR });
  // A bug, not the network.
  const bug = new TypeError("Cannot read properties of undefined (reading 'id')");
  assert.deepEqual(await callAction(() => Promise.reject(bug)), { ok: false, error: GENERIC_ERROR });
  assert.deepEqual(
    await callAction(() => {
      throw "boom";
    }),
    { ok: false, error: GENERIC_ERROR },
  );
});

test("callAction lets Next's redirect and notFound through", async () => {
  // An action that redirects rejects on the client with Next's redirect error (server-action-reducer).
  const redirectErr = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/tasks;307;" });
  await assert.rejects(
    callAction(() => Promise.reject(redirectErr)),
    (e) => e === redirectErr,
  );
  let missing: unknown;
  try {
    notFound();
  } catch (e) {
    missing = e;
  }
  await assert.rejects(
    callAction(() => Promise.reject(missing)),
    (e) => e === missing,
  );
});

test("isOfflineError believes the browser when it says it's offline", () => {
  const unexpected = new Error("An unexpected response was received from the server.");
  assert.equal(isOfflineError(unexpected), false);
  const saved = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
  try {
    assert.equal(isOfflineError(unexpected), true);
  } finally {
    if (saved) Object.defineProperty(globalThis, "navigator", saved);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
  assert.equal(isOfflineError(unexpected), false);
});
