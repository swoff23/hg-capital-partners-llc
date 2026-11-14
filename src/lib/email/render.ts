import { BRAND } from "@/lib/brand";
import { brandTokens as t } from "@/lib/brand-tokens";
import { monogramRadius } from "@/lib/monogram-art";

/**
 * The one email layout (docs/asana-migration-plan.md §6, screen 7): the
 * letterhead, one line, one button. Plain text goes alongside for clients
 * that don't render HTML and for the dev console. Pure; see render.test.ts.
 *
 * Inline styles and a table because that's what Gmail and iOS Mail honor.
 * Email can't read CSS variables, so every color comes from brand-tokens.ts,
 * the hex mirror of the light tokens (docs/brand-guidelines.md, section 4).
 * The letterhead is the monogram tile and the company name over a 1px
 * --gold-deep rule (section 6). The tile is a table cell, not an image, so it
 * shows with images blocked; the letters fall back to the reader's sans.
 */

export interface PlainEmailInput {
  /** One line of body copy. */
  line: string;
  /** Short lines under it, one per change (the task notification bundles). */
  items?: string[];
  /** Optional closing line before the button ("Thanks, Zack."). */
  closing?: string;
  buttonLabel: string;
  /** Absolute URL the button opens. */
  buttonUrl: string;
  /** Optional small print under the button, one line. */
  footnote?: string;
}

export interface RenderedEmail {
  text: string;
  html: string;
}

const FONT = "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/**
 * The monogram tile at 32px (radius 22% in whole pixels, letters at 42%) and
 * the name beside it. The letters are live text in the reader's font, so they
 * can't center on their cap height exactly as the app's outlines do. The -1px
 * indent takes back the trailing -0.04em tracking and the system font's side
 * bearings; measured in Chromium and WebKit with the system font, the pair
 * then sits on center across and within 0.4px up and down.
 */
const LETTERHEAD = `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="32" height="32" align="center" valign="middle" style="width:32px;height:32px;background:${t.inkTile};border-radius:${monogramRadius(32)}px;color:${t.gold};font-size:13px;font-weight:600;letter-spacing:-0.04em;line-height:32px;text-indent:-1px;">${BRAND.mark}</td>
<td style="padding-left:10px;font-size:15px;line-height:20px;font-weight:600;color:${t.foreground};">${BRAND.company}</td>
</tr></table>`;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A line's text for the HTML, with its line breaks kept (a comment's own
 * paragraphs): escaped first, so a break is the only markup that gets in, then
 * each newline becomes a <br>. A line with no newline comes out exactly as
 * escapeHtml gives it.
 */
export function escapeWithBreaks(s: string): string {
  return escapeHtml(s).replace(/\r\n?|\n/g, "<br>");
}

