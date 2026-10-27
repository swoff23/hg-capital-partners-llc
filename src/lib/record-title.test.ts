import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MAX_TAB_TITLE, recordTitle } from "./record-title";

test("recordTitle: a building by its street line, a person and a task by name", () => {
  assert.equal(recordTitle("property", "118 Congress St. Buffalo, NY 14213"), "118 Congress St.");
  assert.equal(recordTitle("deal", "933 Lafayette Avenue Buffalo, NY 14209"), "933 Lafayette Avenue");
  assert.equal(recordTitle("task", "  Mud   drywall "), "Mud drywall");
  assert.equal(recordTitle("contractor", "Kenneth Gonzalez"), "Kenneth Gonzalez");
  assert.equal(recordTitle("template", "Move-in turnover"), "Move-in turnover");
  assert.equal(recordTitle("task", ""), null);
  assert.equal(recordTitle("contractor", null), null);
});

test("recordTitle: a long title is cut on a word, since a tab shows only its start", () => {
  const long = "Pieter to confirm 118 Congress Upper dishwasher install and the countertop template visit";
  const t = recordTitle("task", long)!;
  assert.ok(t.length <= MAX_TAB_TITLE, t);
  assert.ok(t.endsWith("…"), t);
  assert.ok(long.startsWith(t.slice(0, -1)), t);
  assert.ok(!t.slice(0, -1).endsWith(" "), t);
});

test("every staff page names its tab", () => {
  // Every tab and history entry read "HG Capital", so tabs couldn't be told apart.
  let dir = process.cwd();
  while (!fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) {
    const up = path.dirname(dir);
    assert.notEqual(up, dir, "could not locate the repo root");
    dir = up;
  }
  const app = path.join(dir, "src", "app", "(app)");
  const pages: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      // Parallel-route slots render over a page that has its own title.
      if (e.isDirectory() && !e.name.startsWith("@")) walk(path.join(d, e.name));
      else if (e.name === "page.tsx") pages.push(path.join(d, e.name));
    }
  };
  walk(app);
  assert.ok(pages.length > 15);
  for (const page of pages) {
    const rel = path.relative(app, page);
    const src = fs.readFileSync(page, "utf8");
    // /tasks/all only redirects to /tasks, and a section's not-found catch-all renders no page of its own.
    if (rel === path.join("tasks", "all", "page.tsx") || rel.includes("[...missing]")) continue;
    assert.match(src, /export const metadata\b|export async function generateMetadata\b/, `${rel} sets no title`);
  }
});
