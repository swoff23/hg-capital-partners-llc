import test from "node:test";
import assert from "node:assert/strict";
import { collapseStretches } from "@/lib/tasks/activity";
import { BURST_MS, buildDealLog, type LogSourceRow } from "./record-log";

let n = 0;
function row(over: Partial<LogSourceRow> & { at?: string }): LogSourceRow {
  n += 1;
  const createdAt = new Date(over.at ?? "2026-10-20T15:00:00Z");
  return {
    id: `r${n}`,
    source: "change",
    body: "",
    noteDate: createdAt,
    createdAt,
    authorUserId: "u1",
    authorName: "Connor Swofford",
    editedAt: null,
    data: {},
    ...over,
  };
}

const edit = (at: string, field: string, from: string | null, to: string | null, over: Partial<LogSourceRow> = {}) =>
  row({ at, body: `${field}: ${from ?? "—"} → ${to ?? "—"}`, data: { field, from, to }, ...over });

test("it reads newest first", () => {
  const log = buildDealLog([
    row({ source: "manual", body: "first", at: "2026-10-20T14:00:00Z" }),
    row({ source: "manual", body: "second", at: "2026-10-21T14:00:00Z" }),
  ]);
  assert.deepEqual(
    log.map((e) => e.type === "note" && e.text),
    ["second", "first"],
  );
});

test("a note shows its author's name and its text as typed", () => {
  const [entry] = buildDealLog([row({ source: "manual", body: "Seeing it tomorrow at 10.", authorName: "Pieter Louw", authorUserId: "u2" })]);
  assert.equal(entry.type, "note");
  if (entry.type !== "note") return;
  assert.equal(entry.author, "Pieter Louw");
  assert.equal(entry.authorUserId, "u2");
  assert.equal(entry.text, "Seeing it tomorrow at 10.");
});

test("an old note loses the name or initials pasted into its text, and names them as its author", () => {
  const entries = buildDealLog([
    row({ source: "manual", body: "seeing tomorrow (CS)", authorUserId: null, authorName: null, at: "2026-10-01T14:00:00Z" }),
    row({ source: "manual", body: "Called the agent  ·  Pieter Louw", authorUserId: null, authorName: null, at: "2026-10-02T14:00:00Z" }),
  ]);
  const [second, first] = entries;
  assert.ok(first.type === "note" && second.type === "note");
  if (first.type !== "note" || second.type !== "note") return;
  assert.deepEqual([first.text, first.author], ["seeing tomorrow", "CS"]);
  assert.deepEqual([second.text, second.author], ["Called the agent", "Pieter Louw"]);
  assert.equal(first.authorUserId, null, "nobody owns it until the backfill names an author");
});

test("a new note that ends in brackets keeps them", () => {
  const [entry] = buildDealLog([row({ source: "manual", body: "Hold the line (CS)", authorName: "Connor Swofford" })]);
  assert.equal(entry.type === "note" && entry.text, "Hold the line (CS)");
});

test("one person's edits within 30 minutes fold into one sentence with a row per field", () => {
  const log = buildDealLog([
    edit("2026-10-20T15:00:00Z", "theirPrice", "$425,000", "$410,000"),
    edit("2026-10-20T15:05:00Z", "status", "2 - Medium", "1 - High"),
    edit("2026-10-20T15:10:00Z", "passReason", null, "Call Friday"),
  ]);
  assert.equal(log.length, 1);
  const [entry] = log;
  assert.equal(entry.type, "change");
  if (entry.type !== "change") return;
  assert.equal(entry.sentence, "Connor changed the asking price and 2 other fields");
  assert.deepEqual(
    entry.fields.map((f) => [f.label, f.from, f.to]),
    [
      ["Asking price", "$425,000", "$410,000"],
      ["Stage", "Medium", "High"],
      ["Pass reason", null, "Call Friday"],
    ],
  );
  assert.deepEqual([entry.fields[0].fromAmount, entry.fields[0].toAmount], [425000, 410000], "a price carries its amounts for Money");
});

