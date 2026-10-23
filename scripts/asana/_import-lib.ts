/**
 * Shared by 20-load.ts and 30-delta.ts: flags, the target database guard,
 * reading a snapshot from disk, loading what the planner needs from the
 * database, and the file phase (private Blob uploads with sips and ffmpeg
 * thumbnails). The rules themselves are in src/lib/asana/map.ts; the
 * database writes in src/lib/asana/import.ts.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { del, put } from "@vercel/blob";
import type { PrismaClient } from "@prisma/client";
import { getEnv } from "../../src/lib/env";
import { isAsanaHosted, safeFileName } from "../../src/lib/asana/snapshot-helpers";
import { blobSafeName, type AsanaAttachment, type AsanaRef, type AsanaStory, type AsanaTask, type AttachmentPlan, type ImportPlan, type PersonOverride, type PlanDb } from "../../src/lib/asana/map";
import { writeAttachment, type StoredFile } from "../../src/lib/asana/import";
import {
  backupCommand,
  backupRefusal,
  describeDatabaseUrl,
  dumpDbname,
  envFileOf,
  inputRefusal,
  PROD_REF,
  writeRefusal,
  type Target,
} from "../../src/lib/asana/target";

export { PROD_REF, type Target };

export const log = (tag: string) => (msg: string) => console.log(`[${tag}] ${msg}`);

/** Interactive transaction limits. Prisma's 5s default is tight against a remote database. */
export const TX = { timeout: 60_000, maxWait: 10_000 } as const;

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

export const hasFlag = (name: string) => process.argv.includes(name);

/** The value after `--name`. Refuses a missing value or another flag. */
export function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`${name} needs a value`);
  return v;
}

/** Fail on a flag this script doesn't know, so a typo like --aply never silently means a dry run. */
export function assertKnownFlags(known: readonly string[]): void {
  const withValue = new Set(known.filter((k) => k.endsWith("=")).map((k) => k.slice(0, -1)));
  const bare = new Set(known.filter((k) => !k.endsWith("=")));
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (withValue.has(a)) i++;
    else if (!bare.has(a)) throw new Error(`unknown argument ${a}`);
  }
}

// ---------------------------------------------------------------------------
// Target database
// ---------------------------------------------------------------------------

export function describeTarget(): Target {
  const url = getEnv().DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is unset. Is .env filled in?");
  return describeDatabaseUrl(url);
}

/** A pg_dump command for the database this process writes to (see target.ts backupCommand). */
export function backupCommandForThisRun(label: string): string {
  return backupCommand(envFileOf(process.execArgv), label);
}

/**
 * Print where this run reads and writes, before anything else happens.
 * Writing anywhere but a local database needs `--confirm-prod ywdjaygwkqyrmbdnvaai`,
 * and the URL itself must be that project's (src/lib/asana/target.ts).
 */
export async function guardTarget(prisma: PrismaClient, opts: { apply: boolean; tag: string }): Promise<Target> {
  const t = describeTarget();
  const tasks = await prisma.task.count();
  console.log(`[${opts.tag}] database: ${t.host}/${t.database}${t.local ? " (local)" : ""}, project ref: ${t.isProdRef ? PROD_REF : "(not production)"}, ${tasks} Task rows`);
  const refusal = writeRefusal(t, { apply: opts.apply, confirmProd: flagValue("--confirm-prod") });
  if (refusal) throw new Error(refusal);
  if (!t.local) console.log(`[${opts.tag}] not a local database. A pg_dump of this same database, for --backup:\n  ${backupCommandForThisRun(opts.tag)}`);
  return t;
}

/** Refuse to --apply a synthetic fixture, or another Asana project, anywhere but a local database. */
export function guardInput(t: Target, input: { apply: boolean; synthetic: boolean; projectGid: string }): void {
  const refusal = inputRefusal(t, input);
  if (refusal) throw new Error(refusal);
}

/**
 * The backup taken right before a production write: it must exist, be
 * recent, sit somewhere git ignores, and (when pg_restore is installed) be
 * a dump of the database this run writes to.
 */
