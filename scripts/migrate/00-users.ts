/**
 * Seed the two internal users. `passwordEnv` is only used once, by
 * scripts/backfill-password-hashes.ts, to hash that Vercel env var into
 * User.passwordHash on first deploy — sign-in itself checks the DB, not env
 * vars. To add someone: add a row here (with a passwordEnv if they need to
 * sign in), `npm run migrate users`, set that env var in Vercel, deploy.
 */
import { prisma } from "../../src/lib/db";
import { report } from "./_report";

export const SEED_USERS = [
  { email: "connoraswofford@gmail.com", name: "Connor Swofford", passwordEnv: "CONNOR_PASSWORD" },
  { email: "pieter@queencitycorp.com", name: "Pieter Louw", passwordEnv: "PIETER_PASSWORD" },
];

export async function migrateUsers() {
  report.section("Users");
  for (const { email, name } of SEED_USERS) {
    await prisma.user.upsert({ where: { email }, create: { email, name }, update: { name } });
    report.line(`Seeded ${name} <${email}>`);
  }
  report.warn(
    "Confirm these two emails match the Google accounts Connor & Pieter will sign in with; " +
      "update SEED_USERS above and re-run if not.",
  );
}
