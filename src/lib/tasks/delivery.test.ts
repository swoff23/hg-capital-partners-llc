import test from "node:test";
import assert from "node:assert/strict";
import { deleteEmailNote, deliveryLine, emailStateOf, emailStatesIn } from "./delivery";

const sent = new Date("2026-10-23T15:03:00Z");

test("emailStateOf: queued until it is sent; sent with no error is emailed; closed with an error says nothing", () => {
  assert.equal(emailStateOf({ sentAt: null, lastError: null }), "queued");
  // A row a run has claimed (attempts above zero) but not finished is still on its way.
  assert.equal(emailStateOf({ sentAt: null, lastError: "temporary failure" }), "queued");
  assert.equal(emailStateOf({ sentAt: sent, lastError: null }), "emailed");
  // Skipped (no login, no access) or given up: no email went, so the line never claims one.
  assert.equal(emailStateOf({ sentAt: sent, lastError: "no login" }), null);
  assert.equal(emailStateOf({ sentAt: sent, lastError: "gave up: Resend 500" }), null);
  assert.equal(emailStateOf({ sentAt: sent, lastError: "nothing to send" }), null);
});

test("deliveryLine: no login, then seen, then the email, else nothing", () => {
  const base = { to: "Zack", hasLogin: true, email: null, seenAt: null, eventAt: "2026-10-23T15:00:00Z" } as const;
  assert.deepEqual(deliveryLine({ ...base, hasLogin: false, email: "queued" }), { state: "no-login", to: "Zack" });
  assert.deepEqual(deliveryLine({ ...base, email: "queued" }), { state: "queued", to: "Zack" });
  assert.deepEqual(deliveryLine({ ...base, email: "emailed" }), { state: "emailed", to: "Zack" });
  assert.equal(deliveryLine(base), null, "an entry with no email on record says nothing");
  // He opened the job after it: Seen wins over the email, being the later fact.
  assert.deepEqual(deliveryLine({ ...base, email: "emailed", seenAt: new Date("2026-10-23T18:14:00Z") }), { state: "seen", to: "Zack", at: "2026-10-23T18:14:00.000Z" });
  // He opened it before the entry was written: not seen yet.
  assert.deepEqual(deliveryLine({ ...base, email: "queued", seenAt: new Date("2026-10-23T14:00:00Z") }), { state: "queued", to: "Zack" });
  assert.equal(deliveryLine({ ...base, seenAt: "2026-10-23T14:00:00Z" }), null);
});

test("deleteEmailNote: what the delete toast says about the email", () => {
  assert.equal(deleteEmailNote("queued", "Zack"), "Zack won't get it");
  assert.equal(deleteEmailNote("emailed", "Zack"), "Zack already got the email");
  assert.equal(deleteEmailNote(null, "Zack"), null);
  assert.equal(deleteEmailNote("queued", null), null);
});

test("emailStatesIn: asks the outbox once, for this contractor's rows on this task, by the event ids inside", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const db = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: strings.join("?"), values });
      return [
        { eventId: "e1", sentAt: null, lastError: null },
        { eventId: "e2", sentAt: sent, lastError: null },
        { eventId: "e3", sentAt: sent, lastError: "no login" },
      ];
    },
  };
  const states = await emailStatesIn(db as never, "t1", "c-zack", ["e1", "e2", "e3", "e4"]);
  assert.deepEqual([...states], [["e1", "queued"], ["e2", "emailed"]]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /jsonb_array_elements\(o\."items"\)/);
  assert.match(calls[0].sql, /o\."taskId" = \?\s+AND o\."recipientContactId" = \?/);
  assert.match(calls[0].sql, /item->>'eventId' IN/);
  assert.ok(!calls[0].sql.includes("c-zack") && !calls[0].sql.includes("e1"), "ids are parameters");
  // Nothing to look up asks nothing.
  assert.equal((await emailStatesIn(db as never, "t1", "c-zack", [])).size, 0);
  assert.equal(calls.length, 1);
});
