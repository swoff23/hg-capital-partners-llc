import type { ReactNode } from "react";
import { BackLink } from "@/components/back-link";
import { Block, HeadingBlock, LoadingScreen, rowWidth } from "@/components/skeleton";
import { Section } from "@/components/ui";
import { cn } from "@/lib/utils";

/** The rail's facts on every lease, and the widths their values land in. */
const FIELDS = [
  { label: "Property", chip: "w-28" },
  { label: "Moved in", chip: "w-24" },
  { label: "Moves out", chip: "w-24" },
  { label: "Rent", chip: "w-16" },
  { label: "Tenant pays", chip: "w-16" },
  { label: "Deposit", chip: "w-16" },
];

/**
 * A lease while it loads (docs/specs/performance.md 4.3), on LeasePageView's
 * grid (./view.tsx): Tenants, the status, the Details rail with its labels
 * from lg, and the section headings draw at once; the title, the facts and
 * the rows are --muted blocks.
 */
export default function LeaseLoading() {
  return (
    <LoadingScreen
      className={
        "grid max-w-300 gap-x-10 [grid-template-areas:'head'_'fields'_'main'] " +
        "lg:grid-cols-[minmax(0,1fr)_20rem] lg:[grid-template-areas:'head_fields'_'main_fields']"
      }
    >
      <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 [grid-area:head] [grid-template-areas:'nav_more'_'title_title']">
        <div className="flex min-w-0 items-center gap-1.5 [grid-area:nav]">
          <BackLink fallback="/tenants" label="Tenants" />
          <span aria-hidden="true" className="text-meta text-muted-foreground">
            /
          </span>
          <Block className="ml-1.5 h-4 w-16 rounded-md" />
        </div>
        {/* The more menu's 32px slot. */}
        <div className="size-8 [grid-area:more]" />
        <div className="min-w-0 [grid-area:title]">
          <HeadingBlock className="w-1/2 max-sm:w-2/3" />
        </div>
      </header>

      <aside className="min-w-0 [grid-area:fields] lg:sticky lg:top-20 lg:self-start">
        <Section title="Details" className="max-lg:[&>div:first-child]:hidden max-lg:[&>div:last-child]:pt-0">
          <div className="-mx-4 flex items-center gap-2 overflow-x-hidden px-4 py-2 md:-mx-6 md:px-6 lg:mx-0 lg:block lg:p-0">
            {FIELDS.map((f) => (
              <Row key={f.label} label={f.label}>
                <Block className={cn("h-8 rounded-md pointer-coarse:h-11", f.chip)} />
              </Row>
            ))}
          </div>
        </Section>
      </aside>

      <div className="min-w-0 space-y-8 pt-2 [grid-area:main] pointer-coarse:space-y-6 lg:pt-4">
        <Section title="Tenants">
          <ul aria-hidden="true">
            {[0, 1].map((i) => (
              <li key={i} className="flex min-h-12 flex-col justify-center border-b border-border py-1.5">
                <Block text="text-body" className={rowWidth(i, ["w-40", "w-32"])} />
                <Block text="text-meta" className="w-48" />
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Terms">
          <ul aria-hidden="true">
            {[0, 1].map((i) => (
              <li key={i} className="flex min-h-12 items-center border-b border-border py-2 last:border-0">
                <Block text="text-body" className={rowWidth(i, ["w-72 max-w-full", "w-64 max-w-full"])} />
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Notes">
          <Block text="text-body" className="w-2/3" />
        </Section>
      </div>
    </LoadingScreen>
  );
}

/** A rail row as LeaseFacts lays it (./facts.tsx): a 112px label from lg beside the chip, over a hairline. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center lg:min-h-10 lg:gap-3 lg:border-b lg:border-border lg:last:border-0 lg:pointer-coarse:min-h-12">
      <span className="hidden w-28 shrink-0 text-meta text-muted-foreground lg:block">{label}</span>
      <div className="min-w-0 lg:flex-1">{children}</div>
    </div>
  );
}
