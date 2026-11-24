import { Block, LoadingScreen, rowWidth } from "@/components/skeleton";
import { JobHeader } from "../jobs/[id]/_components/job-header";

/**
 * Your invoices while it loads (docs/specs/performance.md 4.3), on the page's own boxes: the header with My jobs
 * draws at once; the title, the address line and the rows (number and, on a phone, the total over the stage and job; from 480 the total and stage in columns) are --muted
 * blocks. Nothing here reads the session or an invoice.
 */
export default function YourInvoicesLoading() {
  return (
    <LoadingScreen>
      <JobHeader wide />
      <main className="mx-auto max-w-400 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Block text="text-title" className="w-40" />
        <div className="mt-1">
          <Block text="text-meta" className="w-64 max-w-full" />
        </div>
        <ul aria-hidden="true" className="mt-4 divide-y divide-border">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex min-h-14 items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <Block text="text-body" className={rowWidth(i, ["w-32", "w-28", "w-36"])} />
                  <span className="shrink-0 min-[480px]:hidden">
                    <Block text="text-body" className="w-16" />
                  </span>
                </span>
                <span className="mt-0.5 block">
                  <Block text="text-meta" className={rowWidth(i + 1, ["w-40", "w-32", "w-48"])} />
                </span>
              </span>
              <span className="hidden shrink-0 items-center min-[480px]:flex">
                <Block text="text-body" className="w-24" />
                <Block text="text-meta" className="w-32" />
              </span>
            </li>
          ))}
        </ul>
      </main>
    </LoadingScreen>
  );
}
