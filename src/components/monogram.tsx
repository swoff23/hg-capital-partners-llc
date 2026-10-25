import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const MIN = 16;
const MAX = 512;

/**
 * The HG monogram (docs/brand-guidelines.md, section 6): the letters in
 * Geist 600 at -0.04em, --gold on an --ink-tile square with a radius of 22%
 * of the size. On dark grounds the tile keeps its ink and adds a 1px --line
 * edge (--tile-edge, which matches the tile in light). It is never redrawn as
 * gold letters alone, and never sits on a photo without its tile.
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
        "inline-flex shrink-0 select-none items-center justify-center bg-ink-tile font-sans font-semibold leading-none text-gold ring-1 ring-inset ring-tile-edge",
        className,
      )}
      style={{
        width: px,
        height: px,
        borderRadius: "22%",
        fontSize: px * 0.42,
        letterSpacing: "-0.04em",
        // Negative tracking also trails the last letter; this puts the pair back on center.
        paddingRight: "0.04em",
      }}
    >
      {BRAND.mark}
    </span>
  );
}
