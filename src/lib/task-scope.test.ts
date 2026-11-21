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
  activeTask,
  closedTask,
  contractorCanOpen,
  draftTask,
  isActiveStatus,
  isDiscarded,
  isDraftStatus,
  listedTask,
  notDiscarded,
  statusRank,
} from "./task-scope";

const ALL = Object.values(TaskStatus);

test("every status but Draft is either active or closed, never both", () => {
  assert.deepEqual([...ACTIVE_STATUSES, ...CLOSED_STATUSES, "DRAFT"].sort(), [...ALL].sort());
  for (const s of ACTIVE_STATUSES) assert.equal((CLOSED_STATUSES as readonly string[]).includes(s), false);
});

// A draft Claude saved isn't a task until a partner adds it (docs/specs/tasks-from-claude.md 6.1): it is neither
// open nor finished, so every list, count and filter built on those two skips it, and no status menu offers it.
test("Draft is neither active nor closed, and is in no status menu", () => {
  assert.equal(isActiveStatus("DRAFT"), false);
  assert.equal((ACTIVE_STATUSES as readonly string[]).includes("DRAFT"), false);
  assert.equal((CLOSED_STATUSES as readonly string[]).includes("DRAFT"), false);
  assert.equal((OVERDUE_ELIGIBLE as readonly string[]).includes("DRAFT"), false);
  // The status menu's rows are STATUS_ORDER (components/status-menu.tsx TASK_KEYS).
  assert.equal((STATUS_ORDER as readonly string[]).includes("DRAFT"), false);
  const menu = fs.readFileSync(path.join(__dirname, "..", "components", "status-menu.tsx"), "utf8");
  assert.match(menu, /const TASK_KEYS: readonly string\[\] = STATUS_ORDER;/);
  assert.equal(statusRank("DRAFT"), -1);
  assert.equal(isDraftStatus("DRAFT"), true);
  for (const s of [...ACTIVE_STATUSES, ...CLOSED_STATUSES]) assert.equal(isDraftStatus(s), false);
});

test("STATUS_ORDER covers every status a task can be moved to, and STATUS_LABEL every status", () => {
  assert.deepEqual([...STATUS_ORDER, "DRAFT"].sort(), [...ALL].sort());
  assert.deepEqual(Object.keys(STATUS_LABEL).sort(), [...ALL].sort());
  assert.equal(STATUS_LABEL.OPEN, "To do");
  assert.equal(STATUS_LABEL.DRAFT, "Draft");
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

// ---------------------------------------------------------------------------
// Every read of tasks, held to the shared filters by scanning the source
// ---------------------------------------------------------------------------

const SRC = path.join(__dirname, "..");

/** Every source file under src that isn't a test, with its text, by its path from src ("lib/tasks/core.ts"). */
function sourceFiles(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.set(path.relative(SRC, p).split(path.sep).join("/"), fs.readFileSync(p, "utf8"));
    }
  };
  walk(SRC);
  return out;
}

/** The text between a call's parentheses, starting at its "(": strings and template literals are stepped over whole. */
function callArgument(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
    } else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

/**
 * What a query's argument filters by, as text: the argument itself, and the
 * initializer of each name it uses as a value (`{ where }`, `where: jobsWhere`,
 * `AND: [where, activeTask]`, `...accessibleTo(id)`) when the file declares it
 * (`const where = allTasksWhere(f, legacy);`). A name used only as a key, or
 * inside a filter (`{ id: { in: ids } }`), is not followed.
 */
