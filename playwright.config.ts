import crypto from "node:crypto";
import { defineConfig } from "@playwright/test";
import { DEVICES } from "./tests/devices/config";

// DEVICES_PORT lets two checkouts run the device check side by side.
const PORT = Number(process.env.DEVICES_PORT) || 3100;
// Set before the build starts, so files edited mid-run still count as
// unchecked for scripts/device-check-gate.mjs.
process.env.DEVICE_CHECK_STARTED_AT ??= String(Date.now());
// A throwaway secret for this run's server. tests/devices/setup.ts signs the
// session cookie with it, so signed-in pages load without a password.
process.env.DEVICE_SESSION_SECRET ??= crypto.randomBytes(32).toString("base64url");

export default defineConfig({
  testDir: "./tests/devices",
  globalSetup: "./tests/devices/setup.ts",
  fullyParallel: true,
  retries: 0,
  timeout: 120_000,
  reporter: [["line"], ["./tests/devices/gallery-reporter.ts"]],
  use: { baseURL: `http://localhost:${PORT}` },
  projects: DEVICES,
  webServer: {
    // A production build in its own folder, so it never touches `npm run dev`
    // (.next/dev) or a regular build (.next). Calls next directly to skip
    // scripts/prebuild.mjs, which applies migrations: this run never changes
    // the local schema (setup.ts writes only the portal fixture's rows).
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 600_000,
    // PORTAL_ENABLED so the (portal) pages and the reset pages render instead
    // of 404ing; tests/devices/setup.ts seeds their fixture contractor.
    env: { NEXT_DIST_DIR: ".next-devices", SESSION_SECRET: process.env.DEVICE_SESSION_SECRET, PORTAL_ENABLED: "1" },
  },
});
