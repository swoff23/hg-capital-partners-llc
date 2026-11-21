import { BackLink } from "@/components/back-link";
import { FactStrip } from "@/components/fact-strip";
import { Block, HeadingBlock, LoadingScreen, rowWidth } from "@/components/skeleton";
import { Section } from "@/components/ui";

/**
 * A rehab while it loads (docs/specs/performance.md 4.3), on RehabView's grid (./view.tsx): Back, the figures'
 * labels, the section headings and the Details rail's labels draw at once; the name, the figures and the rows
 * are --muted blocks.
 */
export default function RehabLoading() {
  const labels = ["Holdback", "Funded", "Submitted", "Ready", "Left"];
  return (
    <LoadingScreen
      className={
        "grid max-w-300 gap-x-10 [grid-template-areas:'head'_'strip'_'main'_'fields'] " +
        "lg:grid-cols-[minmax(0,1fr)_20rem] lg:[grid-template-areas:'head_fields'_'strip_fields'_'main_fields']"
      }
    >
      <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 [grid-area:head] [grid-template-areas:'nav_more'_'title_title']">
        <div className="flex min-w-0 items-center gap-1.5 [grid-area:nav]">
          <BackLink fallback="/draws" label="Draws" />
        </div>
        <div className="size-8 [grid-area:more]" />
        <div className="min-w-0 [grid-area:title]">
          <HeadingBlock className="w-1/2 max-sm:w-2/3" />
        </div>
      </header>

      <div className="min-w-0 pt-2 [grid-area:strip]">
        <FactStrip
          className="max-sm:hidden"
          facts={labels.map((label) => ({ label, value: <Block inline className="h-5 w-24 max-w-full" /> }))}
        />
        <FactStrip
          className="sm:hidden"
          facts={labels.slice(3).map((label) => ({ label, value: <Block inline className="h-5 w-24 max-w-full" /> }))}
        />
      </div>

      <aside className="min-w-0 space-y-8 pt-6 [grid-area:fields] pointer-coarse:space-y-6 lg:self-start lg:pt-2">
        <Section title="Details">
          <ul aria-hidden="true">
            {["Lender", "Holdback", "Properties"].map((label, i) => (
              <li key={label} className="grid min-h-10 grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 border-b border-border py-1 last:border-0 sm:grid-cols-[7rem_minmax(0,1fr)]">
                <span className="text-meta text-muted-foreground">{label}</span>
                <Block text="text-body" className={rowWidth(i, ["w-28", "w-20", "w-36"])} />
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Draws">
          <ul aria-hidden="true">
            {[0, 1].map((i) => (
              <li key={i} className="flex min-h-12 flex-col justify-center border-b border-border py-1.5">
                <Block text="text-body" className="w-20" />
                <Block text="text-meta" className="w-36" />
              </li>
            ))}
          </ul>
        </Section>
      </aside>

      <div className="min-w-0 space-y-8 pt-6 [grid-area:main] pointer-coarse:space-y-6 lg:pt-6">
        <Section title="Budget">
          <ul aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex min-h-12 items-center border-b border-border py-2">
                <Block text="text-body" className={rowWidth(i, ["w-56 max-w-full", "w-44 max-w-full", "w-64 max-w-full"])} />
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </LoadingScreen>
  );
}
