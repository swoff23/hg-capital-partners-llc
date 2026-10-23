"use client";
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/segmented-control";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui";
import type { Ymd } from "@/lib/dates";
import {
  JOBS_GROUP_COOKIE,
  addressLine,
  groupJobs,
  targetLabel,
  type JobCard,
  type JobsGroup,
  type JobsTab,
} from "@/lib/portal/job-view";
import { isActiveStatus } from "@/lib/task-scope";

const TABS = [
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
] as const;

// The narrowest phones (320) get the short labels so the row never wraps.
const GROUPS = [
  {
    key: "date",
    label: (
      <>
        <span className="max-[359px]:hidden">By date</span>
        <span className="min-[360px]:hidden">Date</span>
      </>
    ),
  },
  {
    key: "property",
    label: (
      <>
        <span className="max-[359px]:hidden">By property</span>
        <span className="min-[360px]:hidden">Property</span>
      </>
    ),
  },
] as const;

/**
 * My jobs (§6, D31): Open | Done, and By date | By property with By date
 * first. The tab is in the URL, so Back from a job returns to it; the
 * grouping is remembered in a cookie the page reads. The tab moves as soon
 * as it's tapped, while the other list loads.
 */
export function MyJobs({ jobs, tab, initialGroup, today }: { jobs: JobCard[]; tab: JobsTab; initialGroup: JobsGroup; today: Ymd }) {
  const router = useRouter();
  const [group, setGroup] = useState(initialGroup);
  const [shownTab, setShownTab] = useOptimistic(tab);
  const [, startTabChange] = useTransition();

  function chooseTab(next: JobsTab) {
    startTabChange(() => {
      setShownTab(next);
      router.replace(next === "open" ? "/p" : "/p?view=done", { scroll: false });
    });
  }

  function chooseGroup(next: JobsGroup) {
    setGroup(next);
    try {
      document.cookie = `${JOBS_GROUP_COOKIE}=${next}; path=/p; max-age=31536000; samesite=lax`;
    } catch {}
  }

  const groups = groupJobs(jobs, { tab, group, today });

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-2">
        <SegmentedControl aria-label="Open or done" size="md" options={TABS} value={shownTab} onChange={chooseTab} />
        <SegmentedControl aria-label="Group jobs" size="md" options={GROUPS} value={group} onChange={chooseGroup} />
      </div>

      {jobs.length === 0 ? (
        <EmptyState>{tab === "open" ? "No open jobs right now." : "No finished jobs yet."}</EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map((g, i) => (
            <section key={g.key} aria-labelledby={`jobs-group-${i}`}>
              <h2 id={`jobs-group-${i}`} className="mb-2 truncate text-xs font-medium text-muted">
                {g.label}
              </h2>
              <ul className="space-y-2">
                {g.jobs.map((job) => (
                  <li key={job.id}>
                    <JobCardLink job={job} today={today} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * The whole card opens the job (§6): the title with the "2 new" mark, then
 * the address and unit, then the Target, with the status in the same corner
 * on every card. A finished job's Target is only its old due date, so Done
 * cards leave it out, as the job page does.
 */
function JobCardLink({ job, today }: { job: JobCard; today: Ymd }) {
  const where = addressLine(job.address, job.unitLabel, { short: true });
  const target = job.target && isActiveStatus(job.status) ? targetLabel(job.target, today) : null;

  return (
    <Link
      href={`/p/jobs/${job.id}`}
      className="block min-h-16 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm outline-none transition-colors hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:border-zinc-600"
    >
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{job.title}</p>
        {job.newCount > 0 && (
          <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium leading-4 text-primary-foreground">
            {job.newCount} new
          </span>
        )}
      </div>
      {where && <p className="mt-1 truncate text-xs text-muted">{where}</p>}
      <div className="mt-1.5 flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-xs text-muted">{target}</p>
        <StatusBadge status={job.status} className="shrink-0" />
      </div>
    </Link>
  );
}
