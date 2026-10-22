/**
 * Local dev only: set each seed user's password from their `*_PASSWORD` var
 * in .env, overwriting whatever hash the local DB already has.
 *   npm run db:dev-passwords
 *
 * Unlike scripts/backfill-password-hashes.ts (which only fills an empty hash,
 * so a changed prod password is never clobbered), this always overwrites —
 * so .env stays the source of truth for local logins. A user whose var is
 * empty is left alone.
 *
 * Refuses to run against anything but a localhost DATABASE_URL, or anywhere
 * VERCEL_ENV / NODE_ENV=production is set.
 */
import { prisma } from "../src/lib/db";
import { getEnv } from "../src/lib/env";
import { hashPassword } from "../src/lib/password";
import { SEED_USERS } from "./migrate/00-users";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function assertLocalDb(): void {
  const env = getEnv();
  if (env.isProduction || env.VERCEL_ENV) {
    throw new Error("refusing to run: NODE_ENV=production or VERCEL_ENV is set");
  }
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is unset — is .env filled in?");
  const url = new URL(env.DATABASE_URL);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`refusing to run: DATABASE_URL host is ${url.hostname}, not localhost`);
  }
  console.log(`[dev-reset-passwords] target: ${url.hostname}:${url.port || 5432}${url.pathname}`);
}

async function main() {
  assertLocalDb();
  for (const { email, passwordEnv } of SEED_USERS) {
    if (!passwordEnv) continue;
    const plain = process.env[passwordEnv];
    if (!plain) {
      console.log(`[dev-reset-passwords] ${passwordEnv} is empty — leaving ${email} as is`);
      continue;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`[dev-reset-passwords] no User row for ${email} — run \`npm run migrate users\` first`);
      continue;
    }

    await prisma.user.update({ where: { email }, data: { passwordHash: await hashPassword(plain) } });
    console.log(`[dev-reset-passwords] set ${email} from ${passwordEnv}`);
  }
}

main()
  .catch((err) => {
    console.error("[dev-reset-passwords] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
