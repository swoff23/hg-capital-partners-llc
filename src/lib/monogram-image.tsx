import { ImageResponse } from "next/og";
import { monogramSvg } from "@/lib/monogram-art";

/**
 * The monogram as a PNG at `px` square, for the generated icons
 * (src/app/apple-icon.tsx, src/app/icon1.tsx). Drawn from the same SVG as the
 * favicon, so the letters and colors come from monogram-art.ts and the brand
 * tokens. Built once at build time, like any static icon route.
 */
export function monogramImage(px: number, { bleed = false }: { bleed?: boolean } = {}): ImageResponse {
  const src = "data:image/svg+xml," + encodeURIComponent(monogramSvg({ bleed, darkEdge: false }));
  return new ImageResponse(
    // The image renderer (Satori) takes a plain <img>; next/image doesn't apply here.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={px} height={px} alt="" />,
    { width: px, height: px },
  );
}
