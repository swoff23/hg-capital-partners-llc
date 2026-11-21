import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BRAND } from "@/lib/brand";
import { TOAST_PHONE_CHARS } from "@/lib/toast-line";
import {
  APPROVAL_EXPIRED,
  CLAUDE_LINES,
  CONNECT_STEPS,
  claudeRows,
  claudeSectionVisible,
  connectionLine,
  connectionParts,
  disconnectedMessage,
  usedLabel,
} from "./claude-state";

// Noon Eastern on Nov 20, 2026.
const NOW = new Date("2026-11-20T17:00:00Z");

test("used today, yesterday and an earlier day", () => {
  assert.equal(usedLabel(new Date("2026-11-20T14:00:00Z"), NOW), "Used today");
  assert.equal(usedLabel(new Date("2026-11-19T20:00:00Z"), NOW), "Used yesterday");
  assert.equal(usedLabel(new Date("2026-11-18T20:00:00Z"), NOW), "Used Nov 18");
});

test("a late evening use counts as that Eastern day", () => {
  // 11 pm Nov 19 Eastern is already Nov 20 UTC.
  assert.equal(usedLabel(new Date("2026-11-20T04:00:00Z"), NOW), "Used yesterday");
});

test("a use in another year names the year", () => {
  assert.equal(usedLabel(new Date("2025-12-30T17:00:00Z"), NOW), "Used Dec 30, 2025");
});

test("the connected line", () => {
  const connectedAt = new Date("2026-11-20T15:00:00Z");
  assert.equal(connectionLine({ connectedAt, lastUsedAt: new Date("2026-11-20T16:00:00Z") }, NOW), "Connected Nov 20 · Used today");
  assert.equal(connectionLine({ connectedAt, lastUsedAt: null }, NOW), "Connected Nov 20");
});

test("a phone drops the first half once there is a use, and keeps 'Connected' before one", () => {
  const connectedAt = new Date("2026-11-20T15:00:00Z");
  assert.deepEqual(connectionParts({ connectedAt, lastUsedAt: new Date("2026-11-20T16:00:00Z") }, NOW), { lead: "Connected Nov 20 · ", tail: "Used today" });
  assert.deepEqual(connectionParts({ connectedAt, lastUsedAt: null }, NOW), { lead: "", tail: "Connected Nov 20" });
});

test("rows: the state halves, the first name, and Connect only on the viewer's own unconnected row", () => {
  const partners = [
    { userId: "a", name: "Connor Swofford", email: "c@x.com", connection: { connectedAt: new Date("2026-11-20T15:00:00Z"), lastUsedAt: null } },
    { userId: "b", name: null, email: "p@x.com", connection: null },
    { userId: "c", name: "Pieter Vandenberg", email: "v@x.com", connection: null },
  ];
  assert.deepEqual(claudeRows(partners, "b", NOW, true), [
    { userId: "a", name: "Connor Swofford", first: "Connor", lead: "", tail: "Connected Nov 20", connected: true, canConnect: false },
    { userId: "b", name: "p@x.com", first: "p@x.com", lead: "", tail: "Not connected", connected: false, canConnect: true },
    { userId: "c", name: "Pieter Vandenberg", first: "Pieter", lead: "", tail: "Not connected", connected: false, canConnect: false },
  ]);
});

test("with the connector off no row offers Connect, and connected rows still do", () => {
  const rows = claudeRows(
    [
      { userId: "a", name: "Connor Swofford", email: "c@x.com", connection: { connectedAt: new Date("2026-11-20T15:00:00Z"), lastUsedAt: new Date("2026-11-20T16:00:00Z") } },
      { userId: "b", name: "Pieter", email: "p@x.com", connection: null },
    ],
    "b",
    NOW,
    false,
  );
  assert.equal(rows.some((r) => r.canConnect), false);
  assert.equal(rows[0].connected, true);
});

test("the Claude section shows while the connector is on, or off with a connection on record", () => {
  assert.equal(claudeSectionVisible(true, false), true);
  assert.equal(claudeSectionVisible(true, true), true);
  assert.equal(claudeSectionVisible(false, true), true);
  assert.equal(claudeSectionVisible(false, false), false);
});

test("the disconnect toast uses the first name, with a shorter twin for a phone", () => {
  assert.deepEqual(disconnectedMessage("Pieter Vandenberg"), { message: "Claude disconnected for Pieter.", phoneMessage: "Disconnected for Pieter." });
  assert.deepEqual(disconnectedMessage(null), { message: "Claude disconnected.", phoneMessage: "Disconnected." });
  assert.ok(disconnectedMessage("Pieter").phoneMessage.length <= TOAST_PHONE_CHARS);
});

test("every toast line shows whole on a phone", () => {
  for (const [key, line] of Object.entries(CLAUDE_LINES)) {
    assert.ok(line.length <= TOAST_PHONE_CHARS, `${key} is ${line.length} characters`);
  }
});

test("the steps follow Claude's own dialog, and the name comes from the brand", () => {
  assert.deepEqual(CONNECT_STEPS, [
    "Copy your address.",
    "In Claude, open Customize, Connectors, Add custom connector.",
    "Name it HG Capital, paste the address, then Continue and Add.",
    "Tap Connect, then Allow.",
  ]);
  assert.ok(CONNECT_STEPS[2].includes(BRAND.app));
});

test("no line says the old 10-minute window, and none uses an em dash", () => {
  const all = [...CONNECT_STEPS, ...Object.values(CLAUDE_LINES), APPROVAL_EXPIRED].join("\n");
  assert.doesNotMatch(all, /10 minutes|minutes|—/);
  assert.equal(APPROVAL_EXPIRED, "This link has expired. Try again from Claude.");
});

// Source pins: the screens' rules that no pure function carries.
function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

test("the screens carry no trace of the pairing window", () => {
  for (const f of ["./actions.ts", "./claude-rows.tsx", "./connect-steps.tsx", "./(list)/page.tsx", "./approve/page.tsx", "./approve/approve-actions.tsx"]) {
    assert.doesNotMatch(source(f), /startPairing|connectorUrl|\buntil\b|10 minutes|10-minute/, f);
  }
});

test("closing the Connect sheet refreshes the page", () => {
  const rows = source("./claude-rows.tsx");
  assert.match(rows, /router\.refresh\(\)/);
  assert.match(rows, /aria-label=\{`Disconnect \$\{row\.first\}`\}/);
});

test("Allow and Cancel both send the request id the card was drawn for", () => {
  const actions = source("./actions.ts");
  assert.match(actions, /approvePending\(user, rid\)/);
  assert.match(actions, /denyPending\(user, rid\)/);
  const form = source("./approve/approve-actions.tsx");
  assert.match(form, /<input type="hidden" name="rid" value=\{rid\} \/>/);
  const page = source("./approve/page.tsx");
  assert.match(page, /readPendingApproval\(user, r\)/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /<h1 className="sr-only">Connect Claude<\/h1>/);
});

test("the Settings list stays reachable while the connector is off", () => {
  assert.match(source("./(list)/page.tsx"), /claudeSectionVisible\(/);
  assert.match(source("../layout.tsx"), /claudeSectionVisible\(/);
});
