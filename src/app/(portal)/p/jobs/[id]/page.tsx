import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText, Phone } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { MediaGrid } from "@/components/media-grid";
import { PhotoThumb } from "@/components/photo-thumb";
import { StatusBadge } from "@/components/status-badge";
import { Section, buttonClass } from "@/components/ui";
import { taskFileUrl } from "@/lib/attachments/media";
import { todayYmdEastern } from "@/lib/dates";
import { addressLine, firstName, nextStep, targetLabel, updateTimeLabel } from "@/lib/portal/job-view";
import { noteJobViewed } from "@/lib/portal/jobs";
import { officeTelHref } from "@/lib/portal/office";
import { getJob, type JobUpdate } from "@/lib/portal/queries";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { isActiveStatus } from "@/lib/task-scope";
import { cn } from "@/lib/utils";
import { JobActions } from "./_components/job-actions";
import { AddressActions, JobChecklist, LockboxSection } from "./_components/job-details";
import { JobMediaSection } from "./_components/job-media";

export const metadata: Metadata = { title: "Job" };

/**
 * A contractor's job (docs/asana-migration-plan.md §6, D31: one scroll with a
 * bottom bar): the property's photo, status and title, address, lockbox
 * (D21), notes (D16), checklist, photos and videos, updates and the composer.
 * Done and canceled jobs are read-only (D18). Opening it marks everything
 * seen.
 *
 * A record page (docs/brand-guidelines.md, section 5): capped at 1200 with
 * the 16 / 24 / 32 gutters, sections over hairlines. On a phone the photo
 * runs full width at 16:9 under the header, since whoever holds the phone is
 * often standing at the building; from sm it's the record header's 96x72
 * beside the title. Until HG's photos exist it's the fallback tile.
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

  // "My jobs" asks first while photos are still uploading: JobActions holds the portal layout's LeaveGuard.
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
        {photoAlt && <PhotoThumb size="full" alt={photoAlt} className="rounded-none sm:hidden" />}

        <div className="space-y-8 px-4 pt-4 sm:px-6 sm:pt-8 lg:px-8 pointer-coarse:space-y-6">
          <div>
            <div className="flex items-start gap-4">
              {photoAlt && <PhotoThumb size={96} alt={photoAlt} className="max-sm:hidden" />}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusBadge status={job.status} className="shrink-0" />
                  {job.target && active && <span className="truncate text-meta text-fg-3">{targetLabel(job.target, today)}</span>}
                </div>
                <h1 className="mt-1 text-title text-balance break-words text-fg-1">{job.title}</h1>
                {(job.address || job.unitLabel) && (
                  <p className="mt-1 text-meta text-fg-3">{addressLine(job.address, job.unitLabel)}</p>
                )}
              </div>
            </div>
            {job.address && <AddressActions address={job.address} />}
          </div>

          {job.lockbox && <LockboxSection code={job.lockbox} />}

          {job.notes && (
            <Section title="Notes">
              <p className="max-w-prose whitespace-pre-wrap break-words text-pretty text-body text-fg-1">{job.notes}</p>
            </Section>
          )}

          {job.checklist.length > 0 && <JobChecklist items={job.checklist} editable={active} />}

          <JobMediaSection media={job.media} />

          <Section title="Updates">
            {job.updates.length === 0 ? (
              <p className="text-body text-fg-3">No updates yet.</p>
            ) : (
              <ol className="space-y-5">
                {job.updates.map((u) => (
                  <UpdateItem key={u.id} update={u} now={now} />
                ))}
              </ol>
            )}
            {active && (
              <JobActions
                taskId={job.id}
                status={job.status}
                firstName={firstName(principal.label)}
                staffNames={job.staffNames}
              />
            )}
          </Section>
        </div>
      </main>
    </>
  );
}

function UpdateItem({ update: u, now }: { update: JobUpdate; now: Date }) {
  const time = (
    <time dateTime={u.createdAt.toISOString()} className="shrink-0">
      {updateTimeLabel(u.createdAt, now)}
    </time>
  );
  const files = (
    <>
      {u.attachments.media.length > 0 && <MediaGrid items={u.attachments.media} className="mt-2" />}
      {u.attachments.files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {u.attachments.files.map((f) => (
            <li key={f.id}>
              <a
                href={taskFileUrl(f.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-8 max-w-full items-center gap-1.5 text-body text-fg-1 hover:underline pointer-coarse:min-h-11"
              >
                <FileText className="h-4 w-4 shrink-0 text-fg-3" aria-hidden="true" />
                <span className="truncate">{f.filename}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (u.kind === "comment") {
    return (
      <li>
        <p className="flex items-baseline gap-1.5 text-meta text-fg-3">
          <span className="truncate font-medium text-fg-1">{u.actorLabel}</span>
          <span aria-hidden="true">·</span>
          {time}
        </p>
        {u.body && <p className="mt-1 whitespace-pre-wrap break-words text-pretty text-body text-fg-2">{u.body}</p>}
        {files}
      </li>
    );
  }
  // A status change or a file post: one quiet line, then any files.
  return (
    <li>
      <p className="flex items-baseline gap-1.5 text-meta text-fg-3">
        <span className="min-w-0 truncate">
          <span className="font-medium text-fg-1">{u.actorLabel}</span> {u.body}
        </span>
        <span aria-hidden="true">·</span>
        {time}
      </p>
      {files}
    </li>
  );
}
