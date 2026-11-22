import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { Card, Section } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";
import { contractorMaySetDate, jobLinkStep } from "@/lib/portal/job-link-paths";
import { addressLine, firstName, jobSteps, nextStep } from "@/lib/portal/job-view";
import { noteJobViewed } from "@/lib/portal/jobs";
import { getJob } from "@/lib/portal/queries";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { jobPetsLine } from "@/lib/residents/pets";
import { isActiveStatus } from "@/lib/task-scope";
import { cn } from "@/lib/utils";
import { CrewText } from "./_components/crew-text";
import { HashScroll } from "./_components/hash-scroll";
import { JobActions } from "./_components/job-actions";
import { JobHeader } from "./_components/job-header";
import { JobDates } from "./_components/job-date";
import { AddressRow, GettingInSection, JobChecklist, TenantsSection } from "./_components/job-details";
import { JobMediaSection } from "./_components/job-media";
import { JobNotice } from "./_components/job-notice";
import { JobSteps } from "./_components/job-steps";
import { ScheduleOpenProvider } from "./_components/schedule-open";
import { JobUpdates } from "./_components/job-updates";
import { LateUploads } from "./_components/late-uploads";

export const metadata: Metadata = { title: "Job" };

const firstValue = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * A contractor's job (docs/asana-migration-plan.md §6, D31: one scroll with a
 * bottom bar): a header with the address and Share with crew, its title and
 * steps under it, the job card (the address with Directions and Copy address,
 * Due, their own day), what
 * changed since they last looked, tenants and lockbox (D21,
 * docs/specs/tenants.md section 8), notes (D16), checklist, photos and
 * videos, updates and the composer. Done and canceled jobs are
 * read-only (D18). Opening it marks everything seen.
 *
 * A record page (docs/brand-guidelines.md, section 5) laid out as the task
 * page is (Connor, Nov 21, layout A): capped at 1200 with the 16 / 24 / 32
 * gutters, a 320px rail on the right from lg, one column below. No property
 * photo at the top (Connor, Nov 21); the payoff after Mark done still shows it.
 *
 * Updates are the staff page's timeline (activity 3.4 A). The notice reads
 * where the contractor last looked before this visit is recorded, so it shows
 * once and clears on the next open.
 */
