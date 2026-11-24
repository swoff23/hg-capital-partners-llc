import test from "node:test";
import assert from "node:assert/strict";
import { deliveryEvent, emailProblemOf } from "./delivery-events";

// docs/specs/emails-redesign.md, section 5. The writes are in delivery-events.pg.test.ts.

const AT = "2026-11-22T23:41:12.126Z";
const SENT = "2026-11-22T23:41:11.894Z";
const event = (type: string, data: Record<string, unknown> = {}, createdAt: unknown = AT) => ({
  type,
  created_at: createdAt,
  data: { created_at: SENT, email_id: "56761188", from: "HG Capital <jobs@mail.hg.test>", to: ["Zack@Example.com"], subject: "New: Fix the sink", ...data },
});

test("the four delivery events are read with their address and the event's own time", () => {
  for (const kind of ["bounced", "suppressed", "complained", "delivered"] as const) {
    assert.deepEqual(deliveryEvent(event(`email.${kind}`)), { kind, to: ["zack@example.com"], at: new Date(AT) });
  }
});

test("Resend's example payloads: a permanent bounce and a suppression with their own detail", () => {
  const bounced = event("email.bounced", { bounce: { type: "Permanent", subType: "Suppressed", message: "The recipient is on a suppression list." } });
  assert.equal(deliveryEvent(bounced)?.kind, "bounced");
  const suppressed = event("email.suppressed", { suppressed: { type: "OnAccountSuppressionList", message: "…" } });
  assert.equal(deliveryEvent(suppressed)?.kind, "suppressed");
});

test("a temporary bounce is a delay, not an address that's gone", () => {
  assert.equal(deliveryEvent(event("email.bounced", { bounce: { type: "Transient" } })), null);
  assert.equal(deliveryEvent(event("email.bounced", { bounce: { type: "temporary" } })), null);
  assert.equal(deliveryEvent(event("email.bounced", { bounce: { type: "Undetermined" } }))?.kind, "bounced", "only a named delay is let off");
});

test("any other event, or one that names no address or time, is not a delivery event", () => {
  for (const type of ["email.received", "email.sent", "email.opened", "email.clicked", "email.delivery_delayed", "email.failed", "contact.created", "email.bounced.x"]) {
    assert.equal(deliveryEvent(event(type)), null, type);
  }
  assert.equal(deliveryEvent(event("email.bounced", { to: [] })), null);
  assert.equal(deliveryEvent(event("email.bounced", { to: ["not an address"] })), null);
  assert.equal(deliveryEvent(null), null);
  assert.equal(deliveryEvent("email.bounced"), null);
  assert.equal(deliveryEvent({ type: "email.bounced" }), null);
});

test("addresses come out bare, lowercased and once; the email's time stands in when the event's is missing", () => {
  const ev = deliveryEvent(event("email.complained", { to: ["Zack <ZACK@example.com>", "zack@example.com", "pieter@hg.test"] }, null));
  assert.deepEqual(ev, { kind: "complained", to: ["zack@example.com", "pieter@hg.test"], at: new Date(SENT) });
  assert.deepEqual(deliveryEvent(event("email.delivered", { to: "zack@example.com" }))?.to, ["zack@example.com"], "a lone string");
});

test("a problem counts only while it is about the row's current address", () => {
  const row = { email: "zack@example.com", emailProblem: "BOUNCED" as const, emailEventTo: "zack@example.com" };
  assert.equal(emailProblemOf(row), "BOUNCED");
  assert.equal(emailProblemOf({ ...row, email: "Zack@Example.com" }), "BOUNCED", "a partner's address may have capitals");
  assert.equal(emailProblemOf({ ...row, email: "zack.new@example.com" }), null, "the address changed: cleared");
  assert.equal(emailProblemOf({ ...row, emailProblem: null }), null);
  assert.equal(emailProblemOf({ ...row, emailEventTo: null }), null);
  assert.equal(emailProblemOf(null), null);
});
