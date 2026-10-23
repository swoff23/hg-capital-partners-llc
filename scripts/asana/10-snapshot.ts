/**
 * Full, read-only backup of HG's Asana project to local disk.
 *
 *   npm run asana:snapshot                           # new snapshot
 *   npm run asana:snapshot -- --resume <dir>         # finish or refresh one
 *   npm run asana:snapshot -- --no-files             # metadata only (fast trial)
 *   npm run asana:snapshot -- --resume <dir> --ack-manual
 *        # after saving the Messages tab and any video messages by hand (below)
 *
 * Writes to <main checkout>/_private/asana-snapshot/<timestamp>/ (gitignored),
 * so the archive outlives any worktree. Override with --out <dir>; the script
 * refuses any location inside a git repo that isn't gitignored.
 *
 * What's captured (docs/asana-migration-plan.md §5.5):
 *   - every task in the project, all sections (JMPL, Pieter, playbooks too),
 *     open and completed, plus every subtask, recursively. Checked against
 *     Asana's own counts.
 *   - every story on every task and subtask (comments + system events),
 *     paginated, with the structured before/after values (dates, sections,
 *     assignees, names), not just Asana's rendered sentence
 *   - every attachment's metadata on tasks, the project ("Key resources") and
 *     the project brief, and the file itself when Asana hosts it.
 *     download_url can expire within ~2 minutes, so each file's link is
 *     fetched right before its download, and bytes are checked against size.
 *   - sections, the people referenced by HG tasks plus project members, the
 *     project brief and status updates
 *   - for review only: staff tasks in no project at all (names), and how many
 *     staff tasks sit in other projects (project names and counts only, since
 *     the workspace also holds personal projects)
 *
 * Not reachable through Asana's API, so listed in manifest.manual and kept
 * out of "complete" until --ack-manual:
 *   - the project's Messages tab: save it by hand into <snapshot>/messages/
 *   - Asana video messages (host "vimeo"): open each view_url and save it
 * Links to Dropbox, Drive, Box and other sites are recorded, not downloaded.
 *
 * Layout:
 *   manifest.json        start/finish, status, counts, missing files, errors
 *   project.json  sections.json  users.json  brief.json  status-updates.json
 *   tasks.json           every task and subtask (subtasks carry `parent`)
 *   stories/<task>.json  attachments/<parent>.json
 *   files/<attachment>/<name>
 *   staff-review.json
 *
 * --resume refetches a task's stories and attachment list when Asana says it
 * changed since they were saved, skips files already on disk at the right
 * size, and keeps the original snapshotStartedAt so a delta sync from it
 * misses nothing. Exit code 1 unless the backup is complete.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getEnv } from "../../src/lib/env";
import { countBy, isAsanaHosted, safeFileName, snapshotStamp } from "../../src/lib/asana/snapshot-helpers";
import { AsanaClient, AsanaError, downloadTo } from "./client";

const WORKSPACE_GID = "1208399116236020";
const PROJECT_GID = "1208826670424350"; // "HG Capital"
const STAFF = [
  { gid: "248676381103488", name: "Connor Swofford" },
  { gid: "1208826670424355", name: "Pieter Louw" },
];

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
  "dependencies", "dependents", "num_likes",
].join(",");

const STORY_FIELDS_BASE = [
  "created_at", "created_by.name", "created_by.email",
  "resource_subtype", "type", "text", "html_text",
  "is_edited", "is_pinned", "sticker_name",
];
// The structured side of system stories: what a reschedule, move or rename
// changed from and to. Without these the archive keeps only Asana's sentence.
const STORY_FIELDS = [
  ...STORY_FIELDS_BASE,
  "old_dates", "new_dates", "old_section.name", "new_section.name",
  "assignee.name", "assignee.email", "follower.name",
  "old_name", "new_name", "old_resource_subtype", "new_resource_subtype",
  "custom_field.name", "old_enum_value.name", "new_enum_value.name", "old_text_value", "new_text_value",
  "duplicate_of.name", "duplicated_from.name", "project.name", "task.name",
  "previews", "source", "num_likes",
].join(",");

const ATTACHMENT_FIELDS = [
  "name", "resource_subtype", "host", "size", "created_at",
  "view_url", "permanent_url", "parent.name",
].join(",");

interface Ref { gid: string; name?: string; email?: string }
interface Task {
  gid: string;
  name: string;
  completed: boolean;
  modified_at?: string;
  num_subtasks?: number;
  parent?: Ref | null;
  assignee?: Ref | null;
  created_by?: Ref | null;
  completed_by?: Ref | null;
  followers?: Ref[];
  projects?: Ref[];
  memberships?: Array<{ project?: Ref; section?: Ref }>;
  /** Added here: true when the task is a direct member of the project (not only a subtask of one). */
  in_project?: boolean;
}
interface Story { gid: string; resource_subtype?: string; created_by?: Ref | null }
interface Attachment {
  gid: string;
  name: string;
  host?: string;
  size?: number | null;
  view_url?: string | null;
  permanent_url?: string | null;
}
type ParentedAttachment = Attachment & { parentGid: string };

