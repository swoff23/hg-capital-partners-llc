import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { GENERIC_ERROR, userMessage } from "./action-result";

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
