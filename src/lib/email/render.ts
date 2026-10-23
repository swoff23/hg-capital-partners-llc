/**
 * The one email layout (docs/asana-migration-plan.md §6, screen 7): the HG
 * name, one line, one button. Plain text goes alongside for clients that
 * don't render HTML and for the dev console. Pure; see render.test.ts.
 *
 * Inline styles and a table because that's what Gmail and iOS Mail honor.
 * Colors are the public site's: near-black text on white, gold rule.
 */

export interface PlainEmailInput {
  /** One line of body copy. */
  line: string;
  /** Short lines under it, one per change (the task notification bundles). */
  items?: string[];
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

const BRAND = "HG Capital Partners";

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
    BRAND,
    "",
    input.line,
    ...(items.length ? ["", ...items] : []),
    "",
    `${input.buttonLabel}: ${url.toString()}`,
    ...(input.footnote ? ["", input.footnote] : []),
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#18181b;">
<tr><td style="font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:#8a6d2f;">${BRAND}</td></tr>
<tr><td style="padding:12px 0 0;"><div style="height:1px;width:48px;background:#c8a765;"></div></td></tr>
<tr><td style="padding:24px 0 0;font-size:16px;line-height:1.5;">${escapeHtml(input.line)}</td></tr>
${items.map((item) => `<tr><td style="padding:8px 0 0;font-size:15px;line-height:1.5;color:#3f3f46;">${escapeHtml(item)}</td></tr>\n`).join("")}<tr><td style="padding:24px 0 0;">
<a href="${href}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:999px;">${escapeHtml(input.buttonLabel)}</a>
</td></tr>
${input.footnote ? `<tr><td style="padding:24px 0 0;font-size:13px;line-height:1.5;color:#71717a;">${escapeHtml(input.footnote)}</td></tr>\n` : ""}</table>
</td></tr>
</table>
</body>
</html>`;

  return { text, html };
}
