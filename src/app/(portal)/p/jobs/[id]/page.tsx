import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Phone } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { PhotoThumb } from "@/components/photo-thumb";
import { StatusBadge } from "@/components/status-badge";
import { Section, buttonClass } from "@/components/ui";
import { todayYmdEastern } from "@/lib/dates";
import { addressLine, firstName, nextStep } from "@/lib/portal/job-view";
import { noteJobViewed } from "@/lib/portal/jobs";
import { officeTelHref } from "@/lib/portal/office";
import { getJob } from "@/lib/portal/queries";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { isActiveStatus } from "@/lib/task-scope";
import { cn } from "@/lib/utils";
import { JobActions } from "./_components/job-actions";
import { DueDate } from "../../_components/due-date";
import { AddressActions, JobChecklist, LockboxSection } from "./_components/job-details";
import { JobMediaSection } from "./_components/job-media";
import { JobNotice } from "./_components/job-notice";
import { JobUpdates } from "./_components/job-updates";
import { LateUploads } from "./_components/late-uploads";

export const metadata: Metadata = { title: "Job" };

/**
 * A contractor's job (docs/asana-migration-plan.md §6, D31: one scroll with a
 * bottom bar): the property's photo, status and title, address, what changed
 * since they last looked, lockbox (D21), notes (D16), checklist, photos and
 * videos, updates and the composer. Done and canceled jobs are read-only
 * (D18). Opening it marks everything seen.
 *
 * A record page (docs/brand-guidelines.md, section 5): capped at 1200 with
 * the 16 / 24 / 32 gutters, sections over hairlines. On a phone the photo
 * runs full width at 16:9 under the header, since whoever holds the phone is
 * often standing at the building; from sm it's the record header's 96x72
 * beside the title. Until HG's photos exist it's the fallback tile.
 *
 * Updates are the staff page's timeline (activity 3.4 A). The notice reads
 * where the contractor last looked before this visit is recorded, so it shows
 * once and clears on the next open.
 */
export default async function JobPage({ params }: PageProps<"/p/jobs/[id]">) {
  const principal = await requirePortalPrincipal();
  const { id } = await params;
  const job = await getJob(principal, id);
  if (!job) notFound();

  // Read state and the lockbox log, written after the page is sent.
  await noteJobViewed(job.id, { lockboxShown: !!job.lockbox });

  const now = new Date();
  const today = todayYmdEastern(now);
  const active = isActiveStatus(job.status);
  const hasBar = nextStep(job.status) !== null;
  const tel = officeTelHref();
  const photoAlt = job.address ? `Front of ${addressLine(job.address, null, { short: true })}` : null;
  // The building, for the upload's name and the payoff's photo.
  const place = job.address ? { label: addressLine(job.address, null, { short: true }), photoUrl: job.photoUrl } : null;

  // Leaving this page never cancels what's still going up: the portal layout's upload queue keeps it going and
  // posts it, and only Sign out asks.
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-canvas">
        <div className="mx-auto flex h-14 max-w-300 items-center justify-between gap-3 px-2 sm:px-4 lg:px-6">
          <BackLink fallback="/p" label="My jobs" className="h-11 rounded-md px-2 text-label text-fg-2" />
          {tel && (
            <a href={tel} aria-label="Call HG" className={cn(buttonClass({ variant: "ghost", icon: true }), "h-11 w-11")}>
              <Phone className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
        </div>
      </header>

      <main className={cn("mx-auto max-w-300", hasBar ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))]" : "pb-12")}>
        {photoAlt && <PhotoThumb size="full" src={job.photoUrl} alt={photoAlt} className="rounded-none sm:hidden" />}

        <div className="space-y-8 px-4 pt-4 sm:px-6 sm:pt-8 lg:px-8 pointer-coarse:space-y-6">
          <div>
            <div className="flex items-start gap-4">
              {photoAlt && <PhotoThumb size={96} src={job.photoUrl} alt={photoAlt} className="max-sm:hidden" />}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusBadge status={job.status} className="shrink-0" />
                  {job.target && active && (
                    <span className="truncate text-meta text-fg-3">
                      <DueDate target={job.target} isVisit={job.targetIsVisit} today={today} />
                    </span>
                  )}
                </div>
                <h1 className="mt-1 text-title text-balance break-words text-fg-1">{job.title}</h1>
                {(job.address || job.unitLabel) && (
                  <p className="mt-1 text-meta text-fg-3">{addressLine(job.address, job.unitLabel)}</p>
                )}
              </div>
            </div>
            {job.address && <AddressActions address={job.address} />}
          </div>

          <JobNotice notice={job.notice} now={now.toISOString()} />

          {job.lockbox && <LockboxSection code={job.lockbox} />}

          {job.notes && (
            <Section title="Notes">
              <p className="max-w-prose whitespace-pre-wrap break-words text-pretty text-body text-fg-1">{job.notes}</p>
            </Section>
          )}

          {job.checklist.length > 0 && <JobChecklist items={job.checklist} editable={active} />}

          <JobMediaSection media={job.media} atFinish={job.atFinish} />

          <Section title="Updates">
            <JobUpdates
              updates={job.updates}
              now={now.toISOString()}
              newSince={job.newSince}
              delivery={job.delivery}
              viewerName={principal.label}
            />
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
              />
            ) : (
              // An approved job has no composer, but photos queued before it was can still be waiting to record.
              <LateUploads taskId={job.id} label={place?.label ?? "this job"} />
            )}
          </Section>
        </div>
      </main>
    </>
  );
}
