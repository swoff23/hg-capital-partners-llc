import { getEnv } from "@/lib/env";
import { jobLinkDestination } from "@/lib/portal/job-link-paths";
import { resolveJobLink, touchJobLink } from "@/lib/portal/job-links";
import { withNext } from "@/lib/portal/next-path";
import { getPortalPrincipal, startJobLinkSession } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

/**
 * A button in a job email (docs/specs/contractor-job-emails.md, section 3):
 * `/j/<token>?do=done&u=<update>`. It opens that one job as the contractor,
 * with no password:
 *  - already signed in as them (in full, or by a link to this job): straight to the job;
 *  - otherwise a session that opens this one job, then the job.
 * `do` names what the page has ready (job-link-paths.ts); nothing acts until
 * they tap on the page, since work email scanners open every link. A link
 * that no longer opens the job (closed, taken off it, access removed) goes to
 * sign in, with the job as where to go next, and a STAFF or unknown link to
 * plain sign in. The token never reaches the job page's URL, and the
 * redirect sends no referrer.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  if (!getEnv().portalEnabled) return new Response("Not found", { status: 404 });
  const { token } = await params;
  const query = new URL(request.url).searchParams;
  const link = await resolveJobLink(token);
  if (!link || (link.kind !== "EMAIL" && link.kind !== "CREW") || !link.contactId || !link.accountId) return seeOther("/login");

  const destination = jobLinkDestination(link.taskId, query.get("do"), query.get("u"));
  if (!link.opensJob) return seeOther(withNext("/login", destination));

  const current = await getPortalPrincipal();
  const alreadyIn = current?.contactId === link.contactId && (!current.onlyTaskId || current.onlyTaskId === link.taskId);
  if (!alreadyIn) await startJobLinkSession(link.accountId, link.taskId, link.id);
  await touchJobLink(link.id);
  return seeOther(destination);
}

function seeOther(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
