import test from "node:test";
import assert from "node:assert/strict";
import { contactsWhoSaw, deleteEmailNote, deliveryLine, emailStateOf, emailStatesIn, partnersEmailState, sawComment } from "./delivery";

const sent = new Date("2026-10-23T15:03:00Z");

test("emailStateOf: queued until it is sent; sent with no error is emailed; closed with an error says nothing", () => {
  assert.equal(emailStateOf({ sentAt: null, lastError: null }), "queued");
  // A row a run has claimed (attempts above zero) but not finished is on its way: it can no longer be held back.
  assert.equal(emailStateOf({ sentAt: null, lastError: "temporary failure", attempts: 1 }), "sending");
  assert.equal(emailStateOf({ sentAt: null, lastError: null, attempts: 0 }), "queued");
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
  // A run has claimed the row: it may still go, so the toast promises nothing.
  assert.equal(deleteEmailNote("sending", "Zack"), null);
});

test("deliveryLine: an email a run is sending still reads as one on its way", () => {
  const line = deliveryLine({ to: "Zack", hasLogin: true, email: "sending", seenAt: null, eventAt: "2026-10-23T15:00:00Z" });
  assert.deepEqual(line, { state: "queued", to: "Zack" });
});

const wrote = new Date("2026-10-23T15:00:00Z");
const had = new Date("2026-10-20T12:00:00Z");

test("sawComment: a visit after it was written counts; the job opened before, or only later, does not", () => {
  const base = { accessSince: had, lastSeenAt: null, emails: [] };
  assert.equal(sawComment({ ...base, lastSeenAt: new Date("2026-10-23T15:30:00Z") }, wrote), true, "opened it since");
  assert.equal(sawComment({ ...base, lastSeenAt: new Date("2026-10-23T14:00:00Z") }, wrote), false, "last opened before it was written");
  assert.equal(sawComment(base, wrote), false, "never opened, never emailed");
  assert.equal(sawComment({ ...base, accessSince: new Date("2026-10-23T15:10:00Z"), lastSeenAt: new Date("2026-10-23T16:00:00Z") }, wrote), false, "got the job after it was written");
});

test("sawComment: only an email that went with no error counts", () => {
  const base = { accessSince: had, lastSeenAt: null };
  const at = new Date("2026-10-23T15:12:00Z");
  assert.equal(sawComment({ ...base, emails: [{ sentAt: at, lastError: null }] }, wrote), true);
  // Closed because nothing was left to send once the comment was dropped, or no login: nobody was told.
  assert.equal(sawComment({ ...base, emails: [{ sentAt: at, lastError: "nothing to send" }] }, wrote), false);
  assert.equal(sawComment({ ...base, emails: [{ sentAt: at, lastError: "no login" }] }, wrote), false);
  assert.equal(sawComment({ ...base, emails: [{ sentAt: null, lastError: null }] }, wrote), false, "still queued");
});

test("partnersEmailState: queued until every partner's email has gone, and silent when one was closed unsent", () => {
  const went = { sentAt: sent, lastError: null };
  const waiting = { sentAt: null, lastError: null };
  assert.equal(partnersEmailState([]), null, "no rows, no line");
  assert.equal(partnersEmailState([went, went]), "emailed");
  assert.equal(partnersEmailState([went, waiting]), "queued", "one partner's email is still waiting");
  assert.equal(partnersEmailState([waiting]), "queued");
  assert.equal(partnersEmailState([went, { sentAt: sent, lastError: "nothing to send" }]), null, "a row closed with an error told no one");
  // A claimed row is on its way, not sent.
  assert.equal(partnersEmailState([{ sentAt: null, lastError: "temporary failure" }]), "queued");
});

