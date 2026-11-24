import test from "node:test";
import assert from "node:assert/strict";
import { NAMED_INBOXES, fallbackInbox, inboxFor, receivingDomain } from "./inboxes";

const DOMAIN = "mail.hg.com";
const TOKEN = "a".repeat(20) + "_-" + "b".repeat(21);

test("the receiving domain is EMAIL_FROM's", () => {
  assert.equal(receivingDomain("HG Capital <jobs@Mail.HG.com>"), "mail.hg.com");
  assert.equal(receivingDomain("jobs@mail.hg.com"), "mail.hg.com");
  assert.equal(receivingDomain("nobody"), null);
});

test("an invoice email goes to the invoice inbox, never the reply path", () => {
  assert.equal(NAMED_INBOXES.invoices, "invoices");
  assert.equal(inboxFor(["invoices@mail.hg.com"], DOMAIN), "invoices");
  assert.equal(inboxFor(["HG Capital Invoices <Invoices@MAIL.hg.com>"], DOMAIN), "invoices");
  // Forwarded with a Bcc: only Resend's received_for names it, and recipientsOf reads that too.
  assert.equal(inboxFor(["pieter@gmail.com", "invoices@mail.hg.com"], DOMAIN), "invoices");
  // Cc'd alongside the plain jobs address, it is still an invoice email.
  assert.equal(inboxFor(["jobs@mail.hg.com", "invoices@mail.hg.com"], DOMAIN), "invoices");
});

test("a job reply goes to the reply path, never the invoice inbox", () => {
  assert.equal(inboxFor([`r+${TOKEN}@mail.hg.com`], DOMAIN), "reply");
  assert.equal(inboxFor(["jobs@mail.hg.com"], DOMAIN), "reply");
  // A reply token wins over the invoice address: it's the job's own secret, and a Done job's bill files there (4.2).
  assert.equal(inboxFor([`Jobs <r+${TOKEN}@mail.hg.com>`, "invoices@mail.hg.com"], DOMAIN), "reply");
  // Anything else on the domain keeps going where it always went.
  assert.equal(inboxFor(["hello@mail.hg.com"], DOMAIN), "reply");
  assert.equal(inboxFor([], DOMAIN), "reply");
});

test("the invoice address counts only on our own domain, whole", () => {
  assert.equal(inboxFor(["invoices@gmail.com"], DOMAIN), "reply");
  assert.equal(inboxFor(["invoices@evil-mail.hg.com"], DOMAIN), "reply");
  assert.equal(inboxFor(["invoices@mail.hg.com.evil.com"], DOMAIN), "reply");
  assert.equal(inboxFor(["my-invoices@mail.hg.com", "invoices2@mail.hg.com"], DOMAIN), "reply");
  assert.equal(inboxFor(['"invoices@mail.hg.com" <zack@gmail.com>'], DOMAIN), "reply", "a display name isn't the address");
  // No EMAIL_FROM, no domain of ours: nothing is an invoice email.
  assert.equal(inboxFor(["invoices@mail.hg.com"], null), "reply");
});

test("a reply token counts only on our own domain", () => {
  assert.equal(inboxFor([`r+${TOKEN}@other.example.com`, "invoices@mail.hg.com"], DOMAIN), "invoices");
  assert.equal(inboxFor([`Jobs <r+${TOKEN}@Mail.HG.com>`, "invoices@mail.hg.com"], DOMAIN), "reply");
  // On its own, a foreign r+ address still goes where unmatched mail always went.
  assert.equal(inboxFor([`r+${TOKEN}@other.example.com`], DOMAIN), "reply");
});

test("a reply no job takes goes on to invoices@ when it went there too", () => {
  const both = [`r+${TOKEN}@mail.hg.com`, "invoices@mail.hg.com"];
  assert.equal(fallbackInbox({ outcome: "ignored", reason: "no job" }, both, DOMAIN), "invoices");
  // Forwarded to the partners for a job the sender can't post on: the bill still lands in Invoices.
  assert.equal(fallbackInbox({ outcome: "forwarded", why: "off-task" }, both, DOMAIN), "invoices");
  assert.equal(fallbackInbox({ outcome: "forwarded", why: "old-link" }, both, DOMAIN), "invoices");
  assert.equal(fallbackInbox({ outcome: "forwarded", why: "login-off" }, both, DOMAIN), "invoices");
  assert.equal(fallbackInbox({ outcome: "forwarded", why: "no-job" }, [`r+${TOKEN}@mail.hg.com`, "Invoices <invoices@mail.hg.com>"], DOMAIN), "invoices");
  // The reply path's answer stands when it took the email, or turned it down for any other reason.
  assert.equal(fallbackInbox({ outcome: "forwarded", why: "closed" }, both, DOMAIN), null);
  assert.equal(fallbackInbox({ outcome: "forwarded", why: "off-task", invoiced: true }, both, DOMAIN), null);
  assert.equal(fallbackInbox({ outcome: "forwarded", why: "off-task" }, [`r+${TOKEN}@mail.hg.com`], DOMAIN), null);
  assert.equal(fallbackInbox({ outcome: "ignored", reason: "automatic reply" }, both, DOMAIN), null);
  assert.equal(fallbackInbox({ outcome: "ignored", reason: "already posted" }, both, DOMAIN), null);
  // Without invoices@ on our domain there is nowhere else to go.
  assert.equal(fallbackInbox({ outcome: "ignored", reason: "no job" }, [`r+${TOKEN}@mail.hg.com`], DOMAIN), null);
  assert.equal(fallbackInbox({ outcome: "ignored", reason: "no job" }, [`r+${TOKEN}@mail.hg.com`, "invoices@gmail.com"], DOMAIN), null);
});
