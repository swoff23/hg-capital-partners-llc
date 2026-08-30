// Runs before `next build`. Generates the Prisma client always; applies
// migrations only when a database is actually attached (so the very first
// Vercel deploy — before the DB is connected — still succeeds).
import { execSync } from "node:child_process";

execSync("npx prisma generate", { stdio: "inherit" });

if (process.env.DATABASE_URL) {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log("\n[prebuild] No DATABASE_URL set — skipping `prisma migrate deploy`.");
  console.log("[prebuild] Attach a database and redeploy to create the tables.\n");
}
