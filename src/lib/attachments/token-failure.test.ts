import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { TOKEN_BUSY_MESSAGE, UploadRefusal, tokenFailure } from "./token-failure";

test("a refusal the route threw on purpose is a 400 with its own words", () => {
  assert.deepEqual(tokenFailure(new UploadRefusal("Not found"), "blob.generate-client-token"), { status: 400, message: "Not found" });
  assert.deepEqual(tokenFailure(new UploadRefusal("You don't have access to this job.")), { status: 400, message: "You don't have access to this job." });
});

test("a refusal no Retry can change (the job closed) is a 400 that says final, and no other is", () => {
  assert.deepEqual(tokenFailure(new UploadRefusal("This job is closed.", true)), { status: 400, message: "This job is closed.", final: true });
  assert.equal("final" in tokenFailure(new UploadRefusal("This job is closed.")), false, "final is the route's call, per refusal");
  assert.equal("final" in tokenFailure(new Error("This job is closed.")), false);
});

test("anything the route did not expect is a 503, so a blip never reads as a refusal", () => {
  const prisma = new Prisma.PrismaClientKnownRequestError("Can't reach database server", { code: "P1001", clientVersion: "test" });
  for (const err of [prisma, new Error("connect ECONNREFUSED 127.0.0.1:5432"), new TypeError("fetch failed"), "boom", null, undefined]) {
    assert.deepEqual(tokenFailure(err, "blob.generate-client-token"), { status: 503, message: TOKEN_BUSY_MESSAGE }, String(err));
  }
  // A plain Error is not a refusal, whatever it says.
  assert.equal(tokenFailure(new Error("This job is closed.")).status, 503);
});

test("Blob's upload-completed callback has no database behind it, so whatever it throws is a bad request", () => {
  assert.equal(tokenFailure(new Error("Invalid callback signature"), "blob.upload-completed").status, 400);
  assert.equal(tokenFailure(new Error("Invalid callback signature"), "blob.generate-client-token").status, 503);
});

test("the route answers through tokenFailure and throws UploadRefusal for what it refuses", () => {
  const route = readFileSync("src/app/api/blob/[kind]/route.ts", "utf8");
  assert.match(route, /tokenFailure\(err, body\.type\)/);
  // No answer in the catch is a flat 400, and nothing in the route throws a bare Error for a refusal.
  const afterCatch = route.slice(route.lastIndexOf("} catch (err) {"));
  assert.doesNotMatch(afterCatch, /status:\s*400/);
  assert.doesNotMatch(route, /throw new Error\(/);
  assert.match(route, /throw new UploadRefusal\(/);
});

test("the portal token is refused as final exactly when the record step would say so, and the 400 carries it", () => {
  const route = readFileSync("src/app/api/blob/[kind]/route.ts", "utf8");
  // One predicate (access.ts isFinalRefusal) for both steps, so a closed job reads the same wherever the file meets it.
  assert.match(route, /if \(refusal\) throw new UploadRefusal\(refusal, isFinalRefusal\(refusal\)\);/);
  assert.match(route, /\.\.\.\(failure\.final \? \{ final: true \} : \{\}\)/);
  // Only the portal kind asks contractorUploadRefusal, so no staff or property kind can be final.
  assert.equal(route.match(/isFinalRefusal\(/g)?.length, 1);
});
