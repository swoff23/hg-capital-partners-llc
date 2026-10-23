import { monogramImage } from "@/lib/monogram-image";

// The iOS home-screen icon: the monogram full bleed at 180, since iOS rounds
// the corners itself (docs/brand-guidelines.md, section 6).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return monogramImage(size.width, { bleed: true });
}
