import { PrismaClient } from "@prisma/client";
import { signSessionToken } from "../../src/lib/session-token";
import { SAMPLE_PARAMS } from "./routes";

/**
 * Runs once before any test: looks up a real row for every dynamic route and
 * signs a session cookie for the first local user who can sign in, using the
 * throwaway SESSION_SECRET playwright.config.ts handed this run's server. Both
 * reach the test workers through process.env. Read-only against the local DB.
 */
export default async function setup() {
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
      ttlMs: 24 * 60 * 60 * 1000,
    });

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
