"use client";
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhotoThumb } from "@/components/photo-thumb";
import { SearchInput } from "@/components/search-field";
import { SegmentedControl } from "@/components/segmented-control";
import { StatusBadge } from "@/components/status-badge";
import { Button, EmptyState, Section } from "@/components/ui";
import { useUploadQueue } from "@/components/upload-queue";
import type { Ymd } from "@/lib/dates";
import {
  JOBS_GROUP_COOKIE,
  addressLine,
  groupJobs,
  rowUploadLine,
  type JobCard,
  type JobsGroup,
  type JobsTab,
} from "@/lib/portal/job-view";
import { isActiveStatus } from "@/lib/task-scope";
import { matchesSearch } from "@/lib/text-match";
import { cn } from "@/lib/utils";
import { DueDate } from "./due-date";

const TABS = [
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
] as const;

// Phones under 375 (360, 320) get the short labels, and under 360 the segments
// tighten to 10px sides, so the row fits the content width and ends on the
// edge the rules and notices share. Tailwind's max-[N] is width < N, so each
// pair in this file uses the same N.
const GROUPS = [
  {
    key: "date",
    label: (
      <>
        <span className="max-[375px]:hidden">By date</span>
        <span className="min-[375px]:hidden">Date</span>
      </>
    ),
  },
  {
    key: "property",
    label: (
      <>
        <span className="max-[375px]:hidden">By property</span>
        <span className="min-[375px]:hidden">Property</span>
      </>
    ),
  },
] as const;

const tightAt320 = "max-[360px]:[&>button]:px-2.5";

/**
 * My jobs (§6, D31): Open | Done, and By date | By property with By date
 * first. The tab is in the URL, so Back from a job returns to it; the
 * grouping is remembered in a cookie the page reads. The tab moves as soon
 * as it's tapped, while the other list loads. The Done tab, which keeps up
 * to 500 jobs, has a "Search jobs" field over it that filters the list in
 * place by address, unit and title (search spec, portal).
 */
