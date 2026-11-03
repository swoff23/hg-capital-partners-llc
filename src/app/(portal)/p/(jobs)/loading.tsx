import type { ReactNode } from "react";
import { Monogram } from "@/components/monogram";
import { Block, LoadingScreen, rowWidth } from "@/components/skeleton";
import { BRAND } from "@/lib/brand";

/** A switch's track while it loads, shaped by its words, as SegmentedControl's md size draws it. */
function SwitchFrame({ labels }: { labels: ReactNode[] }) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-fill-1 p-0.5">
      {labels.map((label, i) => (
        <span key={i} className="invisible inline-flex h-8 items-center px-3 text-label max-[360px]:px-2.5 pointer-coarse:h-10">
          {label}
        </span>
      ))}
    </span>
  );
}

/** My jobs' group names, short below 375px as the page has them (../_components/my-jobs.tsx). */
const GROUPS = [
  <>
    <span className="max-[375px]:hidden">By date</span>
    <span className="min-[375px]:hidden">Date</span>
  </>,
  <>
    <span className="max-[375px]:hidden">By property</span>
    <span className="min-[375px]:hidden">Property</span>
  </>,
];

/**
 * My jobs while it loads (docs/specs/performance.md 4.3): the bar's monogram
 * and HG Jobs draw at once; the account button, the greeting (it carries the
 * contractor's name), the two switches and 4 job rows (photo, title, address
 * and date) are --fill-1 blocks on the page's own boxes. Nothing here reads
 * the session or a job.
 */
export default function MyJobsLoading() {
  return (
    <LoadingScreen>
      <header className="border-b border-line bg-canvas">
        <div className="mx-auto flex h-14 max-w-400 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <span className="flex shrink-0 items-center gap-2 text-label font-semibold text-fg-1">
            <Monogram size={32} />
            {BRAND.portal}
          </span>
          <span className="-mr-1.5 flex h-11 w-11 items-center justify-center">
            {/* A contractor's avatar: a 32px rounded square. */}
            <Block className="size-8 rounded-sm" />
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-400 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-4">
          <Block text="text-title" className="w-32" />
        </div>
        <div className="mb-5 flex items-center justify-between gap-2">
          <SwitchFrame labels={["Open", "Done"]} />
          <SwitchFrame labels={GROUPS} />
        </div>
        <section>
          <div className="flex min-h-[2.5625rem] items-center border-b border-line pb-2">
            <Block text="text-section" className="w-24" />
          </div>
          <ul aria-hidden="true" className="divide-y divide-line">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="flex min-h-18 items-center gap-3 py-2.5">
                <Block className="h-9 w-12 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <Block text="text-body" className={rowWidth(i)} />
                  <span className="mt-0.5 block">
                    <Block text="text-meta" className={rowWidth(i + 2, ["w-40", "w-32", "w-48"])} />
                  </span>
                </span>
                <span className="w-28 shrink-0 max-[479px]:hidden">
                  <Block text="text-meta" className="w-20" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </LoadingScreen>
  );
}