export function renderPlainEmail(input: PlainEmailInput): RenderedEmail {
  const url = new URL(input.buttonUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Email button links must be http(s)");
  }
  const href = escapeHtml(url.toString());

  const items = input.items ?? [];
  const text = [
    BRAND.company,
    "",
    input.line,
    ...(items.length ? ["", ...items] : []),
    ...(input.closing ? ["", input.closing] : []),
    "",
    `${input.buttonLabel}: ${url.toString()}`,
    ...(input.footnote ? ["", input.footnote] : []),
  ].join("\n");

  // The viewport meta makes iOS Mail and Outlook lay the email out at the
  // phone's width instead of shrinking a desktop-width page to fit.
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:${t.canvas};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.canvas};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${t.background};border:1px solid ${t.border};border-radius:8px;padding:32px 28px;font-family:${FONT};color:${t.foreground};">
<tr><td style="padding:0 0 16px;border-bottom:1px solid ${t.goldDeep};">${LETTERHEAD}</td></tr>
<tr><td style="padding:24px 0 0;font-size:16px;line-height:1.5;">${escapeHtml(input.line)}</td></tr>
${items.map((item) => `<tr><td style="padding:8px 0 0;font-size:15px;line-height:1.5;color:${t.fg2};">${escapeWithBreaks(item)}</td></tr>\n`).join("")}${input.closing ? `<tr><td style="padding:16px 0 0;font-size:16px;line-height:1.5;">${escapeHtml(input.closing)}</td></tr>\n` : ""}<tr><td style="padding:24px 0 0;">
<a href="${href}" style="display:inline-block;background:${t.primary};color:${t.primaryForeground};text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:6px;">${escapeHtml(input.buttonLabel)}</a>
</td></tr>
${input.footnote ? `<tr><td style="padding:24px 0 0;font-size:13px;line-height:1.5;color:${t.mutedForeground};">${escapeHtml(input.footnote)}</td></tr>\n` : ""}</table>
</td></tr>
</table>
</body>
</html>`;

  return { text, html };
}

// ---------------------------------------------------------------------------
// The job email (docs/specs/contractor-job-emails.md, section 2)
// ---------------------------------------------------------------------------

export interface JobEmailButton {
  label: string;
  url: string;
}

export interface JobEmailPhoto {
  src: string;
  href: string;
}

export interface JobEmailInput {
  /** The hidden inbox preview line. */
  preview: string;
  /** What's new: the headline, then the other lines. */
  headline: string;
  lines: string[];
  /** What's new's photos, then how many more. */
  photos?: JobEmailPhoto[];
  morePhotos?: number;
  closing?: string;
  /** Null on an email with nothing to do (taken off the job): no buttons. */
  primary: JobEmailButton | null;
  secondary: JobEmailButton[];
  job: {
    title: string;
    where: string;
    directionsUrl: string | null;
    photoUrl: string | null;
    due: string | null;
    notes: string | null;
    checklist: { title: string; done: boolean }[];
    contractor: string | null;
    checklistLine: string | null;
    /** "Show access": opens the job at its Lockbox. */
    accessUrl?: string | null;
    /** Add to calendar's .ics. */
    calendarUrl?: string | null;
    /** Change date: the contractor's own date (opens the job's date sheet). */
    dateUrl?: string | null;
    photos?: JobEmailPhoto[];
    morePhotos?: number;
  };
  footnote?: string;
}

/** An http(s) URL, or a throw: every link in an email is checked before it's written. */
function safeUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Email links must be http(s)");
  return url.toString();
}

/**
 * Gmail and iOS Mail show the start of the body beside the subject. This puts
 * the preview line there, hidden in the email itself, then enough blank space
 * that the letterhead's words don't follow it into the preview.
 */
function previewHtml(preview: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preview)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>`;
}

const LABEL = `font-size:13px;line-height:18px;color:${t.mutedForeground};`;

/** A fact row in the job: its label in a fixed column, the value beside it. */
function factRow(label: string, valueHtml: string): string {
  // One 22px line box on both sides, so the 13px label sits on the 15px value's first line instead of above it.
  return `<tr><td valign="top" width="88" style="width:88px;padding:8px 12px 8px 0;border-top:1px solid ${t.border};font-size:13px;line-height:22px;color:${t.mutedForeground};">${escapeHtml(label)}</td><td valign="top" style="padding:8px 0;border-top:1px solid ${t.border};font-size:15px;line-height:22px;color:${t.foreground};">${valueHtml}</td></tr>`;
}

/** A row of thumbnails, each a link, then "+3" when there are more. */
function photoStripHtml(photos: readonly JobEmailPhoto[], more: number): string {
  const tiles = photos
    .map(
      (ph) =>
        `<a href="${escapeHtml(safeUrl(ph.href))}" style="display:inline-block;margin:0 6px 6px 0;text-decoration:none;"><img src="${escapeHtml(safeUrl(ph.src))}" alt="Photo" width="72" height="54" style="display:block;width:72px;height:54px;object-fit:cover;border-radius:4px;border:0;background:${t.muted};"></a>`,
    )
    .join("");
  const rest = more > 0 ? `<span style="display:inline-block;vertical-align:top;line-height:54px;font-size:14px;color:${t.mutedForeground};">+${more}</span>` : "";
  return `${tiles}${rest}`;
}

