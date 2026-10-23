/**
 * The daily Asana delta, from the Monday Oct 26 snapshot until cutover
 * (docs/asana-migration-plan.md §5.5). Brings what changed in Asana since the
 * last run into the app, the same way 20-load.ts loads a snapshot.
 *
 *   npm run asana:delta -- --snapshot <dir>                 # fetch and report; writes nothing to the app
 *   npm run asana:delta -- --snapshot <dir> --apply         # and write; moves the cursor on
 *   npm run asana:delta -- --snapshot <dir> --replay <run>  # plan a saved run again, no Asana calls
 *
 * Each run (read only on the Asana side, like every script in scripts/asana/):
 *   1. tasks modified since the cursor (first run: manifest.snapshotStartedAt minus an hour)
 *   2. the whole project listing again: a section move doesn't change modified_at
 *   3. the full record of each listed task the listing alone can't merge (map.ts deltaScope)
 *   4. subtasks, recursively, of every task in scope with num_subtasks > 0
 *   5. stories and attachment lists of every task in scope and its subtasks. Asana's
 *      modified_at doesn't reflect new comments, so these aren't filtered by it; they
 *      append by gid, so refetching is harmless. New Asana-hosted files are downloaded.
 * Each run is saved to <snapshot>/delta/<timestamp>/ in the snapshot's layout, then
 * planned by src/lib/asana/map.ts: fields three-way merge against Task.asanaLastSynced
 * (an app edit is seen through Task.appEditedAt, never updatedAt), "completed in Asana"
 * always applies, conflicts become Internal CONFLICT events and print, new open tasks
 * in HG sections are imported. Written by src/lib/asana/import.ts, which never emails.
 *
 * The cursor lives in <snapshot>/delta-state.json and moves only after an --apply
 * whose fetch had no errors.
 *
 *   --snapshot <dir>      required: the official snapshot the load used
 *   --apply               write to the app (default: dry run)
 *   --replay <run dir>    use a saved run instead of calling Asana
 *   --confirm-prod <ref>  needed to --apply anywhere but a local database: ywdjaygwkqyrmbdnvaai
 *                         (a SYNTHETIC run or snapshot, or another Asana project, only ever applies locally)
 *   --people <file>       identity confirmations (default <snapshot>/people.json)
 *   --accept-name-matches, --skip-files, --fake-blob <dir>, --report <file>: as in 20-load.ts
 *
 * Production: npx tsx --env-file=.env.prod-write scripts/asana/30-delta.ts --snapshot <dir> --apply --confirm-prod ywdjaygwkqyrmbdnvaai
 * (ASANA_TOKEN must be in that env file too.)
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../src/lib/db";
import { getEnv } from "../../src/lib/env";
import { isAsanaHosted, safeFileName, snapshotStamp } from "../../src/lib/asana/snapshot-helpers";
import { buildPlan, deltaScope, type AsanaAttachment, type AsanaRef, type AsanaStory, type AsanaTask, type PlanDb } from "../../src/lib/asana/map";
import { StalePlanError, writeIdentity, writeTask } from "../../src/lib/asana/import";
import { formatReport } from "../../src/lib/asana/report";
import { AsanaClient, AsanaError, downloadTo } from "./client";
import {
  assertFileNotTracked,
  assertKnownFlags,
  assertNotTracked,
  filesOnDisk,
  flagValue,
  guardInput,
  guardTarget,
  hasFlag,
  loadPlanDb,
  log as logger,
  mediaTools,
  namesOf,
  newTaskId,
  pickUploader,
  readOverrides,
  readSnapshot,
  runFilePhase,
  TX,
  writeJson,
  type Manifest,
} from "./_import-lib";

const log = logger("asana-delta");

// The fields 10-snapshot.ts asks for, so a delta record reads like a snapshot one.
const TASK_FIELDS = [
  "name", "notes", "html_notes", "resource_subtype",
  "assignee.name", "assignee.email",
  "created_by.name", "created_at", "modified_at",
  "completed", "completed_at", "completed_by.name",
  "due_on", "due_at", "start_on", "start_at",
  "followers.name", "followers.email",
  "memberships.project.name", "memberships.section.name",
  "parent.name", "num_subtasks", "permalink_url",
  "tags.name", "custom_fields.name", "custom_fields.display_value",
].join(",");
/** Enough to see sections and completion for every task in the project. */
const LIST_FIELDS = "name,completed,completed_at,modified_at,num_subtasks,parent.name,memberships.project.name,memberships.section.name";
const STORY_FIELDS = [
  "created_at", "created_by.name", "created_by.email",
  "resource_subtype", "type", "text", "html_text",
  "is_edited", "is_pinned", "sticker_name",
  "old_dates", "new_dates", "old_section.name", "new_section.name",
  "assignee.name", "assignee.email", "old_name", "new_name",
].join(",");
const ATTACHMENT_FIELDS = "name,resource_subtype,host,size,created_at,view_url,permanent_url,parent.name";

