"use client";
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhotoThumb } from "@/components/photo-thumb";
import { SegmentedControl } from "@/components/segmented-control";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState, Section } from "@/components/ui";
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
        <div className="space-y-8 pointer-coarse:space-y-6">
          {groups.map((g) => (
            <Section key={g.key} title={<span className="block truncate">{g.label}</span>}>
              {/* The rows sit on hairlines; the heading's rule is the first one. */}
              <ul className="-mt-3 divide-y divide-line">
                {g.jobs.map((job) => (
                  <li key={job.id}>
                    <JobRow job={job} today={today} group={group} />
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * One job, 72px (docs/brand-guidelines.md, section 5 Density), the whole row
 * opening it (§6): the property's photo (the fallback tile until HG's photos
 * exist), the title with the "2 new" mark, then the address and unit and the
 * Target, with the status as its mark and word in one fixed column. Below
 * 480 the column drops and the status leads the subline instead, in its
 * tone. The subline leads with what the group's heading doesn't say (the
 * place By date, the Target By property), so on a narrow phone it's the
 * repeated clause that runs out of room. A finished job's Target is only its
 * old due date, so Done rows leave it out, as the job page does.
 */
function JobRow({ job, today, group }: { job: JobCard; today: Ymd; group: JobsGroup }) {
  const where = addressLine(job.address, job.unitLabel, { short: true });
  const target = job.target && isActiveStatus(job.status) ? targetLabel(job.target, today) : null;
  const subline = (group === "property" ? [target, where] : [where, target]).filter(Boolean).join(" · ");
  const street = job.address ? addressLine(job.address, null, { short: true }) : null;

  return (
    <Link
      href={`/p/jobs/${job.id}`}
      className="flex min-h-18 items-center gap-3 py-2.5 transition-colors hover:bg-fill-1 focus-visible:-outline-offset-2"
    >
      {/* The row's text names the place, so the photo is decoration here. */}
      <span aria-hidden="true" className="shrink-0">
        <PhotoThumb size={48} alt={street ? `Front of ${street}` : "No property"} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate text-body font-medium text-fg-1">{job.title}</span>
          {job.newCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-meta font-medium text-fg-1">
              <span aria-hidden="true" className="size-2 rounded-full bg-act" />
              {job.newCount} new
            </span>
          )}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-meta text-fg-3">
          <span className="flex shrink-0 items-center gap-1 min-[480px]:hidden">
            <StatusBadge status={job.status} />
            {subline && <span aria-hidden="true">·</span>}
          </span>
          {subline && <span className="min-w-0 truncate">{subline}</span>}
        </span>
      </span>
      <StatusBadge status={job.status} className="w-28 shrink-0 max-[479px]:hidden" />
    </Link>
  );
}
