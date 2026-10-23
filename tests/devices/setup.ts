import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/lib/password";
import { generateStartingPassword, hashToken, newToken } from "../../src/lib/portal/tokens";
import { signSessionToken } from "../../src/lib/session-token";
import { ROUTE_SESSION_OVERRIDE, SAMPLE_PARAMS, listRoutes } from "./routes";

/**
 * Runs once before any test: looks up a real row for every dynamic route,
 * signs a session cookie for the first local user who can sign in (using the
 * throwaway SESSION_SECRET playwright.config.ts handed this run's server),
 * and seeds two fixture contractor logins for the (portal) pages. All of it
 * reaches the test workers through process.env.
 *
 * Staff data is only read. The portal fixtures are the one write: for each,
 * a Contact, its PortalAccount and a fresh PortalSession, reused across runs
 * by email. Like `npm run db:dev-passwords`, it refuses anything but a
 * localhost DATABASE_URL.
 *
 *  - "portal": a contractor who has chosen a password, for every /p page.
 *  - "portal-welcome": one still on a starting password, for
 *    /p/welcome/password, which sends anyone else on to /p.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const DAY_MS = 24 * 60 * 60 * 1000;

interface PortalFixture {
  email: string;
  name: string;
  mustChangePassword: boolean;
}

const PORTAL_FIXTURE: PortalFixture = {
  email: "device-check@hg.localhost",
  name: "Device Check Contractor",
  mustChangePassword: false,
};
const PORTAL_WELCOME_FIXTURE: PortalFixture = {
  email: "device-check-welcome@hg.localhost",
  name: "Device Check Newcomer",
  mustChangePassword: true,
};

function assertLocalDb(): void {
  // @prisma/client has loaded .env by the time this runs.
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is unset, so the portal fixture can't be seeded. Is .env filled in?");
  if (process.env.VERCEL_ENV) throw new Error("Refusing to seed the portal fixture: VERCEL_ENV is set.");
  const host = new URL(raw).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to seed the portal fixture: DATABASE_URL host is ${host}, not localhost.`);
  }
}

/** Create or reuse a fixture contractor, put it back in its expected state, and mint a session token. */
async function seedPortalFixture(db: PrismaClient, fixture: PortalFixture): Promise<string> {
  assertLocalDb();
  let account = await db.portalAccount.findUnique({ where: { email: fixture.email }, select: { id: true, contactId: true } });
  if (!account) {
    const contact = await db.contact.create({
      data: { fullName: fixture.name, comments: "Fixture for npm run test:devices. Safe to delete locally." },
      select: { id: true },
    });
    account = await db.portalAccount.create({
      data: {
        contactId: contact.id,
        email: fixture.email,
        // Nobody signs in with it; the session below is the way in.
        passwordHash: await hashPassword(generateStartingPassword()),
        mustChangePassword: fixture.mustChangePassword,
      },
      select: { id: true, contactId: true },
    });
  }

  const token = newToken();
  await db.$transaction([
    db.contact.update({ where: { id: account.contactId }, data: { active: true } }),
    db.portalAccount.update({
      where: { id: account.id },
      data: { status: "ACTIVE", mustChangePassword: fixture.mustChangePassword },
    }),
    // One live session per run; earlier runs' rows are cleared.
    db.portalSession.deleteMany({ where: { accountId: account.id } }),
    db.portalSession.create({
      data: {
        accountId: account.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + DAY_MS),
        userAgent: "tests/devices",
      },
    }),
  ]);
  return token;
}

export default async function setup() {
  // A renamed page would otherwise leave its override behind, and the page
  // would quietly load with the default session.
  const patterns = new Set(listRoutes().map((r) => r.pattern));
  const staleOverrides = Object.keys(ROUTE_SESSION_OVERRIDE).filter((p) => !patterns.has(p));
  if (staleOverrides.length) {
    throw new Error(`ROUTE_SESSION_OVERRIDE in tests/devices/routes.ts names pages that don't exist: ${staleOverrides.join(", ")}`);
  }

  const db = new PrismaClient();
  try {
    const user = await db.user.findFirst({
      where: { passwordHash: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { email: true },
    });
    if (!user) {
      throw new Error("No local user can sign in. Run `npm run db:dev-passwords` (README, Local development).");
    }
    process.env.DEVICE_SESSION_TOKEN = signSessionToken(user.email, {
      secret: process.env.DEVICE_SESSION_SECRET!,
      now: Date.now(),
      ttlMs: DAY_MS,
    });
    process.env.DEVICE_PORTAL_TOKEN = await seedPortalFixture(db, PORTAL_FIXTURE);
    process.env.DEVICE_PORTAL_WELCOME_TOKEN = await seedPortalFixture(db, PORTAL_WELCOME_FIXTURE);

    const samples: Record<string, string> = {};
    for (const [key, find] of Object.entries(SAMPLE_PARAMS)) {
      const row = await find(db);
      if (row) samples[key] = row.id;
    }
    process.env.DEVICE_SAMPLES = JSON.stringify(samples);
  } finally {
    await db.$disconnect();
  }
}
