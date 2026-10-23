import { monogramImage } from "@/lib/monogram-image";

// The 512 icon beside icon.svg: what Android uses for a home-screen shortcut,
// and what a browser without SVG favicons scales down. The rounded tile, as
// in icon.svg (docs/brand-guidelines.md, section 6).
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function HomeScreenIcon() {
  return monogramImage(size.width);
}
