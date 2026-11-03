import type { ReactNode } from "react";
import { Block, LoadingScreen, TaskRowSkeleton } from "@/components/skeleton";
import { Section } from "@/components/ui";

/**
 * Home while Today loads (docs/specs/performance.md 4.3). The greeting carries
 * the person's name and the summary line their counts, so both are blocks at
 * their own line heights; Today's Mine and Contractors columns draw their
 * names from lg, with a section of task rows each, on TaskRow's own boxes.
 * Below lg the column switch holds its place. In Home's own route group, so
 * no other page borrows its shape.
 */
export default function HomeLoading() {
  return (
    <LoadingScreen className="max-w-300">
      {/* PageHeader's boxes: the greeting at title height, the summary line under it. */}
      <div className="mb-5">
        <Block text="text-title" className="w-72" />
        <div className="mt-1">
          <Block text="text-body" className="w-40" />
        </div>
      </div>

      {/* The Mine | Contractors switch below lg: its track, shaped by its words. */}
      <span aria-hidden="true" className="mb-4 inline-flex shrink-0 items-center gap-0.5 rounded-md bg-fill-1 p-0.5 lg:hidden">
        {["Mine", "Contractors"].map((label) => (
          <span key={label} className="invisible inline-flex h-8 items-center px-3 text-label pointer-coarse:h-10">
            {label}
          </span>
        ))}
      </span>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
        <Column title="Mine">
          {Array.from({ length: 6 }, (_, i) => (
            <TaskRowSkeleton key={i} i={i} avatar={false} />
          ))}
        </Column>
        <Column title="Contractors" className="max-lg:hidden">
          {Array.from({ length: 2 }, (_, i) => (
            <TaskRowSkeleton key={i} i={i + 3} checkbox={false} avatar={false} />
          ))}
        </Column>
      </div>
    </LoadingScreen>
  );
}

/** One of Today's columns (tasks/today-view.tsx): its name from lg, then one section of rows under a heading block. */
function Column({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={className ? `min-w-0 ${className}` : "min-w-0"}>
      <h2 className="mb-2 hidden text-meta font-medium text-fg-2 lg:block">{title}</h2>
      <Section as="h3" title={<Block text="text-section" className="w-28" />}>
        <ul className="@container divide-y divide-line">{children}</ul>
      </Section>
    </section>
  );
}