test("a single edit reads as its own sentence", () => {
  const [entry] = buildDealLog([edit("2026-10-20T15:00:00Z", "status", "2 - Medium", "1 - High", { authorName: "Pieter Louw", authorUserId: "u2" })]);
  assert.equal(entry.type === "change" && entry.sentence, "Pieter changed the stage to High");
});

test("a field edited twice in a burst shows its first and last value", () => {
  const [entry] = buildDealLog([
    edit("2026-10-20T15:00:00Z", "theirPrice", "$425,000", "$410,000"),
    edit("2026-10-20T15:03:00Z", "theirPrice", "$410,000", "$400,000"),
  ]);
  assert.ok(entry.type === "change");
  if (entry.type !== "change") return;
  assert.equal(entry.fields.length, 1);
  assert.deepEqual([entry.fields[0].from, entry.fields[0].to], ["$425,000", "$400,000"]);
});

test("a field that ended where it started shows nothing, and a burst of only those is gone", () => {
  assert.equal(
    buildDealLog([
      edit("2026-10-20T15:00:00Z", "status", "2 - Medium", "1 - High"),
      edit("2026-10-20T15:01:00Z", "status", "1 - High", "2 - Medium"),
    ]).length,
    0,
  );
  const [entry] = buildDealLog([
    edit("2026-10-20T15:00:00Z", "status", "2 - Medium", "1 - High"),
    edit("2026-10-20T15:01:00Z", "status", "1 - High", "2 - Medium"),
    edit("2026-10-20T15:02:00Z", "units", "4", "5"),
  ]);
  assert.ok(entry.type === "change");
  if (entry.type === "change") assert.deepEqual(entry.fields.map((f) => f.field), ["units"]);
});

test("a burst ends after 30 minutes, at another person, and at a note", () => {
  const t0 = Date.parse("2026-10-20T15:00:00Z");
  const iso = (ms: number) => new Date(ms).toISOString();
  assert.equal(buildDealLog([edit(iso(t0), "units", "4", "5"), edit(iso(t0 + BURST_MS + 60_000), "passReason", null, "x")]).length, 2, "31 minutes apart");
  assert.equal(buildDealLog([edit(iso(t0), "units", "4", "5"), edit(iso(t0 + BURST_MS - 60_000), "passReason", null, "x")]).length, 1, "29 minutes apart");
  assert.equal(
    buildDealLog([edit(iso(t0), "units", "4", "5"), edit(iso(t0 + 60_000), "passReason", null, "x", { authorUserId: "u2", authorName: "Pieter Louw" })]).length,
    2,
    "someone else ends it",
  );
  const withNote = buildDealLog([
    edit(iso(t0), "units", "4", "5"),
    row({ source: "manual", body: "hi", at: iso(t0 + 60_000) }),
    edit(iso(t0 + 120_000), "passReason", null, "x"),
  ]);
  assert.equal(withNote.length, 3, "a note ends it");
});

test("the 30 minutes run from the burst's first edit, not its latest", () => {
  const t0 = Date.parse("2026-10-20T15:00:00Z");
  const iso = (ms: number) => new Date(ms).toISOString();
  const log = buildDealLog([
    edit(iso(t0), "units", "4", "5"),
    edit(iso(t0 + 20 * 60_000), "passReason", null, "x"),
    edit(iso(t0 + 40 * 60_000), "priority", null, "A"),
  ]);
  assert.equal(log.length, 2, "the third is 40 minutes after the first");
});

