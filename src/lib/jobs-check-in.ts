import "server-only";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { jobReasons, jobsSwitches, readJobsSnapshot, type JobReason } from "@/lib/jobs-health";
import { logError } from "@/lib/log";
import { checkInJobs, startServerReporting } from "@/lib/report-server";

/** The background jobs' reasons right now, for /api/health's detail and the check-in. */
export async function currentJobReasons(now = new Date()): Promise<JobReason[]> {
  return jobReasons(await readJobsSnapshot(prisma, jobsSwitches(getEnv()), now), now);
}

/**
 * After each run of the email job (src/app/api/cron/notifications/route.ts,
 * inside after()): one check-in with Sentry's cron monitor. "error" when a
 * rule tripped, or when the rules couldn't be read, since a job that can't
 * read its own queue isn't doing its work. Does nothing where reporting is off.
 */
export async function checkInBackgroundJobs(now = new Date()): Promise<void> {
  if (!startServerReporting()) return;
  let status: "ok" | "error" = "ok";
  try {
    status = (await currentJobReasons(now)).length > 0 ? "error" : "ok";
  } catch (err) {
    logError("jobs:health", err, {}, { report: false });
    status = "error";
  }
  await checkInJobs(status);
}