/** A cursor this far before a run's start, so nothing modified during the run is missed. */
const CURSOR_OVERLAP_MS = 10 * 60_000;

interface DeltaMeta {
  cursor: string;
  startedAt: string;
  finishedAt?: string;
  projectGid?: string;
  /** Returned by modified_since. */
  modified: string[];
  /** Fetched with every field (modified, plus what deltaScope said needs it). Absent in a hand-made run. */
  fresh?: string[];
  scope?: string[];
  errors?: string[];
  /** Tasks and subtasks whose subtask list couldn't be fetched: their checklists are left alone this run. */
  subtaskErrors?: string[];
  synthetic?: boolean;
}

interface DeltaState {
  cursor: string;
  runs: Array<{ dir: string; startedAt: string; applied: boolean; errors: number }>;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The thin network part: everything the plan needs, saved to `runDir`. */
async function fetchRun(asana: AsanaClient, projectGid: string, cursor: string, db: PlanDb, snapDir: string, runDir: string): Promise<DeltaMeta> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const subtaskErrors: string[] = [];
  const modified = await asana.getAll<AsanaTask>("/tasks", { project: projectGid, modified_since: cursor, opt_fields: TASK_FIELDS });
  const listing = await asana.getAll<AsanaTask>(`/projects/${projectGid}/tasks`, { opt_fields: LIST_FIELDS });
  log(`${modified.length} tasks modified since ${cursor}; ${listing.length} in the project`);

  const byGid = new Map<string, AsanaTask>(listing.map((t) => [t.gid, { ...t, in_project: true }]));
  const fresh = new Set<string>();
  for (const t of modified) {
    if (!byGid.has(t.gid)) continue; // left the project between the two calls
    byGid.set(t.gid, { ...t, in_project: true });
    fresh.add(t.gid);
  }
  const { scope, full } = deltaScope([...byGid.values()], db.tasks, projectGid);
  const needFull = [...full].filter((g) => !fresh.has(g));
  for (const r of await asana.each(needFull, (g) => asana.get<AsanaTask>(`/tasks/${g}`, { opt_fields: TASK_FIELDS }))) {
    if (r.result) {
      byGid.set(r.item, { ...r.result, in_project: true });
      fresh.add(r.item);
    } else errors.push(`task ${r.item}: ${errText(r.error)}`);
  }
  log(`${scope.size} tasks in scope; ${needFull.length} re-fetched in full (new, moved or completed)`);

  const subtasks: AsanaTask[] = [];
  let frontier = [...scope].map((g) => byGid.get(g)!).filter((t) => (t.num_subtasks ?? 0) > 0);
  while (frontier.length) {
    const found: AsanaTask[] = [];
    for (const r of await asana.each(frontier, (t) => asana.getAll<AsanaTask>(`/tasks/${t.gid}/subtasks`, { opt_fields: TASK_FIELDS }))) {
      if (r.error) {
        errors.push(`subtasks of ${r.item.gid}: ${errText(r.error)}`);
        subtaskErrors.push(r.item.gid);
        continue;
      }
      for (const s of r.result ?? []) {
        const withFlag = { ...s, in_project: byGid.get(s.gid)?.in_project ?? false };
        byGid.set(s.gid, withFlag);
        subtasks.push(withFlag);
        found.push(withFlag);
      }
    }
    frontier = found.filter((t) => (t.num_subtasks ?? 0) > 0);
  }

  const deep = [...scope, ...subtasks.map((s) => s.gid)];
  const attachments: Record<string, AsanaAttachment[]> = {};
  for (const r of await asana.each(deep, async (g) => {
    writeJson(path.join(runDir, "stories", `${g}.json`), await asana.getAll<AsanaStory>(`/tasks/${g}/stories`, { opt_fields: STORY_FIELDS }));
    const atts = await asana.getAll<AsanaAttachment>("/attachments", { parent: g, opt_fields: ATTACHMENT_FIELDS });
    writeJson(path.join(runDir, "attachments", `${g}.json`), atts);
    attachments[g] = atts;
  })) {
    if (r.error) errors.push(`stories or files of ${r.item}: ${errText(r.error)}`);
  }
  log(`stories and attachment lists for ${deep.length} tasks and subtasks`);

