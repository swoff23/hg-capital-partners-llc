import { BackLink } from "@/components/back-link";
import { Block, LoadingScreen, rowWidth } from "@/components/skeleton";
import { Section } from "@/components/ui";

/**
 * Apply a playbook while it loads (docs/specs/performance.md 4.3): Playbooks,
 * the Property label and Tasks draw at once; the playbook's name, the
 * property field and the task rows are --fill-1 blocks on ApplyFlow's own
 * boxes (./apply-flow.tsx).
 */
export default function ApplyLoading() {
  return (
    <LoadingScreen className="max-w-3xl">
      <div className="mb-1">
        <BackLink fallback="/templates" label="Playbooks" />
      </div>
      {/* PageHeader's box: the playbook's name at title height. */}
      <div className="mb-5">
        <Block text="text-title" className="w-2/3" />
      </div>

      <div className="space-y-8 pointer-coarse:space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-meta font-medium text-fg-2">Property</span>
            <Block className="h-9 w-full rounded-md pointer-coarse:h-11" />
          </div>
        </div>

        <Section
          title="Tasks"
          actions={
            <span className="flex h-8 items-center pointer-coarse:h-11">
              <Block text="text-meta" className="w-24" />
            </span>
          }
        >
          <ul aria-hidden="true" className="divide-y divide-line">
            {Array.from({ length: 6 }, (_, i) => (
              <li
                key={i}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"
              >
                <span className="flex h-7 w-4 items-center justify-center pointer-coarse:h-11">
                  <Block className="size-4 rounded-sm" />
                </span>
                <span className="flex min-h-7 items-center">
                  <Block text="text-body" className={rowWidth(i)} />
                </span>
                <span className="col-start-2 flex min-w-0 items-center gap-2 md:col-start-3">
                  <Block className="h-7 w-24 rounded-md" />
                  <Block className="h-7 w-20 rounded-md" />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </LoadingScreen>
  );
}
