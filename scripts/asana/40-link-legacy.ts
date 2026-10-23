/**
 * Link tasks whose assignee is only a name (the August CSV's free text, or
 * an Asana person the load couldn't match) to the person it names, so the
 * job leaves Unassigned and reaches the contractor (D12). Matching is the
 * importer's own (src/lib/asana/legacy.ts): the Asana id saved on a User or
 * Contact, people.json, email, and an exact name only once confirmed.
 * Closed tasks and CSV rows the Asana load hasn't reconciled are left alone.
 *
 *   npx tsx --env-file=.env scripts/asana/40-link-legacy.ts --snapshot <dir>           # dry run: every name-only task and what it would link to
 *   npx tsx --env-file=.env scripts/asana/40-link-legacy.ts --snapshot <dir> --apply   # write
 *
 *   --snapshot <dir>         recommended: Asana's people, to match by Asana id and people.json
 *   --people <file>          Connor's identity confirmations (default <snapshot>/people.json)
 *   --accept-name-matches    treat name-only contact matches as confirmed
 *   --apply                  write the links
 *   --confirm-prod <ref>     needed to --apply anywhere but a local database: ywdjaygwkqyrmbdnvaai
 *   --backup <file>          needed with it: the pg_dump taken in the last 30 minutes (under _private/)
 *
 * Never emails: each link is written by src/lib/asana/import.ts as the
 * "asana" principal. Safe to re-run: a linked task no longer has only a name.
 */
import path from "node:path";
import { prisma } from "../../src/lib/db";
import { linkLegacyAssignee } from "../../src/lib/asana/import";
import { planLegacyLinks } from "../../src/lib/asana/legacy";
import type { AsanaRef } from "../../src/lib/asana/map";
import { isActiveStatus } from "../../src/lib/task-scope";
import { assertBackup, assertKnownFlags, flagValue, guardInput, guardTarget, hasFlag, log as logger, readOverrides, readSnapshot, TX } from "./_import-lib";

const log = logger("asana-link-legacy");

const FLAGS = ["--snapshot=", "--people=", "--accept-name-matches", "--apply", "--dry-run", "--confirm-prod=", "--backup="];

async function main() {
  assertKnownFlags(FLAGS);
  const apply = hasFlag("--apply");
  if (apply && hasFlag("--dry-run")) throw new Error("--dry-run and --apply together: pick one");
  const target = await guardTarget(prisma, { apply, tag: "asana-link-legacy" });
  if (apply && !target.local) {
    assertBackup(flagValue("--backup"), target, "asana-link-legacy");
    log(`backup: ${flagValue("--backup")}`);
  }

  // Asana's people, from every place the snapshot names them.
  const dirArg = flagValue("--snapshot");
  let asanaPeople: AsanaRef[] = [];
  let overridesFile = flagValue("--people");
  if (dirArg) {
    const snap = readSnapshot(path.resolve(dirArg));
    // A synthetic fixture's people, or another project's, never link anything outside a local database.
    guardInput(target, { apply, synthetic: !!snap.manifest.synthetic, projectGid: snap.projectGid });
    asanaPeople = [...snap.users, ...snap.tasks.flatMap((t) => [t.assignee, t.created_by, t.completed_by]).filter((r): r is AsanaRef => !!r)];
    overridesFile ??= path.join(path.resolve(dirArg), "people.json");
  } else {
    log("no --snapshot: matching by email and name only (not by Asana id or people.json)");
  }
  const overrides = readOverrides(overridesFile);
  if (Object.keys(overrides).length) log(`${Object.keys(overrides).length} identity confirmations from ${overridesFile}`);

  const [rows, users, contacts] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeUserId: null, assigneeContactId: null, assigneeName: { not: null } },
      select: { id: true, title: true, status: true, assigneeName: true, assigneeEmail: true, asanaId: true, asanaSyncedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({ select: { id: true, email: true, name: true, asanaGid: true } }),
    prisma.contact.findMany({ select: { id: true, fullName: true, email: true, asanaGid: true, active: true } }),
  ]);
  const plan = planLegacyLinks(
    rows.filter((r) => r.assigneeName?.trim()).map((r) => ({ ...r, assigneeName: r.assigneeName! })),
    { users, contacts },
    asanaPeople,
    { overrides, acceptNameMatches: hasFlag("--accept-name-matches") },
  );

  const links = plan.rows.filter((r) => r.decision.kind === "link");
  const open = plan.rows.filter((r) => isActiveStatus(r.row.status));
  console.log(`\n== Name-only assignees ${apply ? "(APPLY)" : "(dry run: nothing is written)"} ==`);
  console.log(`  ${plan.rows.length} name-only, ${open.length} of them open; ${links.length} to link; ${open.length - links.length} open left with only a name`);
  console.log("\n-- By name ------------------------------------------------------------------");
  for (const p of plan.people) console.log(`  ${p.name}${p.email && p.email !== p.name.toLowerCase() ? ` <${p.email}>` : ""}: ${p.open} open, ${p.closed} closed; ${p.match}`);
  console.log("\n-- Open tasks ---------------------------------------------------------------");
  for (const r of open) {
    const d = r.decision;
    console.log(`  ${d.kind === "link" ? "link " : "leave"} ${r.row.id} ${r.row.status.padEnd(11)} ${r.row.title.slice(0, 50).padEnd(50)} ${r.row.assigneeName} -> ${d.kind === "link" ? `${d.to} (by ${d.via})` : d.reason}`);
  }
  if (!apply) {
    log("dry run: nothing written. Re-run with --apply to write.");
    return;
  }

  let linked = 0;
  const moved: string[] = [];
  const now = new Date();
  for (const r of links) {
    if (r.decision.kind !== "link") continue;
    const { assignee } = r.decision;
    const ok = await prisma.$transaction((tx) => linkLegacyAssignee(tx, { taskId: r.row.id, name: r.row.assigneeName, assignee }, now), TX);
    if (ok) linked++;
    else moved.push(`${r.row.title} (${r.row.id})`);
  }
  log(`linked ${linked} of ${links.length}`);
  for (const m of moved) log(`! changed in the app since the plan, left alone: ${m}`);
}

main()
  .catch((err) => {
    console.error("[asana-link-legacy] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
