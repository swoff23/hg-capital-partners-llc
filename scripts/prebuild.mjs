// Runs before `next build`. Always regenerates the Prisma client. Applies
// migrations only through a direct/session connection — the Supabase transaction
// pooler (port 6543) can't run migrations, so those are applied out-of-band
// (see README runbook / `npm run migrate`).
import { execSync } from "node:child_process";

execSync("npx prisma generate", { stdio: "inherit" });

const url = process.env.DATABASE_URL ?? "";
const isTxPooler = /pooler\.supabase\.com:6543/.test(url);

if (url && !isTxPooler) {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} else if (isTxPooler) {
  console.log("\n[prebuild] DATABASE_URL is the Supabase transaction pooler — migrations are applied separately, skipping `migrate deploy`.\n");
} else {
  console.log("\n[prebuild] No DATABASE_URL set — skipping `migrate deploy` (first deploy before DB attached).\n");
}