test("next action edits are left out (it left the deal Nov 15, 2026), without ending the burst around them", () => {
  assert.equal(buildDealLog([edit("2026-10-20T15:00:00Z", "nextAction", null, "Call Friday")]).length, 0);
  const log = buildDealLog([
    edit("2026-10-20T15:00:00Z", "units", "4", "5"),
    edit("2026-10-20T15:05:00Z", "nextAction", null, "Call Friday"),
    edit("2026-10-20T15:10:00Z", "status", "2 - Medium", "1 - High"),
  ]);
  assert.equal(log.length, 1);
  const [entry] = log;
  assert.ok(entry.type === "change");
  if (entry.type === "change") assert.deepEqual(entry.fields.map((f) => f.field), ["units", "status"]);
  const old = row({ at: "2026-10-20T15:00:00Z", body: "Next action: — → Call Friday  ·  Connor Swofford", authorUserId: null, authorName: null });
  assert.equal(buildDealLog([old]).length, 0, "an old line read from its text too");
  const sheet = row({ at: "2026-10-20T15:00:00Z", body: "Next action: run numbers → —  ·  Spreadsheet", data: { field: "nextAction", from: "run numbers", to: null }, authorUserId: null, authorName: null });
  assert.equal(buildDealLog([sheet]).length, 0, "and one the spreadsheet refresh signed");
});

test("old change lines are read from their text, folded with the rest, and a no-op is left out", () => {
  const legacy = (at: string, body: string) => row({ at, body, authorUserId: null, authorName: null });
  const log = buildDealLog([
    legacy("2026-10-20T15:00:00Z", "Asking price: $425,000 → $410,000  ·  Connor Swofford"),
    legacy("2026-10-20T15:02:00Z", "Units: 8 → 9  ·  Connor Swofford"),
    legacy("2026-10-20T15:03:00Z", "Next action: — → —  ·  Connor Swofford"),
  ]);
  assert.equal(log.length, 1);
  const [entry] = log;
  assert.ok(entry.type === "change");
  if (entry.type !== "change") return;
  assert.equal(entry.sentence, "Connor changed the asking price and 1 other field");
});

test("a line that isn't a field edit stays a line and ends a burst", () => {
  const log = buildDealLog([
    edit("2026-10-20T15:00:00Z", "units", "4", "5"),
    row({ at: "2026-10-20T15:01:00Z", body: "Task added: Replace porch light", authorUserId: null, authorName: null }),
    edit("2026-10-20T15:02:00Z", "priority", null, "A"),
  ]);
  assert.deepEqual(
    log.map((e) => e.type),
    ["change", "line", "change"],
  );
  const line = log[1];
  assert.equal(line.type === "line" && line.text, "Task added: Replace porch light");
});

test("a note from the first version of the app names its author and drops the signature from its text", () => {
  const [entry] = buildDealLog([
    row({ source: "manual", body: "going to see it tomorrow\n\n\u2014 Connor Swofford", authorUserId: null, authorName: null, at: "2026-10-01T14:00:00Z" }),
  ]);
  assert.equal(entry.type === "note" && entry.author, "Connor Swofford");
  assert.equal(entry.type === "note" && entry.text, "going to see it tomorrow");
});

test("a line from the deals sheet names no one: no author is made up", () => {
  const log = buildDealLog([
    row({ source: "migration", body: "Called Oct 3", noteDate: new Date("2026-10-03T00:00:00Z"), authorUserId: null, authorName: null }),
    row({ source: "manual", body: "Typed, with nobody on the row", authorUserId: null, authorName: null, at: "2026-10-26T14:00:00Z" }),
  ]);
  for (const e of log) assert.equal(e.type === "note" && e.author, null);
});

test("a note carries the clientId it was sent with, so the note box can tell its send landed", () => {
  const [sent, plain] = buildDealLog([
    row({ source: "manual", body: "From the box", data: { clientId: "k1" }, at: "2026-10-26T14:00:00Z" }),
    row({ source: "manual", body: "Older", data: {}, at: "2026-10-25T14:00:00Z" }),
  ]);
  assert.equal(sent.type === "note" && sent.clientId, "k1");
  assert.equal(plain.type === "note" && plain.clientId, null);
});