  // New Asana-hosted files only: a fresh download link right before each one (they expire in minutes).
  const onDisk = filesOnDisk(attachments, [path.join(snapDir, "files")]);
  const toGet = Object.values(attachments)
    .flat()
    .filter((a) => isAsanaHosted(a) && !db.attachmentGids.has(a.gid) && !onDisk.has(a.gid));
  for (const r of await asana.each(toGet, async (a) => {
    for (let attempt = 1; ; attempt++) {
      const freshLink = await asana.get<{ download_url: string | null; size: number | null }>(`/attachments/${a.gid}`, { opt_fields: "download_url,size" });
      try {
        if (!freshLink.download_url) throw new Error("no download_url");
        return await downloadTo(freshLink.download_url, path.join(runDir, "files", a.gid, safeFileName(a.name)), freshLink.size ?? a.size ?? null);
      } catch (err) {
        const retryable = !(err instanceof AsanaError) || err.status === 403 || err.status === 0 || err.status >= 500;
        if (attempt === 3 || !retryable) throw err;
      }
    }
  })) {
    if (r.error) errors.push(`file ${r.item.gid} "${r.item.name}": ${errText(r.error)}`);
  }
  if (toGet.length) log(`${toGet.length} new files downloaded`);

  writeJson(path.join(runDir, "tasks.json"), [...byGid.values()]);
  const meta: DeltaMeta = { cursor, startedAt, finishedAt: new Date().toISOString(), projectGid, modified: modified.map((t) => t.gid), fresh: [...fresh], scope: [...scope], errors, subtaskErrors };
  writeJson(path.join(runDir, "delta.json"), meta);
  return meta;
}

function readRun(runDir: string): { meta: DeltaMeta; tasks: AsanaTask[]; stories: Record<string, AsanaStory[]>; attachments: Record<string, AsanaAttachment[]>; users: AsanaRef[] } {
  const read = <T>(f: string, fallback?: T): T => {
    const p = path.join(runDir, f);
    if (!fs.existsSync(p)) {
      if (fallback !== undefined) return fallback;
      throw new Error(`${p} is missing`);
    }
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  };
  const meta = read<DeltaMeta>("delta.json");
  const tasks = read<AsanaTask[]>("tasks.json");
  const stories: Record<string, AsanaStory[]> = {};
  const attachments: Record<string, AsanaAttachment[]> = {};
  for (const t of tasks) {
    stories[t.gid] = read<AsanaStory[]>(`stories/${t.gid}.json`, []);
    attachments[t.gid] = read<AsanaAttachment[]>(`attachments/${t.gid}.json`, []);
  }
  return { meta, tasks, stories, attachments, users: read<AsanaRef[]>("users.json", []) };
}

function readState(file: string, manifest: Manifest): DeltaState {
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as DeltaState;
  const start = Date.parse(manifest.snapshotStartedAt);
  if (!Number.isFinite(start)) throw new Error("manifest.json has no snapshotStartedAt");
  return { cursor: new Date(start - 3600_000).toISOString(), runs: [] };
}

