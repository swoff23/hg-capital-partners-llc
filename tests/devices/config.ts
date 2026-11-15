import fs from "node:fs";
import path from "node:path";
import { devices, type PlaywrightTestConfig } from "@playwright/test";
import type { FindingKind } from "./checks";

/**
 * Light by default. `npm run test:devices:dark` (DEVICES_SCHEME=dark) runs the
 * same check with every browser in dark mode, so the app takes its dark theme
 * (THEME_SCRIPT follows the system when nothing is saved), and writes its own
 * report to device-report-dark/. scripts/device-check-gate.mjs reads the light
 * run only (docs/specs/design-foundation.md, sections 7.1 and 7.4).
 */
export const COLOR_SCHEME: "light" | "dark" = (() => {
  const scheme = process.env.DEVICES_SCHEME ?? "light";
  if (scheme !== "light" && scheme !== "dark") throw new Error(`DEVICES_SCHEME is "light" or "dark", not "${scheme}".`);
  return scheme;
})();

export const REPORT_DIR = path.join(__dirname, COLOR_SCHEME === "dark" ? "../../device-report-dark" : "../../device-report");

// Problems that were already there, by page and device, so a run only fails
// on new ones. Fixing a page and rerunning with
// `npm run test:devices:known` drops its entry.
export const KNOWN_ISSUES_FILE = path.join(__dirname, "known-issues.json");
export type KnownIssues = Record<string, Record<string, FindingKind[]>>;

export function loadKnownIssues(): KnownIssues {
  return fs.existsSync(KNOWN_ISSUES_FILE) ? JSON.parse(fs.readFileSync(KNOWN_ISSUES_FILE, "utf8")) : {};
}

export const UPDATE_KNOWN_ISSUES = !!process.env.UPDATE_KNOWN_ISSUES;

export interface DeviceMeta {
  /** Column heading in the report */
  label: string;
  /** Which real browsers this run stands in for */
  covers: string;
  touch: boolean;
  ios: boolean;
  /** Also sweep every width from 320 to 1920 */
  sweep: boolean;
}

type Project = NonNullable<PlaywrightTestConfig["projects"]>[number];

function device(name: string, use: Project["use"], meta: DeviceMeta): Project {
  return { name, use, metadata: meta };
}

// WebKit is Safari's engine and the only engine allowed on iPhone and iPad, so
// it also stands in for Chrome on iOS. Chromium covers Chrome everywhere else.
// Geist is self-hosted through next/font, so every device gets the same font
// and Android needs no stand-in.
export const DEVICES: Project[] = [
  device("iphone-se", devices["iPhone SE (3rd gen)"], {
    label: "iPhone SE",
    covers: "Safari and Chrome on iPhone, 375x667",
    touch: true,
    ios: true,
    sweep: false,
  }),
  device("iphone-17", devices["iPhone 17"], {
    label: "iPhone 17",
    covers: "Safari and Chrome on iPhone, 402x681",
    touch: true,
    ios: true,
    sweep: false,
  }),
  device("galaxy-s24", devices["Galaxy S24"], {
    label: "Galaxy S24",
    covers: "Chrome on Android, 360x780",
    touch: true,
    ios: false,
    sweep: false,
  }),
  device("ipad-mini", devices["iPad Mini"], {
    label: "iPad Mini",
    covers: "Safari and Chrome on iPad, 768x1024",
    touch: true,
    ios: true,
    sweep: false,
  }),
  device("desktop-safari", { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } }, {
    label: "Safari",
    covers: "Safari on Mac, 1280x800 plus 320 to 1920 sweep",
    touch: false,
    ios: false,
    sweep: true,
  }),
  device("desktop-chrome", { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } }, {
    label: "Chrome",
    covers: "Chrome on Mac and Windows, 1280x800 plus 320 to 1920 sweep",
    touch: false,
    ios: false,
    sweep: true,
  }),
];
