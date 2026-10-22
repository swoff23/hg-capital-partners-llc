import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { FullConfig, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";
import { KIND_LABEL, SEVERITY, type Finding, type FindingKind } from "./checks";
import { listRoutes } from "./routes";
import {
  DEVICES,
  KNOWN_ISSUES_FILE,
  REPORT_DIR,
  UPDATE_KNOWN_ISSUES,
  loadKnownIssues,
  type DeviceMeta,
  type KnownIssues,
} from "./config";

type State = "error" | "known" | "warning" | "ok";

interface Cell {
  url: string | null;
  shot: string | null;
  findings: Finding[];
  /** Set when the test died before it could report (timeout, crash) */
  crash?: string;
  durationMs: number;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const isError = (f: Finding) => SEVERITY[f.kind] === "error";

function cellState(cell: Cell): State {
  if (cell.crash !== undefined || cell.findings.some((f) => isError(f) && !f.known)) return "error";
  if (cell.findings.some(isError)) return "known";
  if (cell.findings.length) return "warning";
  return "ok";
}

const RANK: Record<State, number> = { ok: 0, warning: 1, known: 2, error: 3 };

function gitInfo() {
  const run = (cmd: string) => {
    try {
      return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      return "";
    }
  };
  return {
    sha: (process.env.GITHUB_SHA || run("git rev-parse HEAD")).slice(0, 7),
    branch: process.env.GITHUB_REF_NAME || run("git rev-parse --abbrev-ref HEAD"),
  };
}

/**
 * Writes device-report/index.html (screenshot grid) and summary.md (new errors as a table).
 * With UPDATE_KNOWN_ISSUES set, also rewrites known-issues.json from this run.
 */
export default class GalleryReporter implements Reporter {
  private devices: { name: string; meta: DeviceMeta }[] = [];
  private rows = new Map<string, Map<string, Cell>>();

  onBegin(_config: FullConfig, suite: Suite) {
    fs.rmSync(REPORT_DIR, { recursive: true, force: true });
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    this.devices = suite.suites.map((s) => {
      const project = s.project()!;
      return { name: project.name, meta: project.metadata as DeviceMeta };
    });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const project = test.parent.project()!.name;
    const attachment = result.attachments.find((a) => a.name === "device-findings");
    const data = attachment?.body ? JSON.parse(attachment.body.toString()) : null;
    const row = this.rows.get(test.title) ?? new Map<string, Cell>();
    row.set(project, {
      url: data?.url ?? null,
      shot: data?.shot ?? null,
      findings: data?.findings ?? [],
      crash: data ? undefined : (result.error?.message ?? "Didn't finish").split("\n")[0],
      durationMs: result.duration,
    });
    this.rows.set(test.title, row);
  }

  onEnd() {
    const patterns = Array.from(this.rows.keys()).sort();
    const pageStates = patterns.map((p) =>
      Array.from(this.rows.get(p)!.values())
        .map(cellState)
        .reduce<State>((a, b) => (RANK[b] > RANK[a] ? b : a), "ok"),
    );
    const count = (s: State) => pageStates.filter((x) => x === s).length;
    const totals =
      `${patterns.length} pages on ${this.devices.length} devices. ` +
      `${count("error")} with new errors, ${count("known")} with known issues only, ${count("warning")} with warnings only.`;

    const { sha, branch } = gitInfo();
    fs.writeFileSync(path.join(REPORT_DIR, "index.html"), this.html(patterns, totals, sha, branch));
    fs.writeFileSync(path.join(REPORT_DIR, "summary.md"), this.markdown(patterns, totals));
    if (UPDATE_KNOWN_ISSUES) this.writeKnownIssues();

    // Read by scripts/device-check-gate.mjs, which holds back commits of UI
    // changes made after the last complete run.
    const complete =
      this.devices.length === DEVICES.length &&
      patterns.length === listRoutes().length &&
      patterns.every((p) => this.rows.get(p)!.size === DEVICES.length);
    const newErrors = UPDATE_KNOWN_ISSUES
      ? []
      : patterns.filter((p) => Array.from(this.rows.get(p)!.values()).some((c) => cellState(c) === "error"));
    fs.writeFileSync(
      path.join(REPORT_DIR, "last-run.json"),
      JSON.stringify(
        { startedAt: Number(process.env.DEVICE_CHECK_STARTED_AT), finishedAt: Date.now(), complete, pagesWithNewErrors: newErrors },
        null,
        2,
      ) + "\n",
    );

    const time = this.devices
      .map(({ name }) => {
        let ms = 0;
        this.rows.forEach((row) => (ms += row.get(name)?.durationMs ?? 0));
        return `${name} ${Math.round(ms / 1000)}s`;
      })
      .join(", ");
    console.log(`\n${totals}\nTest time per device: ${time}\nReport: ${path.join(REPORT_DIR, "index.html")}\n`);
  }

  private writeKnownIssues() {
    // Merge, so a run limited to some pages or devices keeps everyone else's entries.
    const known: KnownIssues = loadKnownIssues();
    this.rows.forEach((row, pattern) => {
      row.forEach((cell, project) => {
        if (cell.crash !== undefined) return;
        const kinds = Array.from(new Set(cell.findings.filter(isError).map((f) => f.kind))).sort() as FindingKind[];
        known[pattern] = known[pattern] ?? {};
        if (kinds.length) known[pattern][project] = kinds;
        else delete known[pattern][project];
        if (!Object.keys(known[pattern]).length) delete known[pattern];
      });
    });
    const sorted: KnownIssues = {};
    for (const pattern of Object.keys(known).sort()) {
      sorted[pattern] = {};
      for (const { name } of this.devices) if (known[pattern][name]) sorted[pattern][name] = known[pattern][name];
      for (const name of Object.keys(known[pattern])) sorted[pattern][name] ??= known[pattern][name];
    }
    fs.writeFileSync(KNOWN_ISSUES_FILE, JSON.stringify(sorted, null, 2) + "\n");
    console.log(`Updated ${path.relative(process.cwd(), KNOWN_ISSUES_FILE)}`);
  }

  private markdown(patterns: string[], totals: string) {
    const lines: string[] = [];
    for (const pattern of patterns) {
      const row = this.rows.get(pattern)!;
      for (const { name, meta } of this.devices) {
        const cell = row.get(name);
        if (!cell) continue;
        if (cell.crash !== undefined) {
          lines.push(`| \`${pattern}\` | ${meta.label} | Didn't finish: ${cell.crash.replace(/\|/g, "\\|")} |`);
        }
        for (const f of cell.findings.filter((x) => isError(x) && !x.known)) {
          const at = meta.sweep ? ` at ${f.widths.join(", ")}px` : "";
          const text = `${KIND_LABEL[f.kind]}: ${f.where} (${f.detail})${at}`.replace(/\|/g, "\\|");
          lines.push(`| \`${pattern}\` | ${meta.label} | ${text} |`);
        }
      }
    }
    const limit = 80;
    return (
      [
        `## Device check`,
        ``,
        totals,
        ``,
        `Screenshots of every page on every device are in \`device-report/index.html\`.`,
        ``,
        ...(lines.length
          ? [
              `### New errors`,
              ``,
              `| Page | Device | Problem |`,
              `| --- | --- | --- |`,
              ...lines.slice(0, limit),
              ...(lines.length > limit ? [``, `${lines.length - limit} more in the report.`] : []),
            ]
          : [`No new errors.`]),
      ].join("\n") + "\n"
    );
  }

  private html(patterns: string[], totals: string, sha: string, branch: string) {
    const head = this.devices
      .map(({ meta }) => `<th><span class="dev">${esc(meta.label)}</span><span class="covers">${esc(meta.covers)}</span></th>`)
      .join("");

    const body = patterns
      .map((pattern) => {
        const row = this.rows.get(pattern)!;
        let rowState: State = "ok";
        const tds = this.devices
          .map(({ name, meta }) => {
            const cell = row.get(name);
            if (!cell) return `<td class="empty"></td>`;
            const state = cellState(cell);
            if (RANK[state] > RANK[rowState]) rowState = state;
            const fresh = cell.findings.filter((f) => isError(f) && !f.known);
            const known = cell.findings.filter((f) => isError(f) && f.known);
            const warnings = cell.findings.filter((f) => !isError(f));
            const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
            const status =
              cell.crash !== undefined
                ? "Didn't finish"
                : [
                    fresh.length && plural(fresh.length, "new error"),
                    known.length && `${known.length} known`,
                    warnings.length && plural(warnings.length, "warning"),
                  ]
                    .filter(Boolean)
                    .join(", ") || "OK";
            const items = [...fresh, ...known, ...warnings]
              .map((f) => {
                const cls = !isError(f) ? "warning" : f.known ? "known" : "error";
                const tag = f.known ? " <span class=\"tag\">Known</span>" : "";
                const at = meta.sweep ? ` <span class="at">at ${f.widths.join(", ")}px</span>` : "";
                return `<li class="${cls}"><b>${esc(KIND_LABEL[f.kind])}</b>${tag}<br>${esc(f.where)} <span class="detail">${esc(f.detail)}</span>${at}</li>`;
              })
              .join("");
            const details =
              cell.crash !== undefined
                ? `<p class="crash">${esc(cell.crash)}</p>`
                : items
                  ? `<details><summary>Details</summary><ul>${items}</ul></details>`
                  : "";
            const img = cell.shot
              ? `<a href="${esc(cell.shot)}" target="_blank"><img loading="lazy" src="${esc(cell.shot)}" alt=""></a>`
              : `<div class="noshot"></div>`;
            return `<td class="${state}">${img}<div class="status"><i></i>${status}</div>${details}</td>`;
          })
          .join("");
        const url = Array.from(row.values()).find((c) => c.url)?.url;
        const link = url ? `<a href="${esc(url)}" class="url">${esc(url)}</a>` : "";
        return `<tr data-state="${rowState}"><th class="route"><code>${esc(pattern)}</code>${link}</th>${tds}</tr>`;
      })
      .join("\n");

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Device check ${esc(sha)}</title>
<style>
  :root { --bg:#f8fafc; --card:#fff; --line:#e2e8f0; --text:#0f172a; --muted:#64748b; --red:#dc2626; --known:#9333ea; --amber:#d97706; --green:#16a34a; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); }
  header { position: sticky; left: 0; padding: 20px 16px 12px; }
  h1 { margin: 0 0 4px; font-size: 20px; font-weight: 700; }
  .meta { color: var(--muted); margin: 0 0 12px; }
  .filters { display: flex; gap: 8px; overflow-x: auto; }
  .filters button { flex: none; font: inherit; font-weight: 500; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--muted); cursor: pointer; }
  .filters button[aria-pressed="true"] { background: var(--text); border-color: var(--text); color: #fff; }
  .wrap { overflow: auto; max-height: calc(100vh - 110px); border-top: 1px solid var(--line); }
  table { border-collapse: separate; border-spacing: 0; }
  thead th { position: sticky; top: 0; z-index: 2; background: var(--bg); text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: bottom; }
  .dev { display: block; font-weight: 700; }
  .covers { display: block; color: var(--muted); font-weight: 400; font-size: 12px; max-width: 180px; }
  th.route { position: sticky; left: 0; z-index: 1; background: var(--bg); text-align: left; vertical-align: top; padding: 12px 8px; min-width: 200px; max-width: 220px; font-weight: 500; border-bottom: 1px solid var(--line); }
  thead th:first-child { left: 0; z-index: 3; }
  th.route code { display: block; word-break: break-all; }
  .url { display: block; color: var(--muted); font-size: 12px; font-weight: 400; margin-top: 2px; word-break: break-all; }
  td { vertical-align: top; padding: 12px 8px; width: 196px; border-bottom: 1px solid var(--line); }
  td img, .noshot { display: block; width: 180px; height: 260px; object-fit: cover; object-position: top left; border-radius: 8px; border: 2px solid var(--line); background: var(--card); }
  td.error img { border-color: var(--red); }
  td.known img { border-color: var(--known); }
  td.warning img { border-color: var(--amber); }
  .status { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-weight: 500; }
  .status i { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--green); }
  td.error .status i { background: var(--red); }
  td.known .status i { background: var(--known); }
  td.warning .status i { background: var(--amber); }
  details { margin-top: 4px; width: 180px; }
  summary { cursor: pointer; color: var(--muted); }
  ul { margin: 6px 0 0; padding: 0; list-style: none; }
  li { margin-bottom: 8px; padding-left: 8px; border-left: 2px solid var(--amber); font-size: 12px; word-break: break-word; }
  li.error { border-left-color: var(--red); }
  li.known { border-left-color: var(--known); }
  li b { font-weight: 500; }
  .tag { font-size: 11px; color: var(--known); }
  .detail, .at { color: var(--muted); }
  .crash { color: var(--red); font-size: 12px; width: 180px; word-break: break-word; }
  body[data-filter="error"] tr:not([data-state="error"]),
  body[data-filter="issues"] tr[data-state="ok"] { display: none; }
</style></head>
<body data-filter="all">
<header>
  <h1>Device check</h1>
  <p class="meta">${esc(branch)} @ ${esc(sha)}. ${esc(totals)}</p>
  <div class="filters">
    <button type="button" data-f="all" aria-pressed="true">All pages</button>
    <button type="button" data-f="error" aria-pressed="false">New errors</button>
    <button type="button" data-f="issues" aria-pressed="false">Any issue</button>
  </div>
</header>
<div class="wrap"><table><thead><tr><th class="route">Page</th>${head}</tr></thead><tbody>
${body}
</tbody></table></div>
<script>
  document.querySelectorAll(".filters button").forEach((b) => b.addEventListener("click", () => {
    document.body.dataset.filter = b.dataset.f;
    document.querySelectorAll(".filters button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));
</script>
</body></html>`;
  }
}