export function assertBackup(file: string | undefined, t: Target, label: string): void {
  if (!file) throw new Error(`a production write needs --backup <file>, the pg_dump taken right before. Take one with:\n  ${backupCommandForThisRun(label)}`);
  const abs = path.resolve(file);
  const st = fs.existsSync(abs) ? fs.statSync(abs) : null;
  const listing = st ? spawnSync("pg_restore", ["-l", abs], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) : null;
  const refusal = backupRefusal(
    file,
    {
      exists: !!st?.isFile(),
      bytes: st?.size ?? 0,
      mtimeMs: st?.mtimeMs ?? 0,
      trackable: st ? isTrackable(abs) : false,
      dumpDbname: listing?.status === 0 ? dumpDbname(listing.stdout) : null,
    },
    t,
    Date.now(),
  );
  if (refusal) throw new Error(refusal);
}

/** Ask on the terminal; `--yes-delete "<answer>"` stands in when there isn't one (the bare number also counts). */
export async function confirmTyped(question: string, expected: string, flag: string): Promise<boolean> {
  const given = flagValue(flag);
  if (given !== undefined) return given.trim() === expected || given.trim() === expected.replace(/^DELETE /, "");
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(`${question} Type "${expected}" to go ahead: `)).trim() === expected;
  } finally {
    rl.close();
  }
}

