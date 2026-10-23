import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText, Phone } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { LeaveGuard } from "@/components/leave-guard";
import { MediaGrid } from "@/components/media-grid";
import { StatusBadge } from "@/components/status-badge";
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
import { AddressActions, JobChecklist, LockboxCard } from "./_components/job-details";

export const metadata: Metadata = { title: "Job" };

/**
 * A contractor's job (docs/asana-migration-plan.md §6, D31: one scroll with a
 * bottom bar): status and title, address, lockbox (D21), notes (D16),
 * checklist, photos and videos, updates and the composer. Done and canceled
 * jobs are read-only (D18). Opening it marks everything seen.
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

  // LeaveGuard: "My jobs" asks first while photos are still uploading (JobActions holds it).
  return (
    <LeaveGuard>
      <header className="sticky top-0 z-20 border-b border-line bg-canvas">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-2 sm:px-4">
          <BackLink fallback="/p" label="My jobs" className="h-11 rounded-lg px-2 text-sm hover:no-underline" />
          {tel && (
            <a
              href={tel}
              aria-label="Call HG"
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-foreground"
            >
              <Phone className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
        </div>
      </header>

      <main
        className={cn(
          "mx-auto max-w-2xl px-4 pt-5 sm:px-6 sm:pt-8",
          hasBar ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))]" : "pb-12",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <StatusBadge status={job.status} className="shrink-0" />
          {job.target && active && <span className="truncate text-xs text-muted">{targetLabel(job.target, today)}</span>}
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{job.title}</h1>
        {(job.address || job.unitLabel) && <p className="mt-1 text-sm text-muted">{addressLine(job.address, job.unitLabel)}</p>}
        {job.address && <AddressActions address={job.address} />}

        {job.lockbox && <LockboxCard code={job.lockbox} />}

        {job.notes && (
          <Section title="Notes">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{job.notes}</p>
          </Section>
        )}

        {job.checklist.length > 0 && <JobChecklist items={job.checklist} editable={active} />}

        {job.media.length > 0 && (
          <Section title={`Photos & videos (${job.media.length})`}>
            <MediaGrid items={job.media} />
          </Section>
        )}

        <Section title="Updates">
          {job.updates.length === 0 ? (
            <p className="text-sm text-muted">No updates yet.</p>
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
      </main>
    </LeaveGuard>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
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
                className="inline-flex min-h-8 max-w-full items-center gap-1.5 text-sm text-primary hover:underline pointer-coarse:min-h-11"
              >
                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
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
        <p className="flex items-baseline gap-1.5 text-xs text-muted">
          <span className="truncate font-medium text-foreground">{u.actorLabel}</span>
          <span aria-hidden="true">·</span>
          {time}
        </p>
        {u.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{u.body}</p>}
        {files}
      </li>
    );
  }
  // A status change or a file post: one quiet line, then any files.
  return (
    <li>
      <p className="flex items-baseline gap-1.5 text-xs text-muted">
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">{u.actorLabel}</span> {u.body}
        </span>
        <span aria-hidden="true">·</span>
        {time}
      </p>
      {files}
    </li>
  );
}
