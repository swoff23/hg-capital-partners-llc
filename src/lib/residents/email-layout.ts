import { BRAND } from "@/lib/brand";
import { brandTokens as t } from "@/lib/brand-tokens";
import { FONT, LABEL, LETTERHEAD, PRIMARY, escapeHtml, escapeWithBreaks, factRow, previewHtml, safeUrl, type RenderedEmail } from "@/lib/email/render";

/**
 * A resident's email (docs/specs/maintenance-requests.md, section 5; drawing
 * 15 B): the contractor job email's frame (email/render.ts renderJobEmail)
 * with the resident's three steps under the headline. Letterhead, "What's
 * new" and its headline, the steps, a line or two, the full-width button, then
 * "Your request" as labeled rows, and the group chat line at the foot. One
 * 480px column, full width on a phone. Pure; see residents.test.ts.
 */

export interface EmailStep {
  label: string;
  reached: boolean;
  /** The step this email is about: its label in bold. */
  current: boolean;
}

export interface ResidentEmailInput {
  /** The hidden inbox preview line. */
  preview: string;
  /** "What's new" over the headline; null for the link email, which has no news. */
  kicker: string | null;
  headline: string;
  steps?: EmailStep[];
  lines: string[];
  button: { label: string; url: string };
  request?: { title: string; where: string; facts: { label: string; value: string }[] };
  footnote: string;
}

function stepsHtml(steps: readonly EmailStep[]): string {
  const cells = steps.map((s, i) => {
    const dot = s.reached
      ? `<span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${t.foreground};vertical-align:middle;"></span>`
      : `<span style="display:inline-block;width:8px;height:8px;border-radius:5px;border:1px solid ${t.mutedForeground};vertical-align:middle;"></span>`;
    const label = `<span style="padding-left:6px;font-size:13px;line-height:20px;vertical-align:middle;color:${s.reached ? t.foreground : t.mutedForeground};${s.current ? "font-weight:600;" : ""}">${escapeHtml(s.label)}</span>`;
    // The line into a step: solid once that step is reached, faint before.
    const into =
      i === 0
        ? ""
        : `<td style="padding:0 8px;vertical-align:middle;"><div style="width:20px;border-top:1px solid ${s.reached ? t.foreground : t.border};font-size:0;line-height:0;">&nbsp;</div></td>`;
    return `${into}<td style="white-space:nowrap;vertical-align:middle;">${dot}${label}</td>`;
  });
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${cells.join("")}</tr></table>`;
}

export function renderResidentEmail(input: ResidentEmailInput): RenderedEmail {
  const url = safeUrl(input.button.url);
  const steps = input.steps ?? [];
  const facts = input.request?.facts ?? [];

  const text = [
    BRAND.company,
    "",
    ...(input.kicker ? [input.kicker] : []),
    input.headline,
    ...(steps.length ? [steps.map((s) => (s.current ? `${s.label} (now)` : s.reached ? s.label : `${s.label} (to come)`)).join(" > ")] : []),
    ...input.lines,
    "",
    `${input.button.label}: ${url}`,
    ...(input.request
      ? ["", "Your request", input.request.title, input.request.where, ...facts.flatMap((f) => ["", `${f.label}:`, f.value])]
      : []),
    "",
    input.footnote,
  ].join("\n");

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
${input.kicker ? `<tr><td style="padding:24px 0 0;${LABEL}">${escapeHtml(input.kicker)}</td></tr>\n` : ""}<tr><td style="padding:${input.kicker ? "4px" : "24px"} 0 0;font-size:18px;line-height:1.4;font-weight:600;color:${t.foreground};">${escapeHtml(input.headline)}</td></tr>
${steps.length ? `<tr><td style="padding:12px 0 0;">${stepsHtml(steps)}</td></tr>\n` : ""}${input.lines
    .map((l, i) => `<tr><td style="padding:${i === 0 ? "12px" : "8px"} 0 0;font-size:15px;line-height:1.5;color:${t.fg2};">${escapeWithBreaks(l)}</td></tr>\n`)
    .join("")}<tr><td style="padding:24px 0 0;"><a href="${escapeHtml(url)}" style="${PRIMARY}">${escapeHtml(input.button.label)}</a></td></tr>
${
  input.request
    ? `<tr><td style="padding:28px 0 0;"><div style="border-top:1px solid ${t.border};"></div></td></tr>
<tr><td style="padding:20px 0 0;${LABEL}">Your request</td></tr>
<tr><td style="padding:4px 0 0;font-size:16px;line-height:1.4;font-weight:600;color:${t.foreground};">${escapeHtml(input.request.title)}</td></tr>
<tr><td style="padding:2px 0 0;font-size:14px;line-height:1.5;color:${t.mutedForeground};">${escapeHtml(input.request.where)}</td></tr>
${facts.length ? `<tr><td style="padding:12px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${facts.map((f) => factRow(f.label, escapeWithBreaks(f.value))).join("")}</table></td></tr>\n` : ""}`
    : ""
}<tr><td style="padding:24px 0 0;font-size:13px;line-height:1.5;color:${t.mutedForeground};">${escapeHtml(input.footnote)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { text, html };
}
