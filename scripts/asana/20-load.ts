/**
 * Load the open HG work from an Asana snapshot (scripts/asana/10-snapshot.ts)
 * into the app: every open task in an HG section with its comments, history,
 * files and subtasks, the four playbooks as templates, and the reconciliation
 * with the August CSV rows already in the database. docs/asana-migration-plan.md
 * §5.5 and D5, D17, D21, D24, D25, D27, D28.
 *
 *   npm run asana:load -- --snapshot <dir>                    # dry run: the full report, writes nothing
 *   npm run asana:load -- --snapshot <dir> --apply            # write
 *   npm run asana:load -- --snapshot <dir> --apply --delete   # and the D25 delete, after asking again
 *
 *   --snapshot <dir>         required
 *   --dry-run                the default
 *   --apply                  write people's Asana ids, templates, tasks, timelines, checklists, files
 *   --delete                 with --apply: hard-delete the D25 list after printing it and asking
 *   --yes-delete "DELETE <n>"  the answer to that question when there's no terminal (n = rows listed; the bare n also counts)
 *   --confirm-prod <ref>     needed to --apply anywhere but a local database: ywdjaygwkqyrmbdnvaai
 *   --backup <file>          needed with it: the pg_dump taken in the last 30 minutes (under _private/)
 *   --people <file>          Connor's identity confirmations (default <snapshot>/people.json)
 *   --accept-name-matches    treat name-only contact matches as confirmed
 *   --refresh-templates      rewrite templates that already exist
 *   --skip-files             write everything but the files (a later run uploads them)
 *   --fake-blob <dir>        local database only: "upload" into a folder instead of Blob
 *   --allow-incomplete       load a snapshot whose manifest isn't complete
 *   --report <file>          also save the report there (somewhere gitignored: it holds names and comments)
 *
 * A SYNTHETIC fixture (scripts/asana/fixtures/make-fixture.ts), or a snapshot
 * of any Asana project but HG's, is only ever applied to a local database.
 *
 * Production: the owner connection string lives in .env.prod-write
 * (gitignored). Take a pg_dump of that database first (a dry run against it
 * prints the exact command), then:
 *   npx tsx --env-file=.env.prod-write scripts/asana/20-load.ts --snapshot <dir> --apply \
 *     --confirm-prod ywdjaygwkqyrmbdnvaai --backup _private/backups/<file>.dump
 *
 * Never emails: every write goes through src/lib/asana/import.ts as the
 * "asana" principal (see import.test.ts). Safe to re-run: tasks match by
 * Asana id, events by story gid, files and checklist items by their gids.
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../src/lib/db";
import { buildPlan } from "../../src/lib/asana/map";
import { deleteCsvRows, StalePlanError, writeIdentity, writeTask, writeTemplate } from "../../src/lib/asana/import";
import { formatReport } from "../../src/lib/asana/report";
import {
  assertBackup,
  assertFileNotTracked,
  assertKnownFlags,
  backupCommandForThisRun,
  confirmTyped,
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
} from "./_import-lib";

const log = logger("asana-load");

const FLAGS = [
  "--snapshot=",
  "--dry-run",
  "--apply",
  "--delete",
  "--yes-delete=",
  "--confirm-prod=",
  "--backup=",
  "--people=",
  "--accept-name-matches",
  "--refresh-templates",
  "--skip-files",
  "--fake-blob=",
  "--allow-incomplete",
  "--report=",
];

async function main() {
  assertKnownFlags(FLAGS);
  const dirArg = flagValue("--snapshot");
  if (!dirArg) throw new Error("--snapshot <dir> is required");
  const dir = path.resolve(dirArg);
  const apply = hasFlag("--apply");
  if (apply && hasFlag("--dry-run")) throw new Error("--dry-run and --apply together: pick one");
  const doDelete = hasFlag("--delete");
  if (doDelete && !apply) throw new Error("--delete needs --apply (a dry run already lists what it would delete)");
  const skipFiles = hasFlag("--skip-files");
  const reportFile = flagValue("--report");
  if (reportFile) assertFileNotTracked(reportFile);

  // 1. Where this writes, before anything else.
  const target = await guardTarget(prisma, { apply, tag: "asana-load" });

  // 2. The snapshot. A synthetic fixture (or another project's) never reaches production.
  const snap = readSnapshot(dir);
  log(`snapshot ${dir}: ${snap.manifest.status ?? "?"}, started ${snap.manifest.snapshotStartedAt}, ${snap.tasks.length} tasks, ${snap.files.size} files on disk${snap.manifest.synthetic ? " (SYNTHETIC fixture)" : ""}`);
  guardInput(target, { apply, synthetic: !!snap.manifest.synthetic, projectGid: snap.projectGid });
  if (snap.unreadable.length) log(`! ${snap.unreadable.length} tasks have no readable stories or attachment list; their history would be incomplete`);
  const usable = snap.manifest.status === "complete" || snap.manifest.status === "needs-manual-steps";
  if (apply && (!usable || snap.unreadable.length) && !hasFlag("--allow-incomplete")) {
    throw new Error(`the snapshot isn't complete (${snap.manifest.status}); finish it with 10-snapshot.ts --resume, or pass --allow-incomplete`);
  }
  // A production write starts only from a fresh pg_dump of that same database (D3; §5.5 "a backup is taken right before").
  if (apply && !target.local) {
    assertBackup(flagValue("--backup"), target, "asana-load");
    log(`backup: ${flagValue("--backup")}`);
  }

  // 3. Nothing is written until every precondition holds: uploads included.
  const uploader = pickUploader({ apply, skipFiles, fakeBlobDir: flagValue("--fake-blob"), target });

  // 4. The plan, and the report Connor reviews.
  const db = await loadPlanDb(prisma);
  const overridesFile = flagValue("--people") ?? path.join(dir, "people.json");
  const overrides = readOverrides(overridesFile);
  if (Object.keys(overrides).length) log(`${Object.keys(overrides).length} identity confirmations from ${overridesFile}`);
  const plan = buildPlan(
    { mode: "load", projectGid: snap.projectGid, asOf: snap.manifest.snapshotStartedAt, tasks: snap.tasks, stories: snap.stories, attachments: snap.attachments, users: snap.users, files: snap.files },
    db,
    { overrides, acceptNameMatches: hasFlag("--accept-name-matches"), newId: newTaskId },
  );
  const report = formatReport(plan, {
    title: `Asana load ${apply ? "(APPLY)" : "(dry run: nothing is written)"}`,
    names: namesOf(db),
    header: [`snapshot: ${dir}`, `database: ${target.host}/${target.database}`, `files: ${uploader?.label ?? (skipFiles ? "skipped (--skip-files)" : "none uploaded in a dry run")}`],
  });
  console.log(report);
  if (reportFile) {
    fs.writeFileSync(reportFile, `${report}\n`);
    log(`report saved to ${reportFile}`);
  }
  if (!apply) {
    log("dry run: nothing written. Re-run with --apply to write.");
    return;
  }

  // 5. Write. People and templates first, then each task in its own transaction.
  const now = new Date();
  const identity = await prisma.$transaction((tx) => writeIdentity(tx, plan.people), TX);
  log(`linked ${identity.linked} people to their Asana ids${identity.skipped.length ? `; skipped: ${identity.skipped.join("; ")}` : ""}`);
  for (const t of plan.templates) {
    const r = await prisma.$transaction((tx) => writeTemplate(tx, t, { refresh: hasFlag("--refresh-templates") }), TX);
    log(`template ${t.name}: ${r}`);
  }
  let created = 0;
  let events = 0;
  const stale: string[] = [];
  const failed: string[] = [];
  for (const [i, tp] of plan.tasks.entries()) {
    try {
      const r = await prisma.$transaction((tx) => writeTask(tx, tp, now), TX);
      if (r.created) created++;
      events += r.eventsAdded;
      if (r.nextRepeatId) log(`"${tp.title}" repeats: next copy ${r.nextRepeatId}`);
      if (r.joinedSeriesOf) log(`"${tp.title}" is Asana's next copy of repeating task ${r.joinedSeriesOf}; joined its series`);
    } catch (err) {
      if (err instanceof StalePlanError) stale.push(`${tp.title} (${tp.taskId})`);
      else failed.push(`${tp.title} (${tp.taskId}): ${err instanceof Error ? err.message : String(err)}`);
    }
    if ((i + 1) % 50 === 0) log(`tasks: ${i + 1}/${plan.tasks.length}`);
  }
  log(`tasks: ${plan.tasks.length - stale.length - failed.length} written (${created} new), ${events} timeline events added`);
  for (const s of stale) log(`! edited in the app during this run, skipped (re-run to pick it up): ${s}`);
  for (const f of failed) log(`! FAILED: ${f}`);

  // 6. Files, outside any transaction (uploads are slow). Each row is written right after its upload.
  if (uploader) {
    const tools = mediaTools();
    log(`files to ${uploader.label}; thumbnails: ${tools.sips ? "sips" : "none (not macOS)"}, video posters: ${tools.ffmpeg ? "ffmpeg" : "none (no ffmpeg; a video tile instead)"}`);
    const f = await runFilePhase(prisma, plan, { uploader, tools, log });
    log(`files: ${f.uploaded} uploaded (${(f.bytes / 1e6).toFixed(1)} MB), ${f.thumbs} thumbnails, ${f.posters} posters, ${f.links} links, ${f.skippedExisting} already there`);
    for (const x of f.failed) log(`! file FAILED "${x.filename}" (${x.asanaGid}): ${x.error}`);
    if (f.failed.length) process.exitCode = 1;
  } else {
    log("files: skipped (--skip-files); re-run without it to upload them");
  }

  // 7. D25, only when asked, after the list is on screen and Connor says so again.
  if (doDelete) {
    const ids = plan.deletes.filter((d) => !d.heldBack).map((d) => d.taskId);
    const held = plan.deletes.length - ids.length;
    log(
      `D25: ${ids.length} rows listed above for deletion${held ? `, ${held} held back` : ""}. ` +
        (target.local ? `Back up first if this copy matters:\n  ${backupCommandForThisRun("d25")}` : `Backup checked at the start: ${flagValue("--backup")}`),
    );
    if (!ids.length) log("D25: nothing to delete");
    else if (!(await confirmTyped(`Delete ${ids.length} tasks for good?`, `DELETE ${ids.length}`, "--yes-delete"))) {
      log("D25: not confirmed; nothing deleted");
    } else {
      let deleted = 0;
      const blobPaths: string[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const r = await prisma.$transaction((tx) => deleteCsvRows(tx, ids.slice(i, i + 200)), TX);
        deleted += r.deleted;
        blobPaths.push(...r.blobPaths);
      }
      log(`D25: deleted ${deleted} tasks${deleted < ids.length ? ` (${ids.length - deleted} changed since the plan and were kept)` : ""}`);
      if (blobPaths.length) {
        if (uploader) {
          await uploader.del(blobPaths);
          log(`D25: deleted ${blobPaths.length} blobs`);
        } else {
          log(`D25: ${blobPaths.length} blobs to delete by hand (no uploader this run):`);
          for (const p of blobPaths) console.log(`  ${p}`);
        }
      }
    }
  } else if (plan.deletes.length) {
    log(`D25: ${plan.deletes.length} rows listed, not deleted (pass --delete with --apply)`);
  }
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("[asana-load] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
