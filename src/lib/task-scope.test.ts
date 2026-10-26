import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { TaskStatus } from "@prisma/client";
import {
  ACTIVE_STATUSES,
  CLOSED_STATUSES,
  OVERDUE_ELIGIBLE,
  STATUS_LABEL,
  STATUS_ORDER,
  excludeTemplateTasks,
  isActiveStatus,
  statusRank,
} from "./task-scope";

const ALL = Object.values(TaskStatus);

test("every status is either active or closed, never both", () => {
  assert.deepEqual([...ACTIVE_STATUSES, ...CLOSED_STATUSES].sort(), [...ALL].sort());
  for (const s of ACTIVE_STATUSES) assert.equal((CLOSED_STATUSES as readonly string[]).includes(s), false);
});

test("STATUS_ORDER and STATUS_LABEL cover every status exactly once", () => {
  assert.deepEqual([...STATUS_ORDER].sort(), [...ALL].sort());
  assert.deepEqual(Object.keys(STATUS_LABEL).sort(), [...ALL].sort());
  assert.equal(STATUS_LABEL.OPEN, "To do");
});

test("statusRank sorts by display order, not enum order", () => {
  const shuffled: TaskStatus[] = ["CANCELED", "WAITING", "DONE", "OPEN", "REVIEW"];
  assert.deepEqual(
    shuffled.sort((a, b) => statusRank(a) - statusRank(b)),
    ["OPEN", "WAITING", "REVIEW", "DONE", "CANCELED"],
  );
});

test("Waiting and Review are active but never overdue", () => {
  assert.equal(isActiveStatus("WAITING"), true);
  assert.equal(isActiveStatus("REVIEW"), true);
  assert.equal(isActiveStatus("DONE"), false);
  assert.equal((OVERDUE_ELIGIBLE as readonly string[]).includes("WAITING"), false);
  assert.equal((OVERDUE_ELIGIBLE as readonly string[]).includes("REVIEW"), false);
});

// "Open" means five statuses now. A literal `status: "OPEN"` in a query would
// silently hide Scheduled, In progress, Waiting and Review work. Writes that
// really mean OPEN carry a "status-write" comment on the same line.
test('no query filters on the literal status "OPEN"', () => {
  const root = path.join(__dirname, "..");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts")) {
        const src = fs.readFileSync(p, "utf8");
        const bad = src.split("\n").some((line) => /status:\s*"OPEN"/.test(line) && !line.includes("status-write"));
        if (bad) offenders.push(path.relative(root, p));
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], "use activeTask from @/lib/task-scope instead");
});

// Playbook rows imported from Asana sit in the Template bucket. They aren't
// work, so every list, count and search of tasks leaves them out (the test
// docs/asana-migration-plan.md asks for, under "Helpers in task-scope.ts"). A
// file that queries tasks must reach for excludeTemplateTasks, or for one of
// the `where` builders that carry it; the few that don't have a reason.
test("every Task list, count and search query leaves Template rows out", () => {
  const root = path.join(__dirname, "..");
  const QUERY = /\.task\.(findMany|count|groupBy|aggregate|findFirst)\(/;
  const FILTERED = /excludeTemplateTasks|paletteTaskWhere|allTasksWhere|viewScopeWhere/;
  const EXEMPT: Record<string, string> = {
    "lib/tasks/core.ts": "renames a unit label on the tasks of one property, as a write",
    "lib/tasks/bulk.ts": "moves the dates of tasks picked by id",
    "lib/portal/queries.ts": "a contractor's jobs, only through the access rows they were given",
    "lib/asana/import.ts": "the import reads its own CSV rows by id, Template rows included",
  };
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && QUERY.test(fs.readFileSync(p, "utf8"))) {
        found.push(path.relative(root, p).split(path.sep).join("/"));
      }
    }
  };
  walk(root);

  const unfiltered = found.filter((f) => !EXEMPT[f] && !FILTERED.test(fs.readFileSync(path.join(root, f), "utf8")));
  assert.deepEqual(unfiltered, [], "spread excludeTemplateTasks into the where, or use a builder in lib/tasks/list-query.ts");

  const stale = Object.keys(EXEMPT).filter((f) => !found.includes(f));
  assert.deepEqual(stale, [], "an exemption for a file that no longer queries tasks");
});

test("excludeTemplateTasks keeps every bucket but Template", () => {
  assert.deepEqual(excludeTemplateTasks, { bucket: { not: "Template" } });
});
