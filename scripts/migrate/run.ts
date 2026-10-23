/**
 * One-shot migration runner. Idempotent — safe to re-run.
 *   npm run migrate
 *
 * Order matters: users → properties → contractors → deals.
 *
 * Tasks are no longer imported here. The old Asana CSV step (04-tasks.ts)
 * hard-deleted any task missing from the CSV and overwrote app edits, so it
 * was removed; tasks come from the Asana API import in scripts/asana/.
 */
import { prisma } from "../../src/lib/db";
import { report } from "./_report";
import { migrateUsers } from "./00-users";
import { migrateProperties } from "./01-properties";
import { migrateContractors } from "./02-contractors";
import { migrateDeals } from "./03-deals";

const NOT_IMPORTED = [
  "Rent Record Keeping — historical rent ledger (deferred: accounting phase)",
  "Checks — payment records (deferred: accounting phase)",
  "Owners Investments — partner capital (deferred: accounting phase)",
  "Match / Sheet10 — helper sheets (data folded into Properties where relevant)",
];

async function main() {
  const only = process.argv[2];
  const steps: Record<string, () => Promise<void>> = {
    users: migrateUsers,
    properties: migrateProperties,
    contractors: migrateContractors,
    deals: migrateDeals,
  };

  if (only && steps[only]) {
    await steps[only]();
  } else {
    for (const step of Object.values(steps)) await step();
  }

  report.section("Not imported (by design)");
  for (const n of NOT_IMPORTED) report.line(n);

  report.write();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
