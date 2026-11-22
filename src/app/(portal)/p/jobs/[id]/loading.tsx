import { Block, LoadingScreen, rowWidth } from "@/components/skeleton";
import { Section } from "@/components/ui";
import { JobHeader } from "./_components/job-header";

/**
 * A job while it loads (docs/specs/performance.md 4.3), on the page's own
 * grid: My jobs and Updates draw at once; the steps, the title, the job
 * card, the notes and the updates are --muted blocks. An open job's card
 * (four rows) is drawn, since most jobs opened are open. Notes show only on a job that has them, so that
 * heading is a block too. Nothing here reads the session or the job.
 */
export default function JobLoading() {
  return (
    <LoadingScreen>
      <JobHeader />

      <main className="mx-auto max-w-300 pb-12">
        <div
          className={
            "grid px-4 pt-4 sm:px-6 sm:pt-8 lg:px-8 [grid-template-areas:'head'_'rail'_'main'] " +
            "lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:[grid-template-areas:'head_rail'_'main_rail']"
          }
        >
          <div className="min-w-0 [grid-area:head]">
            <Block text="text-title" className="w-2/3" />
            {/* The steps, under the title. */}
            <Block className="mt-4 h-9 w-full max-w-md rounded-md" />
            {/* The job card: the address row, then their day and Due side by side (Share with crew is in the header). */}
            <Block className="mt-6 h-36 w-full rounded-lg" />
          </div>

          <div className="mt-8 min-w-0 space-y-8 [grid-area:main] pointer-coarse:space-y-6">
            <Section title={<Block text="text-section" className="w-16" />}>
              <div className="max-w-prose space-y-1">
                {["w-full", "w-11/12", "w-1/2"].map((w) => (
                  <Block key={w} text="text-body" className={w} />
                ))}
              </div>
            </Section>

            <Section title="Updates">
              <ul aria-hidden="true" className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="space-y-1">
                    <Block text="text-meta" className="w-28" />
                    <Block text="text-body" className={rowWidth(i)} />
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </div>
      </main>
    </LoadingScreen>
  );
}