/** The value after a flag, as an absolute path. Refuses another flag or nothing. */
function pathArg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`${name} needs a directory`);
  return path.resolve(v);
}
const flag = (name: string) => process.argv.includes(name);

/** The main checkout's root, even when run from a worktree. */
function mainCheckoutRoot(): string {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
  return path.dirname(common);
}

/** Refuse to write PII anywhere `git add` could pick it up. */
function assertNotTracked(dir: string): void {
  let top: string | null = null;
  try {
    top = execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return; // not inside a repo
  }
  const probe = path.relative(top, path.join(dir, "manifest.json"));
  if (spawnSync("git", ["-C", top, "check-ignore", "-q", "--no-index", probe]).status !== 0) {
    throw new Error(`${dir} is inside ${top} and not gitignored; refusing to write the snapshot there`);
  }
}

/** Write via a temp file and rename, so an interrupted run never leaves half a JSON file. */
function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

/** Parsed JSON, or null when absent or unreadable (the caller refetches). */
function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Saved before Asana last changed the task (with an hour of slack for clock skew)? Then refetch. */
function stale(file: string, modifiedAt: string | undefined): boolean {
  if (!fs.existsSync(file)) return true;
  const modified = Date.parse(modifiedAt ?? "");
  return Number.isFinite(modified) && modified > fs.statSync(file).mtimeMs - 3_600_000;
}

const log = (msg: string) => console.log(`[asana-snapshot] ${msg}`);

