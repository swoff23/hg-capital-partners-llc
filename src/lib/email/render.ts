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
// The job email (docs/specs/emails-redesign.md, Q3, Q4 and Q9)
// ---------------------------------------------------------------------------

/** A button or a text link: what it says and where it goes. `icon` is a hosted 16px PNG drawn before the words. */
export interface JobEmailLink {
  label: string;
  url: string;
  icon?: string;
}

export interface JobEmailPhoto {
  src: string;
  href: string;
}

/** One cell of the dates row: Scheduled or Due, its day written out, and whether this email changed it. */
export interface JobEmailDate {
  label: string;
  value: string;
  changed?: boolean;
}

/**
 * The job below the first screen (Q4), labels over values. A contractor's carries the whole job: the address on two
 * lines under its label, Scheduled | Due with the day row's one link, notes, checklist, photos and Getting in last; a
 * partner's the title, street and unit on one line, Due | Scheduled and the checklist's progress.
 */
export interface JobEmailDetails {
  title: string;
  address: string[];
  /** The "Address" label over the address (a contractor's), or the street on its own under the title (a partner's). */
  addressLabel: boolean;
  dates: JobEmailDate[];
  /** The day row's link, on its own line under the dates: Reschedule or Add to calendar. */
  dayLink: JobEmailLink | null;
  notes: { text: string; changed?: boolean } | null;
  checklist: { items: { title: string; done: boolean }[]; changed?: boolean } | null;
  /** A partner's "Checklist 2 of 3 done". */
  checklistLine: string | null;
  photos: JobEmailPhoto[];
  morePhotos: number;
  /** The job page's own two lines, never the code or a tenant's name or number. */
  gettingIn: { value: string; note: string } | null;
}

