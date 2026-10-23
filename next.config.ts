import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The device check (npm run test:devices) builds into .next-devices so it
  // never locks or overwrites a regular build. Build config, so it reads
  // process.env directly rather than through src/lib/env.ts.
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
