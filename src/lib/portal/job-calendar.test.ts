import test from "node:test";
import assert from "node:assert/strict";
import { foldIcsLine, icsText, jobCalendar } from "./job-calendar";

const input = {
  taskId: "t1",
  title: "Replace kitchen faucet",
  where: "118 Congress St · Rear",
  address: "118 Congress St, Buffalo, NY 14213",
  date: "2026-11-23",
  url: "https://hg.example.com/j/abc",
  now: new Date("2026-11-14T15:04:05.678Z"),
  domain: "hg.example.com",
};

test("one all-day event on the job's date, ending the next day, named for the job and its place", () => {
  const ics = jobCalendar(input);
  const lines = ics.split("\r\n");
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20261123"));
  assert.ok(lines.includes("DTEND;VALUE=DATE:20261124"));
  assert.ok(lines.includes("UID:job-t1@hg.example.com"));
  assert.ok(lines.includes("DTSTAMP:20261114T150405Z"));
  assert.ok(lines.includes("SUMMARY:Replace kitchen faucet\\, 118 Congress St · Rear"));
  assert.ok(lines.includes("LOCATION:118 Congress St\\, Buffalo\\, NY 14213"));
  assert.ok(lines.includes("URL:https://hg.example.com/j/abc"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  // A month's last day rolls over.
  assert.ok(jobCalendar({ ...input, date: "2026-11-30" }).includes("DTEND;VALUE=DATE:20261201"));
});

test("text is escaped and long lines fold at 75 octets", () => {
  assert.equal(icsText("a;b,c\\d\ne"), "a\;b\\,c\\\\d\\ne");
  const folded = foldIcsLine(`SUMMARY:${"x".repeat(200)}`);
  for (const part of folded.split("\r\n")) assert.ok(Buffer.byteLength(part, "utf8") <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), `SUMMARY:${"x".repeat(200)}`);
  // A multibyte character is never split.
  const wide = foldIcsLine(`SUMMARY:${"·".repeat(60)}`);
  assert.equal(wide.replace(/\r\n /g, ""), `SUMMARY:${"·".repeat(60)}`);
});
