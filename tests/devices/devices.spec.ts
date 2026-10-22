import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { KIND_LABEL, SEVERITY, scanPage, type Finding, type FindingKind } from "./checks";
import { listRoutes, routeUrl } from "./routes";
import { REPORT_DIR, UPDATE_KNOWN_ISSUES, loadKnownIssues, type DeviceMeta } from "./config";

const known = loadKnownIssues();

// Mirrors SESSION_COOKIE in src/lib/session.ts, which is server-only and can't
// be imported here. setup.ts signs the value.
const SESSION_COOKIE = "hgos_session";

// Every width from the responsiveness rule, including both sides of each
// breakpoint edge (639/640, 767/768, 1023/1024, 1279/1280).
const SWEEP_WIDTHS = [
  320, 360, 390, 430, 480, 600, 639, 640, 700, 767, 768, 900, 1023, 1024, 1100, 1180, 1279, 1280, 1366, 1440,
  1600, 1920,
];

async function settle(page: Page, ms: number) {
  await page.evaluate(
    () =>
      document.fonts.ready.then(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      ),
  );
  await page.waitForTimeout(ms);
}

class Findings {
  private byKey = new Map<string, Finding>();

  add(kind: FindingKind, where: string, detail: string, width: number) {
    const key = `${kind}|${where}|${kind === "overflow" ? "" : detail}`;
    const existing = this.byKey.get(key);
    if (existing) {
      if (!existing.widths.includes(width)) existing.widths.push(width);
      return;
    }
    this.byKey.set(key, { kind, where, detail, widths: [width] });
  }

  list() {
    return Array.from(this.byKey.values());
  }
}

function slug(pattern: string) {
  return pattern === "/" ? "home" : pattern.replace(/^\//, "").replace(/[^a-zA-Z0-9_-]+/g, "_");
}

for (const route of listRoutes()) {
  test(route.pattern, async ({ page, baseURL }, testInfo) => {
    const target = routeUrl(route, JSON.parse(process.env.DEVICE_SAMPLES ?? "{}"));
    if ("problem" in target) throw new Error(target.problem);

    const meta = testInfo.project.metadata as DeviceMeta;
    const origin = new URL(baseURL!).origin;
    const findings = new Findings();
    let width = page.viewportSize()!.width;

    if (route.signedIn) {
      await page.context().addCookies([{ name: SESSION_COOKIE, value: process.env.DEVICE_SESSION_TOKEN!, url: origin }]);
    }

    page.on("pageerror", (err) => findings.add("page-error", "page", err.message.split("\n")[0], width));
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      // Failed loads are reported (with the URL) by the response listener.
      if (text.startsWith("Failed to load resource")) return;
      findings.add("console-error", "console", text.split("\n")[0].slice(0, 300), width);
    });
    page.on("response", (res) => {
      const url = new URL(res.url());
      if (url.origin !== origin || res.status() < 400) return;
      findings.add("request-failed", url.pathname, `HTTP ${res.status()}`, width);
    });
    page.on("requestfailed", (req) => {
      const url = new URL(req.url());
      const reason = req.failure()?.errorText ?? "";
      // Next.js cancels prefetches as a normal part of navigation.
      if (url.origin !== origin || /abort|cancel/i.test(reason)) return;
      findings.add("request-failed", url.pathname, reason, width);
    });

    const res = await page.goto(target.url, { waitUntil: "load" });
    if (!res || res.status() >= 400) {
      findings.add("page-error", target.url, `HTTP ${res?.status() ?? "no response"}`, width);
    }
    // A signed-in page that lands on /login means the session didn't take.
    if (route.signedIn && new URL(page.url()).pathname === "/login") {
      findings.add("page-error", target.url, "Redirected to /login: the device session wasn't accepted", width);
    }
    await settle(page, 500);

    for (const f of await page.evaluate(scanPage, { touch: meta.touch, ios: meta.ios })) {
      findings.add(f.kind, f.where, f.detail, width);
    }

    // Named by pattern, not URL: URLs carry this machine's record IDs.
    const shot = path.join(REPORT_DIR, "shots", `${slug(route.pattern)}__${testInfo.project.name}.jpg`);
    fs.mkdirSync(path.dirname(shot), { recursive: true });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.screenshot({
      path: shot,
      type: "jpeg",
      quality: 60,
      scale: "css",
      animations: "disabled",
      fullPage: true,
      // Cap very long pages so the report stays light.
      clip: height > 4000 ? { x: 0, y: 0, width, height: 4000 } : undefined,
    });

    // Desktop runs also sweep every width, since wraps and overflow tend to
    // hide between the named device sizes.
    if (meta.sweep) {
      const start = page.viewportSize()!;
      for (const w of SWEEP_WIDTHS) {
        width = w;
        await page.setViewportSize({ width: w, height: 800 });
        await settle(page, 60);
        for (const f of await page.evaluate(scanPage, { touch: false, ios: false })) {
          findings.add(f.kind, f.where, f.detail, w);
        }
      }
      await page.setViewportSize(start);
    }

    const knownKinds = known[route.pattern]?.[testInfo.project.name] ?? [];
    const list = findings.list().map((f) => (knownKinds.includes(f.kind) ? { ...f, known: true } : f));
    await testInfo.attach("device-findings", {
      contentType: "application/json",
      body: JSON.stringify({ url: target.url, shot: path.relative(REPORT_DIR, shot), findings: list }),
    });

    if (UPDATE_KNOWN_ISSUES) return;
    const errors = list.filter((f) => SEVERITY[f.kind] === "error" && !f.known);
    const summary = errors
      .map((f) => `${KIND_LABEL[f.kind]}: ${f.where} (${f.detail}) at ${f.widths.join(", ")}px`)
      .join("\n");
    expect(errors.length, `${target.url} on ${testInfo.project.name}\n${summary}`).toBe(0);
  });
}