/** Ids for new tasks, cuid-shaped (Prisma's default is cuid; any unique string works). */
export function newTaskId(): string {
  return `c${Date.now().toString(36)}${randomBytes(8).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Snapshot on disk (the layout scripts/asana/10-snapshot.ts writes)
// ---------------------------------------------------------------------------

export interface Manifest {
  snapshotStartedAt: string;
  status?: string;
  project?: { gid: string; name?: string };
  synthetic?: boolean;
}

export interface SnapshotOnDisk {
  dir: string;
  manifest: Manifest;
  projectGid: string;
  tasks: AsanaTask[];
  stories: Record<string, AsanaStory[]>;
  attachments: Record<string, AsanaAttachment[]>;
  users: AsanaRef[];
  sections: AsanaRef[];
  files: Map<string, { path: string; bytes: number }>;
  /** Tasks whose stories or attachment list files are missing or unreadable. */
  unreadable: string[];
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function mustRead<T>(file: string): T {
  const v = readJson<T>(file);
  if (v == null) throw new Error(`${file} is missing or unreadable`);
  return v;
}

/** Bytes on disk for each Asana-hosted attachment, found in any of `fileDirs` at the expected size. */
export function filesOnDisk(attachments: Record<string, AsanaAttachment[]>, fileDirs: readonly string[]): Map<string, { path: string; bytes: number }> {
  const out = new Map<string, { path: string; bytes: number }>();
  for (const list of Object.values(attachments)) {
    for (const a of list) {
      if (!isAsanaHosted(a) || out.has(a.gid)) continue;
      for (const dir of fileDirs) {
        const f = path.join(dir, a.gid, safeFileName(a.name));
        if (!fs.existsSync(f)) continue;
        const bytes = fs.statSync(f).size;
        if (a.size != null && bytes !== a.size) continue; // a truncated download never counts
        out.set(a.gid, { path: f, bytes });
        break;
      }
    }
  }
  return out;
}

export function readSnapshot(dir: string, extraFileDirs: readonly string[] = []): SnapshotOnDisk {
  const manifest = mustRead<Manifest>(path.join(dir, "manifest.json"));
  const tasks = mustRead<AsanaTask[]>(path.join(dir, "tasks.json"));
  const projectGid = manifest.project?.gid ?? readJson<{ gid: string }>(path.join(dir, "project.json"))?.gid;
  if (!projectGid) throw new Error(`${dir}: no project gid in manifest.json or project.json`);
  const stories: Record<string, AsanaStory[]> = {};
  const attachments: Record<string, AsanaAttachment[]> = {};
  const unreadable: string[] = [];
  for (const t of tasks) {
    const s = readJson<AsanaStory[]>(path.join(dir, "stories", `${t.gid}.json`));
    const a = readJson<AsanaAttachment[]>(path.join(dir, "attachments", `${t.gid}.json`));
    if (!s || !a) unreadable.push(t.gid);
    stories[t.gid] = s ?? [];
    attachments[t.gid] = a ?? [];
  }
  return {
    dir,
    manifest,
    projectGid,
    tasks,
    stories,
    attachments,
    users: readJson<AsanaRef[]>(path.join(dir, "users.json")) ?? [],
    sections: readJson<AsanaRef[]>(path.join(dir, "sections.json")) ?? [],
    files: filesOnDisk(attachments, [...extraFileDirs, path.join(dir, "files")]),
    unreadable,
  };
}

/**
 * Connor's confirmations, keyed by Asana user gid:
 *   { "<gid>": { "userId": "..." } }        a staff user
 *   { "<gid>": { "contactId": "..." } }     an existing contact (ids differ between databases: take them from that database's dry run)
 *   { "<gid>": { "none": true } }           nobody; the name stays as text
 *   { "<gid>": { "createContact": { "fullName": "...", "email": "..." } } }
 *                                           a contractor with no contact yet: --apply creates one with this gid, before
 *                                           tasks are written, so their jobs link to them. No login, no invite, no email.
 *                                           A later run finds it by gid (or that email) and creates nothing.
 */
export function readOverrides(file: string | undefined): Record<string, PersonOverride> {
  if (!file || !fs.existsSync(file)) return {};
  const v = mustRead<Record<string, PersonOverride>>(file);
  if (typeof v !== "object" || Array.isArray(v)) throw new Error(`${file}: expected an object keyed by Asana user gid`);
  return v;
}

// ---------------------------------------------------------------------------
// Database inputs for the planner
// ---------------------------------------------------------------------------

export async function loadPlanDb(prisma: PrismaClient): Promise<PlanDb> {
  const [users, contacts, properties, tasks, checklist, templates, events, atts] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, name: true, asanaGid: true } }),
    prisma.contact.findMany({ select: { id: true, fullName: true, email: true, asanaGid: true, active: true } }),
    prisma.property.findMany({ select: { id: true, address: true } }),
    prisma.task.findMany({
      select: {
        id: true,
        asanaId: true,
        title: true,
        description: true,
        status: true,
        dueDate: true,
        startDate: true,
        propertyId: true,
        bucket: true,
        sectionRaw: true,
        assigneeUserId: true,
        assigneeContactId: true,
        assigneeName: true,
        assigneeEmail: true,
        appEditedAt: true,
        asanaSyncedAt: true,
        asanaLastSynced: true,
        repeatRule: true,
        _count: { select: { attachments: true, events: { where: { source: { not: "ASANA" } } } } },
      },
    }),
    prisma.taskChecklistItem.findMany({ where: { asanaGid: { not: null } }, select: { id: true, taskId: true, asanaGid: true, title: true, done: true } }),
    prisma.taskTemplate.findMany({ select: { id: true, sourceAsanaSectionGid: true } }),
    prisma.taskEvent.findMany({ where: { asanaStoryGid: { not: null } }, select: { asanaStoryGid: true } }),
    prisma.taskAttachment.findMany({ where: { asanaGid: { not: null } }, select: { asanaGid: true } }),
  ]);
  return {
    users,
    contacts,
    properties,
    tasks: tasks.map(({ _count, repeatRule, ...t }) => ({ ...t, hasRepeat: repeatRule != null, attachmentCount: _count.attachments, appEventCount: _count.events })),
    checklist: checklist.map((c) => ({ ...c, asanaGid: c.asanaGid! })),
    templates,
    storyGids: new Set(events.map((e) => e.asanaStoryGid!)),
    attachmentGids: new Set(atts.map((a) => a.asanaGid!)),
  };
}

export function namesOf(db: PlanDb): Map<string, string> {
  return new Map<string, string>([...db.users.map((u) => [u.id, u.name ?? u.email] as [string, string]), ...db.contacts.map((c) => [c.id, c.fullName] as [string, string])]);
}

// ---------------------------------------------------------------------------
// Files: private Vercel Blob, thumbnails on Connor's Mac
// ---------------------------------------------------------------------------

export interface Uploader {
  label: string;
  put(pathname: string, file: string, contentType: string | null, size: number): Promise<{ url: string; pathname: string }>;
  del(paths: string[]): Promise<void>;
}

const MULTIPART_OVER = 100 * 1024 * 1024;

/** Private Vercel Blob (§5.3): random suffix on, overwrite off, multipart over 100 MB. */
export function blobUploader(token: string): Uploader {
  return {
    label: "Vercel Blob (private)",
    async put(pathname, file, contentType, size) {
      const res = await put(pathname, fs.createReadStream(file), {
        access: "private",
        addRandomSuffix: true,
        contentType: contentType ?? undefined,
        multipart: size > MULTIPART_OVER,
        token,
      });
      return { url: res.url, pathname: res.pathname };
    },
    async del(paths) {
      if (paths.length) await del(paths, { token });
    },
  };
}

/** Local dev only: "uploads" into a folder, so the whole load can be exercised without a Blob token. */
export function localUploader(dir: string): Uploader {
  return {
    label: `local folder ${dir} (not Blob)`,
    async put(pathname, file) {
      const dot = pathname.lastIndexOf(".");
      const suffixed = `${dot > pathname.lastIndexOf("/") ? pathname.slice(0, dot) : pathname}-${randomBytes(4).toString("hex")}${dot > pathname.lastIndexOf("/") ? pathname.slice(dot) : ""}`;
      const dest = path.join(dir, suffixed);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file, dest, fs.constants.COPYFILE_EXCL);
      return { url: `local-blob:${suffixed}`, pathname: suffixed };
    },
    async del(paths) {
      for (const p of paths) fs.rmSync(path.join(dir, p.replace(/^local-blob:/, "")), { force: true });
    },
  };
}

const has = (cmd: string) => spawnSync("/bin/sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0;

export interface MediaTools {
  sips: boolean;
  ffmpeg: boolean;
  ffprobe: boolean;
}

export function mediaTools(): MediaTools {
  return { sips: process.platform === "darwin" && has("sips"), ffmpeg: has("ffmpeg"), ffprobe: has("ffprobe") };
}

function run(cmd: string, args: string[]): string | null {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 });
  return r.status === 0 ? r.stdout : null;
}

function imageSize(file: string): { width: number; height: number } | null {
  const out = run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]);
  const w = out?.match(/pixelWidth:\s*(\d+)/)?.[1];
  const h = out?.match(/pixelHeight:\s*(\d+)/)?.[1];
  return w && h ? { width: Number(w), height: Number(h) } : null;
}

/** A JPEG no larger than 1024px on its long side; for a HEIC this is also its JPEG copy. */
function imageThumb(file: string, out: string, size: { width: number; height: number } | null): boolean {
  const resize = !size || Math.max(size.width, size.height) > 1024 ? ["-Z", "1024"] : [];
  return run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "80", ...resize, file, "--out", out]) !== null && fs.existsSync(out);
}

function videoInfo(file: string): { width: number | null; height: number | null; durationSec: number | null } | null {
  const out = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file]);
  if (!out) return null;
  try {
    const j = JSON.parse(out) as { streams?: Array<{ width?: number; height?: number }>; format?: { duration?: string } };
    const d = Number(j.format?.duration);
    return { width: j.streams?.[0]?.width ?? null, height: j.streams?.[0]?.height ?? null, durationSec: Number.isFinite(d) ? d : null };
  } catch {
    return null;
  }
}

function videoPoster(file: string, out: string): boolean {
  for (const at of ["1", "0"]) {
    if (run("ffmpeg", ["-y", "-loglevel", "error", "-ss", at, "-i", file, "-frames:v", "1", "-vf", "scale='min(1024,iw)':-2", out]) !== null && fs.existsSync(out)) return true;
  }
  return false;
}

export interface FilePhaseResult {
  uploaded: number;
  links: number;
  bytes: number;
  thumbs: number;
  posters: number;
  skippedExisting: number;
  failed: Array<{ asanaGid: string; filename: string; error: string }>;
}

/**
 * Upload each new Asana-hosted file to tasks/<taskId>/orig/, with a
 * thumbnail in thumb/ and a video poster in poster/ when the tools are
 * there, then record its row. Links get a row and no upload. A file whose
 * row already exists (by Asana gid) is never uploaded again.
 */
export async function runFilePhase(
  prisma: PrismaClient,
  plan: ImportPlan,
  opts: { uploader: Uploader; tools: MediaTools; log: (m: string) => void; concurrency?: number },
): Promise<FilePhaseResult> {
  const res: FilePhaseResult = { uploaded: 0, links: 0, bytes: 0, thumbs: 0, posters: 0, skippedExisting: 0, failed: [] };
  const todo = plan.tasks.flatMap((t) => t.attachments).filter((a) => !a.existing && a.source.type !== "missing");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asana-media-"));
  let next = 0;
  const one = async (a: AttachmentPlan) => {
    if (await prisma.taskAttachment.findUnique({ where: { asanaGid: a.asanaGid }, select: { id: true } })) {
      res.skippedExisting++;
      return;
    }
    if (a.source.type === "link") {
      await prisma.$transaction((tx) => writeAttachment(tx, a, null), TX);
      res.links++;
      return;
    }
    if (a.source.type !== "file") return;
    const src = a.source;
    const uploaded: string[] = [];
    try {
      const name = blobSafeName(a.filename);
      const orig = await opts.uploader.put(`tasks/${a.taskId}/orig/${name}`, src.path, a.contentType, src.bytes);
      uploaded.push(orig.url);
      const stored: StoredFile = { url: orig.url, pathname: orig.pathname, size: src.bytes, thumbPathname: null, posterPathname: null, width: null, height: null, durationSec: null };
      const stem = name.replace(/\.[^.]+$/, "");
      if (a.kind === "IMAGE" && opts.tools.sips) {
        const size = imageSize(src.path);
        if (size) Object.assign(stored, size);
        const out = path.join(tmp, `${a.asanaGid}.jpg`);
        if (imageThumb(src.path, out, size)) {
          const th = await opts.uploader.put(`tasks/${a.taskId}/thumb/${stem}.jpg`, out, "image/jpeg", fs.statSync(out).size);
          uploaded.push(th.url);
          stored.thumbPathname = th.pathname;
          res.thumbs++;
        }
      }
      if (a.kind === "VIDEO") {
        if (opts.tools.ffprobe) Object.assign(stored, videoInfo(src.path) ?? {});
        const out = path.join(tmp, `${a.asanaGid}-poster.jpg`);
        if (opts.tools.ffmpeg && videoPoster(src.path, out)) {
          const po = await opts.uploader.put(`tasks/${a.taskId}/poster/${stem}.jpg`, out, "image/jpeg", fs.statSync(out).size);
          uploaded.push(po.url);
          stored.posterPathname = po.pathname;
          res.posters++;
        }
      }
      await prisma.$transaction((tx) => writeAttachment(tx, a, stored), TX);
      res.uploaded++;
      res.bytes += src.bytes;
      if (res.uploaded % 25 === 0) opts.log(`files: ${res.uploaded}/${todo.length}`);
    } catch (err) {
      // Don't leave bytes in Blob that no row points at.
      await opts.uploader.del(uploaded).catch(() => {});
      res.failed.push({ asanaGid: a.asanaGid, filename: a.filename, error: err instanceof Error ? err.message : String(err) });
    }
  };
  const worker = async () => {
    while (next < todo.length) await one(todo[next++]);
  };
  try {
    await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, todo.length) }, worker));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return res;
}

/** Which uploader this run uses, or why it can't upload. Checked before anything is written. */
export function pickUploader(opts: { apply: boolean; skipFiles: boolean; fakeBlobDir: string | undefined; target: Target }): Uploader | null {
  if (!opts.apply || opts.skipFiles) return null;
  if (opts.fakeBlobDir) {
    if (!opts.target.local) throw new Error("--fake-blob is for a local database only");
    return localUploader(path.resolve(opts.fakeBlobDir));
  }
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is unset, so files can't upload. Nothing was written. Set it (vercel env pull), or pass --skip-files.");
  return blobUploader(token);
}

/** `file` is inside a git work tree and not ignored, so `git add` could pick it up. */
export function isTrackable(file: string): boolean {
  let dir = path.dirname(path.resolve(file));
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  const top = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (top.status !== 0) return false; // not inside a repo
  const root = top.stdout.trim();
  const probe = path.relative(root, path.resolve(file));
  return spawnSync("git", ["-C", root, "check-ignore", "-q", "--no-index", probe]).status !== 0;
}

/** Refuse to write PII anywhere `git add` could pick it up (same check as 10-snapshot.ts). */
export function assertNotTracked(dir: string): void {
  if (isTrackable(path.join(dir, "manifest.json"))) throw new Error(`${dir} is inside a git repo and not gitignored; refusing to write there`);
}

/** The same for one file (a report holds names, emails and comment text). */
export function assertFileNotTracked(file: string): void {
  if (isTrackable(file)) throw new Error(`${file} is inside a git repo and not gitignored; refusing to write there (try _private/)`);
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}
