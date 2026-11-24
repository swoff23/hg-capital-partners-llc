import { BackLink } from "@/components/back-link";
import { Block, HeadingBlock, LoadingScreen } from "@/components/skeleton";
import { Section } from "@/components/ui";

/**
 * An invoice while it loads (docs/specs/performance.md 4.3), on InvoicePage's grid (./invoice-page.tsx): Back, the
 * field labels and the History heading draw at once; the title, the file and the values are --muted blocks.
 */
export default function InvoiceLoading() {
  const labels = ["Contractor", "Invoice #", "Invoice date", "Total", "Jobs"];
  return (
    <LoadingScreen className="max-w-300">
      <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 [grid-template-areas:'nav_more'_'title_title']">
        <div className="flex min-w-0 items-center gap-1.5 [grid-area:nav]">
          <BackLink fallback="/invoices" label="Invoices" />
        </div>
        <div className="size-8 [grid-area:more]" />
        <div className="min-w-0 [grid-area:title]">
          <HeadingBlock className="w-1/2 max-sm:w-2/3" />
        </div>
      </header>
      <div className="mt-4 grid gap-x-10 gap-y-6 lg:pointer-fine:grid-cols-[minmax(0,1fr)_26.25rem]">
        <Block className="h-20 w-full rounded-lg lg:pointer-fine:h-[calc(100dvh-var(--app-bar-h)-9rem)]" />
        <div className="min-w-0 space-y-6">
          <div className="space-y-4" aria-hidden="true">
            {labels.map((label) => (
              <div key={label} className="flex flex-col gap-1.5">
                <span className="text-meta font-medium text-fg-2">{label}</span>
                <Block className="h-9 w-full rounded-md" />
              </div>
            ))}
          </div>
          <Section title="History">
            <ul aria-hidden="true" className="space-y-3">
              {[0, 1].map((i) => (
                <li key={i}>
                  <Block text="text-meta" className="w-48 max-w-full" />
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </LoadingScreen>
  );
}
