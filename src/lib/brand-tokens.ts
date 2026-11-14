/**
 * A hex mirror of the light tokens on :root in src/app/globals.css, for email,
 * which can't read CSS variables (docs/brand-guidelines.md, section 4). Names
 * are the CSS custom properties in camelCase: mutedForeground is
 * --muted-foreground, lineStrong is --line-strong. brand-tokens.test.ts fails
 * when this file and globals.css disagree, so change both together.
 */
export const brandTokens = {
  // Neutrals
  canvas: "#f8f7f3",
  background: "#ffffff",
  popover: "#ffffff",
  muted: "#f2f0ec",
  accent: "#e7e5e0",
  select: "#e4e9f0",
  border: "#e7e5e0",
  lineStrong: "#d5d1ca",
  input: "#84817a",
  mutedForeground: "#5b6576",
  fg2: "#424e61",
  foreground: "#152133",

  // Primary (ink)
  primary: "#152133",
  primaryForeground: "#ffffff",
  primaryHover: "#28364d",

  // Status
  destructive: "#b91c1c",
  destructiveTint: "#fff2f1",
  destructiveFill: "#b91c1c",
  destructiveFillHover: "#a31818",
  destructiveForeground: "#ffffff",
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
  border: "#212835",
} as const satisfies Partial<Record<BrandToken, string>>;

/** The CSS custom property a token mirrors: "mutedForeground" is "--muted-foreground", "toastFg2" is "--toast-fg-2". */
export function cssVarName(token: BrandToken): string {
  return "--" + token.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()).replace(/\d+/g, (d) => "-" + d);
}
