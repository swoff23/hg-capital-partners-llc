import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toYmd } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { shortAddress } from "@/lib/normalize";
import { jobCalendar } from "@/lib/portal/job-calendar";
import { jobLinkUrl } from "@/lib/portal/job-link-paths";
import { resolveJobLink } from "@/lib/portal/job-links";
import { addressLine } from "@/lib/portal/job-view";
import { jobDay } from "@/lib/tasks/rules";

export const dynamic = "force-dynamic";

/**
 * Add to calendar in a contractor's job email (docs/specs/contractor-job-emails.md, 2.2): the job on its date as an
 * .ics, while the email's link still opens the job. It starts no session; the event links back through the same link.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  if (!getEnv().portalEnabled) return notFound();
  const { token } = await params;
  const link = await resolveJobLink(token);
  if (!link || link.kind === "STAFF") return notFound();
  const appUrl = getEnv().appUrl;
  // An old email's Add to calendar on a job that's closed, gone from them or has no day: the link itself says what
  // happened (the job, the gone screen or sign-in), never a bare Not found (docs/specs/emails-redesign.md, section 7).
  const toJob = () => NextResponse.redirect(jobLinkUrl(appUrl, token), { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  if (!link.opensJob) return toJob();
  const task = await prisma.task.findUnique({
    where: { id: link.taskId },
    select: { id: true, title: true, unitLabel: true, status: true, dueDate: true, scheduledFor: true, property: { select: { address: true } } },
  });
  // Their scheduled day when they have one, else Due (docs/specs/contractor-scheduled-date.md, section 4).
  const date = task ? toYmd(jobDay(task)) : null;
  if (!task || !date) return toJob();
  const address = task.property?.address ?? null;
  const body = jobCalendar({
    taskId: task.id,
    title: task.title.replace(/\s+/g, " ").trim(),
    where: addressLine(address ? shortAddress(address) || address : null, task.unitLabel),
    address,
    date,
    url: jobLinkUrl(appUrl, token),
    now: new Date(),
    domain: new URL(appUrl).hostname.replace(/^www\./, ""),
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="job.ics"',
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
