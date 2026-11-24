import { BackLink } from "@/components/back-link";
import { Block, LoadingScreen } from "@/components/skeleton";

/** New invoice while it loads: Back and the title draw at once, the file area and the field values are --muted blocks. */
export default function NewInvoiceLoading() {
  const labels = ["Contractor", "Invoice #", "Total", "Jobs"];
  return (
    <LoadingScreen className="max-w-300">
      <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 [grid-template-areas:'nav_more'_'title_title']">
        <div className="flex min-w-0 items-center gap-1.5 [grid-area:nav]">
          <BackLink fallback="/invoices" label="Invoices" />
        </div>
        <h1 className="min-w-0 py-1 text-title font-semibold text-foreground [grid-area:title]">New invoice</h1>
      </header>
      <div className="mt-4 grid gap-x-10 gap-y-6 lg:pointer-fine:grid-cols-[minmax(0,1fr)_26.25rem]">
        <Block className="h-32 w-full rounded-lg lg:pointer-fine:h-[calc(100dvh-var(--app-bar-h)-9rem)]" />
        <div className="space-y-4" aria-hidden="true">
          {labels.map((label) => (
            <div key={label} className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-fg-2">{label}</span>
              <Block className="h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </LoadingScreen>
  );
}