export function MyJobs({ jobs, tab, initialGroup, today }: { jobs: JobCard[]; tab: JobsTab; initialGroup: JobsGroup; today: Ymd }) {
  const router = useRouter();
  const [group, setGroup] = useState(initialGroup);
  const [shownTab, setShownTab] = useOptimistic(tab);
  const [, startTabChange] = useTransition();
  const [query, setQuery] = useState("");

  function chooseTab(next: JobsTab) {
    // A search belongs to the Done list; the other tab starts clear.
    setQuery("");
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

  const searching = tab === "done" && query.trim() !== "";
  const shown = searching ? jobs.filter((j) => matchesSearch(query, j.address, j.unitLabel, j.title)) : jobs;
  const groups = groupJobs(shown, { tab, group, today });

  return (
    <>
      <div className={cn("flex items-center justify-between gap-2", tab === "done" && jobs.length > 0 ? "mb-3" : "mb-5")}>
        <SegmentedControl
          aria-label="Open or done"
          size="md"
          options={TABS}
          value={shownTab}
          onChange={chooseTab}
          className={tightAt320}
        />
        <SegmentedControl
          aria-label="Group jobs"
          size="md"
          options={GROUPS}
          value={group}
          onChange={chooseGroup}
          className={tightAt320}
        />
      </div>

      {tab === "done" && jobs.length > 0 && (
        <SearchInput placeholder="Search jobs" value={query} onChange={setQuery} className="mb-5 sm:max-w-xs" />
      )}

      {jobs.length === 0 ? (
        // What happens next, in one line (docs/brand-guidelines.md, section 9, Empty).
        <EmptyState>{tab === "open" ? "New jobs from HG show up here." : "Jobs you mark done show up here."}</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => setQuery("")}>
              Clear search
            </Button>
          }
        >
          No jobs match “{query.trim()}”.
        </EmptyState>
      ) : (
        <div className="space-y-8 pointer-coarse:space-y-6">
          {groups.map((g) => (
            <Section key={g.key} title={<span className="block truncate">{g.label}</span>}>
              {/* The rows sit on hairlines; the heading's rule is the first one. */}
              <ul className="-mt-3 divide-y divide-line">
                {g.jobs.map((job) => (
                  <li key={job.id}>
                    <JobRow job={job} today={today} byProperty={group === "property"} />
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
 * opening it (§6): the property's front photo (the fallback tile until it has
 * one), the title, then the address and unit and the date ("Due date Today"),
 * with the status as its mark and word in one fixed column. Below 480 the
 * column drops and the status leads the subline instead, in its tone. The
 * subline is status, date and place (section 5 Density): the date before the
 * place, so on a narrow phone the place is what truncates and the date always
 * shows. By property the group's heading names the street, so the place is
 * the unit alone. A finished job's date is only its old due date, so Done
 * rows leave it out, as the job page does.
 *
 * New updates are one dot hung in the row's leading gutter, centered 8px
 * before the photo, so the photo and title line up whether or not a row has
 * them (activity 3.5 A; 4px clear of the screen edge inside the 16px gutter).
 * The row opens at #new, and screen readers hear the count. While the job has
 * files going up, the subline leads with it: "Uploading 3 photos", or "2
 * photos didn't upload" in danger (uploads 2.1).
 */
function JobRow({ job, today, byProperty }: { job: JobCard; today: Ymd; byProperty: boolean }) {
  const where = byProperty ? job.unitLabel?.trim() || null : addressLine(job.address, job.unitLabel, { short: true });
  const target = job.target && isActiveStatus(job.status) ? job.target : null;
  const street = job.address ? addressLine(job.address, null, { short: true }) : null;
  const uploading = rowUploadLine(useUploadQueue(`portal-task:${job.id}`));

  return (
    <Link
      href={job.newCount > 0 ? `/p/jobs/${job.id}#new` : `/p/jobs/${job.id}`}
      className="relative flex min-h-18 items-center gap-3 py-2.5 transition-colors hover:bg-fill-1 focus-visible:-outline-offset-2"
    >
      {job.newCount > 0 && (
        <span aria-hidden="true" className="absolute -left-2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-act" />
      )}
      {/* The row's text names the place, so the photo is decoration here. */}
      <span aria-hidden="true" className="shrink-0">
        <PhotoThumb size={48} src={job.photoUrl} alt={street ? `Front of ${street}` : "No property"} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-fg-1">
          {job.newCount > 0 && <span className="sr-only">{job.newCount} new, </span>}
          {job.title}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-meta text-fg-3">
          {uploading && (
            <>
              {/* The urgent state leads and keeps its words; the place and the date are what truncate (uploads 3.1). */}
              <span className={cn("shrink-0", uploading.tone === "danger" && "text-danger")}>{uploading.text}</span>
              {(target || where) && (
                <span aria-hidden="true" className="shrink-0">
                  ·
                </span>
              )}
            </>
          )}
          {/* Below 480 the status leads the subline, except while the job has files in flight: the upload line has the room then. */}
          <span className={cn("shrink-0 items-center gap-1 min-[480px]:hidden", uploading ? "hidden" : "flex")}>
            <StatusBadge status={job.status} />
            {(target || where) && <span aria-hidden="true">·</span>}
          </span>
          {target && (
            <span className="min-w-0 truncate">
              <DueDate target={target} isVisit={job.targetIsVisit} today={today} shortBelow480 />
              {where && <span aria-hidden="true"> ·</span>}
            </span>
          )}
          {/* The place fills what's left from a zero basis, so the date only shrinks once the
              place is gone. A shrink-999 place still left the date a fraction of a pixel short
              of its text, and that was enough to fire its ellipsis ("Due Toda…"). */}
          {where && <span className="min-w-0 flex-1 truncate">{where}</span>}
        </span>
      </span>
      <StatusBadge status={job.status} className="w-28 shrink-0 max-[479px]:hidden" />
    </Link>
  );
}