function filterText(file: string, argument: string): string {
  const used = new Set<string>();
  for (const m of argument.matchAll(/[{,]\s*([A-Za-z_]\w*)\s*(?=[,}])/g)) used.add(m[1]);
  for (const m of argument.matchAll(/\bwhere:\s*([A-Za-z_]\w*)\b(?!\s*[(.])/g)) used.add(m[1]);
  for (const m of argument.matchAll(/[[,]\s*([A-Za-z_]\w*)\s*(?=[,\]])/g)) used.add(m[1]);
  for (const m of argument.matchAll(/\.\.\.([A-Za-z_]\w*)/g)) used.add(m[1]);
  const declared = [...used].flatMap((name) => [...file.matchAll(new RegExp(`\\bconst ${name}(?::[^=]+)? = ([^;]+);`, "g"))].map((m) => m[1]));
  return [argument, ...declared].join("\n");
}

// Playbook rows imported from Asana sit in the Template bucket, and a draft
// Claude saved waits for a partner to add it. Neither is work, so every list,
// count and search of tasks leaves both out (the test docs/asana-migration-plan.md
// asks for, under "Helpers in task-scope.ts", and docs/specs/tasks-from-claude.md
// 6.2). Each read is checked on its own: the query's argument must reach for
// listedTask, or for one of the `where` builders that carry it, or for a
// builder with a rule of its own. One mention of a filter somewhere in the
// file no longer covers a second query beside it.
test("every Task list, count and search query leaves Template rows and drafts out, each query on its own", () => {
  const QUERY = /\.task\s*\.(findMany|count|groupBy|aggregate|findFirst)\(/g;
  // contractorJobsWhere (lib/archive.ts) is a contractor page's jobs; archive.test.ts checks both its branches carry it.
  // contractorCanOpen is the portal's (below); the rest are list-query.ts's builders, which list.test.ts holds to the filter.
  const LISTED =
    /listedTask|paletteTaskWhere|allTasksWhere|viewScopeWhere|contractorJobsWhere|contractorCanOpen|todayWhere|legacyNameWhere|propertyOpenTasksWhere|openByPropertyWhere|playbookOpenTasksWhere|linkedTasksWhere|workedSinceWhere/;
  // Reads with a rule of their own, by the builder that states it.
  const OWN_RULE: Record<string, string> = {
    myDraftsWhere: "a partner's own waiting drafts: My drafts and Home's count (never a discarded one)",
    othersDraftsWhere: "the other partner's waiting drafts",
    draftTask: "waiting drafts only: Discard, and its Undo's answer",
    dueReminderWhere: "the 8 am run names the four statuses that wait on a contractor, so never a draft",
    taskPageWhere: "one task by id, for its own page: a draft a partner discarded is not found",
  };
  const OWN = new RegExp(Object.keys(OWN_RULE).join("|"));
  // Files whose every read is of rows they made or were handed by id.
  const EXEMPT_FILES: Record<string, string> = {
    "lib/asana/import.ts": "the import reads its own CSV rows by id, Template rows included",
    "lib/scratch-rows.ts": "a database test finds the tasks it made, to delete every one of them",
  };
  // Single reads that filter by nothing above, each with why that is right. `has` is text only that query's argument holds.
  const EXEMPT_QUERIES: { file: string; has: string; why: string }[] = [
    { file: "lib/tasks/queries.ts", has: "where: { id: { in: ids } }", why: "the page's rows, by the ids the filtered read just above returned" },
    { file: "lib/tasks/core.ts", has: "where: { propertyId, OR: renames.map(", why: "a unit rename follows every task that names the unit, drafts included, as a write" },
    { file: "lib/tasks/core.ts", has: "where: { autoKey: { startsWith: prefix } }", why: "one save's own rows by key, whatever became of them since" },
  ];

  const files = sourceFiles();
  const unfiltered: string[] = [];
  const exempted = new Set<number>();
  const seenFiles = new Set<string>();
  for (const [file, src] of files) {
    for (const m of src.matchAll(QUERY)) {
      seenFiles.add(file);
      if (EXEMPT_FILES[file]) continue;
      const argument = callArgument(src, m.index + m[0].length - 1);
      const filters = filterText(src, argument);
      if (LISTED.test(filters) || OWN.test(filters)) continue;
      const pass = EXEMPT_QUERIES.findIndex((q) => q.file === file && argument.includes(q.has));
      if (pass >= 0) exempted.add(pass);
      else unfiltered.push(`${file}: .task.${m[1]}(${argument.replace(/\s+/g, " ").slice(0, 90)}`);
    }
  }
  assert.deepEqual(unfiltered, [], "spread listedTask into the where, or use a builder in lib/tasks/list-query.ts");
  assert.deepEqual(Object.keys(EXEMPT_FILES).filter((f) => !seenFiles.has(f)), [], "an exemption for a file that no longer queries tasks");
  assert.deepEqual(EXEMPT_QUERIES.filter((_, i) => !exempted.has(i)).map((q) => `${q.file}: ${q.has}`), [], "an exemption for a query that is gone or changed");

  // The old name is gone everywhere: one filter, one name.
  const old = [...files].filter(([file, src]) => file !== "lib/task-scope.test.ts" && /excludeTemplate/.test(src)).map(([file]) => file);
  assert.deepEqual(old, [], "use listedTask from @/lib/task-scope");
});

// The scan above sees only `prisma.task` reads. A draft can also be reached through another model (a file's `task`,
// a contact's `assignedTasks`) or in raw SQL, where no shared filter is spread: each file that does so is listed
// here with how it keeps drafts out, so a new one is a decision somebody made. (A relation under another name, such
// as a link session's `onlyTask`, and the scripts outside src are not seen.)
test("every file that reaches tasks through another model or in raw SQL is on a list, with how it treats a draft", () => {
  const RELATION =
    /\btask:\s*(\{\s*(select|include|NOT|is|isNot)\b|\{\s*propertyId,|\{\s*status:\s*[{"]|activeTask\b|closedTask\b|listedTask\b|draftTask\b)|\bassignedTasks:\s*\{|\btasks:\s*\{\s*(some|none|every|select|where)\b/;
  const RAW = /\b(FROM|JOIN|UPDATE|INTO)\s+"Task/;
  const KNOWN: Record<string, string> = {
    "app/api/files/[kind]/[id]/route.ts": "a resident's file reads its task's request for the lease; a resident's request task is never a draft (createTask refuses one for anyone but a partner)",
    "lib/missing/queries.ts": "the task behind a Make task item, of items openMakeTaskItemsWhere returned (open tasks only)",
    "lib/notifications/outbox.ts": "the send run reads each row's task, and closes a row for a draft unsent (content.ts dueRowVerdict)",
    "lib/portal/job-links.ts": "a link reads its task's status, and opens only an active job",
    "lib/portal/queries.ts": "raw reads of the lines and files of jobs contractorCanOpen returned, joined to an unrevoked access row",
    "lib/properties/photo.ts": "the task title beside a photo takenHerePhotosWhere returned (never a draft's photo)",
    "lib/residents/requests.ts": "a resident's own requests and a row lock on one's task by id; submitRequest makes that task, which is never a draft",
    "lib/residents/updates.ts": "each resident request's task status for its update emails; that task is never a draft",
    "lib/tasks/assignee-people.ts": "who the assignee list draws on: a job puts someone on it, a draft alone doesn't",
    "lib/tasks/bulk-core.ts": "locks the picked rows by id, and hands on no draft; reads repeat lines of those rows",
    "lib/tasks/bulk.ts": "locks the picked rows by id; a move passes over a draft, and an Undo skips one",
    "lib/tasks/core.ts": "row locks by id, the sweep of drafts discarded long ago, and a contractor's access check, which refuses a draft",
    "lib/tasks/list-query.ts": "the named builders: Make task items on open tasks, Recent's lines and photos taken at a property, never a draft's",
    "lib/tasks/read-state-core.ts": "unread counts for task ids the caller's own filtered read returned",
  };
  const found = [...sourceFiles()].filter(([, src]) => RELATION.test(src) || RAW.test(src)).map(([file]) => file);
  assert.deepEqual(found.filter((f) => !KNOWN[f]), [], "say here how this read keeps drafts out, or filter it with task-scope.ts");
  assert.deepEqual(Object.keys(KNOWN).filter((f) => !found.includes(f)), [], "a listing for a file that no longer reads tasks this way");
});

// The page-level reads each have a named builder (list-query.ts), which drafts.pg.test.ts runs on Postgres. Each page
// calls its builder; the clause spelled in place again fails, since the database test would be running a copy.
test("the pages' own task reads go through their named builders", () => {
  const page = (file: string) => fs.readFileSync(path.join(SRC, file), "utf8");
  const reads: [file: string, builder: string, inPlace: RegExp][] = [
    ["app/(app)/properties/[id]/page.tsx", "propertyOpenTasksWhere(", /where: \{ propertyId: id, \.\.\.activeTask, \.\.\.listedTask \}/],
    ["app/(app)/properties/(list)/page.tsx", "openByPropertyWhere", /where: \{ \.\.\.activeTask, \.\.\.listedTask, propertyId: \{ not: null \} \}/],
    ["app/(app)/templates/[id]/apply/page.tsx", "playbookOpenTasksWhere(", /where: \{ \.\.\.listedTask, \.\.\.activeTask, taskTemplateId: template\.id, propertyId: \{ not: null \} \}/],
    ["app/(app)/tasks/[id]/page.tsx", "linkedTasksWhere(", /where: \{ \.\.\.listedTask, OR: \[\{ id: \{ in: pathIds \} \}, \{ asanaId: \{ in: asanaGids \} \}\] \}/],
  ];
  for (const [file, builder, inPlace] of reads) {
    const src = page(file);
    assert.ok(src.includes(builder), `${file}: use ${builder.replace("(", "")} from lib/tasks/list-query.ts`);
    assert.ok(!inPlace.test(src), `${file}: the clause is spelled in place again; the database test runs the builder, not a copy`);
  }
  // The lib reads go through their builders.
  assert.match(page("lib/missing/queries.ts"), /where: workedSinceWhere\(since, contactIds\)/);
  assert.match(page("lib/missing/queries.ts"), /where: openMakeTaskItemsWhere,/);
  assert.match(page("lib/missing/service.ts"), /where: openMakeTaskItemsWhere,/);
  assert.match(page("lib/notifications/reminders.ts"), /where: dueReminderWhere\(days\),/);
  assert.match(page("lib/tasks/assignee-options.ts"), /where: recentAssignmentsWhere\(viewerId\),/);
  assert.match(page("lib/properties/photo.ts"), /const where = takenHerePhotosWhere\(propertyId\);/);
});

test("listedTask keeps every bucket but Template, and every status but Draft", () => {
  assert.deepEqual(listedTask, { bucket: { not: "Template" }, NOT: { status: "DRAFT" } });
});

// docs/specs/tasks-from-claude.md 6.3: Discard only marks a draft (`discardedAt`), so its Undo can bring it back
// whole, and from that moment it is gone to everyone. One filter says so for every read that is of drafts.
test("a read of drafts is of waiting drafts: one a partner discarded is not one", () => {
  assert.deepEqual(draftTask, { status: "DRAFT", discardedAt: null });
  assert.deepEqual(notDiscarded, { discardedAt: null });
  assert.equal(isDiscarded({ discardedAt: new Date("2026-11-20T19:00:00Z") }), true);
  assert.equal(isDiscarded({ discardedAt: null }), false);
  // listedTask needs no second key for it: a discarded draft is still a Draft, which it leaves out already.
  assert.equal("discardedAt" in listedTask, false);
});

// `{ ...activeTask, ...listedTask }` is written both ways round across the app. Were the draft half keyed on
// `status`, whichever came second would silently drop the other: closed tasks in an open list, or drafts in it.
test("listedTask spreads beside activeTask and closedTask in either order without dropping either", () => {
  for (const scope of [activeTask, closedTask]) {
    for (const key of Object.keys(listedTask)) assert.equal(key in scope, false, `${key} is in both`);
    assert.deepEqual({ ...scope, ...listedTask }, { ...listedTask, ...scope });
    assert.deepEqual({ ...scope, ...listedTask }.status, scope.status);
    assert.deepEqual({ ...listedTask, ...scope }.NOT, { status: "DRAFT" });
  }
});

// The portal's every read starts at contractorCanOpen (portal/queries.ts accessibleTo): My jobs and the job page.
test("a contractor's jobs are listed tasks through their own unrevoked access row, so never a draft", () => {
  assert.deepEqual(contractorCanOpen("c-zack"), {
    bucket: { not: "Template" },
    NOT: { status: "DRAFT" },
    access: { some: { contactId: "c-zack", revokedAt: null } },
  });
  const portal = fs.readFileSync(path.join(__dirname, "portal", "queries.ts"), "utf8");
  assert.match(portal, /const accessibleTo = contractorCanOpen;/);
  // Both task reads in the portal go through it, and there is no third.
  const reads = portal.match(/prisma\.task\.\w+\(\{\s*where: \{[^\n]*\n?[^\n]*accessibleTo\(p\.contactId\)/g) ?? [];
  assert.equal(reads.length, 2, "listMyJobs and getJob");
  assert.equal((portal.match(/prisma\.task\./g) ?? []).length, 2);
});