async function main() {
  const token = getEnv().ASANA_TOKEN;
  if (!token) throw new Error("ASANA_TOKEN is unset. Add it to .env (see .env.example).");

  const resumeDir = pathArg("--resume");
  const startedAt = new Date().toISOString();
  if (resumeDir && !fs.existsSync(path.join(resumeDir, "manifest.json"))) {
    throw new Error(`--resume ${resumeDir}: no manifest.json there, so it isn't a snapshot`);
  }
  const out = resumeDir ?? pathArg("--out") ?? path.join(mainCheckoutRoot(), "_private", "asana-snapshot", snapshotStamp(startedAt));
  const withFiles = !flag("--no-files");
  fs.mkdirSync(out, { recursive: true });
  assertNotTracked(out);

  // A resumed run keeps the original start, so a delta sync from it misses nothing.
  let prior: { snapshotStartedAt?: string } | null = null;
  if (resumeDir) {
    try {
      prior = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
    } catch {
      throw new Error(`${path.join(out, "manifest.json")} is unreadable; fix or restore it before resuming`);
    }
  }
  const snapshotStartedAt = prior?.snapshotStartedAt ?? startedAt;
  writeJson(path.join(out, "manifest.json"), { snapshotStartedAt, status: "running", withFiles });
  log(`writing to ${out}`);

  const asana = new AsanaClient(token);
  const errors: string[] = [];
  const note = (where: string, err: unknown) => {
    const msg = `${where}: ${err instanceof Error ? err.message : String(err)}`;
    errors.push(msg);
    console.warn(`[asana-snapshot] ! ${msg}`);
  };

  // --- Project-level records --------------------------------------------------
  const project = await asana.get<Ref & { project_brief?: Ref | null; members?: Ref[] }>(`/projects/${PROJECT_GID}`, {
    opt_fields:
      "name,notes,html_notes,created_at,modified_at,owner.name,members.name,members.email,permalink_url,project_brief,custom_field_settings.custom_field.name",
  });
  writeJson(path.join(out, "project.json"), project);

  const attachDir = path.join(out, "attachments");
  const extraParents: Array<{ gid: string; label: string }> = [{ gid: PROJECT_GID, label: "project" }];
  if (project.project_brief?.gid) {
    extraParents.push({ gid: project.project_brief.gid, label: "brief" });
    try {
      writeJson(path.join(out, "brief.json"), await asana.get(`/project_briefs/${project.project_brief.gid}`, { opt_fields: "title,text,html_text" }));
    } catch (err) {
      note("project brief", err);
    }
  }
  try {
    writeJson(
      path.join(out, "status-updates.json"),
      await asana.getAll("/status_updates", { parent: PROJECT_GID, opt_fields: "title,text,html_text,status_type,created_at,created_by.name" }),
    );
  } catch (err) {
    note("status updates", err);
  }
  // Files on the project's Key resources and inline in the brief.
  for (const p of extraParents) {
    try {
      writeJson(path.join(attachDir, `${p.gid}.json`), await asana.getAll<Attachment>("/attachments", { parent: p.gid, opt_fields: ATTACHMENT_FIELDS }));
    } catch (err) {
      note(`attachments of the ${p.label}`, err);
    }
  }

  const sections = await asana.getAll<Ref>(`/projects/${PROJECT_GID}/sections`, { opt_fields: "name,created_at" });
  writeJson(path.join(out, "sections.json"), sections);
  log(`${sections.length} sections`);

  // --- Tasks, then subtasks breadth-first --------------------------------------
  const topLevel = await asana.getAll<Task>(`/projects/${PROJECT_GID}/tasks`, { opt_fields: TASK_FIELDS });
  try {
    const counts = await asana.get<{ num_tasks: number }>(`/projects/${PROJECT_GID}/task_counts`, { opt_fields: "num_tasks" });
    if (counts.num_tasks !== topLevel.length) note("task count", `Asana reports ${counts.num_tasks} tasks, listing returned ${topLevel.length}`);
  } catch (err) {
    note("task counts", err);
  }
  const tasks = new Map<string, Task>();
  for (const t of topLevel) tasks.set(t.gid, { ...t, in_project: true });
  log(`${topLevel.length} tasks in the project`);

  let frontier = [...tasks.values()].filter((t) => (t.num_subtasks ?? 0) > 0);
  while (frontier.length) {
    const found: Task[] = [];
    for (const r of await asana.each(frontier, (t) => asana.getAll<Task>(`/tasks/${t.gid}/subtasks`, { opt_fields: TASK_FIELDS }))) {
      if (r.error) note(`subtasks of ${r.item.gid}`, r.error);
      else if ((r.result?.length ?? 0) !== (r.item.num_subtasks ?? 0)) {
        note(`subtasks of ${r.item.gid}`, `expected ${r.item.num_subtasks}, got ${r.result?.length ?? 0}`);
      }
      for (const sub of r.result ?? []) {
        if (tasks.has(sub.gid)) continue; // also listed in the project directly
        const withFlag = { ...sub, in_project: false };
        tasks.set(sub.gid, withFlag);
        found.push(withFlag);
      }
    }
    frontier = found.filter((t) => (t.num_subtasks ?? 0) > 0);
  }
  const allTasks = [...tasks.values()];
  writeJson(path.join(out, "tasks.json"), allTasks);
  log(`${allTasks.length} tasks including subtasks`);

  // --- Stories and attachment lists, per task ---------------------------------
  const storiesDir = path.join(out, "stories");
  let storyFields = STORY_FIELDS;
  let done = 0;
  await asana.each(allTasks, async (t) => {
    const sFile = path.join(storiesDir, `${t.gid}.json`);
    const aFile = path.join(attachDir, `${t.gid}.json`);
    if (stale(sFile, t.modified_at) || !readJson(sFile)) {
      try {
        writeJson(sFile, await asana.getAll<Story>(`/tasks/${t.gid}/stories`, { opt_fields: storyFields }));
      } catch (err) {
        // If Asana ever rejects one of the structured fields, keep going with
        // the base set rather than losing stories, and say so.
        if (err instanceof AsanaError && err.status === 400 && storyFields !== STORY_FIELDS_BASE.join(",")) {
          note("story fields", `structured story fields rejected (${err.message}); using the base set`);
          storyFields = STORY_FIELDS_BASE.join(",");
          try {
            writeJson(sFile, await asana.getAll<Story>(`/tasks/${t.gid}/stories`, { opt_fields: storyFields }));
          } catch (err2) {
            note(`stories of ${t.gid}`, err2);
          }
        } else {
          note(`stories of ${t.gid}`, err);
        }
      }
    }
    if (stale(aFile, t.modified_at) || !readJson(aFile)) {
      try {
        writeJson(aFile, await asana.getAll<Attachment>("/attachments", { parent: t.gid, opt_fields: ATTACHMENT_FIELDS }));
      } catch (err) {
        note(`attachments of ${t.gid}`, err);
      }
    }
    if (++done % 250 === 0) log(`stories and attachment lists: ${done}/${allTasks.length}`);
  });

  // --- Files ------------------------------------------------------------------
  const stories: Story[] = [];
  const attachments: ParentedAttachment[] = [];
  for (const parentGid of [...allTasks.map((t) => t.gid), ...extraParents.map((p) => p.gid)]) {
    for (const a of readJson<Attachment[]>(path.join(attachDir, `${parentGid}.json`)) ?? []) attachments.push({ ...a, parentGid });
  }
  for (const t of allTasks) stories.push(...(readJson<Story[]>(path.join(storiesDir, `${t.gid}.json`)) ?? []));

  const hosted = attachments.filter(isAsanaHosted);
  const fileFor = (a: ParentedAttachment) => path.join(out, "files", a.gid, safeFileName(a.name));
  const missing: Array<{ attachment: string; parent: string; name: string; reason: string }> = [];
  const deletedInAsana: Array<{ attachment: string; parent: string; name: string }> = [];
  let downloaded = 0;

  if (withFiles) {
    log(`downloading ${hosted.length} Asana-hosted files`);
    const results = await asana.each(hosted, async (a) => {
      const dest = fileFor(a);
      if (a.size != null && fs.existsSync(dest) && fs.statSync(dest).size === a.size) return;
      for (let attempt = 1; attempt <= 3; attempt++) {
        let fresh: { download_url: string | null; size: number | null };
        try {
          // Fresh link every time: they can expire within ~2 minutes of being issued.
          fresh = await asana.get(`/attachments/${a.gid}`, { opt_fields: "download_url,size,host" });
        } catch (err) {
          if (err instanceof AsanaError && err.status === 404) {
            deletedInAsana.push({ attachment: a.gid, parent: a.parentGid, name: a.name });
            return;
          }
          throw err;
        }
        try {
          if (!fresh.download_url) throw new Error("no download_url");
          await downloadTo(fresh.download_url, dest, fresh.size ?? a.size ?? null);
          if (++downloaded % 50 === 0) log(`files: ${downloaded} downloaded`);
          return;
        } catch (err) {
          const retryable = !(err instanceof AsanaError) || err.status === 403 || err.status === 0 || err.status >= 500;
          if (attempt === 3 || !retryable) throw err;
        }
      }
    });
    for (const r of results) {
      if (r.error) missing.push({ attachment: r.item.gid, parent: r.item.parentGid, name: r.item.name, reason: r.error instanceof Error ? r.error.message : String(r.error) });
    }
  }

  // Ground truth: what's actually on disk at the right size.
  const deleted = new Set(deletedInAsana.map((d) => d.attachment));
  const onDisk = hosted.filter((a) => {
    const f = fileFor(a);
    return fs.existsSync(f) && (a.size == null || fs.statSync(f).size === a.size);
  });
  const bytes = onDisk.reduce((sum, a) => sum + fs.statSync(fileFor(a)).size, 0);
  if (withFiles) {
    const reported = new Set(missing.map((m) => m.attachment));
    for (const a of hosted) {
      if (deleted.has(a.gid) || reported.has(a.gid) || onDisk.includes(a)) continue;
      missing.push({ attachment: a.gid, parent: a.parentGid, name: a.name, reason: "not on disk at the expected size" });
    }
  }

  // --- People ------------------------------------------------------------------
  // Only people tied to HG: anyone referenced by HG tasks or stories, plus
  // project members. The workspace also holds personal projects.
  const directory = new Map<string, Ref>();
  // This endpoint isn't paginated (it returns up to 2,000 users), so no limit/offset.
  for (const u of await asana.get<Ref[]>(`/workspaces/${WORKSPACE_GID}/users`, { opt_fields: "name,email" })) directory.set(u.gid, u);
  const keep = new Set<string>((project.members ?? []).map((m) => m.gid));
  for (const t of allTasks) {
    for (const r of [t.assignee, t.created_by, t.completed_by, ...(t.followers ?? [])]) if (r?.gid) keep.add(r.gid);
  }
  for (const s of stories) if (s.created_by?.gid) keep.add(s.created_by.gid);
  const users = new Map<string, Ref>();
  for (const gid of keep) if (directory.has(gid)) users.set(gid, directory.get(gid)!);
  const unknown = [...keep].filter((gid) => !users.has(gid));
  for (const r of await asana.each(unknown, (gid) => asana.get<Ref>(`/users/${gid}`, { opt_fields: "name,email" }))) {
    if (r.result) users.set(r.item, r.result);
    else if (r.error instanceof AsanaError && (r.error.status === 404 || r.error.status === 403)) users.set(r.item, { gid: r.item, name: "(former user)" });
    else note(`user ${r.item}`, r.error);
  }
  writeJson(path.join(out, "users.json"), [...users.values()]);

  // --- Staff tasks outside the project (review only) ----------------------------
  // Task names only for tasks in no project at all (where stray HG work would
  // sit). For other projects, just project names and counts: the workspace
  // also holds personal projects that don't belong in this archive.
  const noProject: unknown[] = [];
  const otherProjects: Record<string, number> = {};
  for (const s of STAFF) {
    try {
      const mine = await asana.getAll<Task & { created_at?: string }>("/tasks", {
        assignee: s.gid,
        workspace: WORKSPACE_GID,
        opt_fields: "name,completed,created_at,projects.name,parent",
      });
      for (const t of mine) {
        if (tasks.has(t.gid) || t.parent) continue; // already captured, or a subtask
        if (!t.projects?.length) {
          noProject.push({ gid: t.gid, name: t.name, completed: t.completed, created_at: t.created_at, assignee: s.name });
        } else if (!t.projects.some((p) => p.gid === PROJECT_GID)) {
          for (const p of t.projects) otherProjects[`${p.name ?? p.gid} (${s.name})`] = (otherProjects[`${p.name ?? p.gid} (${s.name})`] ?? 0) + 1;
        }
      }
    } catch (err) {
      note(`staff tasks for ${s.name}`, err);
    }
  }
  writeJson(path.join(out, "staff-review.json"), { noProject, otherProjects });

  // --- Manifest ------------------------------------------------------------------
  const videoMessages = attachments.filter((a) => a.host === "vimeo");
  const links = attachments.filter((a) => !isAsanaHosted(a) && a.host !== "vimeo");
  const messagesSaved = fs.existsSync(path.join(out, "messages")) && fs.readdirSync(path.join(out, "messages")).length > 0;
  const manual = [
    ...(messagesSaved ? [] : [`Project Messages tab: no Asana API. Save each thread (print to PDF) into ${path.join(out, "messages")}`]),
    ...videoMessages.map((a) => `Video message "${a.name}" on ${a.parentGid}: open ${a.view_url ?? a.permanent_url} and save it`),
  ];
  const ackManual = flag("--ack-manual");
  const sectionOf = (t: Task) => t.memberships?.find((m) => m.project?.gid === PROJECT_GID)?.section?.name ?? (t.in_project ? "(no section)" : "(subtask)");
  const status = !withFiles
    ? "metadata-only"
    : missing.length || errors.length
      ? "incomplete"
      : manual.length && !ackManual
        ? "needs-manual-steps"
        : "complete";
  const manifest = {
    snapshotStartedAt,
    finishedAt: new Date().toISOString(),
    status,
    withFiles,
    workspace: WORKSPACE_GID,
    project: { gid: PROJECT_GID, name: project.name },
    counts: {
      tasks: allTasks.length,
      inProject: allTasks.filter((t) => t.in_project).length,
      subtasksOnly: allTasks.filter((t) => !t.in_project).length,
      open: allTasks.filter((t) => !t.completed).length,
      completed: allTasks.filter((t) => t.completed).length,
      bySection: countBy(allTasks, sectionOf),
      stories: stories.length,
      storiesBySubtype: countBy(stories, (s) => s.resource_subtype),
      attachments: attachments.length,
      attachmentsByHost: countBy(attachments, (a) => a.host),
      asanaHostedFiles: hosted.length,
      filesOnDisk: onDisk.length,
      bytes,
      users: users.size,
      staffTasksInNoProject: noProject.length,
    },
    apiRequests: asana.requests,
    missingFiles: missing,
    deletedInAsana,
    links: links.map((a) => ({ attachment: a.gid, parent: a.parentGid, name: a.name, host: a.host, view_url: a.view_url ?? a.permanent_url })),
    manual,
    manualAcknowledged: ackManual,
    errors,
  };
  writeJson(path.join(out, "manifest.json"), manifest);

  log(`${status}: ${manifest.counts.tasks} tasks, ${manifest.counts.stories} stories, ${onDisk.length}/${hosted.length} files, ${(bytes / 1e9).toFixed(2)} GB, ${asana.requests} requests`);
  if (missing.length) log(`MISSING ${missing.length} files; see manifest.json. Re-run with --resume ${out}`);
  if (errors.length) log(`${errors.length} errors; see manifest.json. Re-run with --resume ${out}`);
  for (const m of manual) log(`MANUAL: ${m}`);
  if (manual.length && !ackManual) log(`When those are saved, re-run with --resume ${out} --ack-manual`);
  if (status !== "complete") process.exitCode = 1;
}

main().catch((err) => {
  console.error("[asana-snapshot] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
