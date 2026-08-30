/**
 * One-shot migration runner. Idempotent — safe to re-run.
 *   npm run migrate
 *
 * Order matters: users → properties → contractors → deals → tasks
 * (tasks link to properties; task assignees match users).
 */
import { prisma } from "../../src/lib/db.ts";
import { report } from "./_report.ts";
import { migrateUsers } from "./00-users.ts";
import { migrateProperties } from "./01-properties.ts";
import { migrateContractors } from "./02-contractors.ts";
import { migrateDeals } from "./03-deals.ts";
import { migrateTasks } from "./04-tasks.ts";

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
    tasks: migrateTasks,
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
