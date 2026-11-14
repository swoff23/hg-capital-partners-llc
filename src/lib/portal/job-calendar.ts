/**
 * Add to calendar in a job email (docs/specs/contractor-job-emails.md, 2.2):
 * one all-day event on the job's date, as an .ics file every phone's calendar
 * opens. Pure; see job-calendar.test.ts. The route is src/app/j/[token]/calendar.
 */

/** RFC 5545 text: backslash, semicolon and comma escaped, line breaks as \n. */
export function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n?|\n/g, "\\n");
}

/** Lines over 75 octets fold onto continuation lines that start with a space (RFC 5545 3.1). */
export function foldIcsLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    // The first line holds 75 octets; each continuation spends one on its leading space.
    if (bytes + size > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

const compactDate = (ymd: string) => ymd.replace(/-/g, "");

/** The day after a YYYY-MM-DD, for an all-day event's exclusive end. */
function nextDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The job on its date. UID is the job's, so adding it again after the date
 * moves updates the same event in calendars that match on it.
 */
export function jobCalendar(input: { taskId: string; title: string; where: string; address: string | null; date: string; url: string; now: Date; domain: string }): string {
  const summary = [input.title, input.where].filter(Boolean).join(", ");
  const stamp = input.now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HG Capital Partners//Jobs//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:job-${input.taskId}@${input.domain}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compactDate(input.date)}`,
    `DTEND;VALUE=DATE:${compactDate(nextDay(input.date))}`,
    `SUMMARY:${icsText(summary)}`,
    ...(input.address ? [`LOCATION:${icsText(input.address)}`] : []),
    `DESCRIPTION:${icsText(`Open the job: ${input.url}`)}`,
    `URL:${input.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
