import test from "node:test";
import assert from "node:assert/strict";
import { WRONG_SIGN_IN, appScope, assertQueueOwner, ownerRefusal, portalScope, withQueueOwner } from "./queue-owner";

test("a queue's scope is its person's: the app's by user, the portal's by contact", () => {
  assert.equal(appScope("u1"), "app:u1");
  assert.equal(portalScope("c-zack"), "portal:c-zack");
});

test("a request from the signed-in person's own queue passes", () => {
  assert.equal(ownerRefusal("portal:c-mike", portalScope("c-mike")), null);
  assert.equal(ownerRefusal("app:u1", appScope("u1")), null);
  assert.doesNotThrow(() => assertQueueOwner("portal:c-mike", portalScope("c-mike")));
});

test("a request from another person's queue is refused: Zack's tab after Mike signed in", () => {
  assert.equal(ownerRefusal("portal:c-zack", portalScope("c-mike")), WRONG_SIGN_IN);
  assert.throws(() => assertQueueOwner("portal:c-zack", portalScope("c-mike")), { message: WRONG_SIGN_IN });
});

test("the app's queue is never taken for the portal's, nor the portal's for the app's, even with the same id", () => {
  assert.equal(ownerRefusal("app:x1", portalScope("x1")), WRONG_SIGN_IN);
  assert.equal(ownerRefusal("portal:x1", appScope("x1")), WRONG_SIGN_IN);
});

test("anything that isn't the exact scope is refused, not read loosely", () => {
  for (const sent of ["", "portal:c-mike ", "PORTAL:c-mike", "portal:signed-out", 7, {}, ["portal:c-mike"], false]) {
    assert.equal(ownerRefusal(sent, portalScope("c-mike")), WRONG_SIGN_IN, JSON.stringify(sent));
  }
});

test("a request that names no owner (a tab from before this shipped) is let through", () => {
  assert.equal(ownerRefusal(undefined, portalScope("c-mike")), null);
  assert.equal(ownerRefusal(null, portalScope("c-mike")), null);
});

test("the refusal reads as one plain line with no dash", () => {
  assert.ok(!WRONG_SIGN_IN.includes("—"));
  assert.ok(WRONG_SIGN_IN.endsWith("."));
});

test("withQueueOwner: another sign-in's queue is refused before the write runs; the owner's, and an unnamed one, write", async () => {
  // The portal's Send and Mark done run their write through it (composer-owner.test.ts pins that they do).
  const writes: string[] = [];
  const write = (what: string) => async () => {
    writes.push(what);
    return what;
  };
  const mike = portalScope("c-mike");
  await assert.rejects(withQueueOwner(portalScope("c-zack"), mike, write("zack's send")), { message: WRONG_SIGN_IN });
  await assert.rejects(withQueueOwner(appScope("c-mike"), mike, write("app queue")), { message: WRONG_SIGN_IN });
  assert.deepEqual(writes, [], "nothing was written for either");
  assert.equal(await withQueueOwner(mike, mike, write("mike's send")), "mike's send");
  assert.equal(await withQueueOwner(undefined, mike, write("old tab")), "old tab");
  assert.equal(await withQueueOwner(null, mike, write("unnamed")), "unnamed");
  assert.deepEqual(writes, ["mike's send", "old tab", "unnamed"]);
  // What the write throws is its own: the check does not swallow it.
  await assert.rejects(
    withQueueOwner(mike, mike, async () => {
      throw new Error("That job is closed.");
    }),
    { message: "That job is closed." },
  );
});
