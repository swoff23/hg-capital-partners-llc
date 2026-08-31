/**
 * One-time bridge from the old env-var auth to DB-backed passwords.
 *
 * CONNOR_PASSWORD / PIETER_PASSWORD used to be read directly at login time.
 * Now login checks User.passwordHash instead — this hashes those same env
 * vars into the DB once, so existing passwords keep working with nobody
 * re-entering anything. Runs from scripts/prebuild.mjs on every build.
 *
 * Idempotent: only fills a passwordHash that is still null, so a password
 * changed later (in the DB) is never overwritten back to the env var value.
 * Once every listed user has a hash this is a silent no-op — safe to leave
 * running, or delete along with the two env vars once that's true in prod.
 */
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import { SEED_USERS } from "./migrate/00-users";

async function main() {
  for (const { email, passwordEnv } of SEED_USERS) {
    if (!passwordEnv) continue;
    const plain = process.env[passwordEnv];
    if (!plain) continue;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`[backfill-password-hashes] no User row for ${email} yet — skipping`);
      continue;
    }
    if (user.passwordHash) continue; // already seeded, or changed since — never overwrite

    await prisma.user.update({ where: { email }, data: { passwordHash: await hashPassword(plain) } });
    console.log(`[backfill-password-hashes] set initial password for ${email}`);
  }
}

main()
  .catch((err) => {
    console.error("[backfill-password-hashes] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
