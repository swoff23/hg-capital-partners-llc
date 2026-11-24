import type { GoneJob } from "@/lib/portal/gone-job-text";

/**
 * A crew member's link to a job that is canceled, or that the contractor is off (docs/specs/emails-redesign.md, Q7):
 * the verdict as the heading, the job's title and street under it, and no way to My jobs, which isn't theirs.
 * Without a job to name (a deleted one) the heading stands alone.
 */
export function GoneJobView({ job }: { job: GoneJob | null }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:px-8">
      <h1 className="text-title text-balance text-foreground">{job?.heading ?? "This job is canceled. No need to go."}</h1>
      {job && (
        <div className="mt-3 flex min-w-0 max-w-full flex-col gap-0.5">
          <p className="text-body break-words text-foreground">{job.title}</p>
          {job.street && <p className="text-meta break-words text-muted-foreground">{job.street}</p>}
        </div>
      )}
    </main>
  );
}
