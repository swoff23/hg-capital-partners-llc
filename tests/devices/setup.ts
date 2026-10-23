import { PrismaClient } from "@prisma/client";
import { todayYmdEastern } from "../../src/lib/dates";
import { hashPassword } from "../../src/lib/password";
import { generateStartingPassword, hashToken, newToken } from "../../src/lib/portal/tokens";
import { addDaysYmd } from "../../src/lib/quick-dates";
import { signSessionToken } from "../../src/lib/session-token";
import * as core from "../../src/lib/tasks/core";
import { PORTAL_FIXTURE_EMAIL, ROUTE_SESSION_OVERRIDE, SAMPLE_PARAMS, listRoutes } from "./routes";

/**
 * Runs once before any test: looks up a real row for every dynamic route,
 * signs a session cookie for the first local user who can sign in (using the
 * throwaway SESSION_SECRET playwright.config.ts handed this run's server),
 * and seeds two fixture contractor logins for the (portal) pages. All of it
 * reaches the test workers through process.env.
 *
 * Staff data is only read. The portal fixtures are the one write: for each,
 * a Contact, its PortalAccount and a fresh PortalSession, reused across runs
 * by email, plus one job assigned to the "portal" contractor. Like
 * `npm run db:dev-passwords`, it refuses anything but a localhost
 * DATABASE_URL.
 *
 *  - "portal": a contractor who has chosen a password, for every /p page,
 *    with a job of its own so My jobs and the job page render with data.
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
  email: PORTAL_FIXTURE_EMAIL,
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
async function seedPortalFixture(db: PrismaClient, fixture: PortalFixture): Promise<{ token: string; contactId: string }> {
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
  return { token, contactId: account.contactId };
}

/** The fixture job's actor: a system writer, so seeding it never queues an email. */
const FIXTURE_WRITER: core.Principal = { kind: "system", label: "Device check" };

/**
 * One job for the "portal" fixture contractor, so /p shows a card and
 * /p/jobs/[id] renders with real parts: a property and unit with a lockbox
 * code when the local DB has one, notes, a checklist and two Shared updates.
 * Written through src/lib/tasks/core.ts like any task (assignment brings the
 * ASSIGNEE access row). Found again by its assignee, and put back to In
 * progress with live access on every run.
 */
async function seedPortalJob(db: PrismaClient, contactId: string): Promise<void> {
  assertLocalDb();
  const existing = await db.task.findFirst({
    where: { assigneeContactId: contactId },
    select: { id: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    await db.$transaction(async (tx) => {
      await core.grantAssigneeAccess(tx, existing.id, contactId, FIXTURE_WRITER, new Date());
      if (existing.status !== "IN_PROGRESS") await core.setStatus(tx, existing.id, "IN_PROGRESS", FIXTURE_WRITER);
    });
    return;
  }

  // A property with a unit that has a lockbox code, so the lockbox card shows.
  const properties = await db.property.findMany({ select: { id: true, units: true }, orderBy: { createdAt: "asc" }, take: 100 });
  let propertyId: string | null = null;
  let unitLabel: string | null = null;
  for (const p of properties) {
    const units = Array.isArray(p.units) ? (p.units as { label?: unknown; lockboxCode?: unknown }[]) : [];
    const unit = units.find((u) => typeof u?.label === "string" && u.label.trim() && typeof u.lockboxCode === "string" && u.lockboxCode.trim());
    if (unit) {
      propertyId = p.id;
      unitLabel = (unit.label as string).trim();
      break;
    }
  }

  await db.$transaction(async (tx) => {
    const task = await core.createTask(
      tx,
      {
        title: "Cabinet install",
        description: "Hang the uppers first and check they're level before the lowers go in. Fixture for npm run test:devices.",
        propertyId,
        unitLabel,
        dueDate: addDaysYmd(todayYmdEastern(), 3),
        assignee: { contactId },
      },
      FIXTURE_WRITER,
    );
    for (const title of ["Uppers", "Lowers", "Crown molding", "Hardware"]) await core.addChecklistItem(tx, task.id, title, FIXTURE_WRITER);
    await core.addComment(tx, task.id, { body: "Doors arrive Thursday.", visibility: "SHARED" }, FIXTURE_WRITER);
    await core.setStatus(tx, task.id, "IN_PROGRESS", FIXTURE_WRITER);
  });
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
    const portal = await seedPortalFixture(db, PORTAL_FIXTURE);
    await seedPortalJob(db, portal.contactId);
    process.env.DEVICE_PORTAL_TOKEN = portal.token;
    process.env.DEVICE_PORTAL_WELCOME_TOKEN = (await seedPortalFixture(db, PORTAL_WELCOME_FIXTURE)).token;

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
