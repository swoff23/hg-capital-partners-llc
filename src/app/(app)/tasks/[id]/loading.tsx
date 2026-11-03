import type { ReactNode } from "react";
import { BackLink } from "@/components/back-link";
import { Block, HeadingBlock, LoadingScreen, rowWidth } from "@/components/skeleton";
import { Section } from "@/components/ui";
import { cn } from "@/lib/utils";

/** The rail's fields on every task, and the chip widths their values land in. */
const FIELDS = [
  { label: "Assignee", chip: "w-36" },
  { label: "Due", chip: "w-24" },
  { label: "Property", chip: "w-32" },
];

/**
 * A task while it loads (docs/specs/performance.md 4.3), on TaskPageView's grid
 * (./view.tsx): Tasks, the Details rail with its labels from lg, Checklist and
 * Activity draw at once; the status, the title, the field chips, the notes
 * and the activity rows are --fill-1 blocks, and the composer draws its
 * frame. Below md the page is the screen's height, so the frame sits on the
 * bottom edge as the real composer does.
 */
export default function TaskLoading() {
  return (
    <LoadingScreen
      className={
        "grid max-w-300 gap-x-10 [grid-template-areas:'head'_'fields'_'main'] " +
        "max-md:min-h-[calc(100dvh-var(--app-bar-h)-2rem)] max-md:grid-rows-[auto_auto_1fr] " +
        "lg:grid-cols-[minmax(0,1fr)_20rem] lg:[grid-template-areas:'head_fields'_'main_fields']"
      }
    >
      <header
        className={
          "grid min-w-0 items-center gap-x-2 gap-y-1 [grid-area:head] " +
          "grid-cols-[minmax(0,1fr)_auto_auto] [grid-template-areas:'back_status_more'_'title_title_title'] " +
          "md:grid-cols-[auto_minmax(0,1fr)_auto] md:[grid-template-areas:'back_back_back'_'status_title_more']"
        }
      >
        <div className="[grid-area:back]">
          <BackLink fallback="/tasks" label="Tasks" />
        </div>
        <div className="flex min-w-0 items-center [grid-area:status] md:self-start md:pt-1">
          <Block className="h-6 w-18 rounded-md" />
        </div>
        <div className="min-w-0 [grid-area:title]">
          <HeadingBlock className="w-2/3 max-sm:w-full" phoneLines={2} />
        </div>
        {/* The more menu's 32px slot. */}
        <div className="size-8 [grid-area:more] md:self-start md:pt-1" />
      </header>

      <aside className="min-w-0 [grid-area:fields] lg:sticky lg:top-20 lg:self-start">
        <Section title="Details" className="max-lg:[&>div:first-child]:hidden max-lg:[&>div:last-child]:pt-0">
          <div className="-mx-4 flex items-center gap-2 overflow-x-hidden px-4 py-2 md:-mx-6 md:px-6 lg:mx-0 lg:block lg:p-0">
            {FIELDS.map((f) => (
              <Row key={f.label} label={f.label}>
                <Block className={cn("h-8 rounded-md pointer-coarse:h-11", f.chip)} />
              </Row>
            ))}
            <Row label="Created" className="hidden lg:flex">
              <Block text="text-meta" className="w-24" />
            </Row>
          </div>
        </Section>
      </aside>

      <div className="min-w-0 space-y-8 pt-2 [grid-area:main] pointer-coarse:space-y-6 max-md:flex max-md:flex-col lg:pt-4">
        <div className="space-y-1">
          {["w-full", "w-11/12", "w-2/3"].map((w) => (
            <Block key={w} text="text-body" className={w} />
          ))}
        </div>

        <Section title="Checklist">
          <div className="flex min-h-10 items-center pointer-coarse:min-h-12">
            <Block text="text-label" className="w-24" />
          </div>
        </Section>

        <Section title="Activity">
          <ul aria-hidden="true" className="space-y-4">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-start gap-3">
                <Block className="size-6 shrink-0 rounded-full" />
                <span className="min-w-0 flex-1 space-y-1">
                  <Block text="text-meta" className="w-24" />
                  <Block text="text-body" className={rowWidth(i)} />
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {/* The composer's frame: a box from md, a bar on the bottom edge below it. */}
        <div className="h-32 rounded-lg border border-line bg-surface max-md:-mx-4 max-md:-mb-4 max-md:mt-auto max-md:h-14 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 pointer-coarse:max-md:h-15" />
      </div>
    </LoadingScreen>
  );
}

/** A rail row as TaskFields lays it (./fields.tsx): a 112px label from lg beside the chip, over a hairline. */
function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center lg:min-h-10 lg:gap-3 lg:border-b lg:border-line lg:last:border-0 lg:pointer-coarse:min-h-12",
        className,
      )}
    >
      <span className="hidden w-28 shrink-0 text-meta text-fg-3 lg:block">{label}</span>
      <div className="min-w-0 lg:flex-1">{children}</div>
    </div>
  );
}