test("an imported note has a day and no time; an undated one sits last, under no day", () => {
  const dated = row({ source: "migration", body: "Called Oct 3", noteDate: new Date("2026-10-03T00:00:00Z"), createdAt: new Date("2026-10-25T09:00:00Z"), authorUserId: null, authorName: null });
  const undated = row({ source: "migration", body: "Old line", noteDate: null, createdAt: new Date("2026-10-25T09:00:00Z"), authorUserId: null, authorName: null });
  const fresh = row({ source: "manual", body: "Typed today", at: "2026-10-26T14:00:00Z" });
  const log = buildDealLog([undated, dated, fresh]);
  assert.deepEqual(
    log.map((e) => (e.type === "note" ? e.text : "")),
    ["Typed today", "Called Oct 3", "Old line"],
  );
  const [, d, u] = log;
  assert.deepEqual([d.day, d.at], ["2026-10-03", null], "the sheet's date, read as a date");
  assert.deepEqual([u.day, u.at], [null, null]);
});

test("notes, stage changes, archive and the property link stay in view; other changes and task lines don't", () => {
  const log = buildDealLog([
    row({ source: "manual", body: "Walked it", at: "2026-10-20T15:00:00Z" }),
    edit("2026-10-21T15:00:00Z", "theirPrice", "$425,000", "$410,000"),
    edit("2026-10-22T15:00:00Z", "status", "2 - Medium", "1 - High"),
    row({ at: "2026-10-23T15:00:00Z", body: "Task added: Replace porch light", authorUserId: null, authorName: null }),
    row({ at: "2026-10-24T15:00:00Z", body: "Deal archived", data: { event: "archived" } }),
    row({ at: "2026-10-25T15:00:00Z", body: "Linked to 118 Congress St." }),
  ]);
  assert.deepEqual(
    log.map((e) => [e.type, e.anchor, e.kinds]),
    [
      ["line", true, []],
      ["line", true, []],
      ["line", false, ["tasks"]],
      ["change", true, ["stage"]],
      ["change", false, ["asking price"]],
      ["note", true, []],
    ],
  );
});

test("newest first, a stretch of deal changes keeps its newest 2 on top", () => {
  const log = buildDealLog([
    row({ source: "manual", body: "Older note", at: "2026-10-20T15:00:00Z" }),
    ...[1, 2, 3, 4, 5].map((d) => edit(`2026-10-2${d}T15:00:00Z`, "units", String(d), String(d + 1))),
    row({ source: "manual", body: "Newer note", at: "2026-10-27T15:00:00Z" }),
  ]);
  const out = collapseStretches(log, { isAnchor: (e) => e.anchor, idOf: (e) => e.id, newestFirst: true });
  assert.deepEqual(
    out.map((x) => (x.type === "row" ? x.row.type : `collapsed:${x.rows.length}`)),
    ["note", "change", "change", "collapsed:3", "note"],
  );
  const collapsed = out[3];
  assert.ok(collapsed.type === "collapsed");
  assert.deepEqual(
    collapsed.rows.map((e) => e.day),
    ["2026-10-23", "2026-10-22", "2026-10-21"],
    "still newest first",
  );
});

test("archive and restore read with the person first, and close a burst of edits", () => {
  const entries = buildDealLog([
    edit("2026-10-27T14:00:00Z", "status", "1 - High", "Pass"),
    row({ at: "2026-10-27T14:05:00Z", body: "Deal archived", data: { event: "archived" } }),
    row({ at: "2026-10-27T14:10:00Z", body: "Deal restored", data: { event: "restored" }, authorName: "Pieter Louw", authorUserId: "u2" }),
    row({ at: "2026-10-27T14:12:00Z", body: "Deal archived", data: { event: "archived" }, authorName: null, authorUserId: null }),
  ]);
  assert.deepEqual(
    entries.map((e) => [e.type, e.type === "line" ? e.text : e.type === "change" ? e.sentence : "", e.type === "line" ? e.by : undefined]),
    [
      ["line", "Someone archived this deal", null],
      ["line", "Pieter restored this deal", null],
      ["line", "Connor archived this deal", null],
      ["change", "Connor changed the stage to Pass", undefined],
    ],
  );
});
