import { Phone } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { Block, LoadingScreen, rowWidth } from "@/components/skeleton";
import { Section, buttonClass } from "@/components/ui";
import { officeTelHref } from "@/lib/portal/office";
import { cn } from "@/lib/utils";

/** An address button's frame: Directions and Copy address, side by side. */
const action = "h-9 min-w-0 flex-1 rounded-md pointer-coarse:h-11 sm:w-32 sm:flex-none";

/**
 * A job while it loads (docs/specs/performance.md 4.3), on the page's own
 * boxes: My jobs, the Call button and Updates draw at once; the photo, the
 * status, the title, the address, its buttons, the notes and the updates are
 * --fill-1 blocks. Notes show only on a job that has them, so that heading is
 * a block too. Nothing here reads the session or the job.
 */
export default function JobLoading() {
  const tel = officeTelHref();
  return (
    <LoadingScreen>
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

      <main className="mx-auto max-w-300 pb-12">
        <Block className="aspect-video w-full sm:hidden" />

        <div className="space-y-8 px-4 pt-4 sm:px-6 sm:pt-8 lg:px-8 pointer-coarse:space-y-6">
          <div>
            <div className="flex items-start gap-4">
              <Block className="h-18 w-24 shrink-0 rounded-lg max-sm:hidden" />
              <div className="min-w-0 flex-1">
                <Block className="h-5 w-24 rounded-full" />
                <div className="mt-1">
                  <Block text="text-title" className="w-2/3" />
                </div>
                <div className="mt-1">
                  <Block text="text-meta" className="w-48" />
                </div>
              </div>
            </div>
            <div aria-hidden="true" className="mt-3 flex items-center gap-2">
              <Block className={action} />
              <Block className={action} />
            </div>
          </div>

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
      </main>
    </LoadingScreen>
  );
}
