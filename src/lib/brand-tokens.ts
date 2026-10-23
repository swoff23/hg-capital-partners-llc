/**
 * A hex mirror of the light tokens on :root in src/app/globals.css, for email,
 * which can't read CSS variables (docs/brand-guidelines.md, section 11). Names
 * are the CSS custom properties in camelCase: fill1 is --fill-1, lineStrong is
 * --line-strong. brand-tokens.test.ts fails when this file and globals.css
 * disagree, so change both together.
 */
export const brandTokens = {
  // Neutrals
  canvas: "#f8f7f3",
  surface: "#ffffff",
  raised: "#ffffff",
  fill1: "#f2f0ec",
  fill2: "#e7e5e0",
  select: "#e4e9f0",
  line: "#e7e5e0",
  lineStrong: "#d5d1ca",
  lineControl: "#84817a",
  fg3: "#5b6576",
  fg2: "#424e61",
  fg1: "#152133",

  // Act (ink)
  act: "#152133",
  onAct: "#ffffff",
  actHover: "#28364d",

  // Status
  danger: "#b91c1c",
  dangerTint: "#fff2f1",
  dangerFill: "#b91c1c",
  dangerFillHover: "#a31818",
  onDanger: "#ffffff",
  warn: "#a54e09",
  warnTint: "#fff5ec",
  ok: "#1d7038",
  okTint: "#eff9f1",

  // Toast and chart
  toastBg: "#152133",
  toastFg: "#ffffff",
  toastFg2: "#c0bdb7",
  chart1: "#384e6e",

  // Brand. goldDeep is gold on a light page: the rule on reports and email letterhead.
  gold: "#c8a765",
  goldDeep: "#86662c",
  inkTile: "#152133",

  // Photo marks and the public-only pair, fixed in both themes
  pillFg: "#152133",
  onPhoto: "#ece9e4",
  pubFaint: "#858991",
  pubGoldHi: "#d8ba7e",
} as const;

export type BrandToken = keyof typeof brandTokens;

/**
 * The few dark tokens that something outside CSS needs: the browser's theme
 * color (src/app/layout.tsx) and the favicon's dark-ground edge
 * (src/lib/monogram-art.ts). Each mirrors the value in globals.css's
 * :root[data-theme="dark"] block; brand-tokens.test.ts checks them too.
 */
export const brandTokensDark = {
  canvas: "#0a0e17",
  line: "#212835",
} as const satisfies Partial<Record<BrandToken, string>>;

/** The CSS custom property a token mirrors: "fill1" is "--fill-1", "toastFg2" is "--toast-fg-2". */
export function cssVarName(token: BrandToken): string {
  return "--" + token.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()).replace(/\d+/g, (d) => "-" + d);
}