test("contactsWhoSaw: reads the facts once and keeps the contractors who could have read it", async () => {
  const asked: unknown[] = [];
  const db = {
    taskAccess: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        assert.equal(args.where.taskId, "t1");
        assert.equal(args.where.revokedAt, null);
        return [
          { contactId: "c-zack", createdAt: had },
          { contactId: "c-jose", createdAt: had },
          { contactId: "c-dee", createdAt: had },
        ];
      },
    },
    taskReadState: { findMany: async () => [{ contactId: "c-zack", lastSeenAt: new Date("2026-10-23T16:00:00Z") }, { contactId: "c-jose", lastSeenAt: new Date("2026-10-23T14:00:00Z") }] },
    notificationOutbox: {
      findMany: async (args: unknown) => {
        asked.push(args);
        return [
          { recipientContactId: "c-dee", sentAt: new Date("2026-10-23T15:12:00Z"), lastError: null },
          { recipientContactId: "c-jose", sentAt: new Date("2026-10-23T15:12:00Z"), lastError: "nothing to send" },
        ];
      },
    },
  };
  const saw = await contactsWhoSaw(db as never, { id: "ev1", taskId: "t1", createdAt: wrote, audienceContactId: null });
  assert.deepEqual(saw, ["c-zack", "c-dee"], "Zack opened it since, Dee was emailed, Jose had neither");
  // One read of the contractors' rows on this task whose items hold this event (`items @> [{"eventId": "ev1"}]`),
  // for their state only. Through the client: raw SQL naming the outbox is core.ts's and the send run's alone.
  assert.deepEqual(asked, [
    {
      where: { taskId: "t1", recipientContactId: { not: null }, items: { array_contains: [{ eventId: "ev1" }] } },
      select: { recipientContactId: true, sentAt: true, lastError: true },
    },
  ]);
});

test("contactsWhoSaw: a comment written to one contractor is checked for that one only", async () => {
  let asked: Record<string, unknown> = {};
  const db = {
    taskAccess: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        asked = args.where;
        return [];
      },
    },
    taskReadState: { findMany: async () => assert.fail("no access, nothing to read") },
    notificationOutbox: { findMany: async () => assert.fail("no access, nothing to read") },
  };
  assert.deepEqual(await contactsWhoSaw(db as never, { id: "ev1", taskId: "t1", createdAt: wrote, audienceContactId: "c-zack" }), []);
  assert.equal(asked.contactId, "c-zack");
});

test("emailStatesIn: asks the outbox once, for this contractor's rows on this task, by the event ids inside", async () => {
  const calls: unknown[] = [];
  const line = (eventId?: string) => ({ kind: "COMMENT", actorLabel: "Connor Swofford", summary: '"x"', at: sent.toISOString(), ...(eventId ? { eventId } : {}) });
  const db = {
    notificationOutbox: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [
          // A row mixing an old item (no eventId), a line this didn't ask about and one it did.
          { items: [line(), line("e9"), line("e1")], sentAt: null, lastError: null, attempts: 0 },
          { items: [line("e2")], sentAt: sent, lastError: null, attempts: 1 },
          { items: [line("e3")], sentAt: sent, lastError: "no login", attempts: 1 },
          { items: "junk", sentAt: null, lastError: null, attempts: 0 },
        ];
      },
    },
  };
  const states = await emailStatesIn(db as never, "t1", "c-zack", ["e1", "e2", "e3", "e4"]);
  assert.deepEqual([...states], [["e1", "queued"], ["e2", "emailed"]]);
  // One read: this contractor's rows on this task holding any of the events, through the client.
  assert.deepEqual(calls, [
    {
      where: {
        taskId: "t1",
        recipientContactId: "c-zack",
        OR: ["e1", "e2", "e3", "e4"].map((eventId) => ({ items: { array_contains: [{ eventId }] } })),
      },
      select: { items: true, sentAt: true, lastError: true, attempts: true },
    },
  ]);
  // Nothing to look up asks nothing.
  assert.equal((await emailStatesIn(db as never, "t1", "c-zack", [])).size, 0);
  assert.equal(calls.length, 1);
});
