import { Monogram } from "@/components/monogram";
import { Block, LoadingScreen } from "@/components/skeleton";
import { BRAND } from "@/lib/brand";

/**
 * The setup steps while they load: the bar's monogram and the wordmark draw at once, then the meter, the step's heading
 * and four fields as --muted blocks on the page's own boxes. Nothing here reads the session.
 */
export default function SetupLoading() {
  return (
    <LoadingScreen>
      <header className="border-b border-border bg-canvas">
        <div className="mx-auto flex h-14 max-w-400 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <span className="flex shrink-0 items-center gap-2 text-label font-semibold text-foreground">
            <Monogram size={32} />
            {BRAND.portal}
          </span>
          <Block text="text-label" className="w-20" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-8">
        <Block className="h-1 w-full" />
        <div className="mt-2">
          <Block text="text-meta" className="w-28" />
        </div>
        <div className="mt-6 space-y-6">
          <Block text="text-title" className="w-64 max-w-full" />
          <div className="space-y-4" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Block text="text-meta" className="w-20" />
                <Block className="h-9 w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </LoadingScreen>
  );
}