export interface JobEmailInput {
  /** The hidden inbox preview line. */
  preview: string;
  /** The event only, two lines at most at 320. */
  headline: string;
  /** Short lines under it: the detail (the was-day, what it waits on), then the bundle's other changes. */
  lines: string[];
  /** A person's own words, each quoted with a rule on its left, line breaks kept. */
  quotes: string[];
  /** "Reply to answer Connor." right under the quote, when one partner's words lead. */
  quoteReply?: string;
  /** Review and New request: two photo tiles at half the column. */
  tiles?: JobEmailPhoto[];
  /** Under the tiles: "+3 more · Checklist 3 of 3 done". */
  tilesNote?: string;
  /** One line under the tiles: a resident's answers, "Dana must be home · No pets". */
  note?: string;
  /** The one dark full-width button: the reader's next step. Null for none (Removed, On hold, in review, closed). */
  primary: JobEmailLink | null;
  /** A text link under the button: Review's Send back. */
  link?: JobEmailLink | null;
  /** A muted line in the button's place or under it: a partner Update's status, a request's "Due today". */
  actionNote?: string;
  /** Share with crew, the only link under the button on a contractor's open job, with its icon. */
  share?: JobEmailLink | null;
  /** The job below, or null for the short form. */
  job: JobEmailDetails | null;
  /** The short form's one line: the title, street and unit. */
  short?: string | null;
  /** One line at the foot: what a reply does. */
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

/** A fact row in a resident's email (residents/email-layout.ts): its label in a fixed column, the value beside it. */
function factRow(label: string, valueHtml: string): string {
  // One 22px line box on both sides, so the 13px label sits on the 15px value's first line instead of above it.
  return `<tr><td valign="top" width="88" style="width:88px;padding:8px 12px 8px 0;border-top:1px solid ${t.border};font-size:13px;line-height:22px;color:${t.mutedForeground};">${escapeHtml(label)}</td><td valign="top" style="padding:8px 0;border-top:1px solid ${t.border};font-size:15px;line-height:22px;color:${t.foreground};">${valueHtml}</td></tr>`;
}

/** The resident email's full-width button (residents/email-layout.ts). */
const PRIMARY = `display:block;text-align:center;background:${t.primary};color:${t.primaryForeground};text-decoration:none;font-size:15px;font-weight:600;padding:13px 22px;border-radius:6px;`;

/**
 * The job email's one-line mark (Q9): the 24px tile and "HG Capital Partners" at 13px semibold, no gold rule. The
 * letters keep the monogram's 42% of the tile; they are the mark, not text to read. Account emails keep LETTERHEAD.
 */
const MARK = `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="24" height="24" align="center" valign="middle" style="width:24px;height:24px;background:${t.inkTile};border-radius:${monogramRadius(24)}px;color:${t.gold};font-size:10px;font-weight:600;letter-spacing:-0.04em;line-height:24px;text-indent:-1px;">${BRAND.mark}</td>
<td style="padding-left:8px;font-size:13px;line-height:20px;font-weight:600;color:${t.foreground};">${BRAND.company}</td>
</tr></table>`;

/** The one button (Q3, Q9): full width, about 46px tall, one line at 320. */
const BUTTON = `display:block;text-align:center;background:${t.primary};color:${t.primaryForeground};text-decoration:none;font-size:15px;line-height:20px;font-weight:600;padding:13px 16px;border-radius:6px;`;
/** A text link (Q9): 44px tall to tap, never wrapped. */
const TEXT_LINK = `display:inline-block;padding:12px 0;font-size:15px;line-height:20px;color:${t.foreground};text-decoration:underline;white-space:nowrap;`;
const META = `font-size:13px;line-height:20px;color:${t.mutedForeground};`;
const BODY_TEXT = `font-size:15px;line-height:22px;`;

/** A row of the email's one column. */
const row = (pad: string, html: string, style = "") => `<tr><td style="padding:${pad};${style}">${html}</td></tr>\n`;

function textLink(l: JobEmailLink): string {
  const icon = l.icon ? `<img src="${escapeHtml(safeUrl(l.icon))}" width="16" height="16" alt="" style="display:inline-block;width:16px;height:16px;vertical-align:-3px;margin-right:6px;border:0;">` : "";
  return `<a href="${escapeHtml(safeUrl(l.url))}" style="${TEXT_LINK}">${icon}${escapeHtml(l.label)}</a>`;
}

/** A section's label, with a muted "changed" beside it when this email changed it (Q4). */
function labelHtml(label: string, changed?: boolean): string {
  return `<div style="${LABEL}padding-bottom:2px;">${escapeHtml(label)}${changed ? `<span style="padding-left:6px;font-style:italic;">changed</span>` : ""}</div>`;
}

/** The job's photo row (Q9): at most three tiles of 64x48, each a link, then "+N". */
function photoRowHtml(photos: readonly JobEmailPhoto[], more: number): string {
  const tiles = photos
    .map(
      (ph) =>
        `<a href="${escapeHtml(safeUrl(ph.href))}" style="display:inline-block;margin:0 6px 0 0;text-decoration:none;vertical-align:top;"><img src="${escapeHtml(safeUrl(ph.src))}" alt="Photo" width="64" height="48" style="display:block;width:64px;height:48px;object-fit:cover;border-radius:4px;border:0;background:${t.muted};"></a>`,
    )
    .join("");
  const rest = more > 0 ? `<span style="display:inline-block;vertical-align:top;line-height:48px;font-size:13px;color:${t.mutedForeground};">+${more}</span>` : "";
  return `<div style="font-size:0;line-height:0;white-space:nowrap;">${tiles}${rest}</div>`;
}

/** Review's and New request's photos (Q9): two tiles at half the column each. */
function tilesHtml(photos: readonly JobEmailPhoto[]): string {
  const cell = (ph: JobEmailPhoto | undefined, left: boolean) =>
    `<td width="50%" valign="top" style="width:50%;${left ? "padding-right:4px;" : "padding-left:4px;"}">${
      ph
        ? `<a href="${escapeHtml(safeUrl(ph.href))}" style="display:block;text-decoration:none;"><img src="${escapeHtml(safeUrl(ph.src))}" alt="Photo" width="142" height="104" style="display:block;width:100%;height:104px;object-fit:cover;border-radius:6px;border:0;background:${t.muted};"></a>`
        : ""
    }</td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr>${cell(photos[0], true)}${cell(photos[1], false)}</tr></table>`;
}

/** Scheduled | Due (or Due | Scheduled), side by side at half the column each. */
function datesHtml(dates: readonly JobEmailDate[]): string {
  const cells = dates
    .map(
      (d, i) =>
        `<td width="50%" valign="top" style="width:50%;${i ? "padding-left:12px;" : ""}">${labelHtml(d.label, d.changed)}<div style="${BODY_TEXT}color:${d.value === "Not set" ? t.mutedForeground : t.foreground};">${escapeHtml(d.value)}</div></td>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr>${cells}</tr></table>`;
}

function detailsHtml(job: JobEmailDetails): string {
  const sections: string[] = [];
  const hairline = `border-top:1px solid ${t.border};`;
  if (job.addressLabel && job.address.length) {
    sections.push(`${labelHtml("Address")}<div style="${BODY_TEXT}color:${t.foreground};">${job.address.map(escapeHtml).join("<br>")}</div>`);
  }
  if (job.dates.length) sections.push(`${datesHtml(job.dates)}${job.dayLink ? `<div>${textLink(job.dayLink)}</div>` : ""}`);
  if (job.notes) sections.push(`${labelHtml("Notes", job.notes.changed)}<div style="${BODY_TEXT}color:${t.foreground};">${escapeWithBreaks(job.notes.text)}</div>`);
  if (job.checklist) {
    const items = job.checklist.items
      .map(
        (c) =>
          `<div style="${BODY_TEXT}padding:1px 0;color:${c.done ? t.mutedForeground : t.foreground};"><span style="display:inline-block;width:20px;color:${t.mutedForeground};">${c.done ? "&#10003;" : "&#9675;"}</span>${escapeHtml(c.title)}</div>`,
      )
      .join("");
    sections.push(`${labelHtml("Checklist", job.checklist.changed)}${items}`);
  }
  if (job.checklistLine) sections.push(`<div style="${BODY_TEXT}color:${t.fg2};">${escapeHtml(job.checklistLine)}</div>`);
  if (job.photos.length) sections.push(`${labelHtml("Photos")}<div style="padding-top:2px;">${photoRowHtml(job.photos, job.morePhotos)}</div>`);
  // Getting in last (Connor, Nov 22): it matters least once the job is planned.
  if (job.gettingIn) {
    sections.push(
      `${labelHtml("Getting in")}<div style="${BODY_TEXT}color:${t.foreground};">${escapeHtml(job.gettingIn.value)}</div><div style="${META}color:${t.fg2};">${escapeHtml(job.gettingIn.note)}</div>`,
    );
  }
  const street = !job.addressLabel && job.address.length ? row("2px 0 0", escapeHtml(job.address.join(" ")), `${BODY_TEXT}color:${t.fg2};`) : "";
  const title = row("16px 0 0", escapeHtml(job.title), `font-size:16px;line-height:22px;font-weight:600;color:${t.foreground};`);
  // The address sits right under the title; every other section under a hairline, 12px either side of it.
  return `${title}${street}${sections
    .map((html, i) => (i === 0 && job.addressLabel ? row("8px 0 0", html) : row("12px 0 0", `<div style="${hairline}padding-top:12px;">${html}</div>`)))
    .join("")}`;
}

/** The job's plain-text part, in the HTML's order. */
function detailsText(job: JobEmailDetails): string[] {
  const out: string[] = ["", job.title];
  if (job.addressLabel && job.address.length) out.push("", "Address:", ...job.address);
  else if (job.address.length) out.push(job.address.join(" "));
  for (const d of job.dates) out.push("", `${d.label}: ${d.value}${d.changed ? " (changed)" : ""}`);
  if (job.dayLink) out.push(`${job.dayLink.label}: ${safeUrl(job.dayLink.url)}`);
  if (job.notes) out.push("", `Notes${job.notes.changed ? " (changed)" : ""}:`, job.notes.text);
  if (job.checklist) out.push("", `Checklist${job.checklist.changed ? " (changed)" : ""}:`, ...job.checklist.items.map((c) => `${c.done ? "[x]" : "[ ]"} ${c.title}`));
  if (job.checklistLine) out.push("", job.checklistLine);
  if (job.photos.length) out.push("", `Photos: ${job.photos.length + job.morePhotos} on the job`);
  if (job.gettingIn) out.push("", "Getting in:", job.gettingIn.value, job.gettingIn.note);
  return out;
}

/**
 * The job email (docs/specs/emails-redesign.md): the one-line mark, the headline, the lines under it, a person's own
 * words quoted, the one button (with Send back as a link under Approve), Share with crew, then the job, labels over
 * values; or, for Removed, On hold and a job in review or closed, the headline and one line. One 480px column, phone
 * first: inline styles only, 238px of content at 320 and 293px at 375, nothing under 13px but the mark's letters, the
 * text size held at 100% on iOS. No dark-mode styles (Q9). A plain-text part carries the same parts in the same
 * order, each link as a labeled URL.
 */
export function renderJobEmail(input: JobEmailInput): RenderedEmail {
  const primaryUrl = input.primary ? safeUrl(input.primary.url) : null;
  const tiles = input.tiles ?? [];
  const job = input.job;

  const text = [
    BRAND.company,
    "",
    input.headline,
    ...input.lines,
    ...input.quotes.flatMap((q) => ["", ...q.split("\n").map((l) => `> ${l}`)]),
    ...(input.quoteReply ? [input.quoteReply] : []),
    ...(tiles.length ? ["", `Photos: ${tiles.length}${input.tilesNote ? ` · ${input.tilesNote}` : ""}`] : input.tilesNote ? ["", input.tilesNote] : []),
    ...(input.note ? ["", input.note] : []),
    ...(input.primary && primaryUrl ? ["", `${input.primary.label}: ${primaryUrl}`] : []),
    ...(input.link ? [`${input.link.label}: ${safeUrl(input.link.url)}`] : []),
    ...(input.actionNote ? ["", input.actionNote] : []),
    ...(input.share ? [`${input.share.label}: ${safeUrl(input.share.url)}`] : []),
    ...(job ? detailsText(job) : input.short ? ["", input.short] : []),
    ...(input.footnote ? ["", input.footnote] : []),
  ].join("\n");

  const rows = [
    row("0", MARK),
    row("16px 0 0", escapeWithBreaks(input.headline), `font-size:18px;line-height:24px;font-weight:600;color:${t.foreground};`),
    ...input.lines.map((l, i) => row(`${i === 0 ? 6 : 4}px 0 0`, escapeWithBreaks(l), `${BODY_TEXT}color:${t.fg2};`)),
    ...input.quotes.map((q, i) =>
      row(`${i === 0 ? 12 : 8}px 0 0`, `<div style="border-left:3px solid ${t.lineStrong};padding:0 0 0 12px;${BODY_TEXT}color:${t.foreground};">${escapeWithBreaks(q)}</div>`),
    ),
    ...(input.quoteReply ? [row("6px 0 0", escapeHtml(input.quoteReply), META)] : []),
    ...(tiles.length ? [row("12px 0 0", tilesHtml(tiles))] : []),
    ...(input.tilesNote ? [row(tiles.length ? "6px 0 0" : "12px 0 0", escapeHtml(input.tilesNote), META)] : []),
    ...(input.note ? [row("12px 0 0", escapeHtml(input.note), `${BODY_TEXT}color:${t.fg2};`)] : []),
    ...(input.primary && primaryUrl ? [row("16px 0 0", `<a href="${escapeHtml(primaryUrl)}" style="${BUTTON}">${escapeHtml(input.primary.label)}</a>`)] : []),
    ...(input.link ? [row("0", textLink(input.link))] : []),
    ...(input.actionNote ? [row(input.primary ? "8px 0 0" : "16px 0 0", escapeHtml(input.actionNote), `${BODY_TEXT}color:${t.mutedForeground};`)] : []),
    ...(input.share ? [row(input.primary ? "4px 0 0" : "8px 0 0", textLink(input.share))] : []),
    ...(job ? [row(input.share || input.link ? "4px 0 0" : "16px 0 0", `<div style="height:0;border-top:1px solid ${t.border};"></div>`), detailsHtml(job)] : []),
    ...(!job && input.short ? [row("8px 0 0", escapeHtml(input.short), `${BODY_TEXT}color:${t.fg2};`)] : []),
    ...(input.footnote ? [row("20px 0 0", escapeHtml(input.footnote), META)] : []),
  ].join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:${t.canvas};-webkit-text-size-adjust:100%;text-size-adjust:100%;">
${previewHtml(input.preview)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.canvas};">
<tr><td align="center" style="padding:16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${t.background};border:1px solid ${t.border};border-radius:8px;">
<tr><td style="padding:20px 24px 24px;font-family:${FONT};color:${t.foreground};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT};color:${t.foreground};">
${rows}</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { text, html };
}

/** The job email's parts, shared with a resident's update email (lib/residents/email-layout.ts, docs/specs/maintenance-requests.md). */
export { FONT, LABEL, LETTERHEAD, PRIMARY, factRow, previewHtml, safeUrl };
