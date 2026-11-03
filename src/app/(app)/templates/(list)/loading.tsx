import { Block, LoadingScreen, rowWidth } from "@/components/skeleton";
import { PlaybooksHeaderFrame } from "./header-frame";

/**
 * Playbooks while they load (docs/specs/performance.md 4.3): the title draws
 * at once and 10 rows are --fill-1 blocks on the page's own rows.
 */
export default function PlaybooksLoading() {
  return (
    <LoadingScreen>
      <PlaybooksHeaderFrame />
      <ul aria-hidden="true" className="divide-y divide-line border-t border-line">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i} className="flex min-h-10 items-center gap-3 py-2 pointer-coarse:min-h-12">
            <span className="min-w-0 flex-1">
              <Block text="text-body" className={rowWidth(i)} />
            </span>
            <Block text="text-meta" className="w-12" />
            <span className="size-4 shrink-0" />
          </li>
        ))}
      </ul>
    </LoadingScreen>
  );
}
