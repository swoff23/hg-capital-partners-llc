/**
 * Names the author of the deal notes that carry theirs in their text
 * (docs/specs/activity-comments.md 2.9, DEALS-044, DATA-I13). Before
 * DealNote.authorUserId, a note was signed three ways: "seeing tomorrow
 * (CS)", and change lines ending "  ·  Connor Swofford" or "  ·  <label>".
 * This sets authorUserId from the signature and strips it from the text.
 *
 *   npx tsx --env-file=.env scripts/backfill-deal-note-authors.ts            # dry run: prints the plan, writes nothing
 *   npx tsx --env-file=.env scripts/backfill-deal-note-authors.ts --apply    # write
 *
 * A dry run is the default. Every row it would change is printed with the
 * user it picked and the text before and after; every signature it can't
 * place is counted by label and left in the text (a name that is no user,
 * initials two users share). Spreadsheet lines are never touched. The rule is
 * in src/lib/deals/backfill.ts (planBackfill) with its tests.
 *
 * Production: run the dry run first, show Connor the report, then apply on
 * his OK with the production flags (the owner connection string in
 * .env.prod-write, a pg_dump taken right before):
 *   npx tsx --env-file=.env.prod-write scripts/backfill-deal-note-authors.ts --apply \
 *     --confirm-prod ywdjaygwkqyrmbdnvaai
 *
 * Safe to re-run: a note that has an author is skipped, so a second run
 * writes nothing. Writing anywhere but a local database needs --confirm-prod
 * (scripts/asana/_import-lib.ts guardTarget).
 */
import { prisma } from "../src/lib/db";
import { planBackfill, summarize, type BackfillStep } from "../src/lib/deals/backfill";
import { assertKnownFlags, guardTarget, hasFlag } from "./asana/_import-lib";

const TAG = "backfill-deal-note-authors";
const log = (msg: string) => console.log(`[${TAG}] ${msg}`);

/** Notes in batches, so a large table never loads at once. */
const BATCH = 500;

async function main() {
  assertKnownFlags(["--apply", "--dry-run", "--confirm-prod=", "--quiet"]);
  const apply = hasFlag("--apply");
  if (apply && hasFlag("--dry-run")) throw new Error("--apply and --dry-run disagree");
  const quiet = hasFlag("--quiet");

  await guardTarget(prisma, { apply, tag: TAG });

  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
  log(`${users.length} users: ${users.map((u) => u.name ?? u.email).join(", ")}`);

  const steps: BackfillStep[] = [];
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.dealNote.findMany({
      where: { authorUserId: null, source: { in: ["manual", "change"] } },
      select: { id: true, body: true, source: true, authorUserId: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;
    steps.push(...planBackfill(batch, users));
    cursor = batch[batch.length - 1].id;
  }

  const sets = steps.filter((s): s is Extract<BackfillStep, { action: "set" }> => s.action === "set");
  if (!quiet) {
    for (const s of sets) {
      log(`would set ${s.id} to ${s.userName} (${s.via} "${s.label}"):\n    was:  ${JSON.stringify(s.was)}\n    text: ${JSON.stringify(s.text)}`);
    }
  }

  const sum = summarize(steps);
  log(`${steps.length} notes without an author`);
  log(`${apply ? "setting" : "would set"} ${sum.set}`);
  log(
    `left as they are: ${sum.skipped.unmatched} name no user, ${sum.skipped.ambiguous} name two users, ${sum.skipped["no-signature"]} name nobody, ${sum.skipped["not-ours"]} imported, ${sum.skipped["has-author"]} already have an author`,
  );
  const labels = Object.entries(sum.labels).sort((a, b) => b[1] - a[1]);
  if (labels.length > 0) log(`signatures it could not place: ${labels.map(([l, n]) => `"${l}" x${n}`).join(", ")}`);

  if (!apply) {
    log("dry run: nothing written. Pass --apply to write.");
    return;
  }

  // One row at a time, each only while it still has no author, so a note edited meanwhile is never overwritten.
  let written = 0;
  for (const s of sets) {
    const r = await prisma.dealNote.updateMany({
      where: { id: s.id, authorUserId: null },
      data: { authorUserId: s.authorUserId, body: s.text },
    });
    written += r.count;
  }
  log(`wrote ${written} of ${sets.length}`);
}

main()
  .catch((err) => {
    console.error(`[${TAG}] failed:`, err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
