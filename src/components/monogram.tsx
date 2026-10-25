import { MONOGRAM_GLYPHS, MONOGRAM_TRANSFORM, MONOGRAM_VIEWBOX, monogramRadius } from "@/lib/monogram-art";
import { cn } from "@/lib/utils";

const MIN = 16;
const MAX = 512;

/**
 * The HG monogram (docs/brand-guidelines.md, section 6): the letters in
 * Geist 600 at -0.04em, --gold on an --ink-tile square with a radius of 22%
 * of the size rounded to whole pixels (5 at 24, 7 at 32). On dark grounds the
 * tile keeps its ink and adds a 1px --line edge (--tile-edge, which matches
 * the tile in light). It is never redrawn as gold letters alone, and never
 * sits on a photo without its tile.
 *
 * The letters are the favicon's outlines (lib/monogram-art.ts), centered on
 * their ink across and on the cap height up and down, so the pair sits on the
 * tile's center at every size, as in icon.svg. Live text would center its
 * line box instead, which puts the letters off center.
 *
 * Sizes 16 (the favicon, the minimum) to 512: 24 in the sidebar and phone
 * top bar, 32 in the portal header and emails. Leave 25% of the size clear on
 * every side. Decorative by default, since a wordmark sits beside it; pass
 * `title` when it stands alone.
 */
export function Monogram({ size = 24, title, className }: { size?: number; title?: string; className?: string }) {
  const px = Math.min(MAX, Math.max(MIN, Math.round(size)));
  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn(
        "inline-flex shrink-0 select-none bg-ink-tile text-gold ring-1 ring-inset ring-tile-edge",
        className,
      )}
      style={{ width: px, height: px, borderRadius: monogramRadius(px) }}
    >
      <svg viewBox={MONOGRAM_VIEWBOX} width={px} height={px} fill="currentColor" aria-hidden="true" focusable="false">
        <g transform={MONOGRAM_TRANSFORM}>
          {MONOGRAM_GLYPHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </svg>
    </span>
  );
}
