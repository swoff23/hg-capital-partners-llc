// Runs before `next build`. Always regenerates the Prisma client. Applies
// migrations only through a direct/session connection — the Supabase transaction
// pooler (port 6543) can't run migrations, so those are applied out-of-band
// (see README runbook / `npm run migrate`).
//
// Migrations are also gated on VERCEL_ENV. Vercel's default env-var scoping
// applies the same DATABASE_URL to Production, Preview, *and* Development
// deployments unless it's been explicitly split per environment — so without
// this gate, pushing any branch runs `migrate deploy` against whatever
// database Preview inherited, which is very possibly production's. Only a
// Production build (VERCEL_ENV=production) or a local build (VERCEL_ENV
// unset — this var only exists on Vercel) may migrate.
import { execSync } from "node:child_process";

execSync("npx prisma generate", { stdio: "inherit" });

const vercelEnv = process.env.VERCEL_ENV; // undefined | "production" | "preview" | "development"
const mayMigrate = !vercelEnv || vercelEnv === "production";

const url = process.env.DATABASE_URL ?? "";
const isTxPooler = /pooler\.supabase\.com:6543/.test(url);

if (!mayMigrate) {
  console.log(`\n[prebuild] VERCEL_ENV=${vercelEnv} — skipping migrate deploy (only the production build applies migrations; see prod runbook to migrate a preview DB by hand).\n`);
} else if (url && !isTxPooler) {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} else if (isTxPooler) {
  console.log("\n[prebuild] DATABASE_URL is the Supabase transaction pooler — migrations are applied separately, skipping `migrate deploy`.\n");
} else {
  console.log("\n[prebuild] No DATABASE_URL set — skipping `migrate deploy` (first deploy before DB attached).\n");
}
