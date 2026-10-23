import { BRAND } from "@/lib/brand";
import { brandTokens as t } from "@/lib/brand-tokens";

/**
 * The one email layout (docs/asana-migration-plan.md §6, screen 7): the
 * letterhead, one line, one button. Plain text goes alongside for clients
 * that don't render HTML and for the dev console. Pure; see render.test.ts.
 *
 * Inline styles and a table because that's what Gmail and iOS Mail honor.
 * Email can't read CSS variables, so every color comes from brand-tokens.ts,
 * the hex mirror of the light tokens (docs/brand-guidelines.md, section 11).
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

/** The monogram tile at 32px (radius 22%, letters at 42%) and the name beside it. */
const LETTERHEAD = `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="32" height="32" align="center" valign="middle" style="width:32px;height:32px;background:${t.inkTile};border-radius:7px;color:${t.gold};font-size:13px;font-weight:600;letter-spacing:-0.04em;line-height:32px;">${BRAND.mark}</td>
<td style="padding-left:10px;font-size:15px;line-height:20px;font-weight:600;color:${t.fg1};">${BRAND.company}</td>
</tr></table>`;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${t.surface};border:1px solid ${t.line};border-radius:8px;padding:32px 28px;font-family:${FONT};color:${t.fg1};">
<tr><td style="padding:0 0 16px;border-bottom:1px solid ${t.goldDeep};">${LETTERHEAD}</td></tr>
<tr><td style="padding:24px 0 0;font-size:16px;line-height:1.5;">${escapeHtml(input.line)}</td></tr>
${items.map((item) => `<tr><td style="padding:8px 0 0;font-size:15px;line-height:1.5;color:${t.fg2};">${escapeHtml(item)}</td></tr>\n`).join("")}${input.closing ? `<tr><td style="padding:16px 0 0;font-size:16px;line-height:1.5;">${escapeHtml(input.closing)}</td></tr>\n` : ""}<tr><td style="padding:24px 0 0;">
<a href="${href}" style="display:inline-block;background:${t.act};color:${t.onAct};text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:6px;">${escapeHtml(input.buttonLabel)}</a>
</td></tr>
${input.footnote ? `<tr><td style="padding:24px 0 0;font-size:13px;line-height:1.5;color:${t.fg3};">${escapeHtml(input.footnote)}</td></tr>\n` : ""}</table>
</td></tr>
</table>
</body>
</html>`;

  return { text, html };
}
