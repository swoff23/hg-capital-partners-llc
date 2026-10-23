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
  async headers() {
    return [
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
