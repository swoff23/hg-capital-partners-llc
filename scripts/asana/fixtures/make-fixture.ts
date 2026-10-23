/**
 * Write a SYNTHETIC Asana snapshot to disk, in exactly the layout
 * scripts/asana/10-snapshot.ts writes, so 20-load.ts and 30-delta.ts can be
 * run end to end with no Asana token. The tasks, stories and files come from
 * src/lib/asana/__fixtures__/snapshot.ts; this adds real bytes (a PNG drawn
 * here, JPEG and HEIC copies made with sips on macOS, a stand-in MOV and PDF).
 *
 *   npm run asana:fixture -- --out <dir>                 # synthetic people and tasks only
 *   npm run asana:fixture -- --out <dir> --from-db       # plus every CSV task row in DATABASE_URL (read only),
 *                                                        # as Asana would hold it, and real contractor names
 *   npm run asana:fixture -- --delta <snapshotDir>       # a day of Asana activity after that snapshot,
 *                                                        # saved as a 30-delta.ts run to --replay
 *
 * Output must be gitignored (it can hold names and emails from the database);
 * the default is _private/asana-fixture/<timestamp>/.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { prisma } from "../../../src/lib/db";
import { safeFileName, snapshotStamp } from "../../../src/lib/asana/snapshot-helpers";
import { buildDeltaFixture, buildFixture, DEFAULT_WORLD, type FixtureFile, type FixturePerson, type FixtureSnapshot, type FixtureWorld } from "../../../src/lib/asana/__fixtures__/snapshot";
import type { AsanaAttachment, AsanaRef, AsanaStory, AsanaTask } from "../../../src/lib/asana/map";
import { assertKnownFlags, assertNotTracked, describeTarget, flagValue, hasFlag, log as logger, writeJson } from "../_import-lib";

const log = logger("asana-fixture");

// --- Bytes --------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A real RGB PNG (a gradient with a seed-dependent tint), larger than 1024px so thumbnails resize. */
function png(width: number, height: number, seed: number): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = (x * 255) / width;
      raw[row + 2 + x * 3] = (y * 255) / height;
      raw[row + 3 + x * 3] = (seed * 37) % 256;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const PDF = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