/** A link inside a fact's value. */
function inlineLink(label: string, url: string): string {
  return `<a href="${escapeHtml(safeUrl(url))}" style="${LINK}">${escapeHtml(label)}</a>`;
}

const PRIMARY = `display:block;text-align:center;background:${t.primary};color:${t.primaryForeground};text-decoration:none;font-size:15px;font-weight:600;padding:13px 22px;border-radius:6px;`;
const SECONDARY = `display:inline-block;background:${t.background};color:${t.foreground};text-decoration:none;font-size:15px;font-weight:600;padding:11px 18px;border-radius:6px;border:1px solid ${t.lineStrong};margin:8px 8px 0 0;`;
const LINK = `color:${t.primary};text-decoration:underline;`;

/**
 * The job email: letterhead, What's new, the buttons, then the job (spec 2.2,
 * Connor's order A). One 480px column like the plain email, full width on a
 * phone. The primary button is full width; the secondary ones sit in a row
 * and wrap under each other on a narrow phone. A plain-text part carries the
 * same sections in the same order, each button as a labeled link.
 */
export function renderJobEmail(input: JobEmailInput): RenderedEmail {
  const primaryUrl = input.primary ? safeUrl(input.primary.url) : null;
  const secondary = input.secondary.map((b) => ({ label: b.label, url: safeUrl(b.url) }));
  const directions = input.job.directionsUrl ? safeUrl(input.job.directionsUrl) : null;
  const photo = input.job.photoUrl ? safeUrl(input.job.photoUrl) : null;
  const { job } = input;

  const facts: { label: string; text: string; html: string }[] = [];
  if (job.contractor) facts.push({ label: "Contractor", text: job.contractor, html: escapeHtml(job.contractor) });
  if (job.due || job.dateUrl) {
    const calendar = job.calendarUrl ? safeUrl(job.calendarUrl) : null;
    const change = job.dateUrl ? safeUrl(job.dateUrl) : null;
    const links = [calendar ? { label: "Add to calendar", url: calendar } : null, change ? { label: job.due ? "Change date" : "Set a date", url: change } : null].filter(
      (l): l is { label: string; url: string } => !!l,
    );
    facts.push({
      label: "Due",
      text: [job.due ?? "No date", ...links.map((l) => `${l.label}: ${l.url}`)].join("\n"),
      html: [job.due ? escapeHtml(job.due) : "No date", ...links.map((l) => inlineLink(l.label, l.url))].join(" &middot; "),
    });
  }
  if (job.accessUrl) {
    const access = safeUrl(job.accessUrl);
    facts.push({ label: "Access", text: `Show access: ${access}`, html: inlineLink("Show access", access) });
  }
  if (job.checklistLine) facts.push({ label: "Checklist", text: job.checklistLine, html: escapeHtml(job.checklistLine) });
  if (job.notes) facts.push({ label: "Notes", text: job.notes, html: escapeWithBreaks(job.notes) });
  if (job.checklist.length) {
    facts.push({
      label: "Checklist",
      text: job.checklist.map((c) => `${c.done ? "[x]" : "[ ]"} ${c.title}`).join("\n"),
      html: job.checklist
        .map(
          (c) =>
            `<div style="padding:2px 0;${c.done ? `color:${t.mutedForeground};` : ""}"><span style="display:inline-block;width:20px;color:${c.done ? t.ok : t.mutedForeground};">${c.done ? "&#10003;" : "&#9675;"}</span>${escapeHtml(c.title)}</div>`,
        )
        .join(""),
    });
  }
  if (job.photos?.length) {
    const n = job.photos.length + (job.morePhotos ?? 0);
    facts.push({ label: "Photos", text: `${n} on the job`, html: photoStripHtml(job.photos, job.morePhotos ?? 0) });
  }
  const newPhotos = input.photos ?? [];

  const text = [
    BRAND.company,
    "",
    "What's new",
    input.headline,
    ...input.lines,
    ...(input.closing ? ["", input.closing] : []),
    ...(input.primary && primaryUrl ? ["", `${input.primary.label}: ${primaryUrl}`] : []),
    ...secondary.map((b) => `${b.label}: ${b.url}`),
    "",
    "The job",
    job.title,
    ...(job.where ? [job.where] : []),
    ...(directions ? [`Directions: ${directions}`] : []),
    ...facts.flatMap((f) => ["", `${f.label}:`, f.text]),
    ...(input.footnote ? ["", input.footnote] : []),
  ].join("\n");

  const whereLine = [job.where ? escapeHtml(job.where) : "", directions ? `<a href="${escapeHtml(directions)}" style="${LINK}">Directions</a>` : ""]
    .filter(Boolean)
    .join(" &middot; ");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:${t.canvas};">
${previewHtml(input.preview)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.canvas};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${t.background};border:1px solid ${t.border};border-radius:8px;padding:28px 24px;font-family:${FONT};color:${t.foreground};">
<tr><td style="padding:0 0 16px;border-bottom:1px solid ${t.goldDeep};">${LETTERHEAD}</td></tr>
<tr><td style="padding:24px 0 0;${LABEL}">What's new</td></tr>
<tr><td style="padding:4px 0 0;font-size:18px;line-height:1.4;font-weight:600;color:${t.foreground};">${escapeWithBreaks(input.headline)}</td></tr>
${input.lines.map((l) => `<tr><td style="padding:8px 0 0;font-size:15px;line-height:1.5;color:${t.fg2};">${escapeWithBreaks(l)}</td></tr>\n`).join("")}${newPhotos.length ? `<tr><td style="padding:10px 0 0;font-size:0;line-height:0;">${photoStripHtml(newPhotos, input.morePhotos ?? 0)}</td></tr>\n` : ""}${input.closing ? `<tr><td style="padding:12px 0 0;font-size:16px;line-height:1.5;">${escapeHtml(input.closing)}</td></tr>\n` : ""}${
    input.primary && primaryUrl
      ? `<tr><td style="padding:24px 0 0;">
<a href="${escapeHtml(primaryUrl)}" style="${PRIMARY}">${escapeHtml(input.primary.label)}</a>
${secondary.map((b) => `<a href="${escapeHtml(b.url)}" style="${SECONDARY}">${escapeHtml(b.label)}</a>`).join("\n")}
</td></tr>
`
      : ""
  }<tr><td style="padding:28px 0 0;"><div style="border-top:1px solid ${t.border};"></div></td></tr>
<tr><td style="padding:20px 0 0;${LABEL}">The job</td></tr>
${photo ? `<tr><td style="padding:8px 0 0;"><img src="${escapeHtml(photo)}" alt="" width="430" style="display:block;width:100%;max-width:430px;height:auto;border-radius:6px;border:0;"></td></tr>\n` : ""}<tr><td style="padding:12px 0 0;font-size:16px;line-height:1.4;font-weight:600;color:${t.foreground};">${escapeHtml(job.title)}</td></tr>
${whereLine ? `<tr><td style="padding:2px 0 0;font-size:14px;line-height:1.5;color:${t.mutedForeground};">${whereLine}</td></tr>\n` : ""}${
    facts.length
      ? `<tr><td style="padding:12px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${facts.map((f) => factRow(f.label, f.html)).join("")}</table></td></tr>\n`
      : ""
  }${input.footnote ? `<tr><td style="padding:24px 0 0;font-size:13px;line-height:1.5;color:${t.mutedForeground};">${escapeHtml(input.footnote)}</td></tr>\n` : ""}</table>
</td></tr>
</table>
</body>
</html>`;

  return { text, html };
}