async function main() {
  assertKnownFlags(["--snapshot=", "--apply", "--dry-run", "--replay=", "--confirm-prod=", "--people=", "--accept-name-matches", "--skip-files", "--fake-blob=", "--report="]);
  const snapArg = flagValue("--snapshot");
  if (!snapArg) throw new Error("--snapshot <dir> is required (the snapshot the load used)");
  const snapDir = path.resolve(snapArg);
  const apply = hasFlag("--apply");
  if (apply && hasFlag("--dry-run")) throw new Error("--dry-run and --apply together: pick one");
  const replay = flagValue("--replay");
  const skipFiles = hasFlag("--skip-files");
  const reportFile = flagValue("--report");
  if (reportFile) assertFileNotTracked(reportFile);

  const target = await guardTarget(prisma, { apply, tag: "asana-delta" });
  const snap = readSnapshot(snapDir);
  // A synthetic fixture (or another project's snapshot) never reaches production; checked again for the run below.
  guardInput(target, { apply, synthetic: !!snap.manifest.synthetic, projectGid: snap.projectGid });
  assertNotTracked(snapDir);
  const stateFile = path.join(snapDir, "delta-state.json");
  const state = readState(stateFile, snap.manifest);
  const uploader = pickUploader({ apply, skipFiles, fakeBlobDir: flagValue("--fake-blob"), target });
  const db = await loadPlanDb(prisma);

  let runDir: string;
  if (replay) {
    runDir = path.resolve(replay);
    log(`replaying ${runDir} (no Asana calls)`);
  } else {
    const token = getEnv().ASANA_TOKEN;
    if (!token) throw new Error("ASANA_TOKEN is unset. Add it to the env file (see .env.example), or use --replay.");
    runDir = path.join(snapDir, "delta", snapshotStamp(new Date().toISOString()));
    fs.mkdirSync(runDir, { recursive: true });
    log(`cursor ${state.cursor}; saving this run to ${runDir}`);
    await fetchRun(new AsanaClient(token), snap.projectGid, state.cursor, db, snapDir, runDir);
  }
  const run = readRun(runDir);
  const projectGid = run.meta.projectGid ?? snap.projectGid;
  guardInput(target, { apply, synthetic: !!(run.meta.synthetic || snap.manifest.synthetic), projectGid });
  const fresh = run.meta.fresh ? new Set(run.meta.fresh) : new Set([...run.meta.modified, ...deltaScope(run.tasks, db.tasks, projectGid).full]);
  const errors = run.meta.errors ?? [];
  for (const e of errors) log(`! fetch error: ${e}`);
  // Older runs only have the error text.
  const subtasksIncomplete = new Set(run.meta.subtaskErrors ?? errors.flatMap((e) => e.match(/^subtasks of (\d+):/)?.[1] ?? []));

  const overrides = readOverrides(flagValue("--people") ?? path.join(snapDir, "people.json"));
  const plan = buildPlan(
    {
      mode: "delta",
      projectGid,
      asOf: run.meta.startedAt,
      tasks: run.tasks,
      stories: run.stories,
      attachments: run.attachments,
      users: [...snap.users, ...run.users],
      fresh,
      subtasksIncomplete,
      files: filesOnDisk(run.attachments, [path.join(runDir, "files"), path.join(snapDir, "files")]),
    },
    db,
    { overrides, acceptNameMatches: hasFlag("--accept-name-matches"), newId: newTaskId },
  );
  const report = formatReport(plan, {
    title: `Asana delta ${apply ? "(APPLY)" : "(dry run: nothing is written to the app)"}`,
    names: namesOf(db),
    header: [`run: ${runDir} (cursor ${run.meta.cursor}, started ${run.meta.startedAt}${run.meta.synthetic ? ", SYNTHETIC" : ""})`, `database: ${target.host}/${target.database}`],
  });
  console.log(report);
  if (reportFile) fs.writeFileSync(reportFile, `${report}\n`);
  if (!apply) {
    log("dry run: nothing written to the app and the cursor stays. Re-run with --apply (add --replay to reuse this fetch).");
    return;
  }

  const now = new Date();
  const identity = await prisma.$transaction((tx) => writeIdentity(tx, plan.people), TX);
  if (identity.linked) log(`linked ${identity.linked} more people to their Asana ids`);
  const stale: string[] = [];
  const failed: string[] = [];
  let events = 0;
  for (const tp of plan.tasks) {
    try {
      const r = await prisma.$transaction((tx) => writeTask(tx, tp, now), TX);
      events += r.eventsAdded;
      if (r.nextRepeatId) log(`"${tp.title}" repeats: next copy ${r.nextRepeatId}`);
      if (r.joinedSeriesOf) log(`"${tp.title}" is Asana's next copy of repeating task ${r.joinedSeriesOf}; joined its series`);
    } catch (err) {
      if (err instanceof StalePlanError) stale.push(`${tp.title} (${tp.taskId})`);
      else failed.push(`${tp.title} (${tp.taskId}): ${errText(err)}`);
    }
  }
  log(`tasks: ${plan.tasks.length - stale.length - failed.length} written (${plan.tasks.filter((t) => t.op === "create").length} new), ${events} timeline events added, ${plan.report.conflicts.length} conflicts`);
  for (const s of stale) log(`! edited in the app during this run, skipped (the next run picks it up): ${s}`);
  for (const f of failed) log(`! FAILED: ${f}`);
  let fileFailures = 0;
  if (uploader) {
    const f = await runFilePhase(prisma, plan, { uploader, tools: mediaTools(), log });
    log(`files: ${f.uploaded} uploaded (${(f.bytes / 1e6).toFixed(1)} MB), ${f.links} links, ${f.skippedExisting} already there`);
    for (const x of f.failed) log(`! file FAILED "${x.filename}" (${x.asanaGid}): ${x.error}`);
    fileFailures = f.failed.length;
  }

  // Move the cursor only when nothing was missed; otherwise the next run covers this window again.
  const clean = !errors.length && !failed.length && !stale.length && !fileFailures;
  const nextCursor = new Date(Date.parse(run.meta.startedAt) - CURSOR_OVERLAP_MS).toISOString();
  if (clean && nextCursor > state.cursor) state.cursor = nextCursor;
  state.runs.push({ dir: path.relative(snapDir, runDir), startedAt: run.meta.startedAt, applied: true, errors: errors.length + failed.length + fileFailures });
  writeJson(stateFile, state);
  log(clean ? `cursor now ${state.cursor}` : `cursor kept at ${state.cursor} (errors this run)`);
  if (!clean) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("[asana-delta] failed:", errText(err));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
