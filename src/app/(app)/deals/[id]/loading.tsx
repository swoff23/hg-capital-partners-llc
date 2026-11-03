import { BackLink } from "@/components/back-link";
import { RailFact, RailList } from "@/components/rail";
import { Block, HeadingBlock, LoadingScreen } from "@/components/skeleton";
import { Section } from "@/components/ui";
import { DEAL_FIELD_LABEL } from "@/lib/config";

/** The rail's facts on every deal, and the widths their values land in. */
const FACTS = [
  { label: DEAL_FIELD_LABEL.status, block: "w-20" },
  { label: DEAL_FIELD_LABEL.theirPrice, block: "w-24" },
  { label: DEAL_FIELD_LABEL.ourPrice, block: "w-24" },
  { label: DEAL_FIELD_LABEL.units, block: "w-8" },
  { label: DEAL_FIELD_LABEL.nextAction, block: "w-32" },
  { label: DEAL_FIELD_LABEL.sourceUrl, block: "w-28" },
];

/**
 * A deal while it loads (docs/specs/performance.md 4.3), on the page's grid:
 * Deals, Details with its labels and Activity draw at once; the address, the
 * facts' values and the notes are --fill-1 blocks, and the note field draws
 * its frame.
 */
export default function DealLoading() {
  return (
    <LoadingScreen className="max-w-300">
      <div className="mb-8 pointer-coarse:mb-6">
        <BackLink fallback="/deals" label="Deals" />
        <div className="mt-1">
          <HeadingBlock className="w-3/5 max-sm:w-full" phoneLines={2} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 pointer-coarse:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <aside className="min-w-0 lg:col-start-2 lg:row-start-1">
          <Section title="Details">
            <RailList>
              {FACTS.map((f) => (
                <RailFact key={f.label} label={f.label}>
                  <Block text="text-body" className={f.block} />
                </RailFact>
              ))}
            </RailList>
          </Section>
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <Section title="Activity">
            {/* The note field's frame, then two notes. */}
            <div className="h-15.5 rounded-lg border border-line bg-surface" />
            <ul aria-hidden="true" className="mt-6 space-y-6">
              {["w-3/4", "w-1/2"].map((w) => (
                <li key={w} className="space-y-2 pl-8">
                  <Block text="text-meta" className="w-12" />
                  <div className="flex h-10 items-center rounded-lg border border-line px-3">
                    <Block text="text-body" className={w} />
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </LoadingScreen>
  );
}
