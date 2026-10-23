/**
 * Tidy the contractor records the spreadsheet import left messy (ADMIN-023):
 * trades the import's merge repeated ("HVAC / HVAC") and name words typed in
 * lowercase ("John detzler"). Plus Connor's three hand fixes (cutover
 * decision 31): "Electric" (Jeremiah Anderson) and "House Cleaner" (Kim
 * Lockett) move from Company to Trades, and "Mike Morris (Freedom Electric)"
 * becomes Mike Morris at Freedom Electric; each matches only that record's
 * exact current name and company. The rules are src/lib/contacts.ts
 * planContactFixes. Notes and anything else that needs a judgment call are
 * left alone.
 *
 *   npx tsx --env-file=.env scripts/cleanup-contacts.ts            # dry run: lists every change, writes nothing
 *   npx tsx --env-file=.env scripts/cleanup-contacts.ts --apply    # write them
 *
 *   --dry-run                the default
 *   --apply                  write the listed changes
 *   --confirm-prod <ref>     needed to --apply anywhere but a local database: ywdjaygwkqyrmbdnvaai
 *   --backup <file>          needed with it: the pg_dump taken in the last 30 minutes (under _private/)
 *
 * Safe to re-run: a second run finds nothing to change. Each write lands only
 * while the row still holds what the plan read, so an edit made in between
 * is never overwritten. The list holds contractor names: keep any saved
 * copy of it inside the company.
 */
import { prisma } from "../src/lib/db";
import { planContactFixes } from "../src/lib/contacts";
import { TX, assertBackup, assertKnownFlags, flagValue, guardTarget, hasFlag, log as logger } from "./asana/_import-lib";

const TAG = "cleanup-contacts";
const log = logger(TAG);

async function main() {
  assertKnownFlags(["--dry-run", "--apply", "--confirm-prod=", "--backup="]);
  const apply = hasFlag("--apply");
  if (apply && hasFlag("--dry-run")) throw new Error("pass --apply or --dry-run, not both");
  const target = await guardTarget(prisma, { apply, tag: TAG });
  if (apply && !target.local) assertBackup(flagValue("--backup"), target, TAG);

  const contacts = await prisma.contact.findMany({ select: { id: true, fullName: true, trades: true, company: true }, orderBy: { fullName: "asc" } });
  const plan = planContactFixes(contacts);
  log(`${contacts.length} contacts, ${plan.length} to change.`);
  const shown = (v: string | null) => (v === null ? "(none)" : `"${v}"`);
  for (const f of plan) {
    const lines = [
      f.name ? `name: "${f.fullName}" to "${f.name}"` : null,
      f.trades ? `trades: ${shown(f.trades.from)} to ${shown(f.trades.to)}` : null,
      f.company ? `company: ${shown(f.company.from)} to ${shown(f.company.to)}` : null,
    ].filter(Boolean);
    log(`  ${f.fullName} (${f.id}): ${lines.join("; ")}`);
  }
  if (!apply) {
    log(plan.length ? "Dry run: nothing written. Run again with --apply to write these." : "Nothing to change.");
    return;
  }

  const before = new Map(contacts.map((c) => [c.id, c]));
  let written = 0;
  let skipped = 0;
  await prisma.$transaction(async (tx) => {
    for (const f of plan) {
      const was = before.get(f.id)!;
      const r = await tx.contact.updateMany({
        // Only while the row still holds what the plan read.
        where: { id: f.id, fullName: was.fullName, trades: was.trades, company: was.company },
        data: { ...(f.name ? { fullName: f.name } : {}), ...(f.trades ? { trades: f.trades.to } : {}), ...(f.company ? { company: f.company.to } : {}) },
      });
      if (r.count) written++;
      else skipped++;
    }
  }, TX);
  log(`Wrote ${written}.${skipped ? ` Skipped ${skipped} that changed since the plan was read; run again to see them.` : ""}`);
}

main()
  .catch((err) => {
    console.error(`[${TAG}] failed:`, err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
