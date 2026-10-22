import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The device check (npm run test:devices) builds into .next-devices so it
  // never locks or overwrites a regular build. Build config, so it reads
  // process.env directly rather than through src/lib/env.ts.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