trailer << /Root 1 0 R >>
%%EOF
`;

const sips = process.platform === "darwin" && spawnSync("/bin/sh", ["-c", "command -v sips"], { stdio: "ignore" }).status === 0;

/** Write one fixture file. Returns its size. JPEG and HEIC come from sips when it's there, else PNG bytes under that name. */
function writeFixtureFile(dir: string, f: FixtureFile, seed: number): number {
  const dest = path.join(dir, f.attachmentGid, safeFileName(f.name));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (f.format === "pdf") fs.writeFileSync(dest, PDF);
  else if (f.format === "mov") fs.writeFileSync(dest, Buffer.concat([Buffer.from("\x00\x00\x00\x18ftypqt  "), Buffer.alloc(150_000, seed)])); // not playable; no poster without ffmpeg anyway
  else {
    const p = png(1600, 1200, seed);
    if (f.format === "png" || !sips) fs.writeFileSync(dest, p);
    else {
      const tmp = `${dest}.src.png`;
      fs.writeFileSync(tmp, p);
      const ok = spawnSync("sips", ["-s", "format", f.format === "heic" ? "heic" : "jpeg", tmp, "--out", dest], { stdio: "ignore" }).status === 0;
      fs.rmSync(tmp, { force: true });
      if (!ok) fs.writeFileSync(dest, p);
    }
  }
  return fs.statSync(dest).size;
}

/** Files and stories in the snapshot layout. Sizes are set from the bytes written. */
function writeLayout(
  out: string,
  data: { tasks: AsanaTask[]; stories: Record<string, AsanaStory[]>; attachments: Record<string, AsanaAttachment[]>; files: FixtureFile[] },
): number {
  let bytes = 0;
  const sizes = new Map<string, number>();
  data.files.forEach((f, i) => {
    const size = writeFixtureFile(path.join(out, "files"), f, i + 1);
    sizes.set(f.attachmentGid, size);
    bytes += size;
  });
  for (const t of data.tasks) {
    writeJson(path.join(out, "stories", `${t.gid}.json`), data.stories[t.gid] ?? []);
    writeJson(
      path.join(out, "attachments", `${t.gid}.json`),
      (data.attachments[t.gid] ?? []).map((a) => (sizes.has(a.gid) ? { ...a, size: sizes.get(a.gid)! } : a)),
    );
  }
  writeJson(path.join(out, "tasks.json"), data.tasks);
  return bytes;
}

// --- --from-db: the CSV rows as Asana would hold them now ------------------------

/** A stable pseudo-random number in [0, 1) per gid, so the same database gives the same fixture. */
const unit = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
};

async function worldFromDb(): Promise<FixtureWorld> {
  const t = describeTarget();
  log(`reading CSV rows from ${t.host}/${t.database} (read only)`);
  const [rows, contacts, users] = await Promise.all([
    prisma.task.findMany({
      where: { asanaId: { not: null } },
      select: { asanaId: true, title: true, sectionRaw: true, status: true, description: true, dueDate: true, assigneeUserId: true, assigneeName: true, assigneeEmail: true },
      orderBy: { asanaId: "asc" },
    }),
    prisma.contact.findMany({ select: { fullName: true, email: true }, orderBy: { fullName: "asc" } }),
    prisma.user.findMany({ select: { id: true, email: true } }),
  ]);
  // Contractors for the synthetic jobs: real names, with the synthetic gids the fixture's delta expects.
  const withEmail = contacts.filter((c) => c.email?.includes("@"));
  const noEmail = contacts.find((c) => !c.email);
  const crew: FixturePerson[] = DEFAULT_WORLD.contractors.map((d, i) => {
    const c = i < 2 ? withEmail[i] : noEmail;
    return c ? { gid: d.gid, name: c.fullName, email: i < 2 ? c.email!.split(/[\s,;]+/)[0] : null } : d;
  });
  const staffByUser = new Map(users.map((u) => [u.id, DEFAULT_WORLD.staff.find((s) => s.email?.toLowerCase() === u.email.toLowerCase())]));
  const people = new Map<string, FixturePerson>();
  let n = 0;
  const personFor = (name: string | null, email: string | null): FixturePerson | null => {
    if (!name && !email) return null;
    const key = (email || name || "").toLowerCase();
    if (!people.has(key)) people.set(key, { gid: String(1209800000000001 + n++), name: name ?? email!, email });
    return people.get(key)!;
  };
  // Open in August doesn't mean open now: about a third has been finished in Asana since.
  const top = rows.filter((r) => r.sectionRaw);
  const subs = rows.filter((r) => !r.sectionRaw);
  // Playbook steps stay as they are; a handful of August's done tasks were reopened.
  const openNow = (r: (typeof rows)[number]) =>
    /\[address\]/i.test(r.sectionRaw ?? "") ? r.status !== "DONE" : r.status === "DONE" ? unit(r.asanaId!) < 0.002 : unit(r.asanaId!) < 0.65;
  const existing: FixtureWorld["existing"] = top.map((r) => ({
    gid: r.asanaId!,
    name: r.title,
    section: r.sectionRaw!,
    completed: !openNow(r),
    assignee: r.assigneeUserId ? (staffByUser.get(r.assigneeUserId) ?? null) : personFor(r.assigneeName, r.assigneeEmail),
    notes: r.description,
    dueOn: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
  }));
  // The CSV's subtask rows have no section and no parent; hang them under open and finished tasks alike.
  const parents = existing.filter((e) => !/\[address\]/i.test(e.section));
  for (const r of subs) {
    const parent = parents[Math.floor(unit(`${r.asanaId}p`) * parents.length) % parents.length];
    if (parent) existing.push({ gid: r.asanaId!, name: r.title, section: "", completed: r.status === "DONE", parentGid: parent.gid });
  }
  log(`${top.length} CSV rows as project tasks (${existing.filter((e) => !e.parentGid && !e.completed).length} still open), ${subs.length} as subtasks, ${people.size} assignees from the CSV`);
  return { ...DEFAULT_WORLD, contractors: crew, existing };
}

// --- Main -----------------------------------------------------------------------

function defaultOut(): string {
  return path.resolve("_private", "asana-fixture", snapshotStamp(new Date().toISOString()));
}

async function writeSnapshot() {
  const out = path.resolve(flagValue("--out") ?? defaultOut());
  fs.mkdirSync(out, { recursive: true });
  assertNotTracked(out);
  const world = hasFlag("--from-db") ? await worldFromDb() : DEFAULT_WORLD;
  const snap = buildFixture(world);
  const bytes = writeLayout(out, snap);
  writeJson(path.join(out, "manifest.json"), {
    ...snap.manifest,
    counts: { tasks: snap.tasks.length, stories: Object.values(snap.stories).reduce((n, s) => n + s.length, 0), asanaHostedFiles: snap.files.length, bytes },
    missingFiles: [],
    manual: [],
  });
  writeJson(path.join(out, "project.json"), snap.project);
  writeJson(path.join(out, "sections.json"), snap.sections);
  writeJson(path.join(out, "users.json"), snap.users);
  log(`wrote ${snap.tasks.length} tasks, ${snap.files.length} files (${(bytes / 1e6).toFixed(1)} MB${sips ? "" : ", no sips: JPEG and HEIC are PNG bytes"}) to ${out}`);
  log(`next: npm run asana:load -- --snapshot ${out}`);
}

function readBack(dir: string): FixtureSnapshot {
  const read = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as T;
  const tasks = read<AsanaTask[]>("tasks.json");
  const stories: Record<string, AsanaStory[]> = {};
  const attachments: Record<string, AsanaAttachment[]> = {};
  for (const t of tasks) {
    stories[t.gid] = read<AsanaStory[]>(`stories/${t.gid}.json`);
    attachments[t.gid] = read<AsanaAttachment[]>(`attachments/${t.gid}.json`);
  }
  return {
    manifest: read("manifest.json"),
    project: read("project.json"),
    sections: read<AsanaRef[]>("sections.json"),
    users: read<AsanaRef[]>("users.json"),
    tasks,
    stories,
    attachments,
    files: [],
  };
}

async function writeDelta(snapDir: string) {
  const snap = readBack(snapDir);
  const startedAt = new Date(Date.parse(snap.manifest.snapshotStartedAt) + 86_400_000).toISOString();
  const d = buildDeltaFixture(snap, startedAt);
  const out = path.join(snapDir, "delta", `${snapshotStamp(startedAt)}-fixture`);
  fs.mkdirSync(out, { recursive: true });
  assertNotTracked(snapDir);
  writeLayout(out, d);
  writeJson(path.join(out, "users.json"), snap.users);
  writeJson(path.join(out, "delta.json"), { ...d.meta, finishedAt: startedAt, projectGid: snap.project.gid });
  log(`wrote a delta run to ${out}`);
  for (const c of d.changes) log(`  ${c}`);
  if (d.appEdit) {
    log(`for a conflict, edit that task in the app first (or locally):`);
    log(`  psql -d <db> -c "UPDATE \\"Task\\" SET title = '${d.appEdit.title}', \\"appEditedAt\\" = now() WHERE \\"asanaId\\" = '${d.appEdit.gid}'"`);
  }
  log(`next: npm run asana:delta -- --snapshot ${snapDir} --replay ${out}`);
}

async function main() {
  assertKnownFlags(["--out=", "--from-db", "--delta="]);
  const delta = flagValue("--delta");
  if (delta) await writeDelta(path.resolve(delta));
  else await writeSnapshot();
}

main()
  .catch((err) => {
    console.error("[asana-fixture] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
