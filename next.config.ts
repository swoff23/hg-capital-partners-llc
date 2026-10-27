import type { NextConfig } from "next";

/**
 * Public Vercel Blob photos (listing photos, and property photos through
 * PhotoThumb) go through the image optimizer. Only our own store's public
 * host: its id is inside the read-write token, "vercel_blob_rw_<storeId>_<secret>"
 * (storeIdFromToken in src/lib/attachments/paths.ts does the same parse). With
 * no token there's no store to allow. Private blobs never come this way: they
 * sit behind the session-checked /api/files routes, which PhotoThumb and the
 * media grid serve unoptimized, since the optimizer forwards no cookies.
 */
function blobImagePatterns(): NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> {
  const parts = (process.env.BLOB_READ_WRITE_TOKEN ?? "").split("_");
  const storeId = parts.length >= 5 && parts[0] === "vercel" && parts[1] === "blob" && parts[2] === "rw" ? parts[3] : "";
  if (!/^[A-Za-z0-9]+$/.test(storeId)) return [];
  return [{ protocol: "https", hostname: `${storeId.toLowerCase()}.public.blob.vercel-storage.com`, port: "", search: "" }];
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The device check (npm run test:devices) builds into .next-devices so it
  // never locks or overwrites a regular build. Build config, so it reads
  // process.env directly rather than through src/lib/env.ts.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: { remotePatterns: blobImagePatterns() },
  async redirects() {
    return [
      {
        // There's no favicon.ico (the icons are app/icon.svg and its PNGs), but
        // crawlers and old browsers still ask for it: send them to the SVG
        // instead of the HTML 404.
        source: "/favicon.ico",
        destination: "/icon.svg",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // Every response: never sniffed into another type, and never framed
        // by another site (clickjacking). Same-origin frames stay allowed:
        // the media viewer shows a PDF from /api/files in an iframe.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        // Pages say the same in CSP, which supersedes X-Frame-Options. Not on
        // /api: the file routes send a CSP of their own (attachments/headers.ts).
        source: "/((?!api/).*)",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
      {
        // Password reset links carry their token in the URL: never pass it on
        // as a Referer, and never keep the page in any cache.
        source: "/login/reset",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
