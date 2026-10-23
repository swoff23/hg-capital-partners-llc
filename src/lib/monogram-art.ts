import { BRAND } from "@/lib/brand";
import { brandTokens, brandTokensDark } from "@/lib/brand-tokens";

/**
 * The HG monogram as vector art, for the places that can't render the
 * Monogram component: the favicon (src/app/icon.svg) and the generated
 * apple-icon and home-screen icon. Same drawing as Monogram
 * (docs/brand-guidelines.md, section 6): the letters in Geist 600 at -0.04em
 * and 42% of the tile, --gold on the --ink-tile square, radius 22%.
 *
 * The letters are outlines, so they render the same where no web font loads
 * (a browser tab, a home screen). They were taken from Geist's variable font
 * at weight 600, set at 1000 units with the -0.04em tracking and the H-G kern
 * (G starts 663 units after H). Units are a thousandth of an em, y down, with
 * the baseline at 0 and the cap height at -710.
 */
export const MONOGRAM_GLYPHS = [
  // H
  "M80 0V-710H210V-413.8H508.6V-710H638.6V0H508.6V-300.6H210V0Z",
  // G
  "M1030.2 16C962.5 16 904.4 0.2 856 -31.4C807.6 -63 770.5 -106.6 744.7 -162.1C718.9 -217.6 706 -281.6 706 -354C706 -425.3 719.1 -489 745.4 -545C771.7 -601 809.5 -645.2 858.9 -677.5C908.3 -709.8 967.7 -726 1037 -726C1096.9 -726 1147.4 -715.7 1188.5 -695.2C1229.6 -674.7 1262.5 -646.1 1287.1 -609.4C1311.7 -572.7 1328.9 -530.3 1338.6 -482L1203.4 -475.2C1195.8 -516.9 1179.1 -550.3 1153.4 -575.3C1127.7 -600.3 1089.1 -612.8 1037.8 -612.8C992.6 -612.8 955.4 -601.2 926.3 -578C897.2 -554.8 875.6 -523.7 861.5 -484.7C847.4 -445.7 840.4 -402.1 840.4 -354C840.4 -304.5 847.4 -260.5 861.4 -221.9C875.4 -183.3 897.1 -152.9 926.6 -130.6C956.1 -108.3 993.7 -97.2 1039.4 -97.2C1074.5 -97.2 1104.7 -104.6 1130.2 -119.3C1155.7 -134 1175.6 -154.1 1190 -179.6C1204.4 -205.1 1212.5 -233.4 1214.2 -264.6L1038.6 -264.6L1038.6 -365.8L1340.6 -365.8L1340.6 0L1256.6 0L1249 -156L1265 -146C1257.8 -114.3 1242.9 -86.2 1220.4 -61.9C1197.9 -37.6 1170.2 -18.5 1137.5 -4.7C1104.8 9.1 1069 16 1030.2 16Z",
] as const;

/** The tile is a 100-unit square; the letters are 42 units, as in Monogram. */
export const MONOGRAM_VIEWBOX = "0 0 100 100";
export const MONOGRAM_RADIUS = 22;

// The pair's ink runs from 80 to 1340.6 units across and 0 to -710 up (the
// cap height), so this puts the letters' center on the tile's center.
const SCALE = 0.042;
const INK_CENTER_X = (80 + 1340.6) / 2;
const CAP_CENTER_Y = -710 / 2;
export const MONOGRAM_TRANSFORM = `translate(${round(50 - INK_CENTER_X * SCALE)} ${round(50 - CAP_CENTER_Y * SCALE)}) scale(${SCALE})`;

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * The monogram as an SVG document. The default is the favicon: the rounded
 * tile, with a 1px --line edge when the browser is dark, so the ink tile
 * never vanishes into a dark tab strip. `bleed` is the full square for
 * apple-icon, which iOS masks itself. `darkEdge: false` drops the edge, for
 * a PNG, which has no dark mode.
 */
export function monogramSvg({ bleed = false, darkEdge = !bleed }: { bleed?: boolean; darkEdge?: boolean } = {}): string {
  const rx = bleed ? "" : ` rx="${MONOGRAM_RADIUS}"`;
  const edge = darkEdge
    ? `<style>.edge{stroke:none}@media (prefers-color-scheme:dark){.edge{stroke:${brandTokensDark.line}}}</style>` +
      `<rect class="edge" width="100" height="100"${rx} fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MONOGRAM_VIEWBOX}" role="img" aria-label="${BRAND.mark}">` +
    `<rect width="100" height="100"${rx} fill="${brandTokens.inkTile}"/>` +
    `<g transform="${MONOGRAM_TRANSFORM}" fill="${brandTokens.gold}">` +
    MONOGRAM_GLYPHS.map((d) => `<path d="${d}"/>`).join("") +
    `</g>` +
    edge +
    `</svg>`
  );
}