export default async function JobPage({ params, searchParams }: PageProps<"/p/jobs/[id]">) {
  const principal = await requirePortalPrincipal();
  const { id } = await params;
  // What an email's button asked the page to have ready (job-link-paths.ts).
  const ask = jobLinkStep(firstValue((await searchParams).do));
  const job = await getJob(principal, id);
  if (!job) notFound();

  // A resident's pets answer, beside Access while they let the contractor in (docs/specs/maintenance-requests.md, 4.6).
  const pets = job.lockbox && job.tenants.permitted ? await jobPetsLine(job.id) : null;
  // Read state and the lockbox and tenants log, written after the page is sent.
  await noteJobViewed(job.id, { lockboxShown: !!job.lockbox, tenantShown: job.tenants.people.length > 0 });

  const now = new Date();
  const today = todayYmdEastern(now);
  const active = isActiveStatus(job.status);
  const hasBar = nextStep(job.status) !== null;
  const crew = active ? { taskId: job.id, openOnLoad: ask === "share" } : null;
  // Where the job is in its steps; Waiting and Canceled show their status instead (job-view.ts jobSteps).
  // Their day: the one they may still move, or the one they had planned once started.
  const day = job.scheduled ?? job.plannedDay;
  const steps = jobSteps(job.status, day);
  const editable = contractorMaySetDate(job.status);
  // The where-and-when card: the address and its buttons, then Due and their day (Connor, Nov 22, layout B).
  const hasWhere = !!(job.address || job.unitLabel);
  const hasWhen = active && (editable || !!job.due || !!day);
  const hasRail = job.tenants.people.length > 0 || !!job.lockbox || (active && (job.tenants.permitted || job.needsNotice));
  // The building, for the upload's name and the payoff's photo.
  const place = job.address ? { label: addressLine(job.address, null, { short: true }), photoUrl: job.photoUrl } : null;

  // Leaving this page never cancels what's still going up: the portal layout's upload queue keeps it going and
  // posts it, and only Sign out asks.
  return (
    <>
      <JobHeader place={hasWhere ? addressLine(job.address, job.unitLabel, { short: true }) : null} share={crew && <CrewText {...crew} />} />

      <main className={cn("mx-auto max-w-300", hasBar ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))]" : "pb-12")}>
        <HashScroll />

        {/* The card's Schedule and the bar's Schedule open one picker (schedule-open.tsx). */}
        <ScheduleOpenProvider>
          {/* One grid, as the task page's (tasks/[id]/view.tsx): the job, then the rail, then the rest in one column;
            from lg the rail (Getting in, Tenants) sits on the right and stays in view. */}
          <div
            className={
              "grid px-4 pt-4 sm:px-6 sm:pt-8 lg:px-8 [grid-template-areas:'head'_'rail'_'main'] " +
              "lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:[grid-template-areas:'head_rail'_'main_rail']"
            }
          >
            <div className="min-w-0 [grid-area:head]">
              <h1 className="text-title text-balance break-words text-foreground">{job.title}</h1>
              {/* Under the title: what the job is, where it's at, then the details (Connor, Nov 22, B). */}
              <div className="mt-4">{steps ? <JobSteps steps={steps} /> : <StatusBadge status={job.status} />}</div>
              {/* The job card (Connor, Nov 22, card B): the address row with Directions and Copy, then their day and Due
                side by side, label over value, as Superpower's and CVS Health's appointment details and Airbnb's
                check-in | checkout (mobbin.com/screens/44e9c476-2e9a-43eb-9700-d13a478334fd, c3a9a7d5-a6bb-44a6-a76e-bf9339c78b2e).
                Share with crew is the header's. */}
              {(hasWhere || hasWhen) && (
                <Card className="mt-6 divide-y divide-border overflow-hidden">
                  {hasWhere && (
                    <AddressRow address={job.address} line={addressLine(job.address, job.unitLabel, { short: true })} />
                  )}
                  {hasWhen && (
                    <JobDates
                      taskId={job.id}
                      scheduled={day}
                      due={job.due}
                      today={today}
                      editable={editable}
                      needsNotice={job.needsNotice}
                      openOnLoad={ask === "date"}
                    />
                  )}
                </Card>
              )}
              <div className="mt-6 empty:hidden">
                <JobNotice notice={job.notice} now={now.toISOString()} />
              </div>
            </div>

            {hasRail && (
              <aside
                aria-label="Tenants and access"
                className="mt-8 min-w-0 space-y-8 [grid-area:rail] pointer-coarse:space-y-6 lg:sticky lg:top-20 lg:mt-0 lg:self-start"
              >
                {/* How they get in, then who lives there (Connor, Nov 22, B). */}
                <GettingInSection
                  taskId={job.id}
                  lockbox={job.lockbox}
                  tenants={job.tenants}
                  needsNotice={job.needsNotice}
                  vacant={job.vacant}
                  rule={active}
                  pets={pets}
                />
                {job.tenants.people.length > 0 && <TenantsSection tenants={job.tenants} />}
              </aside>
            )}

            <div className="mt-8 min-w-0 space-y-8 [grid-area:main] pointer-coarse:space-y-6">
              {job.notes && (
                <Section title="Notes">
                  <p className="max-w-prose whitespace-pre-wrap break-words text-pretty text-body text-foreground">{job.notes}</p>
                </Section>
              )}

              {job.checklist.length > 0 && <JobChecklist items={job.checklist} editable={active} />}

              <JobMediaSection media={job.media} atFinish={job.atFinish} />

              <Section id="updates" title="Updates">
                <JobUpdates updates={job.updates} now={now.toISOString()} newSince={job.newSince} viewerName={principal.label} />
                {active ? (
                  <JobActions
                    taskId={job.id}
                    contactId={principal.contactId}
                    status={job.status}
                    firstName={firstName(principal.label)}
                    staffNames={job.staffNames}
                    finishPhotosRequired={job.finishPhotosRequired}
                    markedDoneAt={job.markedDoneAt}
                    property={place}
                    sentClientIds={job.updates.flatMap((u) => (u.clientId ? [u.clientId] : []))}
                    openMarkDoneOnLoad={ask === "done"}
                    scheduleFirst={editable && !job.scheduled}
                  />
                ) : (
                  // An approved or canceled job has no composer, but photos queued before then can still be waiting to record.
                  <LateUploads taskId={job.id} label={place?.label ?? "this job"} />
                )}
              </Section>
            </div>
          </div>
        </ScheduleOpenProvider>
      </main>
    </>
  );
}
