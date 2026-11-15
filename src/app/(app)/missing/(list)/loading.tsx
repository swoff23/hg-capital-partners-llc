import { Block, LoadingScreen, rowWidth } from "@/components/skeleton";
import { PageHeader } from "@/components/ui";

/**
 * Missing info while it loads (docs/specs/performance.md 4.3): the title and
 * the Required | Suggested switch's place draw at once; two groups of rows
 * are --muted blocks at the lengths field names run to.
 */
export default function MissingLoading() {
  return (
    <LoadingScreen>
      <div className="max-w-200">
        <PageHeader title="Missing info" subtitle={<Block text="text-body" className="w-56" />} />
        <Block text="text-label" className="h-8 w-56 pointer-coarse:h-10" />
        <div className="mt-6 space-y-8">
          {[0, 1].map((g) => (
            <div key={g}>
              <div className="flex min-h-[2.5625rem] items-center border-b border-border pb-2">
                <Block text="text-section" className="w-36" />
              </div>
              <ul aria-hidden="true" className="divide-y divide-border">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="flex min-h-12 items-center py-1">
                    <Block text="text-body" className={rowWidth(i + g, ["w-40", "w-56", "w-48", "w-32"])} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </LoadingScreen>
  );
}
