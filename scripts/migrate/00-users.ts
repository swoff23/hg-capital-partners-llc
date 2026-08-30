/**
 * Seed the two internal users. Emails must match the Google accounts used to sign in.
 * Adjust in src/lib/auth-allowlist.ts if these change.
 */
import { prisma } from "../../src/lib/db.ts";
import { report } from "./_report.ts";

export const SEED_USERS = [
  { email: "connoraswofford@gmail.com", name: "Connor Swofford" },
  { email: "pieter@queencitycorp.com", name: "Pieter Louw" },
];

export async function migrateUsers() {
  report.section("Users");
  for (const u of SEED_USERS) {
    await prisma.user.upsert({ where: { email: u.email }, create: u, update: { name: u.name } });
    report.line(`Seeded ${u.name} <${u.email}>`);
  }
  report.warn(
    "Confirm these two emails match the Google accounts Connor & Pieter will sign in with; " +
      "update src/lib/auth-allowlist.ts and re-run if not.",
  );
}
